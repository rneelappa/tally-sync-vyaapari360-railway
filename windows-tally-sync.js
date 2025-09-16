#!/usr/bin/env node

/**
 * Windows Tally Sync Client
 * Syncs data from Tally (localhost:9000) to Railway SQLite database
 * Uses UUID configuration for company_id and division_id
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

// Load configurations
const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class WindowsTallySync {
  constructor() {
    this.config = config;
    this.masterTables = tallyExportConfig.master || [];
    this.transactionTables = tallyExportConfig.transaction || [];
    this.lastAlterIdMaster = 0;
    this.lastAlterIdTransaction = 0;
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(this.config.sync.temp_directory)) {
      fs.mkdirSync(this.config.sync.temp_directory, { recursive: true });
    }
    
    console.log(`🏢 Company: ${this.config.company.name} (${this.config.company.id})`);
    console.log(`🏭 Division: ${this.config.company.division_name} (${this.config.company.division_id})`);
  }

  /**
   * Main sync function
   */
  async sync() {
    console.log('🚀 Starting Windows Tally Sync to Railway SQLite...');
    console.log(`📊 Mode: ${this.config.sync.mode}`);
    console.log(`🎯 Target: ${this.config.railway.api_base}`);
    
    try {
      // Test connections first
      await this.testConnections();
      
      // Get sync metadata from Railway
      await this.updateSyncMetadata();
      
      if (this.config.sync.mode === 'incremental') {
        await this.performIncrementalSync();
      } else {
        await this.performFullSync();
      }
      
      // Show final statistics
      await this.showSyncSummary();
      
      console.log('✅ Windows Tally sync completed successfully!');
      
    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Test connections to both Tally and Railway
   */
  async testConnections() {
    console.log('🔍 Testing connections...');
    
    // Test Tally connection
    try {
      const testXML = this.createTestTallyXML();
      await this.postTallyXML(testXML);
      console.log('✅ Tally connection successful (localhost:9000)');
    } catch (error) {
      throw new Error(`Tally connection failed: ${error.message}`);
    }
    
    // Test Railway SQLite connection
    try {
      const response = await axios.get(`${this.config.railway.api_base}${this.config.railway.endpoints.health}`, {
        timeout: this.config.railway.timeout
      });
      console.log('✅ Railway SQLite connection successful');
    } catch (error) {
      throw new Error(`Railway SQLite connection failed: ${error.message}`);
    }
  }

  /**
   * Update sync metadata from Railway
   */
  async updateSyncMetadata() {
    try {
      const response = await axios.get(
        `${this.config.railway.api_base}${this.config.railway.endpoints.metadata}/${this.config.company.id}/${this.config.company.division_id}`,
        { timeout: this.config.railway.timeout }
      );
      
      const metadata = response.data.data;
      this.lastAlterIdMaster = metadata.last_alter_id_master || 0;
      this.lastAlterIdTransaction = metadata.last_alter_id_transaction || 0;
      
      console.log(`📋 Last AlterID - Master: ${this.lastAlterIdMaster}, Transaction: ${this.lastAlterIdTransaction}`);
    } catch (error) {
      console.log('⚠️  Could not fetch sync metadata, starting fresh sync');
      this.lastAlterIdMaster = 0;
      this.lastAlterIdTransaction = 0;
    }
  }

  /**
   * Perform full sync of all data
   */
  async performFullSync() {
    console.log('📊 Performing full sync...');
    
    // Sync master data first (in priority order)
    const masterTables = [...this.masterTables].sort((a, b) => {
      const priorityA = this.config.database_mapping[a.name]?.sync_priority || 999;
      const priorityB = this.config.database_mapping[b.name]?.sync_priority || 999;
      return priorityA - priorityB;
    });
    
    console.log(`📋 Master tables to sync: ${masterTables.length}`);
    for (const table of masterTables) {
      await this.syncTable(table, 'master');
    }
    
    // Sync transaction data
    console.log(`💼 Transaction tables to sync: ${this.transactionTables.length}`);
    for (const table of this.transactionTables) {
      await this.syncTable(table, 'transaction');
    }
  }

  /**
   * Sync a single table from Tally to Railway SQLite
   */
  async syncTable(tableConfig, tableType, incremental = false) {
    const tableName = tableConfig.name;
    console.log(`🔄 Syncing ${tableName}...`);
    
    try {
      // Check if we have mapping for this table
      const mapping = this.config.database_mapping[tableName];
      if (!mapping) {
        console.log(`   ⚠️  No mapping found for ${tableName}, skipping...`);
        return;
      }
      
      // Step 1: Generate TDL XML for this table
      const xmlRequest = this.generateTDLXML(tableConfig, incremental);
      
      // Step 2: Extract data from Tally
      console.log(`   📡 Extracting data from Tally...`);
      const xmlResponse = await this.postTallyXML(xmlRequest);
      
      if (!xmlResponse || xmlResponse.trim().length === 0) {
        console.log(`   ℹ️  No data returned from Tally for ${tableName}`);
        return;
      }
      
      // Step 3: Process XML to CSV format
      console.log(`   🔄 Processing XML response...`);
      const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
      
      // Step 4: Convert CSV to JSON
      const jsonData = this.csvToJSON(csvData, tableConfig);
      
      if (jsonData.length === 0) {
        console.log(`   ℹ️  No records found for ${tableName}`);
        return;
      }
      
      console.log(`   📊 Processed ${jsonData.length} records`);
      
      // Step 5: Add UUID metadata to each record
      const enrichedData = jsonData.map(record => ({
        ...record,
        company_id: this.config.company.id,        // UUID from local config
        division_id: this.config.company.division_id, // UUID from local config
        sync_timestamp: new Date().toISOString(),
        source: 'tally'
      }));
      
      // Step 6: Submit to Railway SQLite
      console.log(`   🚀 Submitting to Railway SQLite...`);
      const result = await this.submitToRailway(mapping.table, enrichedData, incremental);
      
      console.log(`   ✅ ${tableName}: synced ${jsonData.length} records successfully`);
      return result;
      
    } catch (error) {
      console.error(`   ❌ Failed to sync ${tableName}:`, error.message);
      // Don't throw - continue with other tables
    }
  }

  /**
   * Submit data to Railway SQLite
   */
  async submitToRailway(tableName, data, incremental = false) {
    const endpoint = `${this.config.railway.api_base}${this.config.railway.endpoints.bulk_sync}/${this.config.company.id}/${this.config.company.division_id}`;
    
    // Split data into batches
    const batchSize = this.config.railway.batch_size;
    const batches = [];
    
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    
    console.log(`     📦 Submitting ${batches.length} batch(es) of data...`);
    
    let totalProcessed = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const payload = {
        table: tableName,
        data: batch,
        sync_type: incremental ? 'incremental' : 'full',
        batch_info: {
          batch_number: i + 1,
          total_batches: batches.length,
          batch_size: batch.length
        },
        metadata: {
          source: 'windows-tally-sync',
          timestamp: new Date().toISOString(),
          table_name: tableName
        }
      };
      
      try {
        const response = await axios.post(endpoint, payload, {
          timeout: this.config.railway.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        totalProcessed += batch.length;
        console.log(`     ✅ Batch ${i + 1}/${batches.length}: ${batch.length} records processed`);
        
      } catch (error) {
        console.error(`     ❌ Batch ${i + 1}/${batches.length} failed:`, error.response?.data || error.message);
        
        // Retry logic
        if (this.config.sync.auto_retry && error.response?.status >= 500) {
          console.log(`     🔄 Retrying batch ${i + 1}...`);
          await this.delay(this.config.sync.retry_delay);
          
          try {
            const retryResponse = await axios.post(endpoint, payload, {
              timeout: this.config.railway.timeout,
              headers: {
                'Content-Type': 'application/json'
              }
            });
            totalProcessed += batch.length;
            console.log(`     ✅ Batch ${i + 1}/${batches.length}: ${batch.length} records processed (retry)`);
          } catch (retryError) {
            console.error(`     ❌ Batch ${i + 1}/${batches.length} failed on retry`);
          }
        }
      }
    }
    
    return {
      success: true,
      total_processed: totalProcessed,
      total_batches: batches.length
    };
  }

  /**
   * Show sync summary statistics
   */
  async showSyncSummary() {
    try {
      console.log('\n📊 Fetching sync summary...');
      const response = await axios.get(
        `${this.config.railway.api_base}${this.config.railway.endpoints.stats}/${this.config.company.id}/${this.config.company.division_id}`,
        { timeout: this.config.railway.timeout }
      );
      
      if (response.data.success) {
        const stats = response.data.data;
        console.log(`\n📈 Migration Summary:`);
        console.log(`   🏢 Company: ${this.config.company.name} (${this.config.company.id})`);
        console.log(`   🏭 Division: ${this.config.company.division_name} (${this.config.company.division_id})`);
        console.log(`   📊 Total Records: ${stats.total_records}`);
        
        Object.entries(stats.table_counts).forEach(([table, count]) => {
          if (count > 0) {
            console.log(`   • ${table}: ${count} records`);
          }
        });
      }
    } catch (error) {
      console.log('⚠️  Could not fetch sync summary:', error.message);
    }
  }

  /**
   * Generate TDL XML request (same logic as tally-database-loader)
   */
  generateTDLXML(tableConfig, incremental = false) {
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>TallyDatabaseLoaderReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>XML (Data Interchange)</SVEXPORTFORMAT>
        <SVFROMDATE>${this.config.tally.fromdate}</SVFROMDATE>
        <SVTODATE>${this.config.tally.todate}</SVTODATE>`;
    
    if (this.config.tally.company) {
      xml += `<SVCURRENTCOMPANY>${this.escapeHTML(this.config.tally.company)}</SVCURRENTCOMPANY>`;
    }
    
    xml += `</STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="TallyDatabaseLoaderReport">
            <FORMS>MyForm</FORMS>
          </REPORT>
          <FORM NAME="MyForm">
            <PARTS>MyPart01</PARTS>
          </FORM>
          <PART NAME="MyPart01">
            <LINES>MyLine01</LINES>
            <REPEAT>MyLine01 : MyCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="MyLine01">
            <FIELDS>`;
    
    // Add field declarations
    for (let i = 0; i < tableConfig.fields.length; i++) {
      xml += `Fld${String(i + 1).padStart(2, '0')},`;
    }
    xml = xml.slice(0, -1); // Remove last comma
    
    xml += `</FIELDS>
          </LINE>`;
    
    // Add field definitions (exact tally-database-loader logic)
    for (let i = 0; i < tableConfig.fields.length; i++) {
      const field = tableConfig.fields[i];
      xml += `<FIELD NAME="Fld${String(i + 1).padStart(2, '0')}">`;
      
      if (/^(\.\.)?[a-zA-Z0-9_]+$/g.test(field.field)) {
        if (field.type === 'text') {
          xml += `<SET>$${field.field}</SET>`;
        } else if (field.type === 'logical') {
          xml += `<SET>if $${field.field} then 1 else 0</SET>`;
        } else if (field.type === 'date') {
          xml += `<SET>if $$IsEmpty:$${field.field} then $$StrByCharCode:241 else $$PyrlYYYYMMDDFormat:$${field.field}:"-"</SET>`;
        } else if (field.type === 'number') {
          xml += `<SET>if $$IsEmpty:$${field.field} then "0" else $$String:$${field.field}</SET>`;
        } else if (field.type === 'amount') {
          xml += `<SET>$$StringFindAndReplace:(if $$IsDebit:$${field.field} then -$$NumValue:$${field.field} else $$NumValue:$${field.field}):"(-)":"-"</SET>`;
        } else if (field.type === 'quantity') {
          xml += `<SET>$$StringFindAndReplace:(if $$IsInwards:$${field.field} then $$Number:$$String:$${field.field}:"TailUnits" else -$$Number:$$String:$${field.field}:"TailUnits"):"(-)":"-"</SET>`;
        } else if (field.type === 'rate') {
          xml += `<SET>if $$IsEmpty:$${field.field} then 0 else $$Number:$${field.field}</SET>`;
        } else {
          xml += `<SET>${field.field}</SET>`;
        }
      } else {
        xml += `<SET>${field.field}</SET>`;
      }
      
      xml += `<XMLTAG>F${String(i + 1).padStart(2, '0')}</XMLTAG>`;
      xml += `</FIELD>`;
    }
    
    xml += `<FIELD NAME="FldBlank"><SET>""</SET></FIELD>`;

    // Collection definition
    xml += `<COLLECTION NAME="MyCollection">
            <TYPE>${tableConfig.collection}</TYPE>`;
    
    // Add fetch list
    if (tableConfig.fetch && tableConfig.fetch.length) {
      xml += `<FETCH>${tableConfig.fetch.join(',')}</FETCH>`;
    }
    
    // Add filters for incremental sync
    if (tableConfig.filters && tableConfig.filters.length) {
      xml += `<FILTER>`;
      tableConfig.filters.forEach((filter, index) => {
        xml += `Fltr${String(index + 1).padStart(2, '0')},`;
      });
      xml = xml.slice(0, -1);
      xml += `</FILTER>`;
    }
    
    xml += `</COLLECTION>`;
    
    // Add filter definitions
    if (tableConfig.filters && tableConfig.filters.length) {
      tableConfig.filters.forEach((filter, index) => {
        xml += `<SYSTEM TYPE="Formulae" NAME="Fltr${String(index + 1).padStart(2, '0')}">${filter}</SYSTEM>`;
      });
    }
    
    xml += `</TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    
    return xml;
  }

  /**
   * Send XML request to Tally
   */
  postTallyXML(xmlRequest) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.config.tally.server,
        port: this.config.tally.port,
        path: '',
        method: 'POST',
        headers: {
          'Content-Length': Buffer.byteLength(xmlRequest, 'utf16le'),
          'Content-Type': 'text/xml;charset=utf-16'
        }
      }, (res) => {
        let data = '';
        res.setEncoding('utf16le')
          .on('data', (chunk) => {
            data += chunk.toString();
          })
          .on('end', () => {
            resolve(data);
          })
          .on('error', (error) => {
            reject(error);
          });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(xmlRequest, 'utf16le');
      req.end();
    });
  }

  /**
   * Process XML response to CSV format (exact tally-database-loader logic)
   */
  processXMLToCSV(xmlData, tableConfig) {
    let processed = xmlData;
    
    // Remove XML envelope and clean up
    processed = processed.replace('<ENVELOPE>', '');
    processed = processed.replace('</ENVELOPE>', '');
    processed = processed.replace(/\<FLDBLANK\>\<\/FLDBLANK\>/g, '');
    processed = processed.replace(/\s+\r\n/g, '');
    processed = processed.replace(/\r\n/g, '');
    processed = processed.replace(/\t/g, ' ');
    processed = processed.replace(/\s+\<F/g, '<F');
    processed = processed.replace(/\<\/F\d+\>/g, '');
    processed = processed.replace(/\<F01\>/g, '\r\n');
    processed = processed.replace(/\<F\d+\>/g, '\t');
    
    // Escape HTML entities
    processed = processed.replace(/&amp;/g, '&');
    processed = processed.replace(/&lt;/g, '<');
    processed = processed.replace(/&gt;/g, '>');
    processed = processed.replace(/&quot;/g, '"');
    processed = processed.replace(/&apos;/g, "'");
    processed = processed.replace(/&tab;/g, '');
    processed = processed.replace(/&#\d+;/g, "");
    
    // Add column headers
    const headers = tableConfig.fields.map(f => f.name).join('\t');
    return headers + processed;
  }

  /**
   * Convert CSV to JSON array
   */
  csvToJSON(csvData, tableConfig) {
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length <= 1) return [];
    
    const headers = lines[0].split('\t');
    const records = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      const record = {};
      
      headers.forEach((header, index) => {
        const fieldConfig = tableConfig.fields.find(f => f.name === header);
        record[header] = this.transformValue(values[index] || '', fieldConfig?.type || 'text');
      });
      
      // Only add records with valid GUID
      if (record.guid && record.guid.trim()) {
        records.push(record);
      }
    }
    
    return records;
  }

  /**
   * Transform value based on field type
   */
  transformValue(value, type) {
    if (!value || value.trim() === '' || value === '±') return null;
    
    const trimmedValue = value.trim();
    
    switch (type) {
      case 'logical':
        return trimmedValue === '1' || trimmedValue.toLowerCase() === 'true';
      case 'number':
      case 'amount':
      case 'quantity':
      case 'rate':
        const numValue = parseFloat(trimmedValue);
        return isNaN(numValue) ? 0 : numValue;
      case 'date':
        if (trimmedValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return trimmedValue;
        }
        return null;
      default:
        return trimmedValue;
    }
  }

  /**
   * Create test XML for connection testing
   */
  createTestTallyXML() {
    return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>List of Accounts</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
  }

  /**
   * Utility function to add delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Escape HTML entities
   */
  escapeHTML(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// Main execution
async function main() {
  console.log('💻 Windows Tally Sync Client');
  console.log('============================\n');
  
  const sync = new WindowsTallySync();
  
  try {
    await sync.sync();
    process.exit(0);
  } catch (error) {
    console.error('💥 Windows sync process failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = WindowsTallySync;

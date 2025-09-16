#!/usr/bin/env node

/**
 * Complete Tally Data Migration
 * Migrates all Tally data including 6000+ vouchers and related data
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

// Load configurations
const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class CompleteTallyMigration {
  constructor() {
    this.config = config;
    this.masterTables = tallyExportConfig.master || [];
    this.transactionTables = tallyExportConfig.transaction || [];
    
    // Migration statistics
    this.stats = {
      master_data: {},
      transaction_data: {},
      total_records: 0,
      total_tables: 0,
      errors: []
    };
    
    console.log(`🏢 Company: ${this.config.company.name}`);
    console.log(`🆔 Company ID: ${this.config.company.id}`);
    console.log(`🏭 Division: ${this.config.company.division_name}`);
    console.log(`🆔 Division ID: ${this.config.company.division_id}`);
  }

  async migrate() {
    console.log('\n🚀 Starting Complete Tally Data Migration...');
    console.log('===============================================\n');
    
    try {
      // Step 1: Test connections
      await this.testConnections();
      
      // Step 2: Migrate Master Data
      await this.migrateMasterData();
      
      // Step 3: Migrate Transaction Data (Vouchers & Related)
      await this.migrateTransactionData();
      
      // Step 4: Verify migration and show counts
      await this.verifyMigration();
      
      // Step 5: Show final summary
      this.showFinalSummary();
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  async testConnections() {
    console.log('🔍 Testing Connections...');
    
    // Test Tally connection
    try {
      const testXML = this.createTestTallyXML();
      await this.postTallyXML(testXML);
      console.log('✅ Tally connection successful (localhost:9000)');
    } catch (error) {
      throw new Error(`Tally connection failed: ${error.message}. Make sure Tally is running with XML Server enabled.`);
    }
    
    // Test Railway connection
    try {
      const response = await axios.get(`${this.config.railway.api_base}/api/v1/health`, {
        timeout: this.config.railway.timeout
      });
      console.log('✅ Railway SQLite connection successful');
      console.log(`📊 Railway Response:`, response.data.message);
    } catch (error) {
      throw new Error(`Railway connection failed: ${error.message}. Make sure Railway server is deployed.`);
    }
    
    console.log();
  }

  async migrateMasterData() {
    console.log('📊 Migrating Master Data...');
    console.log('============================');
    
    // Sort master tables by priority
    const sortedMasterTables = [...this.masterTables].sort((a, b) => {
      const priorityA = this.config.database_mapping[a.name]?.sync_priority || 999;
      const priorityB = this.config.database_mapping[b.name]?.sync_priority || 999;
      return priorityA - priorityB;
    });
    
    for (const tableConfig of sortedMasterTables) {
      try {
        const count = await this.migrateTable(tableConfig, 'master');
        this.stats.master_data[tableConfig.name] = count;
        this.stats.total_records += count;
        this.stats.total_tables++;
        
        console.log(`✅ ${tableConfig.name}: ${count} records migrated`);
      } catch (error) {
        console.log(`❌ ${tableConfig.name}: Failed - ${error.message}`);
        this.stats.errors.push(`${tableConfig.name}: ${error.message}`);
      }
    }
    
    const masterTotal = Object.values(this.stats.master_data).reduce((sum, count) => sum + count, 0);
    console.log(`\n📊 Master Data Summary: ${masterTotal} total records\n`);
  }

  async migrateTransactionData() {
    console.log('💼 Migrating Transaction Data...');
    console.log('=================================');
    
    for (const tableConfig of this.transactionTables) {
      try {
        const count = await this.migrateTable(tableConfig, 'transaction');
        this.stats.transaction_data[tableConfig.name] = count;
        this.stats.total_records += count;
        this.stats.total_tables++;
        
        console.log(`✅ ${tableConfig.name}: ${count} records migrated`);
        
        // Special handling for vouchers
        if (tableConfig.name === 'trn_voucher') {
          console.log(`   🎯 Voucher Migration: ${count} vouchers (target was 6000+)`);
        }
      } catch (error) {
        console.log(`❌ ${tableConfig.name}: Failed - ${error.message}`);
        this.stats.errors.push(`${tableConfig.name}: ${error.message}`);
      }
    }
    
    const transactionTotal = Object.values(this.stats.transaction_data).reduce((sum, count) => sum + count, 0);
    console.log(`\n💼 Transaction Data Summary: ${transactionTotal} total records\n`);
  }

  async migrateTable(tableConfig, tableType) {
    const tableName = tableConfig.name;
    
    try {
      // Check if we have mapping for this table
      const mapping = this.config.database_mapping[tableName];
      if (!mapping) {
        console.log(`   ⚠️  No mapping found for ${tableName}, skipping...`);
        return 0;
      }
      
      // Generate TDL XML
      const xmlRequest = this.generateTDLXML(tableConfig);
      
      // Extract data from Tally
      const xmlResponse = await this.postTallyXML(xmlRequest);
      
      if (!xmlResponse || xmlResponse.trim().length === 0) {
        return 0;
      }
      
      // Process XML to CSV
      const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
      
      // Convert to JSON
      const jsonData = this.csvToJSON(csvData, tableConfig);
      
      if (jsonData.length === 0) {
        return 0;
      }
      
      // Add UUID metadata
      const enrichedData = jsonData.map(record => ({
        ...record,
        company_id: this.config.company.id,
        division_id: this.config.company.division_id,
        sync_timestamp: new Date().toISOString(),
        source: 'tally'
      }));
      
      // Submit to Railway SQLite
      await this.submitToRailway(mapping.table, enrichedData);
      
      return jsonData.length;
      
    } catch (error) {
      throw new Error(`Migration failed for ${tableName}: ${error.message}`);
    }
  }

  async submitToRailway(tableName, data) {
    const endpoint = `${this.config.railway.api_base}/api/v1/bulk-sync/${this.config.company.id}/${this.config.company.division_id}`;
    
    // Split into batches
    const batchSize = this.config.railway.batch_size;
    const batches = [];
    
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    
    let totalProcessed = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const payload = {
        table: tableName,
        data: batch,
        sync_type: 'full',
        metadata: {
          source: 'windows-migration',
          timestamp: new Date().toISOString()
        }
      };
      
      try {
        const response = await axios.post(endpoint, payload, {
          timeout: this.config.railway.timeout,
          headers: { 'Content-Type': 'application/json' }
        });
        
        totalProcessed += batch.length;
        
        if (batches.length > 1) {
          process.stdout.write(`     📦 Batch ${i + 1}/${batches.length}: ${batch.length} records... `);
        }
        
      } catch (error) {
        throw new Error(`Railway submission failed: ${error.response?.data?.error || error.message}`);
      }
    }
    
    if (batches.length > 1) {
      console.log(`✅ All batches completed`);
    }
    
    return totalProcessed;
  }

  async verifyMigration() {
    console.log('🔍 Verifying Migration...');
    console.log('==========================');
    
    try {
      const response = await axios.get(
        `${this.config.railway.api_base}/api/v1/stats/${this.config.company.id}/${this.config.company.division_id}`,
        { timeout: this.config.railway.timeout }
      );
      
      if (response.data.success) {
        const railwayStats = response.data.data;
        
        console.log('📊 Railway SQLite Database Counts:');
        Object.entries(railwayStats.table_counts).forEach(([table, count]) => {
          console.log(`   • ${table}: ${count} records`);
        });
        
        console.log(`\n📈 Total Records in Railway SQLite: ${railwayStats.total_records}`);
        
        // Compare with our migration stats
        const ourTotal = this.stats.total_records;
        if (railwayStats.total_records >= ourTotal * 0.9) { // Allow 10% variance
          console.log('✅ Migration verification successful!');
        } else {
          console.log(`⚠️  Record count mismatch: Expected ~${ourTotal}, Got ${railwayStats.total_records}`);
        }
      }
    } catch (error) {
      console.log('⚠️  Could not verify migration via Railway API:', error.message);
    }
    
    console.log();
  }

  showFinalSummary() {
    console.log('🎉 Migration Completed!');
    console.log('========================\n');
    
    console.log('📊 Master Data Migrated:');
    Object.entries(this.stats.master_data).forEach(([table, count]) => {
      if (count > 0) {
        console.log(`   ✅ ${table}: ${count} records`);
      }
    });
    
    console.log('\n💼 Transaction Data Migrated:');
    Object.entries(this.stats.transaction_data).forEach(([table, count]) => {
      if (count > 0) {
        console.log(`   ✅ ${table}: ${count} records`);
        if (table === 'trn_voucher') {
          console.log(`       🎯 Vouchers: ${count} (target was 6000+)`);
        }
      }
    });
    
    console.log(`\n📈 Migration Summary:`);
    console.log(`   📊 Total Records: ${this.stats.total_records}`);
    console.log(`   📋 Total Tables: ${this.stats.total_tables}`);
    console.log(`   🏢 Company: ${this.config.company.name} (${this.config.company.id})`);
    console.log(`   🏭 Division: ${this.config.company.division_name} (${this.config.company.division_id})`);
    console.log(`   🗄️ Database: Railway SQLite`);
    
    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️  Errors (${this.stats.errors.length}):`);
      this.stats.errors.forEach(error => console.log(`   • ${error}`));
    }
    
    console.log('\n🎯 Next Steps:');
    console.log('   • Check Railway SQLite database for all migrated data');
    console.log('   • Use API endpoints to query and verify data');
    console.log('   • Set up scheduled syncs for ongoing updates');
  }

  // TDL XML Generation (exact tally-database-loader logic)
  generateTDLXML(tableConfig) {
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
    xml = xml.slice(0, -1);
    
    xml += `</FIELDS>
          </LINE>`;
    
    // Add field definitions
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
    xml += `<COLLECTION NAME="MyCollection"><TYPE>${tableConfig.collection}</TYPE>`;
    
    if (tableConfig.fetch && tableConfig.fetch.length) {
      xml += `<FETCH>${tableConfig.fetch.join(',')}</FETCH>`;
    }
    
    if (tableConfig.filters && tableConfig.filters.length) {
      xml += `<FILTER>`;
      tableConfig.filters.forEach((filter, index) => {
        xml += `Fltr${String(index + 1).padStart(2, '0')},`;
      });
      xml = xml.slice(0, -1);
      xml += `</FILTER>`;
    }
    
    xml += `</COLLECTION>`;
    
    if (tableConfig.filters && tableConfig.filters.length) {
      tableConfig.filters.forEach((filter, index) => {
        xml += `<SYSTEM TYPE="Formulae" NAME="Fltr${String(index + 1).padStart(2, '0')}">${filter}</SYSTEM>`;
      });
    }
    
    xml += `</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    return xml;
  }

  // Send XML to Tally
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
          .on('data', (chunk) => data += chunk.toString())
          .on('end', () => resolve(data))
          .on('error', reject);
      });
      
      req.on('error', reject);
      req.write(xmlRequest, 'utf16le');
      req.end();
    });
  }

  // Process XML to CSV (exact tally-database-loader logic)
  processXMLToCSV(xmlData, tableConfig) {
    let processed = xmlData
      .replace('<ENVELOPE>', '')
      .replace('</ENVELOPE>', '')
      .replace(/\<FLDBLANK\>\<\/FLDBLANK\>/g, '')
      .replace(/\s+\r\n/g, '')
      .replace(/\r\n/g, '')
      .replace(/\t/g, ' ')
      .replace(/\s+\<F/g, '<F')
      .replace(/\<\/F\d+\>/g, '')
      .replace(/\<F01\>/g, '\r\n')
      .replace(/\<F\d+\>/g, '\t')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&tab;/g, '')
      .replace(/&#\d+;/g, "");
    
    const headers = tableConfig.fields.map(f => f.name).join('\t');
    return headers + processed;
  }

  // Convert CSV to JSON
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
      
      if (record.guid && record.guid.trim()) {
        records.push(record);
      }
    }
    
    return records;
  }

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

// Run migration
async function main() {
  const migrator = new CompleteTallyMigration();
  
  try {
    await migrator.migrate();
    process.exit(0);
  } catch (error) {
    console.error('💥 Migration process failed:', error);
    process.exit(1);
  }
}

main();

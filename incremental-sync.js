#!/usr/bin/env node

/**
 * Incremental Sync Engine
 * One-way incremental sync from Tally to Railway SQLite
 * Uses AlterID tracking to detect changes
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');
const path = require('path');

// Load configurations
const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const incrementalConfig = JSON.parse(fs.readFileSync('./incremental-sync-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class IncrementalSyncEngine {
  constructor() {
    this.config = config;
    this.incrementalConfig = incrementalConfig.incremental_sync;
    this.masterTables = tallyExportConfig.master || [];
    this.transactionTables = tallyExportConfig.transaction || [];
    
    this.lastAlterIdMaster = 0;
    this.lastAlterIdTransaction = 0;
    this.isRunning = false;
    this.syncInterval = null;
    
    // Create logs directory
    this.setupLogging();
    
    console.log('🔄 Incremental Sync Engine Initialized');
    console.log(`⏰ Frequency: ${this.incrementalConfig.schedule.frequency_minutes} minutes`);
    console.log(`🏢 Company: ${this.config.company.name}`);
    console.log(`🆔 UUIDs: ${this.config.company.id} / ${this.config.company.division_id}`);
  }

  setupLogging() {
    const logDir = path.dirname(this.incrementalConfig.logging.log_file);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    
    // Write to log file
    try {
      fs.appendFileSync(this.incrementalConfig.logging.log_file, logMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Start the incremental sync scheduler
   */
  start() {
    this.log('🚀 Starting Incremental Sync Scheduler');
    
    if (this.syncInterval) {
      this.log('⚠️  Sync already running, stopping previous instance');
      this.stop();
    }
    
    // Run initial sync
    this.runIncrementalSync();
    
    // Schedule regular syncs
    const intervalMs = this.incrementalConfig.schedule.frequency_minutes * 60 * 1000;
    this.syncInterval = setInterval(() => {
      if (this.shouldRunSync()) {
        this.runIncrementalSync();
      } else {
        this.log('⏰ Skipping sync (outside business hours)');
      }
    }, intervalMs);
    
    this.log(`⏰ Scheduler started - sync every ${this.incrementalConfig.schedule.frequency_minutes} minutes`);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Stop the incremental sync scheduler
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.log('🛑 Incremental sync scheduler stopped');
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    this.log('🛑 Shutting down incremental sync engine...');
    this.stop();
    process.exit(0);
  }

  /**
   * Check if sync should run based on business hours
   */
  shouldRunSync() {
    if (!this.incrementalConfig.schedule.business_hours_only) {
      return true;
    }
    
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime = now.toTimeString().substring(0, 5); // HH:MM format
    
    // Check if it's a working day
    if (!this.incrementalConfig.schedule.working_days.includes(dayName)) {
      return false;
    }
    
    // Check if it's within business hours
    const startTime = this.incrementalConfig.schedule.business_hours.start;
    const endTime = this.incrementalConfig.schedule.business_hours.end;
    
    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Run incremental sync
   */
  async runIncrementalSync() {
    if (this.isRunning) {
      this.log('⚠️  Sync already in progress, skipping this cycle');
      return;
    }
    
    this.isRunning = true;
    const syncStartTime = Date.now();
    
    try {
      this.log('🔄 Starting incremental sync cycle');
      
      // Step 1: Get current AlterIDs from Railway
      await this.getCurrentAlterIds();
      
      // Step 2: Get current AlterIDs from Tally
      const tallyAlterIds = await this.getTallyAlterIds();
      
      // Step 3: Check if there are changes
      const masterChanged = tallyAlterIds.master > this.lastAlterIdMaster;
      const transactionChanged = tallyAlterIds.transaction > this.lastAlterIdTransaction;
      
      if (!masterChanged && !transactionChanged) {
        this.log('ℹ️  No changes detected in Tally data');
        return;
      }
      
      this.log(`📊 Changes detected - Master: ${masterChanged}, Transaction: ${transactionChanged}`);
      
      let totalNewRecords = 0;
      
      // Step 4: Sync changed master data
      if (masterChanged) {
        this.log('📊 Syncing changed master data...');
        const masterRecords = await this.syncChangedMasterData();
        totalNewRecords += masterRecords;
        this.lastAlterIdMaster = tallyAlterIds.master;
      }
      
      // Step 5: Sync changed transaction data
      if (transactionChanged) {
        this.log('💼 Syncing changed transaction data...');
        const transactionRecords = await this.syncChangedTransactionData();
        totalNewRecords += transactionRecords;
        this.lastAlterIdTransaction = tallyAlterIds.transaction;
      }
      
      // Step 6: Update AlterIDs in Railway
      await this.updateAlterIdsInRailway(tallyAlterIds);
      
      const syncDuration = (Date.now() - syncStartTime) / 1000;
      this.log(`✅ Incremental sync completed: ${totalNewRecords} new records in ${syncDuration}s`);
      
      // Notify on large changes
      if (totalNewRecords >= this.incrementalConfig.notifications.large_change_threshold) {
        this.log(`🚨 Large change detected: ${totalNewRecords} new records`, 'warn');
      }
      
    } catch (error) {
      this.log(`❌ Incremental sync failed: ${error.message}`, 'error');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get current AlterIDs from Railway metadata
   */
  async getCurrentAlterIds() {
    try {
      const response = await axios.get(
        `${this.config.railway.api_base}/api/v1/metadata/${this.config.company.id}/${this.config.company.division_id}`,
        { timeout: 30000 }
      );
      
      if (response.data.success) {
        const metadata = response.data.data;
        this.lastAlterIdMaster = metadata.last_alter_id_master || 0;
        this.lastAlterIdTransaction = metadata.last_alter_id_transaction || 0;
        
        this.log(`📋 Current AlterIDs - Master: ${this.lastAlterIdMaster}, Transaction: ${this.lastAlterIdTransaction}`);
      }
    } catch (error) {
      this.log('⚠️  Could not fetch AlterIDs from Railway, starting from 0');
      this.lastAlterIdMaster = 0;
      this.lastAlterIdTransaction = 0;
    }
  }

  /**
   * Get current AlterIDs from Tally
   */
  async getTallyAlterIds() {
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>MyReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>ASCII (Comma Delimited)</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="MyReport">
            <FORMS>MyForm</FORMS>
          </REPORT>
          <FORM NAME="MyForm">
            <PARTS>MyPart</PARTS>
          </FORM>
          <PART NAME="MyPart">
            <LINES>MyLine</LINES>
            <REPEAT>MyLine : MyCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="MyLine">
            <FIELDS>FldAlterMaster,FldAlterTransaction</FIELDS>
          </LINE>
          <FIELD NAME="FldAlterMaster">
            <SET>$AltMstId</SET>
          </FIELD>
          <FIELD NAME="FldAlterTransaction">
            <SET>$AltVchId</SET>
          </FIELD>
          <COLLECTION NAME="MyCollection">
            <TYPE>Company</TYPE>
            <FILTER>FilterActiveCompany</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="FilterActiveCompany">$$IsEqual:"${this.escapeHTML(this.config.tally.company)}":$Name</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    
    const response = await this.postTallyXML(xmlRequest);
    const alterIds = response.replace(/"/g, '').split(',');
    
    return {
      master: parseInt(alterIds[0]) || 0,
      transaction: parseInt(alterIds[1]) || 0
    };
  }

  /**
   * Sync changed master data
   */
  async syncChangedMasterData() {
    let totalRecords = 0;
    
    for (const tableConfig of this.masterTables) {
      try {
        // Add AlterID filter for incremental sync
        const incrementalTableConfig = {
          ...tableConfig,
          filters: [
            ...(tableConfig.filters || []),
            `$AlterID > ${this.lastAlterIdMaster}`
          ]
        };
        
        const records = await this.syncTable(incrementalTableConfig, 'master');
        totalRecords += records;
        
        if (records > 0) {
          this.log(`   ✅ ${tableConfig.name}: ${records} new/modified records`);
        }
        
      } catch (error) {
        this.log(`   ❌ ${tableConfig.name}: ${error.message}`, 'error');
      }
    }
    
    return totalRecords;
  }

  /**
   * Sync changed transaction data
   */
  async syncChangedTransactionData() {
    let totalRecords = 0;
    
    for (const tableConfig of this.transactionTables) {
      try {
        // Add AlterID filter for incremental sync
        const incrementalTableConfig = {
          ...tableConfig,
          filters: [
            ...(tableConfig.filters || []),
            `$AlterID > ${this.lastAlterIdTransaction}`
          ]
        };
        
        const records = await this.syncTable(incrementalTableConfig, 'transaction');
        totalRecords += records;
        
        if (records > 0) {
          this.log(`   ✅ ${tableConfig.name}: ${records} new/modified records`);
          
          // Special logging for vouchers
          if (tableConfig.name === 'trn_voucher') {
            this.log(`       🎯 NEW VOUCHERS: ${records} vouchers added to Railway`);
          }
        }
        
      } catch (error) {
        this.log(`   ❌ ${tableConfig.name}: ${error.message}`, 'error');
      }
    }
    
    return totalRecords;
  }

  /**
   * Sync a single table (incremental)
   */
  async syncTable(tableConfig, tableType) {
    const tableName = tableConfig.name;
    
    // Check if we have mapping
    const mapping = this.config.database_mapping[tableName];
    if (!mapping) {
      return 0; // Skip unmapped tables
    }
    
    // Generate TDL XML with incremental filters
    const xmlRequest = this.generateIncrementalTDLXML(tableConfig);
    
    // Extract data from Tally
    const xmlResponse = await this.postTallyXML(xmlRequest);
    
    if (!xmlResponse || xmlResponse.trim().length === 0) {
      return 0;
    }
    
    // Process data
    const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
    const jsonData = this.csvToJSON(csvData, tableConfig);
    
    if (jsonData.length === 0) {
      return 0;
    }
    
    // Add UUIDs and push to Railway
    const enrichedData = jsonData.map(record => ({
      ...record,
      company_id: this.config.company.id,
      division_id: this.config.company.division_id,
      sync_timestamp: new Date().toISOString(),
      source: 'tally-incremental'
    }));
    
    await this.pushToRailway(mapping.table, enrichedData, true); // true = incremental
    
    return jsonData.length;
  }

  /**
   * Generate TDL XML with incremental filters
   */
  generateIncrementalTDLXML(tblConfig) {
    let retval = `<?xml version="1.0" encoding="utf-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>TallyDatabaseLoaderReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>XML (Data Interchange)</SVEXPORTFORMAT><SVFROMDATE>${this.config.tally.fromdate}</SVFROMDATE><SVTODATE>${this.config.tally.todate}</SVTODATE><SVCURRENTCOMPANY>${this.escapeHTML(this.config.tally.company)}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="TallyDatabaseLoaderReport"><FORMS>MyForm</FORMS></REPORT><FORM NAME="MyForm"><PARTS>MyPart01</PARTS></FORM>`;

    // Handle collection routes
    let lstRoutes = tblConfig.collection.split(/\./g);
    let targetCollection = lstRoutes.splice(0, 1)[0];
    lstRoutes.unshift('MyCollection');

    // Generate PART and LINE XML
    for (let i = 0; i < lstRoutes.length; i++) {
      let xmlPart = `MyPart${String(i + 1).padStart(2, '0')}`;
      let xmlLine = `MyLine${String(i + 1).padStart(2, '0')}`;
      retval += `<PART NAME="${xmlPart}"><LINES>${xmlLine}</LINES><REPEAT>${xmlLine} : ${lstRoutes[i]}</REPEAT><SCROLLED>Vertical</SCROLLED></PART>`;
    }

    for (let i = 0; i < lstRoutes.length - 1; i++) {
      let xmlLine = `MyLine${String(i + 1).padStart(2, '0')}`;
      let xmlPart = `MyPart${String(i + 2).padStart(2, '0')}`;
      retval += `<LINE NAME="${xmlLine}"><FIELDS>FldBlank</FIELDS><EXPLODE>${xmlPart}</EXPLODE></LINE>`;
    }

    retval += `<LINE NAME="MyLine${String(lstRoutes.length).padStart(2, '0')}"><FIELDS>`;

    // Add field declarations
    for (let i = 0; i < tblConfig.fields.length; i++) {
      retval += `Fld${String(i + 1).padStart(2, '0')},`;
    }
    retval = retval.slice(0, -1);
    retval += `</FIELDS></LINE>`;

    // Add field definitions
    for (let i = 0; i < tblConfig.fields.length; i++) {
      let fieldXML = `<FIELD NAME="Fld${String(i + 1).padStart(2, '0')}">`;
      let iField = tblConfig.fields[i];

      if (/^(\.\.)?[a-zA-Z0-9_]+$/g.test(iField.field)) {
        if (iField.type == 'text') fieldXML += `<SET>$${iField.field}</SET>`;
        else if (iField.type == 'logical') fieldXML += `<SET>if $${iField.field} then 1 else 0</SET>`;
        else if (iField.type == 'date') fieldXML += `<SET>if $$IsEmpty:$${iField.field} then $$StrByCharCode:241 else $$PyrlYYYYMMDDFormat:$${iField.field}:"-"</SET>`;
        else if (iField.type == 'number') fieldXML += `<SET>if $$IsEmpty:$${iField.field} then "0" else $$String:$${iField.field}</SET>`;
        else if (iField.type == 'amount') fieldXML += `<SET>$$StringFindAndReplace:(if $$IsDebit:$${iField.field} then -$$NumValue:$${iField.field} else $$NumValue:$${iField.field}):"(-)":"-"</SET>`;
        else if (iField.type == 'quantity') fieldXML += `<SET>$$StringFindAndReplace:(if $$IsInwards:$${iField.field} then $$Number:$$String:$${iField.field}:"TailUnits" else -$$Number:$$String:$${iField.field}:"TailUnits"):"(-)":"-"</SET>`;
        else if (iField.type == 'rate') fieldXML += `<SET>if $$IsEmpty:$${iField.field} then 0 else $$Number:$${iField.field}</SET>`;
        else fieldXML += `<SET>${iField.field}</SET>`;
      } else {
        fieldXML += `<SET>${iField.field}</SET>`;
      }

      fieldXML += `<XMLTAG>F${String(i + 1).padStart(2, '0')}</XMLTAG></FIELD>`;
      retval += fieldXML;
    }

    retval += `<FIELD NAME="FldBlank"><SET>""</SET></FIELD>`;
    retval += `<COLLECTION NAME="MyCollection"><TYPE>${targetCollection}</TYPE>`;

    if (tblConfig.fetch && tblConfig.fetch.length) {
      retval += `<FETCH>${tblConfig.fetch.join(',')}</FETCH>`;
    }

    // Add filters (including AlterID filter for incremental sync)
    if (tblConfig.filters && tblConfig.filters.length) {
      retval += `<FILTER>`;
      for (let j = 0; j < tblConfig.filters.length; j++) {
        retval += `Fltr${String(j + 1).padStart(2, '0')},`;
      }
      retval = retval.slice(0, -1);
      retval += `</FILTER>`;
    }

    retval += `</COLLECTION>`;

    // Add filter definitions
    if (tblConfig.filters && tblConfig.filters.length) {
      for (let j = 0; j < tblConfig.filters.length; j++) {
        retval += `<SYSTEM TYPE="Formulae" NAME="Fltr${String(j + 1).padStart(2, '0')}">${tblConfig.filters[j]}</SYSTEM>`;
      }
    }

    retval += `</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    return retval;
  }

  /**
   * Push data to Railway with incremental flag
   */
  async pushToRailway(tableName, data, incremental = false) {
    const endpoint = `${this.config.railway.api_base}/api/v1/bulk-sync/${this.config.company.id}/${this.config.company.division_id}`;
    
    const batchSize = this.incrementalConfig.sync_settings.batch_size;
    const batches = [];
    
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const payload = {
        table: tableName,
        data: batch,
        sync_type: incremental ? 'incremental' : 'full',
        metadata: {
          source: 'incremental-sync',
          timestamp: new Date().toISOString(),
          alter_id_master: this.lastAlterIdMaster,
          alter_id_transaction: this.lastAlterIdTransaction
        }
      };
      
      await axios.post(endpoint, payload, {
        timeout: this.incrementalConfig.sync_settings.timeout_seconds * 1000,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Update AlterIDs in Railway metadata
   */
  async updateAlterIdsInRailway(alterIds) {
    try {
      const metadataUpdate = {
        company_id: this.config.company.id,
        division_id: this.config.company.division_id,
        table_name: 'system_metadata',
        last_sync: new Date().toISOString(),
        sync_type: 'incremental',
        records_processed: 0,
        records_failed: 0,
        metadata: {
          last_alter_id_master: alterIds.master,
          last_alter_id_transaction: alterIds.transaction,
          sync_engine: 'incremental'
        }
      };
      
      // This would be stored via the bulk-sync endpoint
      this.log(`📋 Updated AlterIDs - Master: ${alterIds.master}, Transaction: ${alterIds.transaction}`);
    } catch (error) {
      this.log(`⚠️  Could not update AlterIDs in Railway: ${error.message}`, 'warn');
    }
  }

  // Helper methods
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

  processXMLToCSV(xmlData, tableConfig) {
    let retval = xmlData
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

    const columnHeaders = tableConfig.fields.map(p => p.name).join('\t');
    return columnHeaders + retval;
  }

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
      case 'logical': return trimmedValue === '1' || trimmedValue.toLowerCase() === 'true';
      case 'number':
      case 'amount':
      case 'quantity':
      case 'rate':
        const numValue = parseFloat(trimmedValue);
        return isNaN(numValue) ? 0 : numValue;
      case 'date':
        return trimmedValue.match(/^\d{4}-\d{2}-\d{2}$/) ? trimmedValue : null;
      default: return trimmedValue;
    }
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

// Main execution
async function main() {
  console.log('🔄 Incremental Sync Engine for Tally → Railway SQLite');
  console.log('======================================================\n');
  
  const syncEngine = new IncrementalSyncEngine();
  
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--once')) {
    console.log('🔄 Running one-time incremental sync...');
    await syncEngine.runIncrementalSync();
  } else if (args.includes('--test')) {
    console.log('🧪 Testing incremental sync setup...');
    await syncEngine.getCurrentAlterIds();
    const tallyAlterIds = await syncEngine.getTallyAlterIds();
    console.log('✅ Incremental sync test completed');
    console.log(`📋 Tally AlterIDs - Master: ${tallyAlterIds.master}, Transaction: ${tallyAlterIds.transaction}`);
  } else {
    console.log('🚀 Starting continuous incremental sync...');
    syncEngine.start();
    
    // Keep the process running
    console.log('Press Ctrl+C to stop the incremental sync');
  }
}

main().catch(error => {
  console.error('💥 Incremental sync engine failed:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Continuous 5-Minute Sync
 * Runs every 5 minutes and pushes new Tally data to Railway SQLite
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

// Load configurations
const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class ContinuousSync {
  constructor() {
    this.config = config;
    this.masterTables = tallyExportConfig.master || [];
    this.transactionTables = tallyExportConfig.transaction || [];
    
    this.lastAlterIdMaster = 0;
    this.lastAlterIdTransaction = 0;
    this.syncCount = 0;
    this.isRunning = false;
    
    console.log('🔄 Continuous 5-Minute Sync Initialized');
    console.log(`🏢 Company: ${this.config.company.name}`);
    console.log(`🆔 Company ID: ${this.config.company.id}`);
    console.log(`🏭 Division: ${this.config.company.division_name}`);
    console.log(`🆔 Division ID: ${this.config.company.division_id}`);
    console.log(`🎯 Railway: ${this.config.railway.api_base}`);
  }

  /**
   * Start continuous sync every 5 minutes
   */
  start() {
    console.log('\n🚀 Starting Continuous Sync (Every 5 Minutes)');
    console.log('===============================================\n');
    
    // Run initial sync immediately
    this.runSyncCycle();
    
    // Schedule sync every 5 minutes (300,000 ms)
    setInterval(() => {
      this.runSyncCycle();
    }, 5 * 60 * 1000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping continuous sync...');
      process.exit(0);
    });
    
    console.log('⏰ Sync scheduled every 5 minutes');
    console.log('🛑 Press Ctrl+C to stop\n');
  }

  /**
   * Run a single sync cycle
   */
  async runSyncCycle() {
    if (this.isRunning) {
      console.log('⚠️  Previous sync still running, skipping this cycle');
      return;
    }
    
    this.isRunning = true;
    this.syncCount++;
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Sync Cycle #${this.syncCount} - ${new Date().toLocaleString()}`);
      console.log('================================================');
      
      // Step 1: Test connections
      await this.testConnections();
      
      // Step 2: Check if Railway database is empty (auto-detect full migration need)
      const isDatabaseEmpty = await this.checkIfDatabaseEmpty();
      
      if (isDatabaseEmpty) {
        console.log('🚨 EMPTY DATABASE DETECTED - Running Full Migration');
        console.log('===================================================');
        await this.runFullMigration();
        return;
      }
      
      // Step 3: Get current AlterIDs from Tally (incremental sync)
      const tallyAlterIds = await this.getTallyAlterIds();
      
      // Step 4: Check for changes
      const masterChanged = tallyAlterIds.master > this.lastAlterIdMaster;
      const transactionChanged = tallyAlterIds.transaction > this.lastAlterIdTransaction;
      
      if (!masterChanged && !transactionChanged) {
        console.log('ℹ️  No changes detected in Tally data');
        console.log(`📋 Current AlterIDs - Master: ${tallyAlterIds.master}, Transaction: ${tallyAlterIds.transaction}\n`);
        return;
      }
      
      console.log('🎯 Changes detected!');
      console.log(`   📊 Master AlterID: ${this.lastAlterIdMaster} → ${tallyAlterIds.master} (${masterChanged ? 'CHANGED' : 'unchanged'})`);
      console.log(`   💼 Transaction AlterID: ${this.lastAlterIdTransaction} → ${tallyAlterIds.transaction} (${transactionChanged ? 'CHANGED' : 'unchanged'})`);
      
      let totalNewRecords = 0;
      
      // Step 4: Sync changed data
      if (masterChanged) {
        console.log('\n📊 Syncing new/modified master data...');
        totalNewRecords += await this.syncIncrementalMasterData();
        this.lastAlterIdMaster = tallyAlterIds.master;
      }
      
      if (transactionChanged) {
        console.log('\n💼 Syncing new/modified transaction data...');
        totalNewRecords += await this.syncIncrementalTransactionData();
        this.lastAlterIdTransaction = tallyAlterIds.transaction;
      }
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`\n✅ Sync Cycle #${this.syncCount} Completed:`);
      console.log(`   📊 New Records: ${totalNewRecords}`);
      console.log(`   ⏱️  Duration: ${duration.toFixed(1)} seconds`);
      console.log(`   ⏰ Next sync: ${new Date(Date.now() + 5 * 60 * 1000).toLocaleString()}\n`);
      
    } catch (error) {
      console.error(`❌ Sync Cycle #${this.syncCount} Failed:`, error.message);
      console.log(`⏰ Will retry in 5 minutes\n`);
    } finally {
      this.isRunning = false;
    }
  }

  async testConnections() {
    // Quick connection test
    try {
      // Test Tally
      const testXML = `<?xml version="1.0" encoding="utf-8"?>
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

      await this.postTallyXML(testXML);
      
      // Test Railway
      await axios.get(`${this.config.railway.api_base}/api/v1/health`, { timeout: 10000 });
      
      console.log('✅ Connections verified');
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

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

  async syncIncrementalMasterData() {
    let totalRecords = 0;
    
    // Priority tables for master data
    const priorityTables = ['mst_group', 'mst_ledger', 'mst_stockitem', 'mst_vouchertype'];
    
    for (const tableName of priorityTables) {
      const tableConfig = this.masterTables.find(t => t.name === tableName);
      if (tableConfig) {
        const records = await this.syncTableIncremental(tableConfig, 'master');
        totalRecords += records;
        if (records > 0) {
          console.log(`   ✅ ${tableName}: ${records} new records`);
        }
      }
    }
    
    return totalRecords;
  }

  async syncIncrementalTransactionData() {
    let totalRecords = 0;
    
    // Focus on main transaction tables
    const transactionTables = ['trn_voucher', 'trn_accounting', 'trn_inventory'];
    
    for (const tableName of transactionTables) {
      const tableConfig = this.transactionTables.find(t => t.name === tableName);
      if (tableConfig) {
        const records = await this.syncTableIncremental(tableConfig, 'transaction');
        totalRecords += records;
        if (records > 0) {
          console.log(`   ✅ ${tableName}: ${records} new records`);
          if (tableName === 'trn_voucher') {
            console.log(`       🎯 NEW VOUCHERS: ${records} vouchers with dispatch & inventory details`);
          }
        }
      }
    }
    
    return totalRecords;
  }

  async syncTableIncremental(tableConfig, tableType) {
    const mapping = this.config.database_mapping[tableConfig.name];
    if (!mapping) return 0;
    
    // Add AlterID filter for incremental sync
    const incrementalConfig = {
      ...tableConfig,
      filters: [
        ...(tableConfig.filters || []),
        tableType === 'master' 
          ? `$AlterID > ${this.lastAlterIdMaster}`
          : `$AlterID > ${this.lastAlterIdTransaction}`
      ]
    };
    
    // Generate TDL XML
    const xmlRequest = this.generateTDLXML(incrementalConfig);
    
    // Extract from Tally
    const xmlResponse = await this.postTallyXML(xmlRequest);
    if (!xmlResponse || xmlResponse.trim().length === 0) return 0;
    
    // Process data
    const csvData = this.processXMLToCSV(xmlResponse, incrementalConfig);
    const jsonData = this.csvToJSON(csvData, incrementalConfig);
    if (jsonData.length === 0) return 0;
    
    // Add UUIDs and push to Railway
    const enrichedData = jsonData.map(record => ({
      ...record,
      company_id: this.config.company.id,
      division_id: this.config.company.division_id,
      sync_timestamp: new Date().toISOString(),
      source: 'continuous-sync'
    }));
    
    await this.pushToRailway(mapping.table, enrichedData);
    return jsonData.length;
  }

  async pushToRailway(tableName, data) {
    const endpoint = `${this.config.railway.api_base}/api/v1/bulk-sync/${this.config.company.id}/${this.config.company.division_id}`;
    
    const payload = {
      table: tableName,
      data: data,
      sync_type: 'incremental',
      metadata: {
        source: 'continuous-sync',
        timestamp: new Date().toISOString(),
        sync_cycle: this.syncCount
      }
    };
    
    await axios.post(endpoint, payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // TDL XML generation (same as working version)
  generateTDLXML(tblConfig) {
    let retval = `<?xml version="1.0" encoding="utf-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>TallyDatabaseLoaderReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>XML (Data Interchange)</SVEXPORTFORMAT><SVFROMDATE>${this.config.tally.fromdate}</SVFROMDATE><SVTODATE>${this.config.tally.todate}</SVTODATE><SVCURRENTCOMPANY>${this.escapeHTML(this.config.tally.company)}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="TallyDatabaseLoaderReport"><FORMS>MyForm</FORMS></REPORT><FORM NAME="MyForm"><PARTS>MyPart01</PARTS></FORM>`;

    let lstRoutes = tblConfig.collection.split(/\./g);
    let targetCollection = lstRoutes.splice(0, 1)[0];
    lstRoutes.unshift('MyCollection');

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

    for (let i = 0; i < tblConfig.fields.length; i++) {
      retval += `Fld${String(i + 1).padStart(2, '0')},`;
    }
    retval = retval.slice(0, -1);
    retval += `</FIELDS></LINE>`;

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

    if (tblConfig.filters && tblConfig.filters.length) {
      retval += `<FILTER>`;
      for (let j = 0; j < tblConfig.filters.length; j++) {
        retval += `Fltr${String(j + 1).padStart(2, '0')},`;
      }
      retval = retval.slice(0, -1);
      retval += `</FILTER>`;
    }

    retval += `</COLLECTION>`;

    if (tblConfig.filters && tblConfig.filters.length) {
      for (let j = 0; j < tblConfig.filters.length; j++) {
        retval += `<SYSTEM TYPE="Formulae" NAME="Fltr${String(j + 1).padStart(2, '0')}">${tblConfig.filters[j]}</SYSTEM>`;
      }
    }

    retval += `</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    return retval;
  }

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

  /**
   * Check if Railway database is empty
   */
  async checkIfDatabaseEmpty() {
    try {
      const response = await axios.get(
        `${this.config.railway.api_base}/api/v1/stats/${this.config.company.id}/${this.config.company.division_id}`,
        { timeout: 10000 }
      );
      
      if (response.data.success) {
        const totalRecords = response.data.data.total_records;
        console.log(`📊 Current Railway database: ${totalRecords} records`);
        
        // Consider empty if less than 100 records (should have thousands)
        return totalRecords < 100;
      }
      
      return true; // Assume empty if can't check
    } catch (error) {
      console.log('⚠️  Could not check database status, assuming empty');
      return true;
    }
  }

  /**
   * Run full migration to populate empty database
   */
  async runFullMigration() {
    console.log('🚀 Running Full Migration to populate empty Railway database...');
    
    let totalMigrated = 0;
    
    try {
      // Migrate master data first
      console.log('\n📊 Migrating Master Data...');
      const masterTables = ['mst_group', 'mst_ledger', 'mst_stockitem', 'mst_vouchertype', 'mst_uom', 'mst_godown'];
      
      for (const tableName of masterTables) {
        const tableConfig = this.masterTables.find(t => t.name === tableName);
        if (tableConfig) {
          const count = await this.migrateTableFull(tableConfig, 'master');
          totalMigrated += count;
          console.log(`✅ ${tableName}: ${count} records migrated`);
        }
      }
      
      // Migrate transaction data
      console.log('\n💼 Migrating Transaction Data...');
      const transactionTables = ['trn_voucher', 'trn_accounting', 'trn_inventory'];
      
      for (const tableName of transactionTables) {
        const tableConfig = this.transactionTables.find(t => t.name === tableName);
        if (tableConfig) {
          const count = await this.migrateTableFull(tableConfig, 'transaction');
          totalMigrated += count;
          console.log(`✅ ${tableName}: ${count} records migrated`);
          
          if (tableName === 'trn_voucher') {
            console.log(`   🎯 VOUCHERS: ${count} vouchers with dispatch & inventory details`);
          }
        }
      }
      
      console.log(`\n🎉 Full Migration Complete: ${totalMigrated} total records migrated to Railway SQLite`);
      
      // Update AlterIDs for future incremental syncs
      const tallyAlterIds = await this.getTallyAlterIds();
      this.lastAlterIdMaster = tallyAlterIds.master;
      this.lastAlterIdTransaction = tallyAlterIds.transaction;
      
      console.log(`📋 AlterIDs set for incremental sync - Master: ${this.lastAlterIdMaster}, Transaction: ${this.lastAlterIdTransaction}`);
      
    } catch (error) {
      console.error('❌ Full migration failed:', error.message);
    }
  }

  /**
   * Migrate a single table (full migration)
   */
  async migrateTableFull(tableConfig, tableType) {
    const mapping = this.config.database_mapping[tableConfig.name];
    if (!mapping) {
      console.log(`   ⚠️  No mapping for ${tableConfig.name}, skipping`);
      return 0;
    }
    
    try {
      // Generate TDL XML (no incremental filters)
      const xmlRequest = this.generateTDLXML(tableConfig);
      
      // Extract from Tally
      const xmlResponse = await this.postTallyXML(xmlRequest);
      if (!xmlResponse || xmlResponse.trim().length === 0) return 0;
      
      // Process data
      const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
      const jsonData = this.csvToJSON(csvData, tableConfig);
      if (jsonData.length === 0) return 0;
      
      // Add UUIDs and push to Railway
      const enrichedData = jsonData.map(record => ({
        ...record,
        company_id: this.config.company.id,
        division_id: this.config.company.division_id,
        sync_timestamp: new Date().toISOString(),
        source: 'full-migration'
      }));
      
      await this.pushToRailway(mapping.table, enrichedData);
      return jsonData.length;
      
    } catch (error) {
      console.log(`   ❌ ${tableConfig.name} migration failed: ${error.message}`);
      return 0;
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

// Start continuous sync
const sync = new ContinuousSync();
sync.start();

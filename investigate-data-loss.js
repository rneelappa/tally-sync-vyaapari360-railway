#!/usr/bin/env node

/**
 * Investigate Data Loss
 * Diagnose why Railway SQLite has incomplete data
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class DataLossInvestigator {
  constructor() {
    this.config = config;
    this.railwayAPI = config.railway.api_base;
    this.companyId = config.company.id;
    this.divisionId = config.company.division_id;
  }

  async investigate() {
    console.log('🔍 DATA LOSS INVESTIGATION');
    console.log('===========================\n');
    
    try {
      // Step 1: Check what's actually in Railway
      await this.checkRailwayDatabase();
      
      // Step 2: Check what we can extract from Tally
      await this.checkTallyDataAvailable();
      
      // Step 3: Test Railway endpoints
      await this.testRailwayEndpoints();
      
      // Step 4: Run diagnostic migration
      await this.runDiagnosticMigration();
      
    } catch (error) {
      console.error('❌ Investigation failed:', error.message);
    }
  }

  async checkRailwayDatabase() {
    console.log('🗄️ RAILWAY DATABASE STATUS');
    console.log('===========================');
    
    try {
      // Check health
      const healthResponse = await axios.get(`${this.railwayAPI}/api/v1/health`);
      console.log('✅ Railway health:', healthResponse.data.message);
      
      // Check tables
      const tablesResponse = await axios.get(`${this.railwayAPI}/api/v1/tables`);
      console.log(`📋 Tables available: ${tablesResponse.data.data.tables.length}`);
      tablesResponse.data.data.tables.forEach(table => {
        console.log(`   • ${table}`);
      });
      
      // Check current stats
      const statsResponse = await axios.get(`${this.railwayAPI}/api/v1/stats/${this.companyId}/${this.divisionId}`);
      
      if (statsResponse.data.success) {
        const stats = statsResponse.data.data;
        console.log(`\n📊 Current Database Counts:`);
        console.log(`   Total Records: ${stats.total_records}`);
        
        Object.entries(stats.table_counts).forEach(([table, count]) => {
          const status = count > 0 ? '✅' : '⚪';
          console.log(`   ${status} ${table}: ${count} records`);
        });
        
        // Identify the problem
        console.log(`\n🚨 PROBLEM IDENTIFIED:`);
        console.log(`   Expected: 635 ledgers, 2546 stock items`);
        console.log(`   Actual: ${stats.table_counts.ledgers || 0} ledgers, ${stats.table_counts.stock_items || 0} stock items`);
        console.log(`   📉 Data Loss: ${((635 - (stats.table_counts.ledgers || 0)) / 635 * 100).toFixed(1)}% ledgers missing`);
      }
      
    } catch (error) {
      console.log('❌ Could not check Railway database:', error.message);
    }
    
    console.log();
  }

  async checkTallyDataAvailable() {
    console.log('📊 TALLY DATA AVAILABILITY CHECK');
    console.log('=================================');
    
    try {
      // Test simple connection
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

      const response = await this.postTallyXML(testXML);
      console.log('✅ Tally connection successful');
      console.log(`📏 Response size: ${response.length} characters`);
      
      // Test ledger extraction specifically
      await this.testLedgerExtraction();
      
      // Test stock item extraction
      await this.testStockItemExtraction();
      
    } catch (error) {
      console.log('❌ Tally connection failed:', error.message);
    }
  }

  async testLedgerExtraction() {
    console.log('\n💰 Testing Ledger Extraction...');
    
    try {
      const ledgerTable = tallyExportConfig.master.find(t => t.name === 'mst_ledger');
      if (!ledgerTable) {
        console.log('❌ mst_ledger table config not found');
        return;
      }
      
      const xmlRequest = this.generateTDLXML(ledgerTable);
      const xmlResponse = await this.postTallyXML(xmlRequest);
      
      const csvData = this.processXMLToCSV(xmlResponse, ledgerTable);
      const jsonData = this.csvToJSON(csvData, ledgerTable);
      
      console.log(`📊 Ledgers extracted from Tally: ${jsonData.length}`);
      
      if (jsonData.length > 0) {
        console.log('📋 Sample ledgers:');
        jsonData.slice(0, 5).forEach((ledger, index) => {
          console.log(`   ${index + 1}. ${ledger.name} (${ledger.guid})`);
        });
      }
      
      return jsonData.length;
      
    } catch (error) {
      console.log('❌ Ledger extraction failed:', error.message);
      return 0;
    }
  }

  async testStockItemExtraction() {
    console.log('\n📦 Testing Stock Item Extraction...');
    
    try {
      const stockTable = tallyExportConfig.master.find(t => t.name === 'mst_stockitem');
      if (!stockTable) {
        console.log('❌ mst_stockitem table config not found');
        return;
      }
      
      const xmlRequest = this.generateTDLXML(stockTable);
      const xmlResponse = await this.postTallyXML(xmlRequest);
      
      const csvData = this.processXMLToCSV(xmlResponse, stockTable);
      const jsonData = this.csvToJSON(csvData, stockTable);
      
      console.log(`📊 Stock items extracted from Tally: ${jsonData.length}`);
      
      if (jsonData.length > 0) {
        console.log('📋 Sample stock items:');
        jsonData.slice(0, 5).forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.name} (${item.guid})`);
        });
      }
      
      return jsonData.length;
      
    } catch (error) {
      console.log('❌ Stock item extraction failed:', error.message);
      return 0;
    }
  }

  async testRailwayEndpoints() {
    console.log('\n🔧 RAILWAY ENDPOINT TESTING');
    console.log('============================');
    
    try {
      // Test bulk sync endpoint with sample data
      const sampleData = [{
        guid: 'test-investigation-001',
        name: 'Test Investigation Ledger',
        parent: 'Test Group',
        company_id: this.companyId,
        division_id: this.divisionId,
        sync_timestamp: new Date().toISOString(),
        source: 'investigation'
      }];
      
      const payload = {
        table: 'ledgers',
        data: sampleData,
        sync_type: 'test',
        metadata: { source: 'investigation' }
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/bulk-sync/${this.companyId}/${this.divisionId}`,
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      console.log('✅ Bulk sync endpoint working');
      console.log(`📊 Response:`, response.data);
      
      // Check if the test record was stored
      const verifyResponse = await axios.get(`${this.railwayAPI}/api/v1/stats/${this.companyId}/${this.divisionId}`);
      if (verifyResponse.data.success) {
        const newLedgerCount = verifyResponse.data.data.table_counts.ledgers;
        console.log(`📊 Ledgers after test: ${newLedgerCount}`);
      }
      
    } catch (error) {
      console.log('❌ Railway endpoint test failed:', error.message);
      if (error.response) {
        console.log('Response:', error.response.data);
      }
    }
  }

  async runDiagnosticMigration() {
    console.log('\n🔬 DIAGNOSTIC MIGRATION');
    console.log('========================');
    
    console.log('Running small batch migration to identify issues...');
    
    try {
      // Test with just groups first (small dataset)
      const groupTable = tallyExportConfig.master.find(t => t.name === 'mst_group');
      if (groupTable) {
        console.log('\n📊 Testing Groups Migration...');
        const count = await this.migrateSingleTable(groupTable, 'groups');
        console.log(`✅ Groups migrated: ${count}`);
      }
      
      // Test with ledgers (larger dataset)
      const ledgerTable = tallyExportConfig.master.find(t => t.name === 'mst_ledger');
      if (ledgerTable) {
        console.log('\n💰 Testing Ledgers Migration...');
        const count = await this.migrateSingleTable(ledgerTable, 'ledgers');
        console.log(`✅ Ledgers migrated: ${count}`);
      }
      
      // Check final counts
      const finalStats = await axios.get(`${this.railwayAPI}/api/v1/stats/${this.companyId}/${this.divisionId}`);
      if (finalStats.data.success) {
        console.log('\n📊 Final Counts After Diagnostic:');
        Object.entries(finalStats.data.data.table_counts).forEach(([table, count]) => {
          if (count > 0) {
            console.log(`   • ${table}: ${count} records`);
          }
        });
      }
      
    } catch (error) {
      console.log('❌ Diagnostic migration failed:', error.message);
    }
  }

  async migrateSingleTable(tableConfig, railwayTable) {
    try {
      // Extract from Tally
      const xmlRequest = this.generateTDLXML(tableConfig);
      const xmlResponse = await this.postTallyXML(xmlRequest);
      
      // Process data
      const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
      const jsonData = this.csvToJSON(csvData, tableConfig);
      
      console.log(`   📡 Extracted from Tally: ${jsonData.length} records`);
      
      if (jsonData.length === 0) return 0;
      
      // Add UUIDs
      const enrichedData = jsonData.map(record => ({
        ...record,
        company_id: this.companyId,
        division_id: this.divisionId,
        sync_timestamp: new Date().toISOString(),
        source: 'diagnostic'
      }));
      
      // Push to Railway in smaller batches
      const batchSize = 50; // Smaller batches for testing
      let totalPushed = 0;
      
      for (let i = 0; i < enrichedData.length; i += batchSize) {
        const batch = enrichedData.slice(i, i + batchSize);
        
        const payload = {
          table: railwayTable,
          data: batch,
          sync_type: 'diagnostic',
          metadata: { 
            source: 'investigation',
            batch: Math.floor(i / batchSize) + 1,
            total_batches: Math.ceil(enrichedData.length / batchSize)
          }
        };
        
        try {
          const response = await axios.post(
            `${this.railwayAPI}/api/v1/bulk-sync/${this.companyId}/${this.divisionId}`,
            payload,
            { 
              timeout: 30000,
              headers: { 'Content-Type': 'application/json' }
            }
          );
          
          totalPushed += batch.length;
          console.log(`     📦 Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records → ${response.data.success ? 'SUCCESS' : 'FAILED'}`);
          
          if (!response.data.success) {
            console.log(`     ❌ Error:`, response.data);
          }
          
        } catch (error) {
          console.log(`     ❌ Batch failed:`, error.response?.data || error.message);
        }
      }
      
      console.log(`   🚀 Total pushed to Railway: ${totalPushed} records`);
      return totalPushed;
      
    } catch (error) {
      console.log(`   ❌ Table migration failed:`, error.message);
      return 0;
    }
  }

  // TDL XML generation (working version)
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

// Run investigation
const investigator = new DataLossInvestigator();
investigator.investigate();

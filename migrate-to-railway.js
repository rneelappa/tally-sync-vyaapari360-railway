#!/usr/bin/env node

/**
 * Migrate to Railway SQLite
 * Extracts data from Tally and pushes to Railway SQLite database
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

// Load configurations
const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class RailwayMigration {
  constructor() {
    this.config = config;
    this.masterTables = tallyExportConfig.master || [];
    this.transactionTables = tallyExportConfig.transaction || [];
    
    this.stats = {
      master_data: {},
      transaction_data: {},
      total_records: 0,
      railway_records: 0,
      successful_tables: 0,
      failed_tables: 0
    };
  }

  async migrate() {
    console.log('🚀 Tally to Railway SQLite Migration');
    console.log('====================================\n');
    
    console.log(`🏢 Company: ${this.config.company.name}`);
    console.log(`🆔 Company ID: ${this.config.company.id}`);
    console.log(`🏭 Division: ${this.config.company.division_name}`);
    console.log(`🆔 Division ID: ${this.config.company.division_id}`);
    console.log(`🎯 Railway: ${this.config.railway.api_base}\n`);
    
    try {
      // Test connections
      await this.testConnections();
      
      // Migrate master data
      await this.migrateMasterData();
      
      // Migrate transaction data
      await this.migrateTransactionData();
      
      // Verify final counts
      await this.verifyFinalCounts();
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
    }
  }

  async testConnections() {
    console.log('🔍 Testing connections...');
    
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
    console.log('✅ Tally connection successful');
    
    // Test Railway
    const railwayResponse = await axios.get(`${this.config.railway.api_base}/api/v1/health`);
    console.log('✅ Railway connection successful');
    console.log(`📊 Railway: ${railwayResponse.data.message}\n`);
  }

  async migrateMasterData() {
    console.log('📊 Migrating Master Data to Railway...');
    
    const priorityTables = ['mst_group', 'mst_ledger', 'mst_vouchertype', 'mst_uom', 'mst_godown', 'mst_stock_group', 'mst_stock_item'];
    
    for (const tableName of priorityTables) {
      const tableConfig = this.masterTables.find(t => t.name === tableName);
      if (tableConfig) {
        await this.migrateTableToRailway(tableConfig, 'master');
      }
    }
    
    console.log();
  }

  async migrateTransactionData() {
    console.log('💼 Migrating Transaction Data to Railway...');
    
    const transactionTables = ['trn_voucher', 'trn_accounting', 'trn_inventory', 'trn_bill', 'trn_bank', 'trn_batch', 'trn_inventory_accounting'];
    
    for (const tableName of transactionTables) {
      const tableConfig = this.transactionTables.find(t => t.name === tableName);
      if (tableConfig) {
        await this.migrateTableToRailway(tableConfig, 'transaction');
      }
    }
    
    console.log();
  }

  async migrateTableToRailway(tableConfig, tableType) {
    const tableName = tableConfig.name;
    console.log(`🔄 ${tableName}...`);
    
    try {
      // Check mapping
      const mapping = this.config.database_mapping[tableName];
      if (!mapping) {
        console.log(`   ⚠️  No mapping found for ${tableName}, skipping...`);
        return;
      }
      
      // Extract from Tally
      const xmlRequest = this.generateTDLXML(tableConfig);
      const xmlResponse = await this.postTallyXML(xmlRequest);
      
      if (!xmlResponse || xmlResponse.trim().length === 0) {
        console.log(`   ℹ️  No data from Tally`);
        return;
      }
      
      // Process data
      const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
      const jsonData = this.csvToJSON(csvData, tableConfig);
      
      if (jsonData.length === 0) {
        console.log(`   ℹ️  No records found`);
        return;
      }
      
      // Add UUIDs and push to Railway
      const enrichedData = jsonData.map(record => ({
        ...record,
        company_id: this.config.company.id,
        division_id: this.config.company.division_id,
        sync_timestamp: new Date().toISOString(),
        source: 'tally'
      }));
      
      await this.pushToRailway(mapping.table, enrichedData);
      
      // Update stats
      if (tableType === 'master') {
        this.stats.master_data[tableName] = jsonData.length;
      } else {
        this.stats.transaction_data[tableName] = jsonData.length;
      }
      
      this.stats.total_records += jsonData.length;
      this.stats.successful_tables++;
      
      console.log(`   ✅ ${jsonData.length} records → Railway SQLite`);
      
      if (tableName === 'trn_voucher') {
        console.log(`       🎯 VOUCHERS: ${jsonData.length} records pushed to Railway`);
      }
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.stats.failed_tables++;
    }
  }

  async pushToRailway(tableName, data) {
    const endpoint = `${this.config.railway.api_base}/api/v1/bulk-sync/${this.config.company.id}/${this.config.company.division_id}`;
    
    // Split into smaller batches to avoid timeouts
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const payload = {
        table: tableName,
        data: batch,
        sync_type: 'full',
        metadata: {
          source: 'tally-migration',
          timestamp: new Date().toISOString(),
          batch: i + 1,
          total_batches: batches.length
        }
      };
      
      const response = await axios.post(endpoint, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (batches.length > 1) {
        process.stdout.write(`     📦 ${i + 1}/${batches.length}... `);
      }
    }
    
    if (batches.length > 1) {
      console.log('✅');
    }
  }

  async verifyFinalCounts() {
    console.log('🔍 Verifying Final Counts in Railway SQLite...');
    
    try {
      const response = await axios.get(
        `${this.config.railway.api_base}/api/v1/stats/${this.config.company.id}/${this.config.company.division_id}`
      );
      
      if (response.data.success) {
        const railwayStats = response.data.data;
        this.stats.railway_records = railwayStats.total_records;
        
        console.log('\n📊 FINAL RAILWAY SQLITE COUNTS:');
        Object.entries(railwayStats.table_counts).forEach(([table, count]) => {
          if (count > 0) {
            console.log(`   ✅ ${table}: ${count} records`);
          }
        });
        
        console.log(`\n📈 MIGRATION SUMMARY:`);
        console.log(`   📊 Total Extracted from Tally: ${this.stats.total_records}`);
        console.log(`   🗄️ Total Stored in Railway SQLite: ${this.stats.railway_records}`);
        console.log(`   ✅ Successful Tables: ${this.stats.successful_tables}`);
        console.log(`   ❌ Failed Tables: ${this.stats.failed_tables}`);
        
        // Check voucher count specifically
        const voucherCount = railwayStats.table_counts.vouchers || 0;
        console.log(`\n🎯 VOUCHER MIGRATION:`);
        console.log(`   📊 Vouchers in Railway SQLite: ${voucherCount}`);
        console.log(`   🎯 Target was: 6000+`);
        
        if (voucherCount >= 1000) {
          console.log(`   🎉 EXCELLENT: ${voucherCount} vouchers successfully migrated!`);
        } else if (voucherCount > 0) {
          console.log(`   ✅ GOOD: ${voucherCount} vouchers migrated`);
        } else {
          console.log(`   ⚠️  No vouchers found in Railway database`);
        }
        
        if (this.stats.railway_records > 10000) {
          console.log(`\n🎉 MIGRATION SUCCESS: ${this.stats.railway_records} records in Railway SQLite!`);
        }
      }
    } catch (error) {
      console.log('⚠️  Could not verify Railway counts:', error.message);
    }
  }

  // TDL XML generation using exact tally-database-loader format
  generateTDLXML(tblConfig) {
    let retval = `<?xml version="1.0" encoding="utf-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>TallyDatabaseLoaderReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>XML (Data Interchange)</SVEXPORTFORMAT><SVFROMDATE>{fromDate}</SVFROMDATE><SVTODATE>{toDate}</SVTODATE><SVCURRENTCOMPANY>{targetCompany}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="TallyDatabaseLoaderReport"><FORMS>MyForm</FORMS></REPORT><FORM NAME="MyForm"><PARTS>MyPart01</PARTS></FORM>`;

    if (!this.config.tally.company) {
      retval = retval.replace('<SVCURRENTCOMPANY>{targetCompany}</SVCURRENTCOMPANY>', '');
    } else {
      retval = retval.replace('{targetCompany}', this.escapeHTML(this.config.tally.company));
    }
    retval = retval.replace('{fromDate}', this.config.tally.fromdate);
    retval = retval.replace('{toDate}', this.config.tally.todate);

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

// Run migration
const migrator = new RailwayMigration();
migrator.migrate();

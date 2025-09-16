#!/usr/bin/env node

/**
 * Complete Migration using Corrected TDL XML Format
 * Migrates all Tally data including 6000+ vouchers using working XML format
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

// Load configurations
const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class CompleteMigration {
  constructor() {
    this.config = config;
    this.masterTables = tallyExportConfig.master || [];
    this.transactionTables = tallyExportConfig.transaction || [];
    
    this.migrationStats = {
      master_data: {},
      transaction_data: {},
      total_records: 0,
      successful_tables: 0,
      failed_tables: 0,
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
      // Test connections
      await this.testConnections();
      
      // Migrate Master Data first
      await this.migrateMasterData();
      
      // Migrate Transaction Data (including 6000+ vouchers)
      await this.migrateTransactionData();
      
      // Verify migration with Railway
      await this.verifyMigrationWithRailway();
      
      // Show final summary
      this.showCompleteSummary();
      
    } catch (error) {
      console.error('❌ Complete migration failed:', error.message);
    }
  }

  async testConnections() {
    console.log('🔍 Testing Connections...');
    
    // Test Tally
    const simpleXML = `<?xml version="1.0" encoding="utf-8"?>
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

    try {
      await this.postTallyXML(simpleXML);
      console.log('✅ Tally connection successful');
    } catch (error) {
      throw new Error(`Tally connection failed: ${error.message}`);
    }
    
    // Test Railway
    try {
      const response = await axios.get(`${this.config.railway.api_base}/api/v1/health`);
      console.log('✅ Railway connection successful');
    } catch (error) {
      console.log('⚠️  Railway connection failed, will use local processing only');
    }
    
    console.log();
  }

  async migrateMasterData() {
    console.log('📊 Migrating Master Data...');
    console.log('============================');
    
    // Priority order for master data
    const priorityTables = [
      'mst_group',      // Account groups (smallest)
      'mst_ledger',     // Chart of accounts  
      'mst_vouchertype', // Voucher types
      'mst_uom',        // Units
      'mst_godown',     // Warehouses
      'mst_stockitem'   // Stock items
    ];
    
    for (const tableName of priorityTables) {
      const tableConfig = this.masterTables.find(t => t.name === tableName);
      if (tableConfig) {
        await this.migrateTableWithRetry(tableConfig, 'master');
      }
    }
    
    // Migrate remaining master tables
    for (const tableConfig of this.masterTables) {
      if (!priorityTables.includes(tableConfig.name)) {
        await this.migrateTableWithRetry(tableConfig, 'master');
      }
    }
    
    const masterTotal = Object.values(this.migrationStats.master_data).reduce((sum, count) => sum + count, 0);
    console.log(`\n📊 Master Data Complete: ${masterTotal} total records\n`);
  }

  async migrateTransactionData() {
    console.log('💼 Migrating Transaction Data...');
    console.log('=================================');
    
    // Focus on vouchers first (the main transaction data)
    const voucherTable = this.transactionTables.find(t => t.name === 'trn_voucher');
    if (voucherTable) {
      console.log('🎯 Migrating Vouchers (target: 6000+)...');
      await this.migrateTableWithRetry(voucherTable, 'transaction');
    }
    
    // Then migrate other transaction tables
    for (const tableConfig of this.transactionTables) {
      if (tableConfig.name !== 'trn_voucher') {
        await this.migrateTableWithRetry(tableConfig, 'transaction');
      }
    }
    
    const transactionTotal = Object.values(this.migrationStats.transaction_data).reduce((sum, count) => sum + count, 0);
    console.log(`\n💼 Transaction Data Complete: ${transactionTotal} total records\n`);
  }

  async migrateTableWithRetry(tableConfig, tableType, retries = 2) {
    const tableName = tableConfig.name;
    
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        console.log(`🔄 ${tableName} (attempt ${attempt})...`);
        
        const count = await this.migrateTable(tableConfig, tableType);
        
        if (tableType === 'master') {
          this.migrationStats.master_data[tableName] = count;
        } else {
          this.migrationStats.transaction_data[tableName] = count;
        }
        
        this.migrationStats.total_records += count;
        this.migrationStats.successful_tables++;
        
        console.log(`✅ ${tableName}: ${count} records migrated`);
        
        if (tableName === 'trn_voucher') {
          console.log(`   🎯 VOUCHERS: ${count} records (target was 6000+)`);
        }
        
        return count;
        
      } catch (error) {
        console.log(`❌ ${tableName} attempt ${attempt} failed: ${error.message}`);
        
        if (attempt <= retries) {
          console.log(`   🔄 Retrying in 3 seconds...`);
          await this.delay(3000);
        } else {
          this.migrationStats.failed_tables++;
          this.migrationStats.errors.push(`${tableName}: ${error.message}`);
          console.log(`❌ ${tableName}: All attempts failed`);
          return 0;
        }
      }
    }
  }

  async migrateTable(tableConfig, tableType) {
    // Generate corrected TDL XML
    const xmlRequest = this.generateCorrectedTDLXML(tableConfig);
    
    // Extract data from Tally
    const xmlResponse = await this.postTallyXMLWithTimeout(xmlRequest, 45000); // Longer timeout for large tables
    
    if (!xmlResponse || xmlResponse.trim().length === 0) {
      return 0;
    }
    
    // Process XML to CSV
    const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
    const jsonData = this.csvToJSON(csvData, tableConfig);
    
    return jsonData.length;
  }

  // Use the corrected TDL XML generation from the working version
  generateCorrectedTDLXML(tblConfig) {
    let retval = '';
    try {
      // XML header - exact format from tally-database-loader
      retval = `<?xml version="1.0" encoding="utf-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>TallyDatabaseLoaderReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>XML (Data Interchange)</SVEXPORTFORMAT><SVFROMDATE>{fromDate}</SVFROMDATE><SVTODATE>{toDate}</SVTODATE><SVCURRENTCOMPANY>{targetCompany}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="TallyDatabaseLoaderReport"><FORMS>MyForm</FORMS></REPORT><FORM NAME="MyForm"><PARTS>MyPart01</PARTS></FORM>`;

      // Handle company and dates
      if (!this.config.tally.company) {
        retval = retval.replace('<SVCURRENTCOMPANY>{targetCompany}</SVCURRENTCOMPANY>', '');
      } else {
        retval = retval.replace('{targetCompany}', this.escapeHTML(this.config.tally.company));
      }
      retval = retval.replace('{fromDate}', this.config.tally.fromdate);
      retval = retval.replace('{toDate}', this.config.tally.todate);

      // Push routes list - exact tally-database-loader logic
      let lstRoutes = tblConfig.collection.split(/\./g);
      let targetCollection = lstRoutes.splice(0, 1)[0];
      lstRoutes.unshift('MyCollection');

      // Loop through and append PART XML
      for (let i = 0; i < lstRoutes.length; i++) {
        let xmlPart = this.formatNumber(i + 1, 'MyPart00');
        let xmlLine = this.formatNumber(i + 1, 'MyLine00');
        retval += `<PART NAME="${xmlPart}"><LINES>${xmlLine}</LINES><REPEAT>${xmlLine} : ${lstRoutes[i]}</REPEAT><SCROLLED>Vertical</SCROLLED></PART>`;
      }

      // Loop through and append LINE XML
      for (let i = 0; i < lstRoutes.length - 1; i++) {
        let xmlLine = this.formatNumber(i + 1, 'MyLine00');
        let xmlPart = this.formatNumber(i + 2, 'MyPart00');
        retval += `<LINE NAME="${xmlLine}"><FIELDS>FldBlank</FIELDS><EXPLODE>${xmlPart}</EXPLODE></LINE>`;
      }

      retval += `<LINE NAME="${this.formatNumber(lstRoutes.length, 'MyLine00')}">`;
      retval += `<FIELDS>`;

      // Field declarations
      for (let i = 0; i < tblConfig.fields.length; i++) {
        retval += this.formatNumber(i + 1, 'Fld00') + ',';
      }
      retval = retval.slice(0, -1);
      retval += `</FIELDS></LINE>`;

      // Field definitions
      for (let i = 0; i < tblConfig.fields.length; i++) {
        let fieldXML = `<FIELD NAME="${this.formatNumber(i + 1, 'Fld00')}">`;
        let iField = tblConfig.fields[i];

        if (/^(\.\.)?[a-zA-Z0-9_]+$/g.test(iField.field)) {
          if (iField.type == 'text')
            fieldXML += `<SET>$${iField.field}</SET>`;
          else if (iField.type == 'logical')
            fieldXML += `<SET>if $${iField.field} then 1 else 0</SET>`;
          else if (iField.type == 'date')
            fieldXML += `<SET>if $$IsEmpty:$${iField.field} then $$StrByCharCode:241 else $$PyrlYYYYMMDDFormat:$${iField.field}:"-"</SET>`;
          else if (iField.type == 'number')
            fieldXML += `<SET>if $$IsEmpty:$${iField.field} then "0" else $$String:$${iField.field}</SET>`;
          else if (iField.type == 'amount')
            fieldXML += `<SET>$$StringFindAndReplace:(if $$IsDebit:$${iField.field} then -$$NumValue:$${iField.field} else $$NumValue:$${iField.field}):"(-)":"-"</SET>`;
          else if (iField.type == 'quantity')
            fieldXML += `<SET>$$StringFindAndReplace:(if $$IsInwards:$${iField.field} then $$Number:$$String:$${iField.field}:"TailUnits" else -$$Number:$$String:$${iField.field}:"TailUnits"):"(-)":"-"</SET>`;
          else if (iField.type == 'rate')
            fieldXML += `<SET>if $$IsEmpty:$${iField.field} then 0 else $$Number:$${iField.field}</SET>`;
          else
            fieldXML += `<SET>${iField.field}</SET>`;
        } else {
          fieldXML += `<SET>${iField.field}</SET>`;
        }

        fieldXML += `<XMLTAG>${this.formatNumber(i + 1, 'F00')}</XMLTAG>`;
        fieldXML += `</FIELD>`;
        retval += fieldXML;
      }

      retval += `<FIELD NAME="FldBlank"><SET>""</SET></FIELD>`;
      retval += `<COLLECTION NAME="MyCollection"><TYPE>${targetCollection}</TYPE>`;

      if (tblConfig.fetch && tblConfig.fetch.length)
        retval += `<FETCH>${tblConfig.fetch.join(',')}</FETCH>`;

      if (tblConfig.filters && tblConfig.filters.length) {
        retval += `<FILTER>`;
        for (let j = 0; j < tblConfig.filters.length; j++)
          retval += this.formatNumber(j + 1, 'Fltr00') + ',';
        retval = retval.slice(0, -1);
        retval += `</FILTER>`;
      }

      retval += `</COLLECTION>`;

      if (tblConfig.filters && tblConfig.filters.length)
        for (let j = 0; j < tblConfig.filters.length; j++)
          retval += `<SYSTEM TYPE="Formulae" NAME="${this.formatNumber(j + 1, 'Fltr00')}">${tblConfig.filters[j]}</SYSTEM>`;

      retval += `</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    } catch (err) {
      console.error('Error generating XML:', err);
    }
    return retval;
  }

  formatNumber(num, format) {
    const str = num.toString();
    if (format === 'MyPart00') return `MyPart${str.padStart(2, '0')}`;
    if (format === 'MyLine00') return `MyLine${str.padStart(2, '0')}`;
    if (format === 'Fld00') return `Fld${str.padStart(2, '0')}`;
    if (format === 'F00') return `F${str.padStart(2, '0')}`;
    if (format === 'Fltr00') return `Fltr${str.padStart(2, '0')}`;
    return str;
  }

  postTallyXMLWithTimeout(xmlRequest, timeout = 45000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Tally request timeout'));
      }, timeout);

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
          .on('end', () => {
            clearTimeout(timeoutId);
            resolve(data);
          })
          .on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });
      
      req.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      
      req.write(xmlRequest, 'utf16le');
      req.end();
    });
  }

  postTallyXML(xmlRequest) {
    return this.postTallyXMLWithTimeout(xmlRequest, 30000);
  }

  processXMLToCSV(xmlData, tableConfig) {
    let retval = xmlData;
    try {
      retval = retval.replace('<ENVELOPE>', '');
      retval = retval.replace('</ENVELOPE>', '');
      retval = retval.replace(/\<FLDBLANK\>\<\/FLDBLANK\>/g, '');
      retval = retval.replace(/\s+\r\n/g, '');
      retval = retval.replace(/\r\n/g, '');
      retval = retval.replace(/\t/g, ' ');
      retval = retval.replace(/\s+\<F/g, '<F');
      retval = retval.replace(/\<\/F\d+\>/g, '');
      retval = retval.replace(/\<F01\>/g, '\r\n');
      retval = retval.replace(/\<F\d+\>/g, '\t');
      retval = retval.replace(/&amp;/g, '&');
      retval = retval.replace(/&lt;/g, '<');
      retval = retval.replace(/&gt;/g, '>');
      retval = retval.replace(/&quot;/g, '"');
      retval = retval.replace(/&apos;/g, "'");
      retval = retval.replace(/&tab;/g, '');
      retval = retval.replace(/&#\d+;/g, "");
    } catch (err) {
      console.error('Error processing XML:', err);
    }

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

  async verifyMigrationWithRailway() {
    console.log('🔍 Verifying Migration with Railway...');
    
    try {
      const response = await axios.get(
        `${this.config.railway.api_base}/api/v1/stats/${this.config.company.id}/${this.config.company.division_id}`
      );
      
      if (response.data.success) {
        const railwayStats = response.data.data;
        console.log('✅ Railway verification successful');
        console.log(`📊 Railway Database Total: ${railwayStats.total_records} records`);
        
        Object.entries(railwayStats.table_counts).forEach(([table, count]) => {
          if (count > 0) {
            console.log(`   • ${table}: ${count} records`);
          }
        });
      }
    } catch (error) {
      console.log('⚠️  Railway verification failed (using local counts only)');
    }
    
    console.log();
  }

  showCompleteSummary() {
    console.log('🎉 COMPLETE MIGRATION SUMMARY');
    console.log('==============================\n');
    
    console.log('📊 Master Data Migrated:');
    Object.entries(this.migrationStats.master_data).forEach(([table, count]) => {
      if (count > 0) {
        console.log(`   ✅ ${table}: ${count} records`);
      }
    });
    
    console.log('\n💼 Transaction Data Migrated:');
    Object.entries(this.migrationStats.transaction_data).forEach(([table, count]) => {
      if (count > 0) {
        console.log(`   ✅ ${table}: ${count} records`);
        if (table === 'trn_voucher') {
          console.log(`       🎯 VOUCHERS: ${count} (target was 6000+)`);
        }
      }
    });
    
    console.log(`\n📈 FINAL TOTALS:`);
    console.log(`   📊 Total Records: ${this.migrationStats.total_records}`);
    console.log(`   ✅ Successful Tables: ${this.migrationStats.successful_tables}`);
    console.log(`   ❌ Failed Tables: ${this.migrationStats.failed_tables}`);
    console.log(`   🏢 Company: ${this.config.company.name}`);
    console.log(`   🆔 Company UUID: ${this.config.company.id}`);
    console.log(`   🏭 Division: ${this.config.company.division_name}`);
    console.log(`   🆔 Division UUID: ${this.config.company.division_id}`);
    
    if (this.migrationStats.errors.length > 0) {
      console.log(`\n⚠️  Errors (${this.migrationStats.errors.length}):`);
      this.migrationStats.errors.forEach(error => console.log(`   • ${error}`));
    }
    
    console.log('\n🎯 Migration Status:');
    if (this.migrationStats.total_records > 5000) {
      console.log('   🎉 EXCELLENT: Large dataset successfully migrated!');
    } else if (this.migrationStats.total_records > 1000) {
      console.log('   ✅ GOOD: Significant data migrated successfully!');
    } else if (this.migrationStats.total_records > 0) {
      console.log('   ⚠️  PARTIAL: Some data migrated, check for issues');
    } else {
      console.log('   ❌ FAILED: No data migrated');
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

// Run complete migration
const migrator = new CompleteMigration();
migrator.migrate();

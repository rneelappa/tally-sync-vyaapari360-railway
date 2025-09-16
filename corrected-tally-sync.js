#!/usr/bin/env node

/**
 * Corrected Tally Sync using exact tally-database-loader logic
 * This fixes the "Invalid object type" error by using the exact XML structure
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

// Load configurations
const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

class CorrectedTallySync {
  constructor() {
    this.config = config;
    this.masterTables = tallyExportConfig.master || [];
    this.transactionTables = tallyExportConfig.transaction || [];
    
    console.log(`🏢 Company: ${this.config.company.name}`);
    console.log(`🆔 Company ID: ${this.config.company.id}`);
    console.log(`🏭 Division: ${this.config.company.division_name}`);
    console.log(`🆔 Division ID: ${this.config.company.division_id}`);
  }

  async migrate() {
    console.log('\n🚀 Starting Corrected Tally Migration...');
    console.log('==========================================\n');
    
    try {
      // Test Tally connection with simple request first
      await this.testTallyConnection();
      
      // Start with smallest tables first to avoid crashes
      console.log('📊 Migrating Master Data (starting with smallest tables)...');
      
      // Get a small table first (groups)
      const groupTable = this.masterTables.find(t => t.name === 'mst_group');
      if (groupTable) {
        await this.migrateTableSafely(groupTable, 'master');
      }
      
      console.log('\n🎉 Initial migration test completed!');
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
    }
  }

  async testTallyConnection() {
    console.log('🔍 Testing Tally connection with simple request...');
    
    // Use the simplest possible request first
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
      const response = await this.postTallyXML(simpleXML);
      console.log('✅ Tally connection successful');
      console.log(`📏 Response length: ${response.length} characters`);
      return true;
    } catch (error) {
      throw new Error(`Tally connection failed: ${error.message}`);
    }
  }

  async migrateTableSafely(tableConfig, tableType) {
    const tableName = tableConfig.name;
    console.log(`🔄 Safely migrating ${tableName}...`);
    
    try {
      // Generate corrected TDL XML using exact tally-database-loader format
      const xmlRequest = this.generateCorrectedTDLXML(tableConfig);
      
      console.log(`   📏 Generated XML length: ${xmlRequest.length} characters`);
      
      // Extract data from Tally with timeout
      console.log(`   📡 Extracting data from Tally (with timeout)...`);
      const xmlResponse = await this.postTallyXMLWithTimeout(xmlRequest, 30000);
      
      if (!xmlResponse || xmlResponse.trim().length === 0) {
        console.log(`   ℹ️  No data returned from Tally for ${tableName}`);
        return 0;
      }
      
      console.log(`   📏 Received XML length: ${xmlResponse.length} characters`);
      
      // Process XML to CSV
      const csvData = this.processXMLToCSV(xmlResponse, tableConfig);
      const jsonData = this.csvToJSON(csvData, tableConfig);
      
      console.log(`   📊 Processed ${jsonData.length} records`);
      
      if (jsonData.length > 0) {
        // Show sample data
        console.log(`   📋 Sample record:`, jsonData[0]);
      }
      
      return jsonData.length;
      
    } catch (error) {
      console.error(`   ❌ Failed to migrate ${tableName}:`, error.message);
      return 0;
    }
  }

  /**
   * Generate TDL XML using EXACT tally-database-loader logic
   */
  generateCorrectedTDLXML(tblConfig) {
    let retval = '';
    try {
      // XML header - exact format from tally-database-loader
      retval = `<?xml version="1.0" encoding="utf-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>TallyDatabaseLoaderReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>XML (Data Interchange)</SVEXPORTFORMAT><SVFROMDATE>{fromDate}</SVFROMDATE><SVTODATE>{toDate}</SVTODATE><SVCURRENTCOMPANY>{targetCompany}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="TallyDatabaseLoaderReport"><FORMS>MyForm</FORMS></REPORT><FORM NAME="MyForm"><PARTS>MyPart01</PARTS></FORM>`;

      // Handle company name
      if (!this.config.tally.company) {
        retval = retval.replace('<SVCURRENTCOMPANY>{targetCompany}</SVCURRENTCOMPANY>', '');
      } else {
        retval = retval.replace('{targetCompany}', this.escapeHTML(this.config.tally.company));
      }

      // Handle date substitution
      retval = retval.replace('{fromDate}', this.config.tally.fromdate);
      retval = retval.replace('{toDate}', this.config.tally.todate);

      // Push routes list - exact tally-database-loader logic
      let lstRoutes = tblConfig.collection.split(/\./g);
      let targetCollection = lstRoutes.splice(0, 1)[0]; // Get first element
      lstRoutes.unshift('MyCollection'); // Add basic collection level route

      // Loop through and append PART XML
      for (let i = 0; i < lstRoutes.length; i++) {
        let xmlPart = this.formatNumber(i + 1, 'MyPart00');
        let xmlLine = this.formatNumber(i + 1, 'MyLine00');
        retval += `<PART NAME="${xmlPart}"><LINES>${xmlLine}</LINES><REPEAT>${xmlLine} : ${lstRoutes[i]}</REPEAT><SCROLLED>Vertical</SCROLLED></PART>`;
      }

      // Loop through and append LINE XML (except last line which contains field data)
      for (let i = 0; i < lstRoutes.length - 1; i++) {
        let xmlLine = this.formatNumber(i + 1, 'MyLine00');
        let xmlPart = this.formatNumber(i + 2, 'MyPart00');
        retval += `<LINE NAME="${xmlLine}"><FIELDS>FldBlank</FIELDS><EXPLODE>${xmlPart}</EXPLODE></LINE>`;
      }

      retval += `<LINE NAME="${this.formatNumber(lstRoutes.length, 'MyLine00')}">`;
      retval += `<FIELDS>`; // Field start

      // Append field declaration list
      for (let i = 0; i < tblConfig.fields.length; i++) {
        retval += this.formatNumber(i + 1, 'Fld00') + ',';
      }
      retval = retval.slice(0, -1); // Remove last comma
      retval += `</FIELDS></LINE>`; // End of Field declaration

      // Loop through each field
      for (let i = 0; i < tblConfig.fields.length; i++) {
        let fieldXML = `<FIELD NAME="${this.formatNumber(i + 1, 'Fld00')}">`;
        let iField = tblConfig.fields[i];

        // Set field TDL XML expression based on type of data - exact logic
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

      retval += `<FIELD NAME="FldBlank"><SET>""</SET></FIELD>`; // Blank Field specification

      // Collection
      retval += `<COLLECTION NAME="MyCollection"><TYPE>${targetCollection}</TYPE>`;

      // Fetch list
      if (tblConfig.fetch && tblConfig.fetch.length)
        retval += `<FETCH>${tblConfig.fetch.join(',')}</FETCH>`;

      // Filter
      if (tblConfig.filters && tblConfig.filters.length) {
        retval += `<FILTER>`;
        for (let j = 0; j < tblConfig.filters.length; j++)
          retval += this.formatNumber(j + 1, 'Fltr00') + ',';
        retval = retval.slice(0, -1); // Remove last comma
        retval += `</FILTER>`;
      }

      retval += `</COLLECTION>`;

      // Filter definitions
      if (tblConfig.filters && tblConfig.filters.length)
        for (let j = 0; j < tblConfig.filters.length; j++)
          retval += `<SYSTEM TYPE="Formulae" NAME="${this.formatNumber(j + 1, 'Fltr00')}">${tblConfig.filters[j]}</SYSTEM>`;

      // XML footer
      retval += `</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    } catch (err) {
      console.error('Error generating XML:', err);
    }
    return retval;
  }

  /**
   * Format number exactly like tally-database-loader utility
   */
  formatNumber(num, format) {
    const str = num.toString();
    if (format === 'MyPart00') {
      return `MyPart${str.padStart(2, '0')}`;
    } else if (format === 'MyLine00') {
      return `MyLine${str.padStart(2, '0')}`;
    } else if (format === 'Fld00') {
      return `Fld${str.padStart(2, '0')}`;
    } else if (format === 'F00') {
      return `F${str.padStart(2, '0')}`;
    } else if (format === 'Fltr00') {
      return `Fltr${str.padStart(2, '0')}`;
    }
    return str;
  }

  /**
   * Send XML to Tally with timeout protection
   */
  postTallyXMLWithTimeout(xmlRequest, timeout = 30000) {
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
          .on('data', (chunk) => {
            data += chunk.toString();
          })
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

  /**
   * Send XML to Tally (basic version)
   */
  postTallyXML(xmlRequest) {
    return this.postTallyXMLWithTimeout(xmlRequest, 30000);
  }

  /**
   * Process XML to CSV (exact tally-database-loader logic)
   */
  processXMLToCSV(xmlData, tableConfig) {
    let retval = xmlData;
    try {
      retval = retval.replace('<ENVELOPE>', ''); // Eliminate ENVELOPE TAG
      retval = retval.replace('</ENVELOPE>', '');
      retval = retval.replace(/\<FLDBLANK\>\<\/FLDBLANK\>/g, ''); // Eliminate blank tag
      retval = retval.replace(/\s+\r\n/g, ''); // Remove empty lines
      retval = retval.replace(/\r\n/g, ''); // Remove all line breaks
      retval = retval.replace(/\t/g, ' '); // Replace all tabs with a single space
      retval = retval.replace(/\s+\<F/g, '<F'); // Trim left space
      retval = retval.replace(/\<\/F\d+\>/g, ''); // Remove XML end tags
      retval = retval.replace(/\<F01\>/g, '\r\n'); // Append line break to each row start and remove first field XML start tag
      retval = retval.replace(/\<F\d+\>/g, '\t'); // Replace XML start tags with tab separator
      retval = retval.replace(/&amp;/g, '&'); // Escape ampersand
      retval = retval.replace(/&lt;/g, '<'); // Escape less than
      retval = retval.replace(/&gt;/g, '>'); // Escape greater than
      retval = retval.replace(/&quot;/g, '"'); // Escape quotes
      retval = retval.replace(/&apos;/g, "'"); // Escape apostrophe
      retval = retval.replace(/&tab;/g, ''); // Strip out tab if any
      retval = retval.replace(/&#\d+;/g, ""); // Remove all unreadable character escapes
    } catch (err) {
      console.error('Error processing XML:', err);
    }

    // Add column headers
    const columnHeaders = tableConfig.fields.map(p => p.name).join('\t');
    return columnHeaders + retval;
  }

  /**
   * Convert CSV to JSON
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
  console.log('🔧 Corrected Tally Sync - Fixing Invalid Object Type Error');
  console.log('============================================================\n');
  
  const sync = new CorrectedTallySync();
  
  try {
    await sync.migrate();
    process.exit(0);
  } catch (error) {
    console.error('💥 Corrected sync failed:', error);
    console.error('\n🔧 Make sure:');
    console.error('   • Tally is running and stable');
    console.error('   • XML Server is enabled in Tally');
    console.error('   • Company "SKM IMPEX-CHENNAI-(24-25)" is active');
    process.exit(1);
  }
}

main();

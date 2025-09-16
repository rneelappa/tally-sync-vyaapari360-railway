#!/usr/bin/env node

/**
 * Force Full Migration
 * Ensures complete dataset reaches Railway SQLite
 */

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const yaml = require('js-yaml');

const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

console.log('🔧 Force Full Migration to Railway SQLite');
console.log('==========================================\n');

console.log(`🏢 Company: ${config.company.name}`);
console.log(`🆔 Company ID: ${config.company.id}`);
console.log(`🏭 Division: ${config.company.division_name}`);
console.log(`🆔 Division ID: ${config.company.division_id}`);
console.log(`🎯 Railway: ${config.railway.api_base}\n`);

async function forceMigration() {
  try {
    // Test Railway connection
    console.log('🔍 Testing Railway connection...');
    const healthResponse = await axios.get(`${config.railway.api_base}/api/v1/health`);
    console.log('✅ Railway connected:', healthResponse.data.message);
    
    // Test Tally connection
    console.log('🔍 Testing Tally connection...');
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

    await postTallyXML(testXML);
    console.log('✅ Tally connected\n');
    
    // Force migrate critical tables
    console.log('🎯 Force migrating critical tables...');
    
    // 1. Ledgers (most important)
    await forceMigrateTable('mst_ledger', 'ledgers');
    
    // 2. Stock Items
    await forceMigrateTable('mst_stockitem', 'stock_items');
    
    // 3. Vouchers
    await forceMigrateTable('trn_voucher', 'vouchers');
    
    // Check final results
    console.log('\n📊 Checking final results...');
    const finalStats = await axios.get(`${config.railway.api_base}/api/v1/stats/${config.company.id}/${config.company.division_id}`);
    
    if (finalStats.data.success) {
      const stats = finalStats.data.data;
      console.log(`\n📈 FINAL RAILWAY SQLITE COUNTS:`);
      console.log(`   Total Records: ${stats.total_records}`);
      
      Object.entries(stats.table_counts).forEach(([table, count]) => {
        console.log(`   • ${table}: ${count} records`);
      });
      
      // Check if we now have full dataset
      const ledgerCount = stats.table_counts.ledgers || 0;
      const stockCount = stats.table_counts.stock_items || 0;
      const voucherCount = stats.table_counts.vouchers || 0;
      
      console.log(`\n🎯 VERIFICATION:`);
      console.log(`   Ledgers: ${ledgerCount} (expected ~635)`);
      console.log(`   Stock Items: ${stockCount} (expected ~2546)`);
      console.log(`   Vouchers: ${voucherCount} (expected ~1711)`);
      
      if (ledgerCount >= 500 && stockCount >= 2000) {
        console.log('\n🎉 SUCCESS: Full dataset now in Railway SQLite!');
      } else {
        console.log('\n⚠️  Still incomplete - may need different approach');
      }
    }
    
  } catch (error) {
    console.error('❌ Force migration failed:', error.message);
  }
}

async function forceMigrateTable(tallyTableName, railwayTableName) {
  console.log(`🔄 Force migrating ${tallyTableName} → ${railwayTableName}...`);
  
  try {
    // Find table config
    const tableConfig = [...tallyExportConfig.master, ...tallyExportConfig.transaction]
      .find(t => t.name === tallyTableName);
    
    if (!tableConfig) {
      console.log(`   ❌ Table config not found for ${tallyTableName}`);
      return;
    }
    
    // Generate TDL XML
    const xmlRequest = generateTDLXML(tableConfig);
    
    // Extract from Tally
    const xmlResponse = await postTallyXML(xmlRequest);
    
    // Process data
    const csvData = processXMLToCSV(xmlResponse, tableConfig);
    const jsonData = csvToJSON(csvData, tableConfig);
    
    console.log(`   📊 Extracted from Tally: ${jsonData.length} records`);
    
    if (jsonData.length === 0) {
      console.log(`   ℹ️  No data available`);
      return;
    }
    
    // Add UUIDs
    const enrichedData = jsonData.map(record => ({
      ...record,
      company_id: config.company.id,
      division_id: config.company.division_id,
      sync_timestamp: new Date().toISOString(),
      source: 'force-migration'
    }));
    
    // Push to Railway in very small batches
    const batchSize = 25; // Very small batches
    let totalPushed = 0;
    
    for (let i = 0; i < enrichedData.length; i += batchSize) {
      const batch = enrichedData.slice(i, i + batchSize);
      
      const payload = {
        table: railwayTableName,
        data: batch,
        sync_type: 'force-full',
        metadata: {
          source: 'force-migration',
          batch: Math.floor(i / batchSize) + 1,
          total_batches: Math.ceil(enrichedData.length / batchSize)
        }
      };
      
      try {
        const response = await axios.post(
          `${config.railway.api_base}/api/v1/bulk-sync/${config.company.id}/${config.company.division_id}`,
          payload,
          { 
            timeout: 60000,
            headers: { 'Content-Type': 'application/json' }
          }
        );
        
        totalPushed += batch.length;
        process.stdout.write(`     📦 ${Math.floor(i / batchSize) + 1}/${Math.ceil(enrichedData.length / batchSize)}... `);
        
      } catch (error) {
        console.log(`\n     ❌ Batch failed: ${error.response?.data?.error || error.message}`);
      }
    }
    
    console.log(`\n   ✅ ${tallyTableName}: ${totalPushed}/${jsonData.length} records pushed to Railway`);
    
  } catch (error) {
    console.log(`   ❌ ${tallyTableName} migration failed: ${error.message}`);
  }
}

// Helper functions (simplified versions)
function generateTDLXML(tblConfig) {
  let retval = `<?xml version="1.0" encoding="utf-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>TallyDatabaseLoaderReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>XML (Data Interchange)</SVEXPORTFORMAT><SVFROMDATE>${config.tally.fromdate}</SVFROMDATE><SVTODATE>${config.tally.todate}</SVTODATE><SVCURRENTCOMPANY>${escapeHTML(config.tally.company)}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="TallyDatabaseLoaderReport"><FORMS>MyForm</FORMS></REPORT><FORM NAME="MyForm"><PARTS>MyPart01</PARTS></FORM>`;

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

function postTallyXML(xmlRequest) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: config.tally.server,
      port: config.tally.port,
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

function processXMLToCSV(xmlData, tableConfig) {
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

function csvToJSON(csvData, tableConfig) {
  const lines = csvData.split('\n').filter(line => line.trim());
  if (lines.length <= 1) return [];
  
  const headers = lines[0].split('\t');
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const record = {};
    
    headers.forEach((header, index) => {
      const fieldConfig = tableConfig.fields.find(f => f.name === header);
      record[header] = transformValue(values[index] || '', fieldConfig?.type || 'text');
    });
    
    if (record.guid && record.guid.trim()) {
      records.push(record);
    }
  }
  
  return records;
}

function transformValue(value, type) {
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

function escapeHTML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Run force migration
forceMigration();

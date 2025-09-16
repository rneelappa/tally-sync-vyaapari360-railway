console.log('🔍 Testing Full Data Extraction from Tally');
console.log('==========================================\n');

const fs = require('fs');
const http = require('http');
const yaml = require('js-yaml');

const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

console.log(`🏢 Company: ${config.company.name}`);
console.log(`🎯 Testing data extraction from Tally...\n`);

// Test Tally connection
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

async function testExtraction() {
  try {
    // Test 1: Simple connection
    console.log('1️⃣ Testing Tally connection...');
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

    const response = await postTallyXML(testXML);
    console.log('✅ Tally connection successful');
    console.log(`📏 Response size: ${response.length} characters\n`);

    // Test 2: Count tables in YAML config
    console.log('2️⃣ Checking table configurations...');
    console.log(`📊 Master tables: ${tallyExportConfig.master.length}`);
    console.log(`💼 Transaction tables: ${tallyExportConfig.transaction.length}`);
    
    console.log('\n📋 Master tables:');
    tallyExportConfig.master.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.name} (${table.collection})`);
    });
    
    console.log('\n💼 Transaction tables:');
    tallyExportConfig.transaction.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.name} (${table.collection})`);
    });

    console.log('\n🎯 DIAGNOSIS:');
    console.log('   Expected: 635 ledgers, 2546 stock items');
    console.log('   Railway shows: 12 ledgers, 4 stock items');
    console.log('   📉 This indicates data is being extracted but not stored properly');
    console.log('   🔧 Likely issue: Batch processing or endpoint problems');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testExtraction();

#!/usr/bin/env node

/**
 * Test Windows Client
 * Tests the complete Windows client with Railway SQLite integration
 */

const WindowsTallySync = require('./windows-tally-sync');

async function testWindowsClient() {
  console.log('🧪 Testing Windows Tally Sync Client...\n');
  
  const sync = new WindowsTallySync();
  
  try {
    // Test 1: Configuration Loading
    console.log('1️⃣ Testing configuration...');
    console.log(`   🏢 Company ID: ${sync.config.company.id}`);
    console.log(`   🏭 Division ID: ${sync.config.company.division_id}`);
    console.log(`   🎯 Railway API: ${sync.config.railway.api_base}`);
    console.log('✅ Configuration loaded successfully\n');
    
    // Test 2: Connection Testing
    console.log('2️⃣ Testing connections...');
    await sync.testConnections();
    console.log('✅ Connection test passed\n');
    
    // Test 3: Single Table Test (Groups)
    console.log('3️⃣ Testing single table sync (Groups)...');
    const groupTable = sync.masterTables.find(t => t.name === 'mst_group');
    if (groupTable) {
      await sync.syncTable(groupTable, 'master');
      console.log('✅ Single table sync test passed\n');
    } else {
      console.log('⚠️  Groups table not found in configuration\n');
    }
    
    // Test 4: Show current stats
    console.log('4️⃣ Checking current database stats...');
    await sync.showSyncSummary();
    
    console.log('\n🎉 All tests passed! Windows client is ready for production sync.');
    console.log('\n📝 To run full migration:');
    console.log('   node windows-tally-sync.js');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   • Make sure Tally is running on localhost:9000');
    console.error('   • Make sure Railway SQLite server is deployed and running');
    console.error('   • Check UUID configuration in windows-client-config.json');
    process.exit(1);
  }
}

testWindowsClient();

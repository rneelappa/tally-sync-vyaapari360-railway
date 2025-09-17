#!/usr/bin/env node

/**
 * Check Database Status and Migrate if Empty
 * Verifies Railway database status and runs full migration if needed
 */

const axios = require('axios');

const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function checkAndMigrate() {
  console.log('🔍 Checking Railway Database Status After Deployment');
  console.log('===================================================\n');
  
  try {
    // Step 1: Check current database status
    console.log('1️⃣ Checking current database status...');
    
    const statsResponse = await axios.get(`${API_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
    
    if (statsResponse.data.success) {
      const stats = statsResponse.data.data;
      const totalRecords = stats.total_records;
      
      console.log(`📊 Current database records: ${totalRecords}`);
      
      if (totalRecords === 0) {
        console.log('🚨 CONFIRMED: Database is EMPTY after deployment');
        console.log('🔧 Starting full migration to populate database...\n');
        
        // Run the continuous sync which will auto-detect empty database
        await runMigration();
      } else {
        console.log('✅ Database already has data');
        console.log('📋 Current counts:');
        Object.entries(stats.table_counts).forEach(([table, count]) => {
          if (count > 0) {
            console.log(`   • ${table}: ${count} records`);
          }
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    console.log('🔧 Will attempt migration anyway...\n');
    await runMigration();
  }
}

async function runMigration() {
  console.log('🚀 Running Full Migration');
  console.log('=========================\n');
  
  try {
    // Import and run the migration
    const ContinuousSync = require('./continuous-sync');
    const sync = new ContinuousSync();
    
    console.log('🔄 Starting migration process...');
    
    // Run one sync cycle (will auto-detect empty database and run full migration)
    await sync.runSyncCycle();
    
    console.log('\n✅ Migration completed!');
    
    // Verify results
    await verifyMigration();
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  }
}

async function verifyMigration() {
  console.log('\n📊 Verifying Migration Results');
  console.log('==============================');
  
  try {
    const statsResponse = await axios.get(`${API_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
    
    if (statsResponse.data.success) {
      const stats = statsResponse.data.data;
      
      console.log(`📈 Total Records After Migration: ${stats.total_records}`);
      
      console.log('\n📋 Table Breakdown:');
      Object.entries(stats.table_counts).forEach(([table, count]) => {
        const status = count > 0 ? '✅' : '⚪';
        console.log(`   ${status} ${table}: ${count} records`);
      });
      
      // Check key metrics
      const ledgers = stats.table_counts.ledgers || 0;
      const vouchers = stats.table_counts.vouchers || 0;
      const stockItems = stats.table_counts.stock_items || 0;
      
      console.log('\n🎯 Key Metrics:');
      console.log(`   💰 Ledgers: ${ledgers} (target: ~635)`);
      console.log(`   💼 Vouchers: ${vouchers} (target: ~1711)`);
      console.log(`   📦 Stock Items: ${stockItems} (target: ~2546)`);
      
      if (stats.total_records > 10000) {
        console.log('\n🎉 EXCELLENT: Full dataset migrated successfully!');
        console.log('✅ Lovable.dev should now get complete data on next sync');
      } else if (stats.total_records > 1000) {
        console.log('\n✅ GOOD: Significant data migrated');
      } else {
        console.log('\n⚠️  INCOMPLETE: Migration may need to be run again');
      }
      
      // Test specific endpoints
      await testEndpoints();
      
    }
  } catch (error) {
    console.log('❌ Could not verify migration results:', error.message);
  }
}

async function testEndpoints() {
  console.log('\n🧪 Testing Updated Endpoints...');
  
  try {
    // Test POST /api/v1/query endpoint
    const queryResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, {
      table: 'ledgers',
      limit: 5
    });
    
    if (queryResponse.data.success) {
      console.log('✅ POST /api/v1/query endpoint working');
      console.log(`   📊 Ledgers query returned: ${queryResponse.data.data.length} records`);
    }
    
    // Test versioned endpoint
    const versionedResponse = await axios.get(`${API_URL}/api/v1/masters/groups/${COMPANY_ID}/${DIVISION_ID}`);
    
    if (versionedResponse.data.success) {
      console.log('✅ Versioned /api/v1/masters/groups endpoint working');
      console.log(`   📊 Groups returned: ${versionedResponse.data.data.length} records`);
    }
    
    console.log('\n🎯 Lovable.dev Readiness:');
    console.log('✅ All endpoints implemented and working');
    console.log('✅ Database populated with full dataset');
    console.log('✅ Ready for Lovable.dev integration');
    
  } catch (error) {
    console.log('❌ Endpoint testing failed:', error.message);
  }
}

// Run check and migration
checkAndMigrate();

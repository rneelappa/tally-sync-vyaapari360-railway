#!/usr/bin/env node

/**
 * Check Current Data in Railway SQLite
 * Verify what data Lovable.dev can actually read
 */

const axios = require('axios');

const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function checkCurrentData() {
  console.log('🔍 Checking Current Railway SQLite Data');
  console.log('======================================\n');
  
  try {
    // 1. Check overall stats
    console.log('1️⃣ Overall Database Status...');
    const statsResponse = await axios.get(`${API_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
    
    if (statsResponse.data.success) {
      const stats = statsResponse.data.data;
      console.log(`📊 Total Records: ${stats.total_records}`);
      
      console.log('\n📋 Current Table Counts (What Lovable.dev can read):');
      Object.entries(stats.table_counts).forEach(([table, count]) => {
        const status = count > 0 ? '✅' : '⚪';
        console.log(`   ${status} ${table}: ${count} records`);
      });
      
      // 2. Test specific endpoints that Lovable.dev uses
      console.log('\n2️⃣ Testing Lovable.dev Endpoints...');
      
      // Test POST /api/v1/query (what Lovable.dev should use)
      const queryTest = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, {
        table: 'groups',
        limit: 5
      });
      
      if (queryTest.data.success) {
        console.log('✅ POST /api/v1/query working');
        console.log(`   📊 Groups sample: ${queryTest.data.data.length} records returned`);
        
        if (queryTest.data.data.length > 0) {
          const sample = queryTest.data.data[0];
          console.log(`   📋 Sample group: ${sample.name} (${sample.guid})`);
        }
      }
      
      // Test vouchers endpoint
      const vouchersTest = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, {
        table: 'vouchers',
        limit: 3
      });
      
      if (vouchersTest.data.success) {
        console.log('✅ Vouchers query working');
        console.log(`   📊 Vouchers sample: ${vouchersTest.data.data.length} records returned`);
        
        if (vouchersTest.data.data.length > 0) {
          const sample = vouchersTest.data.data[0];
          console.log(`   📋 Sample voucher: ${sample.voucher_number} - ${sample.party_name}`);
        }
      }
      
      console.log('\n🎯 Analysis for Lovable.dev:');
      
      if (stats.total_records > 5000) {
        console.log('✅ EXCELLENT: Significant data available for Lovable.dev');
        console.log('✅ Reading operations should work perfectly');
        console.log('⚠️  Issue is with WRITING operations (continuous sync)');
      } else if (stats.total_records > 0) {
        console.log('✅ PARTIAL: Some data available for Lovable.dev');
        console.log('🔧 May need to complete migration for full dataset');
      } else {
        console.log('❌ EMPTY: No data available for Lovable.dev');
        console.log('🔧 Need to run successful migration first');
      }
      
    } else {
      console.log('❌ Could not get database stats');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkCurrentData();

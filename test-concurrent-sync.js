#!/usr/bin/env node

/**
 * Test concurrent sync scenarios to ensure no Railway hangs
 */

const axios = require('axios');

const RAILWAY_URL = 'https://tally-sync-vyaapari360-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function testConcurrentSync() {
  console.log('🧪 Testing Concurrent Sync Scenarios...\n');
  
  // Test 1: Metadata endpoint during bulk operation
  console.log('1️⃣ Testing metadata endpoint during bulk operation...');
  
  try {
    const metadataPromise = axios.get(
      `${RAILWAY_URL}/api/v1/metadata/${COMPANY_ID}/${DIVISION_ID}`,
      { timeout: 15000 }
    );
    
    const statsPromise = axios.get(
      `${RAILWAY_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`,
      { timeout: 15000 }
    );
    
    const [metadataRes, statsRes] = await Promise.all([metadataPromise, statsPromise]);
    
    console.log('✅ Both endpoints responded successfully');
    console.log(`📊 Metadata status: ${metadataRes.status}`);
    console.log(`📊 Stats status: ${statsRes.status}`);
    
    if (metadataRes.data.data.message && metadataRes.data.data.message.includes('Bulk operation in progress')) {
      console.log('✅ Operation lock working - metadata returned safe response');
    }
    
  } catch (error) {
    console.log('❌ Concurrent request failed:', error.message);
  }
  
  // Test 2: Multiple simultaneous metadata requests
  console.log('\n2️⃣ Testing multiple simultaneous metadata requests...');
  
  try {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        axios.get(
          `${RAILWAY_URL}/api/v1/metadata/${COMPANY_ID}/${DIVISION_ID}`,
          { timeout: 15000 }
        ).catch(err => ({ error: err.message, request: i + 1 }))
      );
    }
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    
    console.log(`✅ ${successCount}/5 requests succeeded`);
    console.log(`❌ ${errorCount}/5 requests failed`);
    
    if (errorCount === 0) {
      console.log('🎉 All concurrent requests succeeded - no hangs!');
    }
    
  } catch (error) {
    console.log('❌ Concurrent requests failed:', error.message);
  }
  
  // Test 3: Query endpoint during potential bulk operation
  console.log('\n3️⃣ Testing query endpoint during potential bulk operation...');
  
  try {
    const queryData = {
      table: 'vouchers',
      limit: 10,
      offset: 0
    };
    
    const queryPromise = axios.post(
      `${RAILWAY_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`,
      queryData,
      { timeout: 15000 }
    );
    
    const healthPromise = axios.get(
      `${RAILWAY_URL}/api/v1/health`,
      { timeout: 15000 }
    );
    
    const [queryRes, healthRes] = await Promise.all([queryPromise, healthPromise]);
    
    console.log('✅ Query and health endpoints responded successfully');
    console.log(`📊 Query status: ${queryRes.status}`);
    console.log(`📊 Health status: ${healthRes.status}`);
    
  } catch (error) {
    console.log('❌ Query/health test failed:', error.message);
  }
  
  console.log('\n🎯 CONCURRENT SYNC TEST SUMMARY:');
  console.log('   - If all tests passed: ✅ Railway handles concurrent syncs');
  console.log('   - If any timeouts: ❌ Railway may hang during concurrent operations');
  console.log('   - If operation lock messages: ✅ Protection is working');
  
  console.log('\n📋 RECOMMENDATIONS:');
  console.log('   1. Run Windows continuous sync every 5 minutes');
  console.log('   2. Run Lovable full sync during off-peak hours');
  console.log('   3. Monitor Railway logs for timeout messages');
  console.log('   4. Use operation lock system to prevent conflicts');
}

// Run tests
testConcurrentSync().catch(console.error);

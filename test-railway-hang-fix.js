#!/usr/bin/env node

/**
 * Test script to verify Railway hang fix
 * Tests metadata endpoint with timeout and error handling
 */

const axios = require('axios');

const RAILWAY_URL = 'https://tally-sync-vyaapari360-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function testMetadataEndpoint() {
  console.log('🧪 Testing Railway metadata endpoint hang fix...\n');
  
  try {
    console.log('1️⃣ Testing metadata endpoint with timeout...');
    const startTime = Date.now();
    
    const response = await axios.get(
      `${RAILWAY_URL}/api/v1/metadata/${COMPANY_ID}/${DIVISION_ID}`,
      { timeout: 15000 } // 15 second timeout
    );
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Metadata endpoint responded in ${duration}ms`);
    console.log(`📊 Response status: ${response.status}`);
    console.log(`📋 Response data:`, JSON.stringify(response.data, null, 2));
    
    if (duration < 10000) {
      console.log('🎉 SUCCESS: Endpoint responded within 10 seconds!');
    } else {
      console.log('⚠️ WARNING: Endpoint took longer than expected');
    }
    
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.log('❌ FAILED: Request timed out after 15 seconds');
    } else if (error.response) {
      console.log(`❌ FAILED: HTTP ${error.response.status} - ${error.response.statusText}`);
      console.log('📋 Error response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ FAILED:', error.message);
    }
  }
}

async function testHealthEndpoint() {
  console.log('\n2️⃣ Testing health endpoint...');
  
  try {
    const response = await axios.get(`${RAILWAY_URL}/api/v1/health`, { timeout: 5000 });
    console.log('✅ Health endpoint working');
    console.log('📊 Health data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Health endpoint failed:', error.message);
  }
}

async function testConcurrentRequests() {
  console.log('\n3️⃣ Testing concurrent metadata requests...');
  
  const promises = [];
  for (let i = 0; i < 3; i++) {
    promises.push(
      axios.get(
        `${RAILWAY_URL}/api/v1/metadata/${COMPANY_ID}/${DIVISION_ID}`,
        { timeout: 15000 }
      ).catch(err => ({ error: err.message, request: i + 1 }))
    );
  }
  
  try {
    const results = await Promise.all(promises);
    console.log('📊 Concurrent request results:');
    results.forEach((result, index) => {
      if (result.error) {
        console.log(`   Request ${index + 1}: ❌ ${result.error}`);
      } else {
        console.log(`   Request ${index + 1}: ✅ ${result.status} - ${result.data.success ? 'SUCCESS' : 'FAILED'}`);
      }
    });
  } catch (error) {
    console.log('❌ Concurrent requests failed:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting Railway hang fix verification tests...\n');
  console.log(`🌐 Testing against: ${RAILWAY_URL}`);
  console.log(`🏢 Company: ${COMPANY_ID}`);
  console.log(`🏬 Division: ${DIVISION_ID}\n`);
  
  await testHealthEndpoint();
  await testMetadataEndpoint();
  await testConcurrentRequests();
  
  console.log('\n🎯 Test Summary:');
  console.log('   - If metadata endpoint responds within 10 seconds: ✅ FIXED');
  console.log('   - If no timeout errors: ✅ FIXED');
  console.log('   - If safe error responses: ✅ FIXED');
  console.log('   - If container remains responsive: ✅ FIXED');
  
  console.log('\n📋 Next Steps:');
  console.log('   1. Verify Railway deployment is updated');
  console.log('   2. Test Supabase function integration');
  console.log('   3. Monitor for any remaining issues');
  console.log('   4. Proceed with two-way sync implementation');
}

// Run tests
runTests().catch(console.error);

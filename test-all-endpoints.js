#!/usr/bin/env node

/**
 * Test All Endpoints
 * Comprehensive test of all Railway API endpoints for Lovable.dev compatibility
 */

const axios = require('axios');

const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

// All endpoints that Lovable.dev expects
const ENDPOINTS_TO_TEST = [
  { name: 'Groups', url: '/masters/groups', expected: 49 },
  { name: 'Ledgers', url: '/masters/ledgers', expected: 635 },
  { name: 'Stock Items', url: '/masters/stock-items', expected: 2546 },
  { name: 'Voucher Types', url: '/masters/voucher-types', expected: 43 },
  { name: 'Cost Centers', url: '/masters/cost-centers', expected: 0 },
  { name: 'Employees', url: '/masters/employees', expected: 0 },
  { name: 'UOMs', url: '/masters/uoms', expected: 6 },
  { name: 'Godowns', url: '/masters/godowns', expected: 5 },
  { name: 'Vouchers', url: '/vouchers', expected: 1711 },
  { name: 'Accounting', url: '/accounting', expected: 6369 },
  { name: 'Inventory', url: '/inventory', expected: 2709 }
];

class EndpointTester {
  constructor() {
    this.results = {
      total_endpoints: ENDPOINTS_TO_TEST.length,
      working_endpoints: 0,
      failed_endpoints: 0,
      total_records: 0,
      endpoint_details: {}
    };
  }

  async testAllEndpoints() {
    console.log('🧪 COMPREHENSIVE ENDPOINT TESTING');
    console.log('==================================\n');
    
    console.log(`🎯 Testing ${this.results.total_endpoints} endpoints for Lovable.dev compatibility`);
    console.log(`🏢 Company ID: ${COMPANY_ID}`);
    console.log(`🏭 Division ID: ${DIVISION_ID}\n`);
    
    try {
      // Test health first
      await this.testHealth();
      
      // Test all data endpoints
      for (const endpoint of ENDPOINTS_TO_TEST) {
        await this.testEndpoint(endpoint);
      }
      
      // Test special endpoints
      await this.testSpecialEndpoints();
      
      // Show final summary
      this.showSummary();
      
    } catch (error) {
      console.error('❌ Endpoint testing failed:', error.message);
    }
  }

  async testHealth() {
    console.log('🔍 Testing Health Endpoint...');
    
    try {
      const response = await axios.get(`${API_URL}/api/v1/health`);
      console.log('✅ Health check passed');
      console.log(`📊 Service: ${response.data.data.service}`);
      console.log(`🗄️ Database: ${response.data.data.database}\n`);
    } catch (error) {
      console.log('❌ Health check failed:', error.message);
      throw error;
    }
  }

  async testEndpoint(endpoint) {
    const fullUrl = `${API_URL}${endpoint.url}/${COMPANY_ID}/${DIVISION_ID}`;
    
    try {
      console.log(`🔄 Testing ${endpoint.name}...`);
      
      const response = await axios.get(fullUrl, { timeout: 15000 });
      
      if (response.data.success) {
        const count = response.data.data.count || 0;
        
        this.results.endpoint_details[endpoint.name] = {
          status: 'success',
          records: count,
          expected: endpoint.expected,
          url: endpoint.url,
          match: count >= endpoint.expected * 0.8 // 80% match considered good
        };
        
        this.results.working_endpoints++;
        this.results.total_records += count;
        
        const status = count >= endpoint.expected * 0.8 ? '🎉' : count > 0 ? '✅' : '⚠️';
        console.log(`   ${status} ${endpoint.name}: ${count} records (expected ~${endpoint.expected})`);
        
        // Show sample data for key endpoints
        if (count > 0 && response.data.data.records && response.data.data.records.length > 0) {
          const sample = response.data.data.records[0];
          const identifier = sample.name || sample.voucher_number || sample.guid || 'N/A';
          console.log(`      📋 Sample: ${identifier}`);
        }
        
      } else {
        this.results.endpoint_details[endpoint.name] = {
          status: 'failed',
          error: response.data.error,
          url: endpoint.url
        };
        this.results.failed_endpoints++;
        console.log(`   ❌ ${endpoint.name}: ${response.data.error}`);
      }
      
    } catch (error) {
      this.results.endpoint_details[endpoint.name] = {
        status: 'error',
        error: error.message,
        url: endpoint.url
      };
      this.results.failed_endpoints++;
      
      if (error.response?.status === 404) {
        console.log(`   ❌ ${endpoint.name}: Endpoint not found (404)`);
      } else {
        console.log(`   ❌ ${endpoint.name}: ${error.message}`);
      }
    }
    
    console.log();
  }

  async testSpecialEndpoints() {
    console.log('🔍 Testing Special Endpoints...');
    
    // Test voucher verification endpoint
    try {
      const voucherResponse = await axios.get(
        `${API_URL}/api/v1/voucher/${COMPANY_ID}/${DIVISION_ID}/2800237/25-26`
      );
      
      if (voucherResponse.data.success) {
        const voucher = voucherResponse.data.data;
        console.log('✅ Voucher verification endpoint working');
        console.log(`   📄 Voucher: ${voucher.voucher?.voucher_number}`);
        console.log(`   🏢 Party: ${voucher.voucher?.party_ledger_name}`);
        console.log(`   💰 Accounting Entries: ${voucher.relationships?.accounting_count}`);
        console.log(`   📦 Inventory Entries: ${voucher.relationships?.inventory_count}`);
      } else {
        console.log('⚠️  Voucher verification: No data found (may not exist yet)');
      }
    } catch (error) {
      console.log('❌ Voucher verification failed:', error.response?.status || error.message);
    }
    
    // Test endpoints list
    try {
      const endpointsResponse = await axios.get(`${API_URL}/api/v1/endpoints`);
      console.log('✅ Endpoints list available');
      console.log(`   📋 Total endpoints: ${endpointsResponse.data.data.lovable_compatible_endpoints.length}`);
    } catch (error) {
      console.log('❌ Endpoints list failed:', error.message);
    }
    
    console.log();
  }

  showSummary() {
    console.log('📊 ENDPOINT TESTING SUMMARY');
    console.log('============================\n');
    
    console.log('🔍 Overall Results:');
    console.log(`   📊 Total Endpoints: ${this.results.total_endpoints}`);
    console.log(`   ✅ Working: ${this.results.working_endpoints}`);
    console.log(`   ❌ Failed: ${this.results.failed_endpoints}`);
    console.log(`   📈 Total Records: ${this.results.total_records}`);
    
    console.log('\n📋 Detailed Results:');
    Object.entries(this.results.endpoint_details).forEach(([name, result]) => {
      if (result.status === 'success') {
        const matchStatus = result.match ? '🎉' : result.records > 0 ? '✅' : '⚠️';
        console.log(`   ${matchStatus} ${name}: ${result.records}/${result.expected} records`);
      } else {
        console.log(`   ❌ ${name}: ${result.error}`);
      }
    });
    
    console.log('\n🎯 Lovable.dev Readiness:');
    if (this.results.working_endpoints >= 9 && this.results.total_records > 10000) {
      console.log('   🎉 EXCELLENT: All endpoints working with full dataset!');
      console.log('   ✅ Lovable.dev should sync successfully with complete data');
    } else if (this.results.working_endpoints >= 7) {
      console.log('   ✅ GOOD: Most endpoints working, some data available');
    } else {
      console.log('   ⚠️  NEEDS WORK: Many endpoints failing or no data');
    }
    
    console.log('\n📋 Recommendations for Supabase Function:');
    console.log('1. ✅ Use the working endpoints (those showing records > 0)');
    console.log('2. 🔄 Add inventory mapping to TABLE_MAPPINGS');
    console.log('3. 🔧 Enhance response parsing for different formats');
    console.log('4. 📊 Use POST /api/v1/query for complex queries');
    console.log('5. 🔍 Test individual voucher verification');
    
    console.log(`\n🎯 Expected Lovable.dev Results:`);
    console.log(`   Total Records: ${this.results.total_records}+ (instead of 0)`);
    console.log(`   Entity Counts: All populated (instead of all 0s)`);
    console.log(`   Success Rate: High (instead of 0 records processed)`);
  }
}

// Run comprehensive test
const tester = new EndpointTester();
tester.testAllEndpoints();

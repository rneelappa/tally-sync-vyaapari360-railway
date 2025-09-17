#!/usr/bin/env node

/**
 * Test API Endpoints - Mimics Supabase Function
 * Tests all endpoints that Lovable.dev expects to use
 */

const axios = require('axios');

const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

// Same table mappings as Supabase function
const TABLE_MAPPINGS = [
  { apiTable: 'groups', supabaseTable: 'mst_group', endpoint: '/masters/groups', keyField: 'guid' },
  { apiTable: 'ledgers', supabaseTable: 'mst_ledger', endpoint: '/masters/ledgers', keyField: 'guid' },
  { apiTable: 'stock_items', supabaseTable: 'mst_stock_item', endpoint: '/masters/stock-items', keyField: 'guid' },
  { apiTable: 'voucher_types', supabaseTable: 'mst_vouchertype', endpoint: '/masters/voucher-types', keyField: 'guid' },
  { apiTable: 'cost_centers', supabaseTable: 'mst_cost_centre', endpoint: '/masters/cost-centers', keyField: 'guid' },
  { apiTable: 'godowns', supabaseTable: 'mst_godown', endpoint: '/masters/godowns', keyField: 'guid' },
  { apiTable: 'employees', supabaseTable: 'mst_employee', endpoint: '/masters/employees', keyField: 'guid' },
  { apiTable: 'uoms', supabaseTable: 'mst_uom', endpoint: '/masters/uoms', keyField: 'guid' },
  { apiTable: 'vouchers', supabaseTable: 'tally_trn_voucher', endpoint: '/vouchers', keyField: 'guid' },
  { apiTable: 'accounting', supabaseTable: 'trn_accounting', endpoint: '/accounting', keyField: 'guid' }
];

class APITester {
  constructor() {
    this.apiUrl = API_URL;
    this.companyId = COMPANY_ID;
    this.divisionId = DIVISION_ID;
    this.testResults = {
      health: null,
      metadata: null,
      endpoints: {},
      summary: {
        total_endpoints: TABLE_MAPPINGS.length,
        working_endpoints: 0,
        failed_endpoints: 0,
        total_records: 0
      }
    };
  }

  async testAllEndpoints() {
    console.log('🧪 Testing Railway API Endpoints (Mimicking Supabase Function)');
    console.log('================================================================\n');
    
    console.log(`🎯 API URL: ${this.apiUrl}`);
    console.log(`🏢 Company ID: ${this.companyId}`);
    console.log(`🏭 Division ID: ${this.divisionId}\n`);
    
    try {
      // Step 1: Test health endpoint
      await this.testHealthEndpoint();
      
      // Step 2: Test metadata endpoint
      await this.testMetadataEndpoint();
      
      // Step 3: Test all data endpoints
      await this.testDataEndpoints();
      
      // Step 4: Show summary
      this.showTestSummary();
      
    } catch (error) {
      console.error('❌ API testing failed:', error.message);
    }
  }

  async testHealthEndpoint() {
    console.log('1️⃣ Testing Health Endpoint...');
    
    try {
      const response = await axios.get(`${this.apiUrl}/api/v1/health`);
      this.testResults.health = response.data;
      
      console.log('✅ Health endpoint working');
      console.log(`📊 Response: ${response.data.message}`);
      console.log(`🗄️ Database: ${response.data.data.database}`);
      
    } catch (error) {
      console.log('❌ Health endpoint failed:', error.message);
      this.testResults.health = { error: error.message };
    }
    
    console.log();
  }

  async testMetadataEndpoint() {
    console.log('2️⃣ Testing Metadata Endpoint...');
    
    try {
      const response = await axios.get(`${this.apiUrl}/api/v1/metadata/${this.companyId}/${this.divisionId}`);
      this.testResults.metadata = response.data;
      
      console.log('✅ Metadata endpoint working');
      console.log(`📊 Total records: ${response.data.data.total_records || 0}`);
      console.log(`📋 Tables tracked: ${Object.keys(response.data.data.tables || {}).length}`);
      
    } catch (error) {
      console.log('❌ Metadata endpoint failed:', error.message);
      this.testResults.metadata = { error: error.message };
    }
    
    console.log();
  }

  async testDataEndpoints() {
    console.log('3️⃣ Testing Data Endpoints (Lovable.dev Compatible)...');
    console.log('====================================================');
    
    for (const mapping of TABLE_MAPPINGS) {
      await this.testSingleEndpoint(mapping);
    }
  }

  async testSingleEndpoint(mapping) {
    const endpointUrl = `${this.apiUrl}${mapping.endpoint}/${this.companyId}/${this.divisionId}`;
    
    try {
      console.log(`🔄 Testing ${mapping.apiTable}...`);
      console.log(`   📡 URL: ${endpointUrl}`);
      
      const response = await axios.get(endpointUrl, { timeout: 10000 });
      
      if (response.data.success) {
        const recordCount = response.data.data.count || 0;
        this.testResults.endpoints[mapping.apiTable] = {
          status: 'success',
          records: recordCount,
          endpoint: mapping.endpoint
        };
        
        this.testResults.summary.working_endpoints++;
        this.testResults.summary.total_records += recordCount;
        
        console.log(`   ✅ ${mapping.apiTable}: ${recordCount} records`);
        
        // Show sample data for tables with records
        if (recordCount > 0 && response.data.data.records && response.data.data.records.length > 0) {
          const sampleRecord = response.data.data.records[0];
          console.log(`   📋 Sample record: ${sampleRecord.name || sampleRecord.voucher_number || sampleRecord.guid}`);
        }
        
      } else {
        this.testResults.endpoints[mapping.apiTable] = {
          status: 'failed',
          error: response.data.error || 'Unknown error',
          endpoint: mapping.endpoint
        };
        this.testResults.summary.failed_endpoints++;
        console.log(`   ❌ ${mapping.apiTable}: ${response.data.error}`);
      }
      
    } catch (error) {
      this.testResults.endpoints[mapping.apiTable] = {
        status: 'error',
        error: error.message,
        endpoint: mapping.endpoint
      };
      this.testResults.summary.failed_endpoints++;
      
      if (error.response?.status === 404) {
        console.log(`   ❌ ${mapping.apiTable}: Endpoint not found (404)`);
      } else {
        console.log(`   ❌ ${mapping.apiTable}: ${error.message}`);
      }
    }
    
    console.log();
  }

  showTestSummary() {
    console.log('📊 API ENDPOINT TEST SUMMARY');
    console.log('=============================\n');
    
    console.log('🔍 Overall Results:');
    console.log(`   📊 Total Endpoints: ${this.testResults.summary.total_endpoints}`);
    console.log(`   ✅ Working: ${this.testResults.summary.working_endpoints}`);
    console.log(`   ❌ Failed: ${this.testResults.summary.failed_endpoints}`);
    console.log(`   📈 Total Records: ${this.testResults.summary.total_records}`);
    
    console.log('\n📋 Endpoint Status:');
    Object.entries(this.testResults.endpoints).forEach(([table, result]) => {
      const status = result.status === 'success' ? '✅' : '❌';
      const info = result.status === 'success' 
        ? `${result.records} records`
        : result.error;
      console.log(`   ${status} ${table}: ${info}`);
    });
    
    console.log('\n🎯 Lovable.dev Compatibility:');
    if (this.testResults.summary.working_endpoints >= 8) {
      console.log('   🎉 EXCELLENT: Most endpoints working - Lovable.dev should sync successfully');
    } else if (this.testResults.summary.working_endpoints >= 5) {
      console.log('   ✅ GOOD: Core endpoints working - Basic Lovable.dev functionality available');
    } else {
      console.log('   ⚠️  LIMITED: Many endpoints failing - Lovable.dev may have issues');
    }
    
    console.log('\n🔧 Expected Lovable.dev Results:');
    console.log('When Lovable.dev runs full sync again, it should get:');
    console.log(`   • Ledgers: ${this.testResults.endpoints.ledgers?.records || 0} (expected ~635)`);
    console.log(`   • Groups: ${this.testResults.endpoints.groups?.records || 0} (expected ~49)`);
    console.log(`   • Stock Items: ${this.testResults.endpoints.stock_items?.records || 0} (expected ~2546)`);
    console.log(`   • Vouchers: ${this.testResults.endpoints.vouchers?.records || 0} (expected ~1711)`);
    
    if (this.testResults.summary.total_records > 10000) {
      console.log('\n🎉 SUCCESS: Full dataset available for Lovable.dev integration!');
    } else if (this.testResults.summary.total_records > 1000) {
      console.log('\n✅ PARTIAL: Significant data available, may need more time');
    } else {
      console.log('\n⚠️  INCOMPLETE: Limited data available, continuous sync may still be populating');
    }
  }
}

// Run the test
const tester = new APITester();
tester.testAllEndpoints();

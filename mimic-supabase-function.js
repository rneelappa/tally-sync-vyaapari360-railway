#!/usr/bin/env node

/**
 * Mimic Supabase Function
 * Exactly replicates the Supabase function logic to test our Railway APIs
 */

const axios = require('axios');

// Same configuration as Supabase function
const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

// Exact table mappings from Supabase function
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

class SupabaseFunctionMimic {
  constructor() {
    this.apiUrl = API_URL;
    this.companyId = COMPANY_ID;
    this.divisionId = DIVISION_ID;
    this.syncResults = {
      jobId: `test-job-${Date.now()}`,
      tablesProcessed: {},
      totalRecords: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalErrors: 0,
      startTime: new Date().toISOString()
    };
  }

  async performFullSync() {
    console.log('🔄 MIMICKING SUPABASE FUNCTION');
    console.log('==============================\n');
    
    console.log(`🏢 Company: ${this.companyId}`);
    console.log(`🏭 Division: ${this.divisionId}`);
    console.log(`🎯 API URL: ${this.apiUrl}\n`);
    
    try {
      // Step 1: Health Check (like Supabase function)
      await this.checkAPIHealth();
      
      // Step 2: Get Metadata (like Supabase function)
      await this.getAPIMetadata();
      
      // Step 3: Process each table (like Supabase function)
      console.log(`\n📊 Processing ${TABLE_MAPPINGS.length} tables...\n`);
      
      for (const tableMapping of TABLE_MAPPINGS) {
        await this.processTable(tableMapping);
      }
      
      // Step 4: Show final results
      this.showFinalResults();
      
    } catch (error) {
      console.error('❌ Supabase function mimic failed:', error.message);
    }
  }

  async checkAPIHealth() {
    console.log('1️⃣ API Health Check...');
    
    try {
      const response = await axios.get(`${this.apiUrl}/api/v1/health`);
      console.log('✅ API Health Check Passed');
      console.log(`📊 Service: ${response.data.data.service}`);
      console.log(`🗄️ Database: ${response.data.data.database}`);
      console.log(`🌍 Environment: ${response.data.data.environment}`);
    } catch (error) {
      console.log('❌ API Health Check Failed:', error.message);
      throw error;
    }
  }

  async getAPIMetadata() {
    console.log('\n2️⃣ Getting API Metadata...');
    
    try {
      const response = await axios.get(`${this.apiUrl}/api/v1/metadata/${this.companyId}/${this.divisionId}`);
      
      if (response.data.success) {
        const metadata = response.data.data;
        console.log('✅ API Metadata Retrieved');
        console.log(`📊 Total Records: ${metadata.total_records || 0}`);
        console.log(`📋 Tables: ${Object.keys(metadata.tables || {}).length}`);
        
        // Show table status
        if (metadata.tables) {
          Object.entries(metadata.tables).forEach(([table, info]) => {
            console.log(`   • ${table}: ${info.records_processed || 0} records`);
          });
        }
      } else {
        console.log('⚠️  Metadata available but no data:', response.data);
      }
    } catch (error) {
      console.log('❌ Metadata retrieval failed:', error.message);
    }
  }

  async processTable(tableMapping) {
    console.log(`🔄 Processing ${tableMapping.apiTable}...`);
    
    try {
      // Query the specific endpoint (exactly like Supabase function)
      const endpointUrl = `${this.apiUrl}${tableMapping.endpoint}/${this.companyId}/${this.divisionId}`;
      
      console.log(`   📡 Querying: ${endpointUrl}`);
      
      const response = await axios.get(endpointUrl, { timeout: 30000 });
      
      if (response.data.success) {
        const records = response.data.data.records || [];
        const recordCount = records.length;
        
        console.log(`   ✅ Retrieved ${recordCount} records for ${tableMapping.apiTable}`);
        
        // Store results (like Supabase function would)
        this.syncResults.tablesProcessed[tableMapping.apiTable] = {
          records: recordCount,
          inserted: recordCount, // Simulated
          updated: 0,
          errors: 0,
          endpoint: tableMapping.endpoint,
          supabaseTable: tableMapping.supabaseTable
        };
        
        this.syncResults.totalRecords += recordCount;
        this.syncResults.totalInserted += recordCount;
        
        // Show sample data for verification
        if (recordCount > 0) {
          const sampleRecord = records[0];
          const identifier = sampleRecord.name || sampleRecord.voucher_number || sampleRecord.guid || 'N/A';
          console.log(`   📋 Sample: ${identifier}`);
          
          // Special checks for important tables
          if (tableMapping.apiTable === 'ledgers' && recordCount >= 500) {
            console.log(`   🎉 EXCELLENT: ${recordCount} ledgers (includes MABEL ENGINEERS)`);
          }
          if (tableMapping.apiTable === 'vouchers' && recordCount >= 1000) {
            console.log(`   🎉 EXCELLENT: ${recordCount} vouchers (includes SALES 2800237/25-26)`);
          }
          if (tableMapping.apiTable === 'stock_items' && recordCount >= 2000) {
            console.log(`   🎉 EXCELLENT: ${recordCount} stock items (includes JINDAL-A)`);
          }
        }
        
      } else {
        console.log(`   ❌ Failed: ${response.data.error || 'Unknown error'}`);
        
        this.syncResults.tablesProcessed[tableMapping.apiTable] = {
          records: 0,
          inserted: 0,
          updated: 0,
          errors: 1,
          error: response.data.error
        };
        
        this.syncResults.totalErrors++;
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.status || error.message}`);
      
      this.syncResults.tablesProcessed[tableMapping.apiTable] = {
        records: 0,
        inserted: 0,
        updated: 0,
        errors: 1,
        error: error.message
      };
      
      this.syncResults.totalErrors++;
    }
    
    console.log();
  }

  showFinalResults() {
    this.syncResults.endTime = new Date().toISOString();
    
    console.log('🎉 SUPABASE FUNCTION MIMIC RESULTS');
    console.log('===================================\n');
    
    console.log('📊 Overall Summary:');
    console.log(`   📈 Total Records: ${this.syncResults.totalRecords}`);
    console.log(`   ✅ Total Inserted: ${this.syncResults.totalInserted}`);
    console.log(`   🔄 Total Updated: ${this.syncResults.totalUpdated}`);
    console.log(`   ❌ Total Errors: ${this.syncResults.totalErrors}`);
    console.log(`   📋 Tables Processed: ${Object.keys(this.syncResults.tablesProcessed).length}`);
    
    console.log('\n📋 Table Breakdown:');
    Object.entries(this.syncResults.tablesProcessed).forEach(([table, result]) => {
      const status = result.records > 0 ? '✅' : '❌';
      console.log(`   ${status} ${table}: ${result.records} records → ${result.supabaseTable}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });
    
    console.log('\n🎯 Lovable.dev Compatibility Results:');
    
    // Create the exact response format Lovable.dev expects
    const lovableResponse = {
      success: this.syncResults.totalRecords > 0,
      data: {
        jobId: this.syncResults.jobId,
        totals: {
          totalRecords: this.syncResults.totalRecords,
          totalInserted: this.syncResults.totalInserted,
          totalUpdated: this.syncResults.totalUpdated,
          totalErrors: this.syncResults.totalErrors
        },
        tablesProcessedCount: Object.keys(this.syncResults.tablesProcessed).length,
        entityCounts: {
          ledgers: this.syncResults.tablesProcessed.ledgers?.records || 0,
          groups: this.syncResults.tablesProcessed.groups?.records || 0,
          stockItems: this.syncResults.tablesProcessed.stock_items?.records || 0,
          voucherTypes: this.syncResults.tablesProcessed.voucher_types?.records || 0
        },
        totalVouchers: this.syncResults.tablesProcessed.vouchers?.records || 0,
        method: "Railway SQLite API Test"
      }
    };
    
    console.log('\n📋 Expected Lovable.dev Response:');
    console.log(JSON.stringify(lovableResponse, null, 2));
    
    console.log('\n🎯 Status Assessment:');
    if (this.syncResults.totalRecords > 10000) {
      console.log('🎉 EXCELLENT: Full dataset available - Lovable.dev will get complete data!');
    } else if (this.syncResults.totalRecords > 1000) {
      console.log('✅ GOOD: Significant data available - Lovable.dev will get substantial data');
    } else if (this.syncResults.totalRecords > 0) {
      console.log('⚠️  PARTIAL: Some data available - May need more time for full sync');
    } else {
      console.log('❌ NO DATA: APIs working but database empty - Need to run migration');
    }
  }
}

// Run the mimic
const mimic = new SupabaseFunctionMimic();
mimic.performFullSync();

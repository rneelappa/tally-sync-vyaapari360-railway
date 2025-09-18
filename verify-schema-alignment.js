#!/usr/bin/env node

/**
 * Schema Alignment Verification Script
 * Verifies that Railway SQLite schema matches Supabase conventions
 */

const axios = require('axios');

const RAILWAY_URL = 'https://tally-sync-vyaapari360-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

// Expected table names after alignment
const EXPECTED_TABLES = [
  'tally_trn_voucher',
  'trn_accounting', 
  'trn_inventory',
  'mst_group',
  'mst_ledger',
  'mst_stock_item',
  'mst_vouchertype',
  'mst_uom',
  'mst_godown',
  'mst_cost_centre'
];

// Expected column names after alignment
const EXPECTED_COLUMNS = {
  'tally_trn_voucher': ['party_ledger_name'], // Should have party_ledger_name, not party_name
  'mst_uom': ['formal_name'], // Should have formal_name, not formalname
  'trn_inventory': ['order_due_date'] // Should have order_due_date, not order_duedate
};

async function verifySchemaAlignment() {
  console.log('🔍 Verifying Schema Alignment...\n');
  
  try {
    // Test 1: Check if Railway is responding
    console.log('1️⃣ Testing Railway connection...');
    const healthResponse = await axios.get(`${RAILWAY_URL}/api/v1/health`, { timeout: 10000 });
    console.log(`✅ Railway is responding: ${healthResponse.data.success ? 'OK' : 'ERROR'}`);
    
    // Test 2: Check table existence
    console.log('\n2️⃣ Checking table existence...');
    for (const tableName of EXPECTED_TABLES) {
      try {
        const response = await axios.post(
          `${RAILWAY_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`,
          {
            table: tableName,
            limit: 1
          },
          { timeout: 10000 }
        );
        
        if (response.data.success) {
          console.log(`✅ ${tableName}: EXISTS`);
        } else {
          console.log(`❌ ${tableName}: NOT FOUND - ${response.data.error}`);
        }
      } catch (error) {
        console.log(`❌ ${tableName}: ERROR - ${error.message}`);
      }
    }
    
    // Test 3: Check column names
    console.log('\n3️⃣ Checking column names...');
    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_COLUMNS)) {
      try {
        const response = await axios.post(
          `${RAILWAY_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`,
          {
            table: tableName,
            limit: 1
          },
          { timeout: 10000 }
        );
        
        if (response.data.success && response.data.data.records.length > 0) {
          const record = response.data.data.records[0];
          const recordKeys = Object.keys(record);
          
          for (const expectedColumn of expectedColumns) {
            if (recordKeys.includes(expectedColumn)) {
              console.log(`✅ ${tableName}.${expectedColumn}: EXISTS`);
            } else {
              console.log(`❌ ${tableName}.${expectedColumn}: MISSING`);
              console.log(`   Available columns: ${recordKeys.join(', ')}`);
            }
          }
        } else {
          console.log(`⚠️ ${tableName}: No records to check columns`);
        }
      } catch (error) {
        console.log(`❌ ${tableName}: ERROR checking columns - ${error.message}`);
      }
    }
    
    // Test 4: Check data integrity
    console.log('\n4️⃣ Checking data integrity...');
    try {
      const statsResponse = await axios.get(
        `${RAILWAY_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`,
        { timeout: 10000 }
      );
      
      if (statsResponse.data.success) {
        const stats = statsResponse.data.data;
        console.log(`📊 Total records: ${stats.summary.total_records}`);
        console.log(`📊 Total tables: ${stats.summary.total_tables}`);
        
        // Check specific table counts
        for (const tableName of EXPECTED_TABLES) {
          const tableStats = stats.table_statistics[tableName];
          if (tableStats) {
            console.log(`   ${tableName}: ${tableStats.record_count} records`);
          } else {
            console.log(`   ${tableName}: No statistics available`);
          }
        }
      } else {
        console.log(`❌ Could not get statistics: ${statsResponse.data.error}`);
      }
    } catch (error) {
      console.log(`❌ Error getting statistics: ${error.message}`);
    }
    
    // Test 5: Check voucher relationships
    console.log('\n5️⃣ Checking voucher relationships...');
    try {
      const voucherResponse = await axios.post(
        `${RAILWAY_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`,
        {
          table: 'tally_trn_voucher',
          limit: 5
        },
        { timeout: 10000 }
      );
      
      if (voucherResponse.data.success && voucherResponse.data.data.records.length > 0) {
        const vouchers = voucherResponse.data.data.records;
        console.log(`✅ Found ${vouchers.length} vouchers`);
        
        // Check if vouchers have proper structure
        const sampleVoucher = vouchers[0];
        const hasGuid = sampleVoucher.guid ? '✅' : '❌';
        const hasVoucherNumber = sampleVoucher.voucher_number ? '✅' : '❌';
        const hasPartyLedgerName = sampleVoucher.party_ledger_name ? '✅' : '❌';
        
        console.log(`   GUID: ${hasGuid}`);
        console.log(`   Voucher Number: ${hasVoucherNumber}`);
        console.log(`   Party Ledger Name: ${hasPartyLedgerName}`);
      } else {
        console.log(`⚠️ No vouchers found to check relationships`);
      }
    } catch (error) {
      console.log(`❌ Error checking voucher relationships: ${error.message}`);
    }
    
    console.log('\n🎯 SCHEMA ALIGNMENT VERIFICATION COMPLETE');
    console.log('==========================================');
    console.log('✅ If all tests passed, your schema is aligned!');
    console.log('❌ If any tests failed, check the error messages above');
    console.log('📋 Next step: Update your application code to use new table names');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if Railway is running');
    console.log('2. Verify database connection');
    console.log('3. Check if schema changes were applied');
    console.log('4. Review error messages above');
  }
}

// Run verification
verifySchemaAlignment().catch(console.error);

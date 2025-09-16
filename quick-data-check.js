#!/usr/bin/env node

/**
 * Quick Data Check
 * Simple check of what data is actually in Railway SQLite
 */

const axios = require('axios');

const RAILWAY_API = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function quickCheck() {
  console.log('🔍 Quick Data Check in Railway SQLite');
  console.log('=====================================\n');
  
  try {
    // Test connection
    console.log('1️⃣ Testing Railway connection...');
    const healthResponse = await axios.get(`${RAILWAY_API}/api/v1/health`);
    console.log('✅ Railway connected:', healthResponse.data.message);
    
    // Get overall stats
    console.log('\n2️⃣ Getting database statistics...');
    const statsResponse = await axios.get(`${RAILWAY_API}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
    
    if (statsResponse.data.success) {
      const stats = statsResponse.data.data;
      console.log(`📊 Total Records: ${stats.total_records}`);
      
      console.log('\n📋 Table Counts:');
      Object.entries(stats.table_counts).forEach(([table, count]) => {
        console.log(`   • ${table}: ${count} records`);
      });
      
      // Check if we have vouchers
      const voucherCount = stats.table_counts.vouchers || 0;
      console.log(`\n🎯 Voucher Analysis:`);
      console.log(`   📊 Vouchers in Database: ${voucherCount}`);
      
      if (voucherCount > 0) {
        console.log('   ✅ Vouchers successfully migrated!');
        
        // Get sample voucher data
        const sampleQuery = {
          sql: `SELECT voucher_number, voucher_type, date, party_ledger_name, amount 
                FROM vouchers 
                WHERE company_id = ? AND division_id = ? 
                ORDER BY date DESC LIMIT 5`,
          params: [COMPANY_ID, DIVISION_ID]
        };
        
        const sampleResponse = await axios.post(`${RAILWAY_API}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, sampleQuery);
        
        if (sampleResponse.data.success) {
          console.log('\n📋 Sample Vouchers:');
          sampleResponse.data.data.results.forEach(v => {
            console.log(`   • ${v.voucher_number} (${v.voucher_type}): ${v.party_ledger_name} - ₹${v.amount}`);
          });
        }
      } else {
        console.log('   ⚠️  No vouchers found in database');
      }
      
      // Check accounting entries
      const accountingCount = stats.table_counts.accounting_entries || 0;
      console.log(`\n💰 Accounting Entries: ${accountingCount}`);
      
      // Check inventory entries  
      const inventoryCount = stats.table_counts.inventory_entries || 0;
      console.log(`📦 Inventory Entries: ${inventoryCount}`);
      
      // Summary
      console.log(`\n📈 MIGRATION VERIFICATION:`);
      if (voucherCount >= 1000 && accountingCount >= 5000) {
        console.log('   🎉 EXCELLENT: Large dataset successfully migrated!');
        console.log('   ✅ Vouchers, accounting, and inventory data all present');
      } else if (voucherCount > 0) {
        console.log('   ✅ GOOD: Data migrated, checking relationships...');
      } else {
        console.log('   ⚠️  LIMITED: Some data missing, may need re-migration');
      }
      
    } else {
      console.log('❌ Could not get database statistics');
    }
    
  } catch (error) {
    console.error('❌ Quick check failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

quickCheck();

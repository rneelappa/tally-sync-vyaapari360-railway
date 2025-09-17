#!/usr/bin/env node

/**
 * Quick Database Check
 * Tests the specific voucher data from the Tally screenshot
 */

const axios = require('axios');

const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function quickDatabaseCheck() {
  console.log('📊 Quick Database Status Check');
  console.log('==============================\n');
  
  try {
    // 1. Overall statistics
    console.log('1️⃣ Overall Database Statistics...');
    const statsResponse = await axios.get(`${API_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
    
    if (statsResponse.data.success) {
      const stats = statsResponse.data.data;
      console.log(`📈 Total Records: ${stats.total_records}`);
      
      Object.entries(stats.table_counts).forEach(([table, count]) => {
        const status = count > 0 ? '✅' : '⚪';
        console.log(`   ${status} ${table}: ${count} records`);
      });
      
      console.log(`\n🎯 Key Metrics:`);
      console.log(`   💰 Ledgers: ${stats.table_counts.ledgers || 0} (expected ~635)`);
      console.log(`   💼 Vouchers: ${stats.table_counts.vouchers || 0} (expected ~1711)`);
      console.log(`   📦 Stock Items: ${stats.table_counts.stock_items || 0} (expected ~2546)`);
    }
    
    console.log('\n2️⃣ Testing Specific Voucher (SALES 2800237/25-26)...');
    
    // 2. Check for MABEL ENGINEERS vouchers
    const voucherQuery = {
      sql: `SELECT voucher_number, voucher_type, date, party_ledger_name, amount 
            FROM vouchers 
            WHERE company_id = ? AND division_id = ? 
              AND (voucher_number LIKE '%2800237%' OR party_ledger_name LIKE '%MABEL%')
            ORDER BY date DESC 
            LIMIT 5`,
      params: [COMPANY_ID, DIVISION_ID]
    };
    
    const voucherResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, voucherQuery);
    
    if (voucherResponse.data.success && voucherResponse.data.data.results.length > 0) {
      console.log('✅ MABEL ENGINEERS vouchers found:');
      voucherResponse.data.data.results.forEach(voucher => {
        console.log(`   • ${voucher.voucher_number} (${voucher.voucher_type}): ${voucher.party_ledger_name} - ₹${voucher.amount}`);
      });
    } else {
      console.log('⚠️  No MABEL ENGINEERS vouchers found');
    }
    
    console.log('\n3️⃣ Testing JINDAL-A Stock Items...');
    
    // 3. Check for JINDAL-A stock items
    const stockQuery = {
      sql: `SELECT name, description, base_units, opening_balance, closing_balance
            FROM stock_items 
            WHERE company_id = ? AND division_id = ? 
              AND UPPER(name) LIKE '%JINDAL%'
            LIMIT 5`,
      params: [COMPANY_ID, DIVISION_ID]
    };
    
    const stockResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, stockQuery);
    
    if (stockResponse.data.success && stockResponse.data.data.results.length > 0) {
      console.log('✅ JINDAL stock items found:');
      stockResponse.data.data.results.forEach(item => {
        console.log(`   • ${item.name}`);
        console.log(`     Units: ${item.base_units}, Balance: ${item.closing_balance}`);
      });
    } else {
      console.log('⚠️  No JINDAL stock items found');
    }
    
    console.log('\n4️⃣ Testing GST Ledgers...');
    
    // 4. Check for GST ledgers (INPUT CGST, INPUT SGST)
    const gstQuery = {
      sql: `SELECT name, parent, tax_rate, gstn
            FROM ledgers 
            WHERE company_id = ? AND division_id = ? 
              AND (UPPER(name) LIKE '%CGST%' OR UPPER(name) LIKE '%SGST%' OR UPPER(name) LIKE '%GST%')
            ORDER BY name
            LIMIT 10`,
      params: [COMPANY_ID, DIVISION_ID]
    };
    
    const gstResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, gstQuery);
    
    if (gstResponse.data.success && gstResponse.data.data.results.length > 0) {
      console.log('✅ GST ledgers found:');
      gstResponse.data.data.results.forEach(ledger => {
        console.log(`   • ${ledger.name} (Rate: ${ledger.tax_rate}%)`);
      });
    } else {
      console.log('⚠️  No GST ledgers found');
    }
    
    console.log('\n📊 SUMMARY:');
    const totalRecords = statsResponse.data?.data?.total_records || 0;
    
    if (totalRecords > 10000) {
      console.log('🎉 EXCELLENT: Full dataset available in Railway SQLite!');
      console.log('✅ Voucher data like SALES 2800237/25-26 should be completely captured');
      console.log('✅ All relationships (party, inventory, GST) should be maintained');
    } else if (totalRecords > 1000) {
      console.log('✅ GOOD: Significant data available, checking specific voucher...');
    } else {
      console.log('⚠️  LIMITED: May need to run full migration or wait for continuous sync');
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

quickDatabaseCheck();

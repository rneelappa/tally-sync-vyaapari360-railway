const axios = require('axios');

const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function quickStats() {
  console.log('📊 Quick Database Statistics');
  console.log('============================\n');
  
  try {
    const response = await axios.get(`${API_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
    
    if (response.data.success) {
      const stats = response.data.data;
      
      console.log(`🏢 Company: SKM IMPEX-CHENNAI-(24-25)`);
      console.log(`🆔 Company ID: ${COMPANY_ID}`);
      console.log(`🏭 Division ID: ${DIVISION_ID}`);
      console.log(`📈 Total Records: ${stats.total_records}`);
      console.log(`⏰ Timestamp: ${stats.timestamp}\n`);
      
      console.log('📋 Table Breakdown:');
      Object.entries(stats.table_counts).forEach(([table, count]) => {
        const status = count > 0 ? '✅' : '⚪';
        console.log(`   ${status} ${table}: ${count} records`);
      });
      
      // Analysis
      console.log('\n🎯 Analysis:');
      const ledgers = stats.table_counts.ledgers || 0;
      const vouchers = stats.table_counts.vouchers || 0;
      const stockItems = stats.table_counts.stock_items || 0;
      
      console.log(`   💰 Ledgers: ${ledgers} (expected ~635)`);
      console.log(`   💼 Vouchers: ${vouchers} (expected ~1711)`);
      console.log(`   📦 Stock Items: ${stockItems} (expected ~2546)`);
      
      if (stats.total_records > 10000) {
        console.log('\n🎉 EXCELLENT: Full dataset available!');
      } else if (stats.total_records > 1000) {
        console.log('\n✅ GOOD: Significant data available');
      } else if (stats.total_records > 0) {
        console.log('\n⚠️  PARTIAL: Some data available, may still be syncing');
      } else {
        console.log('\n❌ EMPTY: No data in database');
      }
      
    } else {
      console.log('❌ Failed to get statistics:', response.data.error);
    }
    
  } catch (error) {
    console.error('❌ Statistics check failed:', error.message);
  }
}

quickStats();

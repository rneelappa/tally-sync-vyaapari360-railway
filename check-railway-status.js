const axios = require('axios');

const RAILWAY_API = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

async function checkRailwayStatus() {
  console.log('🔍 Checking Railway Database Status...\n');
  
  try {
    // Check health
    const health = await axios.get(`${RAILWAY_API}/api/v1/health`);
    console.log('✅ Railway Health:', health.data.message);
    
    // Check stats
    const stats = await axios.get(`${RAILWAY_API}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
    console.log('\n📊 Database Statistics:');
    console.log(`Total Records: ${stats.data.data.total_records}`);
    
    Object.entries(stats.data.data.table_counts).forEach(([table, count]) => {
      console.log(`   • ${table}: ${count} records`);
    });
    
    if (stats.data.data.total_records === 0) {
      console.log('\n🚨 CONFIRMED: Railway database is EMPTY');
      console.log('🔧 Need to run full migration to populate database');
    } else {
      console.log('\n✅ Database has data - continuous sync is working');
    }
    
  } catch (error) {
    console.error('❌ Railway check failed:', error.message);
  }
}

checkRailwayStatus();

console.log('🔍 Simple Railway Verification');
console.log('Current directory:', process.cwd());

const axios = require('axios');

const RAILWAY_API = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

axios.get(`${RAILWAY_API}/api/v1/health`)
  .then(response => {
    console.log('✅ Railway connected');
    console.log('Message:', response.data.message);
    
    return axios.get(`${RAILWAY_API}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
  })
  .then(response => {
    console.log('\n📊 Database Status:');
    console.log('Total Records:', response.data.data.total_records);
    
    if (response.data.data.total_records === 0) {
      console.log('🚨 CONFIRMED: Database is EMPTY');
      console.log('🔧 Railway redeployment cleared the database');
      console.log('💡 Solution: Run full migration to repopulate');
    } else {
      console.log('✅ Database has data');
    }
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
  });

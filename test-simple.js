console.log('🧪 Simple Test Starting...');
console.log('Current directory:', process.cwd());
console.log('Node version:', process.version);

// Test if config file exists
const fs = require('fs');
if (fs.existsSync('./windows-client-config.json')) {
  const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
  console.log('✅ Configuration loaded');
  console.log('🏢 Company ID:', config.company.id);
  console.log('🏭 Division ID:', config.company.division_id);
} else {
  console.log('❌ Configuration file not found');
}

console.log('🎉 Basic test completed!');

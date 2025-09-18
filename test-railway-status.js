#!/usr/bin/env node

/**
 * Test Railway deployment status
 */

const https = require('https');

const RAILWAY_URL = 'https://tally-sync-vyaapari360-production.up.railway.app';

function testRailwayStatus() {
  console.log('🔍 Testing Railway deployment status...\n');
  
  const options = {
    hostname: 'tally-sync-vyaapari360-production.up.railway.app',
    port: 443,
    path: '/api/v1/health',
    method: 'GET',
    timeout: 10000
  };
  
  const req = https.request(options, (res) => {
    console.log(`✅ Railway is responding!`);
    console.log(`📊 Status Code: ${res.statusCode}`);
    console.log(`📋 Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`📄 Response Body:`, data);
    });
  });
  
  req.on('error', (error) => {
    console.log(`❌ Railway is NOT responding:`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Code: ${error.code}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log(`   🚨 Container is not running or crashed`);
    } else if (error.code === 'ENOTFOUND') {
      console.log(`   🚨 Domain not found - deployment issue`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`   🚨 Connection timeout - container hanging`);
    }
  });
  
  req.on('timeout', () => {
    console.log(`⏰ Request timed out after 10 seconds`);
    req.destroy();
  });
  
  req.setTimeout(10000);
  req.end();
}

testRailwayStatus();

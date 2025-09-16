#!/usr/bin/env node

/**
 * Database Schema Diagnostic
 * Identifies database schema issues causing data loss
 */

const fs = require('fs');
const axios = require('axios');
const yaml = require('js-yaml');

const config = JSON.parse(fs.readFileSync('./windows-client-config.json', 'utf8'));
const tallyExportConfig = yaml.load(fs.readFileSync('./tally-export-config.yaml', 'utf8'));

console.log('🔍 DATABASE SCHEMA DIAGNOSTIC');
console.log('==============================\n');

async function diagnoseDatabaseSchema() {
  try {
    // Step 1: Check table structure in Railway
    await checkTableStructure();
    
    // Step 2: Test with sample data to identify constraint issues
    await testDataConstraints();
    
    // Step 3: Check field mapping issues
    await checkFieldMappings();
    
    // Step 4: Identify the specific problem
    await identifySpecificProblem();
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
  }
}

async function checkTableStructure() {
  console.log('🗄️ CHECKING TABLE STRUCTURE');
  console.log('============================');
  
  try {
    // Get table list
    const tablesResponse = await axios.get(`${config.railway.api_base}/api/v1/tables`);
    console.log('✅ Railway tables available:');
    tablesResponse.data.data.tables.forEach(table => {
      console.log(`   • ${table}`);
    });
    
    // Test table structure with PRAGMA
    const schemaQuery = {
      sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name='ledgers'",
      params: []
    };
    
    const schemaResponse = await axios.post(
      `${config.railway.api_base}/api/v1/query/${config.company.id}/${config.company.division_id}`,
      schemaQuery
    );
    
    if (schemaResponse.data.success && schemaResponse.data.data.results.length > 0) {
      console.log('\n📋 Ledgers table schema:');
      console.log(schemaResponse.data.data.results[0].sql);
    }
    
  } catch (error) {
    console.log('❌ Could not check table structure:', error.message);
  }
  
  console.log();
}

async function testDataConstraints() {
  console.log('🔧 TESTING DATA CONSTRAINTS');
  console.log('============================');
  
  try {
    // Test with a simple ledger record
    const testLedger = {
      guid: 'test-constraint-001',
      name: 'Test Constraint Ledger',
      parent: 'Test Group',
      alias: '',
      description: '',
      notes: '',
      is_revenue: false,
      is_deemedpositive: true,
      opening_balance: 0,
      closing_balance: 0,
      company_id: config.company.id,
      division_id: config.company.division_id,
      sync_timestamp: new Date().toISOString(),
      source: 'constraint-test'
    };
    
    console.log('📊 Testing single ledger insertion...');
    
    const payload = {
      table: 'ledgers',
      data: [testLedger],
      sync_type: 'test',
      metadata: { source: 'constraint-test' }
    };
    
    const response = await axios.post(
      `${config.railway.api_base}/api/v1/bulk-sync/${config.company.id}/${config.company.division_id}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log('✅ Single ledger test result:', response.data);
    
    // Now test with problematic data (long text, special characters)
    const problematicLedger = {
      guid: 'test-constraint-002',
      name: 'Test Ledger with Very Long Name That Might Exceed Column Limits and Contains Special Characters like & < > " \' and unicode ñ é',
      parent: 'Group with Special Characters & Symbols',
      alias: 'Alias with "quotes" and \'apostrophes\'',
      description: 'Description with <XML> tags and & symbols',
      notes: 'Notes with \r\n line breaks and \t tabs',
      is_revenue: null, // Test null values
      is_deemedpositive: undefined, // Test undefined values
      opening_balance: 'invalid_number', // Test invalid number
      closing_balance: '', // Test empty string
      mailing_address: 'Very long address that might exceed database column limits and contains special characters like newlines \r\n and tabs \t and unicode characters ñ é ü ö',
      company_id: config.company.id,
      division_id: config.company.division_id,
      sync_timestamp: new Date().toISOString(),
      source: 'constraint-test-problematic'
    };
    
    console.log('\n📊 Testing problematic data insertion...');
    
    const problematicPayload = {
      table: 'ledgers',
      data: [problematicLedger],
      sync_type: 'test',
      metadata: { source: 'constraint-test-problematic' }
    };
    
    try {
      const problematicResponse = await axios.post(
        `${config.railway.api_base}/api/v1/bulk-sync/${config.company.id}/${config.company.division_id}`,
        problematicPayload,
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      console.log('✅ Problematic data test result:', problematicResponse.data);
    } catch (error) {
      console.log('❌ Problematic data test failed:', error.response?.data || error.message);
      console.log('🎯 This might be the root cause of data loss!');
    }
    
  } catch (error) {
    console.log('❌ Constraint testing failed:', error.message);
  }
  
  console.log();
}

async function checkFieldMappings() {
  console.log('🗂️ CHECKING FIELD MAPPINGS');
  console.log('===========================');
  
  // Get ledger table config from YAML
  const ledgerConfig = tallyExportConfig.master.find(t => t.name === 'mst_ledger');
  
  if (ledgerConfig) {
    console.log('📋 Ledger fields in YAML config:');
    ledgerConfig.fields.forEach((field, index) => {
      console.log(`   ${index + 1}. ${field.name} (${field.type}) → $${field.field}`);
    });
    
    console.log('\n🔧 Potential issues:');
    ledgerConfig.fields.forEach(field => {
      if (field.name.length > 30) {
        console.log(`   ⚠️  Long field name: ${field.name}`);
      }
      if (field.field.includes('$$') || field.field.includes('if ')) {
        console.log(`   ⚠️  Complex field expression: ${field.name} → ${field.field}`);
      }
    });
  }
  
  console.log();
}

async function identifySpecificProblem() {
  console.log('🎯 IDENTIFYING SPECIFIC PROBLEM');
  console.log('================================');
  
  console.log('Based on the symptoms:');
  console.log('✅ Tally extraction: Working (26,204 records extracted)');
  console.log('✅ Railway connection: Working (some data gets through)');
  console.log('❌ Data storage: Failing (only 12/635 ledgers stored)');
  console.log();
  
  console.log('🔧 Most likely causes:');
  console.log('1. 📊 SQLite column constraints (text length limits)');
  console.log('2. 🔑 Primary key conflicts (duplicate GUIDs)');
  console.log('3. 📝 Data type mismatches (text vs number)');
  console.log('4. 🚫 Foreign key constraints failing');
  console.log('5. ⏱️  Transaction timeouts during large batch inserts');
  console.log();
  
  console.log('🎯 RECOMMENDED SOLUTION:');
  console.log('1. Fix SQLite schema to handle all Tally data types');
  console.log('2. Increase column sizes for text fields');
  console.log('3. Add proper NULL handling');
  console.log('4. Use smaller batch sizes (10-25 records)');
  console.log('5. Add transaction error logging');
  console.log();
  
  console.log('📋 NEXT STEPS:');
  console.log('1. Update Railway SQLite schema');
  console.log('2. Redeploy Railway server');
  console.log('3. Re-run migration with fixed schema');
  console.log('4. Verify full dataset (635 ledgers, 2546 stock items)');
}

// Run diagnostic
diagnoseDatabaseSchema();

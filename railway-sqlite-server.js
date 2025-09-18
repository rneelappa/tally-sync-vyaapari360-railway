const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/xml', limit: '10mb' }));

// Database configuration
const DB_PATH = process.env.DB_PATH || '/data/tally.db';
console.log(`🗄️ Using database: ${DB_PATH}`);

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database schema
function initializeDatabase() {
  console.log('🔧 Initializing database schema...');
  
  // Create tables with proper schema including notes column
  const createTables = `
    -- Master data tables
    CREATE TABLE IF NOT EXISTS mst_group (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent TEXT NOT NULL DEFAULT '',
      primary_group TEXT NOT NULL DEFAULT '',
      is_revenue INTEGER DEFAULT 0,
      is_deemedpositive INTEGER DEFAULT 0,
      is_reserved INTEGER DEFAULT 0,
      affects_gross_profit INTEGER DEFAULT 0,
      sort_position INTEGER,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    CREATE TABLE IF NOT EXISTS mst_ledger (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent TEXT NOT NULL DEFAULT '',
      alias TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_revenue INTEGER DEFAULT 0,
      is_deemedpositive INTEGER DEFAULT 0,
      opening_balance REAL DEFAULT 0,
      closing_balance REAL DEFAULT 0,
      mailing_name TEXT NOT NULL DEFAULT '',
      mailing_address TEXT NOT NULL DEFAULT '',
      mailing_state TEXT NOT NULL DEFAULT '',
      mailing_country TEXT NOT NULL DEFAULT '',
      mailing_pincode TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      it_pan TEXT NOT NULL DEFAULT '',
      gstn TEXT NOT NULL DEFAULT '',
      gst_registration_type TEXT NOT NULL DEFAULT '',
      gst_supply_type TEXT NOT NULL DEFAULT '',
      gst_duty_head TEXT NOT NULL DEFAULT '',
      tax_rate REAL DEFAULT 0,
      bank_account_holder TEXT NOT NULL DEFAULT '',
      bank_account_number TEXT NOT NULL DEFAULT '',
      bank_ifsc TEXT NOT NULL DEFAULT '',
      bank_swift TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      bank_branch TEXT NOT NULL DEFAULT '',
      bill_credit_period INTEGER DEFAULT 0,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    CREATE TABLE IF NOT EXISTS mst_stock_group (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent TEXT NOT NULL DEFAULT '',
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    CREATE TABLE IF NOT EXISTS mst_stock_item (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent TEXT NOT NULL DEFAULT '',
      alias TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      part_number TEXT NOT NULL DEFAULT '',
      uom TEXT NOT NULL DEFAULT '',
      alternate_uom TEXT NOT NULL DEFAULT '',
      conversion INTEGER DEFAULT 0,
      opening_balance REAL DEFAULT 0,
      opening_rate REAL DEFAULT 0,
      opening_value REAL DEFAULT 0,
      closing_balance REAL DEFAULT 0,
      closing_rate REAL DEFAULT 0,
      closing_value REAL DEFAULT 0,
      costing_method TEXT NOT NULL DEFAULT '',
      gst_type_of_supply TEXT DEFAULT '',
      gst_hsn_code TEXT DEFAULT '',
      gst_hsn_description TEXT DEFAULT '',
      gst_rate REAL DEFAULT 0,
      gst_taxability TEXT DEFAULT '',
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    CREATE TABLE IF NOT EXISTS mst_vouchertype (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent TEXT NOT NULL DEFAULT '',
      numbering_method TEXT NOT NULL DEFAULT '',
      is_deemedpositive INTEGER DEFAULT 0,
      affects_stock INTEGER DEFAULT 0,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    CREATE TABLE IF NOT EXISTS mst_uom (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      formalname TEXT NOT NULL DEFAULT '',
      is_simple_unit INTEGER DEFAULT 1,
      base_units TEXT NOT NULL DEFAULT '',
      additional_units TEXT NOT NULL DEFAULT '',
      conversion INTEGER DEFAULT 0,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    CREATE TABLE IF NOT EXISTS mst_godown (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    -- Transaction data tables
    CREATE TABLE IF NOT EXISTS trn_voucher (
      guid TEXT PRIMARY KEY,
      voucher_number TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      date TEXT NOT NULL,
      reference TEXT,
      reference_date TEXT,
      narration TEXT,
      party_ledger_name TEXT,
      place_of_supply TEXT,
      amount REAL DEFAULT 0,
      is_cancelled INTEGER DEFAULT 0,
      is_optional INTEGER DEFAULT 0,
      is_invoice INTEGER DEFAULT 0,
      is_accounting INTEGER DEFAULT 1,
      is_inventory INTEGER DEFAULT 0,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally'
    );

    CREATE TABLE IF NOT EXISTS trn_accounting (
      guid TEXT PRIMARY KEY,
      voucher_guid TEXT NOT NULL,
      voucher_number TEXT,
      voucher_type TEXT,
      voucher_date TEXT,
      ledger_name TEXT NOT NULL,
      ledger_guid TEXT,
      amount REAL DEFAULT 0,
      is_party_ledger INTEGER DEFAULT 0,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally',
      FOREIGN KEY (voucher_guid) REFERENCES trn_voucher(guid)
    );

    CREATE TABLE IF NOT EXISTS trn_inventory (
      guid TEXT PRIMARY KEY,
      voucher_guid TEXT NOT NULL,
      voucher_number TEXT,
      voucher_type TEXT,
      voucher_date TEXT,
      stock_item_name TEXT NOT NULL,
      stock_item_guid TEXT,
      quantity REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      godown TEXT,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'tally',
      FOREIGN KEY (voucher_guid) REFERENCES trn_voucher(guid)
    );

    -- Sync metadata table
    CREATE TABLE IF NOT EXISTS sync_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      division_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      last_sync TEXT DEFAULT CURRENT_TIMESTAMP,
      sync_type TEXT DEFAULT 'full',
      records_processed INTEGER DEFAULT 0,
      records_failed INTEGER DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, division_id, table_name)
    );
  `;

  db.exec(createTables, (err) => {
    if (err) {
      console.error('❌ Error creating tables:', err.message);
    } else {
      console.log('✅ Database schema initialized successfully');
      createIndexes();
    }
  });
}

// Create indexes for better performance
function createIndexes() {
  console.log('🔧 Creating database indexes...');
  
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_mst_group_company_division ON mst_group(company_id, division_id)',
    'CREATE INDEX IF NOT EXISTS idx_mst_ledger_company_division ON mst_ledger(company_id, division_id)',
    'CREATE INDEX IF NOT EXISTS idx_mst_stock_item_company_division ON mst_stock_item(company_id, division_id)',
    'CREATE INDEX IF NOT EXISTS idx_trn_voucher_company_division ON trn_voucher(company_id, division_id)',
    'CREATE INDEX IF NOT EXISTS idx_trn_voucher_date ON trn_voucher(date)',
    'CREATE INDEX IF NOT EXISTS idx_trn_voucher_guid ON trn_voucher(guid)',
    'CREATE INDEX IF NOT EXISTS idx_trn_voucher_number ON trn_voucher(voucher_number)',
    'CREATE INDEX IF NOT EXISTS idx_trn_accounting_voucher_guid ON trn_accounting(voucher_guid)',
    'CREATE INDEX IF NOT EXISTS idx_trn_inventory_voucher_guid ON trn_inventory(voucher_guid)',
    'CREATE INDEX IF NOT EXISTS idx_sync_metadata_company_division ON sync_metadata(company_id, division_id)'
  ];

  let completed = 0;
  indexes.forEach((indexSQL, i) => {
    db.exec(indexSQL, (err) => {
      if (err) {
        console.error(`❌ Error creating index ${i + 1}:`, err.message);
      }
      completed++;
      if (completed === indexes.length) {
        console.log('✅ Database indexes created successfully');
      }
    });
  });
}

// Helper function to run SQL queries
function runSQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper function to get single row
function getSQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to get all rows
function getAllSQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'Railway SQLite service is running',
    timestamp: new Date().toISOString(),
    database: DB_PATH
  });
});

// Metadata endpoint
app.get('/api/v1/metadata/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    const tables = {};
    const tableNames = [
      'mst_group', 'mst_ledger', 'mst_stock_group', 'mst_stock_item', 
      'mst_vouchertype', 'mst_uom', 'mst_godown',
      'trn_voucher', 'trn_accounting', 'trn_inventory'
    ];
    
    for (const tableName of tableNames) {
      try {
        const count = await getSQL(`SELECT COUNT(*) as count FROM ${tableName} WHERE company_id = ? AND division_id = ?`, [companyId, divisionId]);
        tables[tableName] = count ? count.count : 0;
      } catch (err) {
        tables[tableName] = 0;
      }
    }
    
    res.json({
      success: true,
      data: {
        company_id: companyId,
        division_id: divisionId,
        tables: tables,
        last_updated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Metadata error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk sync endpoint
app.post('/api/v1/bulk-sync/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    const { table, data, sync_type, metadata } = req.body;
    
    if (!table || !data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: table and data array are required'
      });
    }
    
    console.log(`📊 Processing ${data.length} records for table: ${table}`);
    
    // Map table names
    const tableMapping = {
      'groups': 'mst_group',
      'ledgers': 'mst_ledger',
      'stock_items': 'mst_stock_item',
      'stock_groups': 'mst_stock_group',
      'voucher_types': 'mst_vouchertype',
      'units': 'mst_uom',
      'godowns': 'mst_godown',
      'vouchers': 'trn_voucher',
      'accounting_entries': 'trn_accounting',
      'inventory_entries': 'trn_inventory'
    };
    
    const targetTable = tableMapping[table];
    if (!targetTable) {
      return res.status(400).json({
        success: false,
        error: `Unknown table: ${table}`
      });
    }
    
    // Process data in batches
    const batchSize = 100;
    let totalProcessed = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      try {
        // Use INSERT OR REPLACE for upsert functionality
        const placeholders = batch.map(() => `(${Object.keys(batch[0]).map(() => '?').join(', ')})`).join(', ');
        const columns = Object.keys(batch[0]).join(', ');
        const values = batch.flatMap(record => Object.values(record));
        
        const sql = `INSERT OR REPLACE INTO ${targetTable} (${columns}) VALUES ${placeholders}`;
        await runSQL(sql, values);
        
        totalProcessed += batch.length;
        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${batch.length} records processed`);
        
      } catch (batchError) {
        console.error(`❌ Batch processing error:`, batchError);
        totalErrors += batch.length;
      }
    }
    
    // Update sync metadata
    await runSQL(`
      INSERT OR REPLACE INTO sync_metadata 
      (company_id, division_id, table_name, last_sync, sync_type, records_processed, records_failed, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      companyId, 
      divisionId, 
      table, 
      new Date().toISOString(), 
      sync_type || 'full', 
      totalProcessed, 
      totalErrors, 
      JSON.stringify(metadata || {})
    ]);
    
    console.log(`✅ Bulk sync completed: ${totalProcessed} processed, ${totalErrors} errors`);
    
    res.json({
      success: true,
      message: `Bulk sync completed for ${table}`,
      data: {
        table: table,
        total_records: data.length,
        processed: totalProcessed,
        failed: totalErrors,
        sync_type: sync_type || 'full',
        company_id: companyId,
        division_id: divisionId,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Bulk sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during bulk sync',
      details: error.message
    });
  }
});

// Query endpoint
app.post('/api/v1/query', async (req, res) => {
  try {
    const { sql, params = [] } = req.body;
    
    if (!sql) {
      return res.status(400).json({
        success: false,
        error: 'SQL query is required'
      });
    }
    
    const result = await getAllSQL(sql, params);
    
    res.json({
      success: true,
      data: result,
      count: result.length
    });
    
  } catch (error) {
    console.error('❌ Query error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute SQL endpoint
app.post('/api/v1/execute-sql', async (req, res) => {
  try {
    const { sql, params = [] } = req.body;
    
    if (!sql) {
      return res.status(400).json({
        success: false,
        error: 'SQL query is required'
      });
    }
    
    const result = await runSQL(sql, params);
    
    res.json({
      success: true,
      message: 'SQL executed successfully',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Execute SQL error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Railway SQLite server running on port ${PORT}`);
  console.log(`📊 Database: ${DB_PATH}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/v1/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed');
    }
    process.exit(0);
  });
});

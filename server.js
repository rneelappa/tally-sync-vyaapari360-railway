const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Railway SQLite Server Starting...');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// SQLite Database Setup
const DB_PATH = process.env.NODE_ENV === 'production' ? '/app/data/tally.db' : './tally.db';

// Ensure data directory exists in production
if (process.env.NODE_ENV === 'production') {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to SQLite database:', DB_PATH);
  }
});

// Enable foreign keys and WAL mode for better performance
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');

// Database Schema with UUID company_id and division_id
const createTablesSQL = `
  -- Sync metadata table
  CREATE TABLE IF NOT EXISTS sync_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    table_name TEXT NOT NULL,
    last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_type TEXT DEFAULT 'full',
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    metadata TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, division_id, table_name)
  );

  -- Groups table (master data)
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    primary_group TEXT,
    is_revenue BOOLEAN DEFAULT 0,
    is_deemedpositive BOOLEAN DEFAULT 0,
    is_reserved BOOLEAN DEFAULT 0,
    affects_gross_profit BOOLEAN DEFAULT 0,
    sort_position INTEGER,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Ledgers table (master data)
  CREATE TABLE IF NOT EXISTS ledgers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    alias TEXT,
    description TEXT,
    notes TEXT,
    is_revenue BOOLEAN DEFAULT 0,
    is_deemedpositive BOOLEAN DEFAULT 0,
    opening_balance DECIMAL(17,2) DEFAULT 0,
    closing_balance DECIMAL(17,2) DEFAULT 0,
    mailing_name TEXT,
    mailing_address TEXT,
    mailing_state TEXT,
    mailing_country TEXT,
    mailing_pincode TEXT,
    email TEXT,
    it_pan TEXT,
    gstn TEXT,
    gst_registration_type TEXT,
    gst_supply_type TEXT,
    gst_duty_head TEXT,
    tax_rate DECIMAL(9,4) DEFAULT 0,
    bank_account_holder TEXT,
    bank_account_number TEXT,
    bank_ifsc TEXT,
    bank_swift TEXT,
    bank_name TEXT,
    bank_branch TEXT,
    bill_credit_period INTEGER DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Stock Items table (master data)
  CREATE TABLE IF NOT EXISTS stock_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    alias TEXT,
    part_number TEXT,
    description TEXT,
    base_units TEXT,
    additional_units TEXT,
    gst_type_of_supply TEXT,
    gst_hsn_code TEXT,
    gst_hsn_description TEXT,
    gst_taxability TEXT,
    opening_balance DECIMAL(17,6) DEFAULT 0,
    opening_rate DECIMAL(17,6) DEFAULT 0,
    opening_value DECIMAL(17,2) DEFAULT 0,
    closing_balance DECIMAL(17,6) DEFAULT 0,
    closing_rate DECIMAL(17,6) DEFAULT 0,
    closing_value DECIMAL(17,2) DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Voucher Types table (master data)
  CREATE TABLE IF NOT EXISTS voucher_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    numbering_method TEXT,
    is_deemedpositive BOOLEAN DEFAULT 0,
    affects_stock BOOLEAN DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Units table (master data)
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    formal_name TEXT,
    is_simple_unit BOOLEAN DEFAULT 1,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Godowns table (master data)
  CREATE TABLE IF NOT EXISTS godowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    address TEXT,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Cost Centres table (master data)
  CREATE TABLE IF NOT EXISTS cost_centres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Vouchers table (transaction data)
  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    voucher_number TEXT NOT NULL,
    voucher_type TEXT NOT NULL,
    date DATE NOT NULL,
    reference TEXT,
    reference_date DATE,
    narration TEXT,
    party_ledger_name TEXT,
    place_of_supply TEXT,
    amount DECIMAL(17,2) DEFAULT 0,
    is_cancelled BOOLEAN DEFAULT 0,
    is_optional BOOLEAN DEFAULT 0,
    is_invoice BOOLEAN DEFAULT 0,
    is_accounting BOOLEAN DEFAULT 1,
    is_inventory BOOLEAN DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Accounting Entries table (transaction data)
  CREATE TABLE IF NOT EXISTS accounting_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    voucher_guid TEXT,
    ledger_name TEXT NOT NULL,
    ledger_guid TEXT,
    amount DECIMAL(17,2) DEFAULT 0,
    is_party_ledger BOOLEAN DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Inventory Entries table (transaction data)
  CREATE TABLE IF NOT EXISTS inventory_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    voucher_guid TEXT,
    stock_item_name TEXT NOT NULL,
    stock_item_guid TEXT,
    quantity DECIMAL(17,6) DEFAULT 0,
    rate DECIMAL(17,6) DEFAULT 0,
    amount DECIMAL(17,2) DEFAULT 0,
    godown TEXT,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_groups_company_division ON groups(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_ledgers_company_division ON ledgers(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_stock_items_company_division ON stock_items(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_vouchers_company_division ON vouchers(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
  CREATE INDEX IF NOT EXISTS idx_sync_metadata_company_division ON sync_metadata(company_id, division_id);
`;

// Initialize database tables
db.exec(createTablesSQL, (err) => {
  if (err) {
    console.error('❌ Error creating tables:', err.message);
  } else {
    console.log('✅ Database tables initialized');
  }
});

// Helper function to run SQL with promises
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

// Helper function to get data with promises
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

// Helper function to get all data with promises
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

// Health endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'Railway SQLite Server is running',
    data: {
      service: 'Railway SQLite Database',
      timestamp: new Date().toISOString(),
      database: 'SQLite',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// Bulk sync endpoint for batch data operations
app.post('/api/v1/bulk-sync/:companyId/:divisionId', async (req, res) => {
  console.log(`🔄 Bulk sync request for ${req.params.companyId}/${req.params.divisionId}`);
  
  try {
    const { table, data, sync_type, batch_info, metadata } = req.body;
    
    if (!table || !data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: table and data array are required'
      });
    }
    
    console.log(`📊 Processing ${data.length} records for table: ${table}`);
    console.log(`🔧 Sync type: ${sync_type || 'full'}`);
    
    // Validate UUIDs
    const companyId = req.params.companyId;
    const divisionId = req.params.divisionId;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({
        success: false,
        error: 'company_id and division_id must be valid UUIDs'
      });
    }
    
    // Add UUID company_id and division_id to each record
    const enrichedData = data.map(record => ({
      ...record,
      company_id: companyId,
      division_id: divisionId,
      sync_timestamp: new Date().toISOString(),
      source: 'tally'
    }));
    
    // Process data in batches
    const batchSize = 100;
    const results = [];
    let totalProcessed = 0;
    let totalErrors = 0;
    
    await runSQL('BEGIN TRANSACTION');
    
    try {
      for (let i = 0; i < enrichedData.length; i += batchSize) {
        const batch = enrichedData.slice(i, i + batchSize);
        
        try {
          for (const record of batch) {
            const columns = Object.keys(record);
            const placeholders = columns.map(() => '?').join(', ');
            const values = columns.map(col => record[col]);
            
            // SQLite UPSERT
            const sql = `
              INSERT INTO ${table} (${columns.join(', ')})
              VALUES (${placeholders})
              ON CONFLICT(guid) DO UPDATE SET
              ${columns.filter(col => col !== 'guid').map(col => `${col} = excluded.${col}`).join(', ')},
              updated_at = CURRENT_TIMESTAMP
            `;
            
            await runSQL(sql, values);
            totalProcessed++;
          }
          
          console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${batch.length} records processed`);
          
          results.push({
            batch: Math.floor(i/batchSize) + 1,
            records: batch.length,
            success: true
          });
          
        } catch (batchError) {
          console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} error:`, batchError.message);
          totalErrors += batch.length;
          results.push({
            batch: Math.floor(i/batchSize) + 1,
            records: batch.length,
            success: false,
            error: batchError.message
          });
        }
      }
      
      // Update sync metadata
      const syncMetadata = {
        company_id: companyId,
        division_id: divisionId,
        table_name: table,
        last_sync: new Date().toISOString(),
        sync_type: sync_type || 'full',
        records_processed: totalProcessed,
        records_failed: totalErrors,
        metadata: JSON.stringify(metadata || {})
      };
      
      const metadataSQL = `
        INSERT INTO sync_metadata (
          company_id, division_id, table_name, last_sync, sync_type,
          records_processed, records_failed, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, division_id, table_name) DO UPDATE SET
          last_sync = excluded.last_sync,
          sync_type = excluded.sync_type,
          records_processed = excluded.records_processed,
          records_failed = excluded.records_failed,
          metadata = excluded.metadata,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await runSQL(metadataSQL, [
        syncMetadata.company_id,
        syncMetadata.division_id,
        syncMetadata.table_name,
        syncMetadata.last_sync,
        syncMetadata.sync_type,
        syncMetadata.records_processed,
        syncMetadata.records_failed,
        syncMetadata.metadata
      ]);
      
      await runSQL('COMMIT');
      
      console.log(`✅ Bulk sync completed: ${totalProcessed} processed, ${totalErrors} errors`);
      
      res.json({
        success: true,
        message: `Bulk sync completed for ${table}`,
        data: {
          table: table,
          total_records: data.length,
          processed: totalProcessed,
          failed: totalErrors,
          batches: results.length,
          sync_type: sync_type || 'full',
          company_id: companyId,
          division_id: divisionId,
          timestamp: new Date().toISOString()
        },
        batch_results: results
      });
      
    } catch (error) {
      await runSQL('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Bulk sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during bulk sync',
      details: error.message
    });
  }
});

// Metadata endpoint for sync tracking
app.get('/api/v1/metadata/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({
        success: false,
        error: 'company_id and division_id must be valid UUIDs'
      });
    }
    
    console.log(`📋 Fetching sync metadata for ${companyId}/${divisionId}`);
    
    const metadata = await getAllSQL(
      'SELECT * FROM sync_metadata WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    // Convert to the format expected by Tally sync
    const response = {
      company_id: companyId,
      division_id: divisionId,
      last_alter_id_master: 0,
      last_alter_id_transaction: 0,
      tables: {}
    };
    
    if (metadata && metadata.length > 0) {
      metadata.forEach(item => {
        response.tables[item.table_name] = {
          last_sync: item.last_sync,
          sync_type: item.sync_type,
          records_processed: item.records_processed,
          records_failed: item.records_failed
        };
        
        // Extract AlterIDs if available
        try {
          const metadataObj = JSON.parse(item.metadata || '{}');
          if (metadataObj.last_alter_id_master) {
            response.last_alter_id_master = Math.max(response.last_alter_id_master, metadataObj.last_alter_id_master);
          }
          if (metadataObj.last_alter_id_transaction) {
            response.last_alter_id_transaction = Math.max(response.last_alter_id_transaction, metadataObj.last_alter_id_transaction);
          }
        } catch (parseError) {
          // Ignore JSON parse errors
        }
      });
    }
    
    res.json({
      success: true,
      data: response
    });
    
  } catch (error) {
    console.error('❌ Metadata endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Sync status endpoint
app.get('/api/v1/sync-status/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({
        success: false,
        error: 'company_id and division_id must be valid UUIDs'
      });
    }
    
    const syncHistory = await getAllSQL(
      'SELECT * FROM sync_metadata WHERE company_id = ? AND division_id = ? ORDER BY last_sync DESC LIMIT 10',
      [companyId, divisionId]
    );
    
    // Calculate summary statistics
    const summary = {
      total_tables: syncHistory?.length || 0,
      last_sync: syncHistory?.[0]?.last_sync || null,
      total_records_processed: syncHistory?.reduce((sum, item) => sum + (item.records_processed || 0), 0) || 0,
      total_records_failed: syncHistory?.reduce((sum, item) => sum + (item.records_failed || 0), 0) || 0,
      sync_health: 'healthy'
    };
    
    // Determine sync health
    if (summary.total_records_failed > summary.total_records_processed * 0.1) {
      summary.sync_health = 'warning';
    }
    if (summary.total_records_failed > summary.total_records_processed * 0.5) {
      summary.sync_health = 'critical';
    }
    
    res.json({
      success: true,
      data: {
        company_id: companyId,
        division_id: divisionId,
        summary,
        recent_syncs: syncHistory || []
      }
    });
    
  } catch (error) {
    console.error('❌ Sync status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Database stats endpoint
app.get('/api/v1/stats/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({
        success: false,
        error: 'company_id and division_id must be valid UUIDs'
      });
    }
    
    const tables = ['groups', 'ledgers', 'stock_items', 'voucher_types', 'units', 'godowns', 'vouchers', 'accounting_entries', 'inventory_entries'];
    const stats = {};
    
    for (const table of tables) {
      try {
        const result = await getSQL(
          `SELECT COUNT(*) as count FROM ${table} WHERE company_id = ? AND division_id = ?`,
          [companyId, divisionId]
        );
        stats[table] = result.count;
      } catch (error) {
        stats[table] = 0;
      }
    }
    
    const totalRecords = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    res.json({
      success: true,
      data: {
        company_id: companyId,
        division_id: divisionId,
        table_counts: stats,
        total_records: totalRecords,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Query endpoint for custom SQL queries
app.post('/api/v1/query/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    const { sql, params } = req.body;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({
        success: false,
        error: 'company_id and division_id must be valid UUIDs'
      });
    }
    
    if (!sql) {
      return res.status(400).json({
        success: false,
        error: 'SQL query is required'
      });
    }
    
    // Security: Only allow SELECT statements
    if (!sql.trim().toLowerCase().startsWith('select')) {
      return res.status(400).json({
        success: false,
        error: 'Only SELECT queries are allowed'
      });
    }
    
    const results = await getAllSQL(sql, params || []);
    
    res.json({
      success: true,
      data: {
        results,
        count: results.length,
        company_id: companyId,
        division_id: divisionId
      }
    });
    
  } catch (error) {
    console.error('❌ Query error:', error);
    res.status(500).json({
      success: false,
      error: 'Query execution failed',
      details: error.message
    });
  }
});

// Tables list endpoint
app.get('/api/v1/tables', async (req, res) => {
  try {
    const tables = await getAllSQL(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    
    res.json({
      success: true,
      data: {
        tables: tables.map(t => t.name),
        count: tables.length
      }
    });
    
  } catch (error) {
    console.error('❌ Tables error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tables',
      details: error.message
    });
  }
});

// UUID validation helper
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Railway SQLite server...');
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed');
    }
    process.exit(0);
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Railway SQLite Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/v1/health`);
  console.log(`📦 Bulk Sync: POST /api/v1/bulk-sync/{companyId}/{divisionId}`);
  console.log(`📋 Metadata: GET /api/v1/metadata/{companyId}/{divisionId}`);
  console.log(`📊 Sync Status: GET /api/v1/sync-status/{companyId}/{divisionId}`);
  console.log(`📈 Stats: GET /api/v1/stats/{companyId}/{divisionId}`);
  console.log(`🔍 Query: POST /api/v1/query/{companyId}/{divisionId}`);
  console.log(`📋 Tables: GET /api/v1/tables`);
  console.log(`\n🗄️ Database: SQLite (${DB_PATH})`);
  console.log(`🆔 UUIDs Required: company_id and division_id must be valid UUIDs`);
  console.log(`✅ Ready for Tally sync from Windows client`);
});

module.exports = app;

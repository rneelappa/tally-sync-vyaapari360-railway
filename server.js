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

// SQLite Database Setup with Persistent Volume
const DB_PATH = process.env.NODE_ENV === 'production' ? '/data/tally.db' : './tally.db';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`📁 Created data directory: ${dataDir}`);
}

// Check if database exists
const dbExists = fs.existsSync(DB_PATH);
console.log(`🗄️ Database status: ${dbExists ? 'EXISTS' : 'NEW'} at ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to SQLite database:', DB_PATH);
    if (dbExists) {
      console.log('🔄 Existing database found - checking data integrity...');
      checkDatabaseIntegrity();
    } else {
      console.log('🆕 New database created - will auto-populate from Tally');
    }
  }
});

// Enable foreign keys and WAL mode for better performance
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');

// CRITICAL: Add busy timeout to prevent hangs
db.configure("busyTimeout", 30000); // 30 second timeout for concurrent access

// Operation lock to prevent concurrent database conflicts
let bulkOperationInProgress = false;
let operationStartTime = null;

// Database integrity check
async function checkDatabaseIntegrity() {
  try {
    const stats = await getAllSQL(
      "SELECT name, COUNT(*) as count FROM sqlite_master WHERE type='table' GROUP BY name"
    );
    
    const tableCount = stats.length;
    console.log(`📊 Found ${tableCount} existing tables`);
    
    if (tableCount >= 10) {
      console.log('✅ Database appears complete - ready for incremental sync');
    } else {
      console.log('⚠️ Database incomplete - may need re-migration');
    }
  } catch (error) {
    console.log('⚠️ Could not check database integrity:', error.message);
  }
}

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

  -- Groups table (master data) - FIXED to match Tally YAML config
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    primary_group TEXT,
    is_revenue INTEGER DEFAULT 0,
    is_deemedpositive INTEGER DEFAULT 0,
    is_reserved INTEGER DEFAULT 0,
    affects_gross_profit INTEGER DEFAULT 0,
    sort_position INTEGER DEFAULT 0,
    alterid INTEGER DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Ledgers table (master data) - FIXED SCHEMA
  CREATE TABLE IF NOT EXISTS ledgers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent TEXT,
    alias TEXT,
    description TEXT,
    notes TEXT,
    is_revenue INTEGER DEFAULT 0,
    is_deemedpositive INTEGER DEFAULT 0,
    opening_balance REAL DEFAULT 0,
    closing_balance REAL DEFAULT 0,
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
    tax_rate REAL DEFAULT 0,
    bank_account_holder TEXT,
    bank_account_number TEXT,
    bank_ifsc TEXT,
    bank_swift TEXT,
    bank_name TEXT,
    bank_branch TEXT,
    bill_credit_period INTEGER DEFAULT 0,
    -- Additional Tally fields that might be missing
    alterid INTEGER DEFAULT 0,
    sort_position INTEGER DEFAULT 0,
    bill_credit_period_type TEXT,
    bill_credit_limit REAL DEFAULT 0,
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

  -- Units table (master data) - FIXED column names to match Tally exactly
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    formalname TEXT, -- Tally field name (no underscore)
    is_simple_unit INTEGER DEFAULT 1,
    base_units TEXT,
    additional_units TEXT,
    conversion TEXT,
    alterid INTEGER DEFAULT 0,
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

  -- Vouchers table (transaction data) - COMPLETE schema with all fields
  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    date TEXT, -- Tally date format
    voucher_type TEXT,
    voucher_number TEXT,
    reference_number TEXT,
    reference_date TEXT,
    narration TEXT,
    party_name TEXT, -- Tally field: PartyLedgerName
    place_of_supply TEXT,
    amount REAL DEFAULT 0, -- CRITICAL: Missing amount field
    is_invoice INTEGER DEFAULT 0,
    is_accounting_voucher INTEGER DEFAULT 0,
    is_inventory_voucher INTEGER DEFAULT 0,
    is_order_voucher INTEGER DEFAULT 0,
    alterid INTEGER DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Accounting Entries table (transaction data) - FIXED with voucher relationships
  CREATE TABLE IF NOT EXISTS accounting_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    voucher_guid TEXT, -- CRITICAL: Links to parent voucher
    voucher_number TEXT, -- CRITICAL: Links to parent voucher
    voucher_type TEXT,
    voucher_date TEXT,
    ledger TEXT, -- Tally field: LedgerName
    amount REAL DEFAULT 0,
    amount_forex REAL DEFAULT 0,
    currency TEXT,
    alterid INTEGER DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Inventory Entries table (transaction data) - FIXED with voucher relationships
  CREATE TABLE IF NOT EXISTS inventory_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT UNIQUE NOT NULL,
    voucher_guid TEXT, -- CRITICAL: Links to parent voucher
    voucher_number TEXT, -- CRITICAL: Links to parent voucher
    voucher_type TEXT,
    voucher_date TEXT,
    item TEXT, -- Tally field: StockItemName
    quantity REAL DEFAULT 0,
    rate REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    additional_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    godown TEXT,
    tracking_number TEXT,
    order_number TEXT,
    order_duedate TEXT, -- Tally field name (no underscore, with \r suffix)
    alterid INTEGER DEFAULT 0,
    company_id TEXT NOT NULL, -- UUID format
    division_id TEXT NOT NULL, -- UUID format
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'tally',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for better performance and relationships
  CREATE INDEX IF NOT EXISTS idx_groups_company_division ON groups(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_ledgers_company_division ON ledgers(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_stock_items_company_division ON stock_items(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_vouchers_company_division ON vouchers(company_id, division_id);
  CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
  CREATE INDEX IF NOT EXISTS idx_sync_metadata_company_division ON sync_metadata(company_id, division_id);
  
  -- CRITICAL: Indexes for voucher relationships
  CREATE INDEX IF NOT EXISTS idx_accounting_voucher_guid ON accounting_entries(voucher_guid);
  CREATE INDEX IF NOT EXISTS idx_accounting_voucher_number ON accounting_entries(voucher_number);
  CREATE INDEX IF NOT EXISTS idx_inventory_voucher_guid ON inventory_entries(voucher_guid);
  CREATE INDEX IF NOT EXISTS idx_inventory_voucher_number ON inventory_entries(voucher_number);
`;

// Initialize database tables
db.exec(createTablesSQL, (err) => {
  if (err) {
    console.error('❌ Error creating tables:', err.message);
  } else {
    console.log('✅ Database tables initialized');
  }
});

// Helper function to run SQL with promises - FIXED with timeout
function runSQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Database query timeout after 30 seconds'));
    }, 30000);
    
    db.run(sql, params, function(err) {
      clearTimeout(timeout);
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper function to get data with promises - FIXED with timeout
function getSQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Database query timeout after 30 seconds'));
    }, 30000);
    
    db.get(sql, params, (err, row) => {
      clearTimeout(timeout);
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
    const timeout = setTimeout(() => {
      reject(new Error('Database query timeout after 30 seconds'));
    }, 30000);
    
    db.all(sql, params, (err, rows) => {
      clearTimeout(timeout);
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

// Bulk sync endpoint for batch data operations - FIXED with operation lock
app.post('/api/v1/bulk-sync/:companyId/:divisionId', async (req, res) => {
  console.log(`🔄 Bulk sync request for ${req.params.companyId}/${req.params.divisionId}`);
  
  // Set operation lock
  bulkOperationInProgress = true;
  operationStartTime = Date.now();
  
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
    
    // Clean and validate data before processing
    const enrichedData = data.map(record => {
      // Clean field names (remove \r characters)
      const cleanedRecord = {};
      Object.entries(record).forEach(([key, value]) => {
        const cleanKey = key.replace(/\r/g, '').trim();
        
        // Validate and clean values
        let cleanValue = value;
        
        // Handle invalid date values
        if (cleanKey.includes('date') && (value === 'ñ' || value === '±' || !value)) {
          cleanValue = null;
        }
        
        // Handle invalid numeric values
        if (typeof value === 'string' && (value === 'ñ' || value === '±')) {
          cleanValue = null;
        }
        
        // Clean string values
        if (typeof value === 'string') {
          cleanValue = value.replace(/\r/g, '').replace(/\n/g, '').trim();
          if (cleanValue === '') cleanValue = null;
        }
        
        cleanedRecord[cleanKey] = cleanValue;
      });
      
      // Add metadata
      return {
        ...cleanedRecord,
        company_id: companyId,
        division_id: divisionId,
        sync_timestamp: new Date().toISOString(),
        source: 'tally'
      };
    });
    
    // Process data in batches with optimized logging
    const batchSize = 100;
    const results = [];
    let totalProcessed = 0;
    let totalErrors = 0;
    const errorSummary = {};
    
    await runSQL('BEGIN TRANSACTION');
    
    try {
      for (let i = 0; i < enrichedData.length; i += batchSize) {
        const batch = enrichedData.slice(i, i + batchSize);
        const batchId = `batch_${Math.floor(i/batchSize) + 1}_${Date.now()}`;
        let batchProcessed = 0;
        let batchErrors = 0;
        
        try {
          for (let recordIndex = 0; recordIndex < batch.length; recordIndex++) {
            const record = batch[recordIndex];
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
            
            try {
              await runSQL(sql, values);
              batchProcessed++;
              totalProcessed++;
            } catch (sqlError) {
              batchErrors++;
              totalErrors++;
              
              // Group similar errors to reduce logging
              const errorKey = sqlError.message.split(':')[1]?.trim() || 'unknown_error';
              if (!errorSummary[errorKey]) {
                errorSummary[errorKey] = {
                  count: 0,
                  firstRecord: record,
                  firstSQL: sql,
                  table: table
                };
              }
              errorSummary[errorKey].count++;
              
              // Only log first occurrence of each error type
              if (errorSummary[errorKey].count === 1) {
                console.error(`❌ SQL Error [${batchId}]: ${sqlError.message}`);
                console.error(`   First failing record:`, JSON.stringify(record, null, 2));
              }
            }
          }
          
          // Optimized batch logging
          if (batchErrors === 0) {
            console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${batchProcessed} records processed`);
          } else {
            console.log(`⚠️ Batch ${Math.floor(i/batchSize) + 1}: ${batchProcessed} processed, ${batchErrors} errors`);
          }
          
          results.push({
            batch: Math.floor(i/batchSize) + 1,
            records: batch.length,
            processed: batchProcessed,
            errors: batchErrors,
            success: batchErrors === 0
          });
          
        } catch (batchError) {
          console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, batchError.message);
          totalErrors += batch.length;
          results.push({
            batch: Math.floor(i/batchSize) + 1,
            records: batch.length,
            processed: 0,
            errors: batch.length,
            success: false,
            error: batchError.message
          });
        }
      }
      
      // Log error summary instead of individual errors
      if (Object.keys(errorSummary).length > 0) {
        console.log('\n📊 ERROR SUMMARY:');
        Object.entries(errorSummary).forEach(([errorType, info]) => {
          console.log(`   ❌ ${errorType}: ${info.count} occurrences in table ${info.table}`);
        });
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
  } finally {
    // CRITICAL: Always release operation lock
    bulkOperationInProgress = false;
    operationStartTime = null;
    console.log(`🔓 Bulk operation completed, lock released`);
  }
});

// Metadata endpoint for sync tracking - FIXED with timeout and error handling
app.get('/api/v1/metadata/:companyId/:divisionId', async (req, res) => {
  const { companyId, divisionId } = req.params;
  
  console.log(`📋 Fetching sync metadata for ${companyId}/${divisionId}`);
  
  try {
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({
        success: false,
        error: 'company_id and division_id must be valid UUIDs'
      });
    }
    
    // CRITICAL: Check if bulk operation is in progress
    if (bulkOperationInProgress) {
      const duration = operationStartTime ? Math.round((Date.now() - operationStartTime) / 1000) : 0;
      console.log(`⚠️ Bulk operation in progress (${duration}s), returning cached metadata`);
      
      return res.json({
        success: true,
        data: {
          company_id: companyId,
          division_id: divisionId,
          last_alter_id_master: 0,
          last_alter_id_transaction: 0,
          tables: {},
          message: `Bulk operation in progress (${duration}s), metadata temporarily unavailable`
        }
      });
    }
    
    // CRITICAL FIX: Add timeout to prevent hangs
    const metadataPromise = getAllSQL(
      'SELECT * FROM sync_metadata WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    // Race with timeout to prevent hangs
    const metadata = await Promise.race([
      metadataPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Metadata query timeout after 10 seconds')), 10000)
      )
    ]);
    
    console.log(`✅ Metadata query completed: ${metadata?.length || 0} records`);
    
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
    console.error('❌ Metadata endpoint error:', error.message);
    
    // CRITICAL: Return safe response instead of hanging
    res.json({
      success: true,
      data: {
        company_id: companyId,
        division_id: divisionId,
        last_alter_id_master: 0,
        last_alter_id_transaction: 0,
        tables: {},
        error: 'Metadata temporarily unavailable',
        message: error.message.includes('timeout') ? 'Database query timeout' : 'Database error'
      }
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

// POST /api/v1/query endpoint - EXACTLY what Lovable.dev Supabase function expects
app.post('/api/v1/query/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    const { 
      table, 
      filters = {}, 
      limit = 1000, 
      offset = 0,
      since_alter_id,
      date_from,
      date_to,
      sql,
      params
    } = req.body;
    
    console.log(`📡 Query request: table=${table}, limit=${limit}, offset=${offset}`);
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({
        success: false,
        error: 'company_id and division_id must be valid UUIDs'
      });
    }
    
    let query;
    let queryParams = [];
    
    if (sql) {
      // Custom SQL query
      query = sql;
      queryParams = params || [];
    } else if (table) {
      // Table-based query (Supabase function format)
      
      // Map table names to actual SQLite table names
      const tableMapping = {
        'groups': 'groups',
        'ledgers': 'ledgers', 
        'stock_items': 'stock_items',
        'voucher_types': 'voucher_types',
        'cost_centers': 'cost_centres',
        'employees': 'employees', // Will return empty
        'uoms': 'units',
        'godowns': 'godowns',
        'vouchers': 'vouchers',
        'accounting': 'accounting_entries',
        'accounting_entries': 'accounting_entries',
        'inventory': 'inventory_entries',
        'inventory_entries': 'inventory_entries'
      };
      
      const actualTable = tableMapping[table] || table;
      
      // Build base query
      query = `SELECT * FROM ${actualTable} WHERE company_id = ? AND division_id = ?`;
      queryParams = [companyId, divisionId];
      
      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        query += ` AND ${key} = ?`;
        queryParams.push(value);
      });
      
      // Add date filters
      if (date_from) {
        query += ` AND date >= ?`;
        queryParams.push(date_from);
      }
      if (date_to) {
        query += ` AND date <= ?`;
        queryParams.push(date_to);
      }
      
      // Add AlterID filter for incremental sync
      if (since_alter_id) {
        query += ` AND alterid > ?`;
        queryParams.push(since_alter_id);
      }
      
      // Add ordering and pagination - FIXED column names
      if (actualTable === 'vouchers') {
        query += ` ORDER BY date DESC, voucher_number`;
      } else if (actualTable === 'accounting_entries') {
        query += ` ORDER BY ledger, guid`;
      } else if (actualTable === 'inventory_entries') {
        query += ` ORDER BY item, guid`;
      } else {
        // For tables with 'name' column (groups, ledgers, stock_items, etc.)
        query += ` ORDER BY name, guid`;
      }
      
      query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
      
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either table or sql parameter is required'
      });
    }
    
    // Security check
    if (!query.trim().toLowerCase().startsWith('select')) {
      return res.status(400).json({
        success: false,
        error: 'Only SELECT queries are allowed'
      });
    }
    
    console.log(`🔍 Executing query: ${query.substring(0, 100)}...`);
    
    const results = await getAllSQL(query, queryParams);
    
    // Get total count for pagination
    let total = results.length;
    if (table && limit) {
      const countQuery = query.replace(/SELECT \* FROM/, 'SELECT COUNT(*) as count FROM').split(' ORDER BY')[0];
      const countResult = await getSQL(countQuery, queryParams.slice(0, -2)); // Remove LIMIT/OFFSET params
      total = countResult?.count || results.length;
    }
    
    // Calculate next offset
    const nextOffset = offset + results.length < total ? offset + results.length : null;
    
    console.log(`✅ Query result: ${results.length} records (total: ${total})`);
    
    // Standardized response format for Lovable.dev
    res.json({
      success: true,
      data: results, // Direct array format that Supabase function expects
      total: total,
      count: results.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      next_offset: nextOffset,
      table: table,
      company_id: companyId,
      division_id: divisionId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Query error:', error);
    res.status(500).json({
      success: false,
      error: 'Query execution failed',
      details: error.message,
      table: req.body.table,
      timestamp: new Date().toISOString()
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

// ========================================
// VERSIONED API ENDPOINTS (Recommended Option B)
// ========================================

// /api/v1/masters/* endpoints
app.get('/api/v1/masters/groups/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const groups = await getAllSQL(
      'SELECT * FROM groups WHERE company_id = ? AND division_id = ? ORDER BY name',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: groups,
      total: groups.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/masters/ledgers/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const ledgers = await getAllSQL(
      'SELECT * FROM ledgers WHERE company_id = ? AND division_id = ? ORDER BY name',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: ledgers,
      total: ledgers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/masters/stock-items/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const stockItems = await getAllSQL(
      'SELECT * FROM stock_items WHERE company_id = ? AND division_id = ? ORDER BY name',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: stockItems,
      total: stockItems.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/masters/voucher-types/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const voucherTypes = await getAllSQL(
      'SELECT * FROM voucher_types WHERE company_id = ? AND division_id = ? ORDER BY name',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: voucherTypes,
      total: voucherTypes.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/vouchers/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    const { limit = 1000, offset = 0 } = req.query;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const vouchers = await getAllSQL(
      `SELECT * FROM vouchers 
       WHERE company_id = ? AND division_id = ? 
       ORDER BY date DESC, voucher_number 
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: vouchers,
      total: vouchers.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/accounting-entries/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    const { limit = 1000, offset = 0 } = req.query;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const accounting = await getAllSQL(
      `SELECT * FROM accounting_entries 
       WHERE company_id = ? AND division_id = ? 
       ORDER BY ledger_name 
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: accounting,
      total: accounting.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/inventory-entries/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    const { limit = 1000, offset = 0 } = req.query;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const inventory = await getAllSQL(
      `SELECT * FROM inventory_entries 
       WHERE company_id = ? AND division_id = ? 
       ORDER BY stock_item_name 
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: inventory,
      total: inventory.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// LOVABLE.DEV COMPATIBLE ENDPOINTS (Legacy)
// ========================================

// Masters endpoints for Lovable.dev compatibility
app.get('/masters/groups/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const groups = await getAllSQL(
      'SELECT * FROM groups WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: groups,
        count: groups.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/masters/ledgers/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const ledgers = await getAllSQL(
      'SELECT * FROM ledgers WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: ledgers,
        count: ledgers.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/masters/stock-items/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const stockItems = await getAllSQL(
      'SELECT * FROM stock_items WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: stockItems,
        count: stockItems.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/masters/voucher-types/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const voucherTypes = await getAllSQL(
      'SELECT * FROM voucher_types WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: voucherTypes,
        count: voucherTypes.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/vouchers/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const vouchers = await getAllSQL(
      'SELECT * FROM vouchers WHERE company_id = ? AND division_id = ? ORDER BY date DESC',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: vouchers,
        count: vouchers.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/accounting/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const accounting = await getAllSQL(
      'SELECT * FROM accounting_entries WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: accounting,
        count: accounting.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Additional missing endpoints for Lovable.dev compatibility
app.get('/masters/cost-centers/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const costCenters = await getAllSQL(
      'SELECT * FROM cost_centres WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: costCenters,
        count: costCenters.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/masters/employees/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    // Create empty response for employees (not in our current schema)
    res.json({
      success: true,
      data: {
        records: [],
        count: 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/masters/uoms/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const uoms = await getAllSQL(
      'SELECT * FROM units WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: uoms,
        count: uoms.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enhanced godowns endpoint (already exists but ensuring it's complete)
app.get('/masters/godowns/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const godowns = await getAllSQL(
      'SELECT * FROM godowns WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: godowns,
        count: godowns.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Additional critical endpoints for complete Lovable.dev compatibility
app.get('/inventory/:companyId/:divisionId', async (req, res) => {
  try {
    const { companyId, divisionId } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    const inventory = await getAllSQL(
      'SELECT * FROM inventory_entries WHERE company_id = ? AND division_id = ?',
      [companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        records: inventory,
        count: inventory.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Individual voucher endpoint for detailed verification
app.get('/api/v1/voucher/:companyId/:divisionId/:voucherNumber', async (req, res) => {
  try {
    const { companyId, divisionId, voucherNumber } = req.params;
    
    if (!isValidUUID(companyId) || !isValidUUID(divisionId)) {
      return res.status(400).json({ success: false, error: 'Invalid UUIDs' });
    }
    
    // Get main voucher
    const voucher = await getSQL(
      'SELECT * FROM vouchers WHERE company_id = ? AND division_id = ? AND voucher_number = ?',
      [companyId, divisionId, voucherNumber]
    );
    
    if (!voucher) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }
    
    // Get related accounting entries
    const accountingEntries = await getAllSQL(
      'SELECT * FROM accounting_entries WHERE voucher_guid = ? AND company_id = ? AND division_id = ?',
      [voucher.guid, companyId, divisionId]
    );
    
    // Get related inventory entries
    const inventoryEntries = await getAllSQL(
      'SELECT * FROM inventory_entries WHERE voucher_guid = ? AND company_id = ? AND division_id = ?',
      [voucher.guid, companyId, divisionId]
    );
    
    // Get party details
    const partyDetails = await getSQL(
      'SELECT * FROM ledgers WHERE name = ? AND company_id = ? AND division_id = ?',
      [voucher.party_ledger_name, companyId, divisionId]
    );
    
    res.json({
      success: true,
      data: {
        voucher: voucher,
        accounting_entries: accountingEntries,
        inventory_entries: inventoryEntries,
        party_details: partyDetails,
        relationships: {
          accounting_count: accountingEntries.length,
          inventory_count: inventoryEntries.length,
          party_found: !!partyDetails
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Data validation endpoint for debugging
app.post('/api/v1/validate-data/:companyId/:divisionId', async (req, res) => {
  try {
    const { table, data } = req.body;
    
    if (!table || !data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'table and data array are required'
      });
    }
    
    const validationResults = {
      total_records: data.length,
      clean_records: 0,
      problematic_records: 0,
      field_issues: {},
      value_issues: {},
      sample_clean_record: null,
      sample_problematic_record: null
    };
    
    data.forEach((record, index) => {
      let hasIssues = false;
      
      // Check for \r in field names
      Object.keys(record).forEach(key => {
        if (key.includes('\r')) {
          hasIssues = true;
          const cleanKey = key.replace(/\r/g, '');
          if (!validationResults.field_issues[key]) {
            validationResults.field_issues[key] = { count: 0, cleanKey };
          }
          validationResults.field_issues[key].count++;
        }
      });
      
      // Check for invalid values
      Object.entries(record).forEach(([key, value]) => {
        if (value === 'ñ' || value === '±') {
          hasIssues = true;
          if (!validationResults.value_issues[key]) {
            validationResults.value_issues[key] = { count: 0, invalidValues: [] };
          }
          validationResults.value_issues[key].count++;
          if (!validationResults.value_issues[key].invalidValues.includes(value)) {
            validationResults.value_issues[key].invalidValues.push(value);
          }
        }
      });
      
      if (hasIssues) {
        validationResults.problematic_records++;
        if (!validationResults.sample_problematic_record) {
          validationResults.sample_problematic_record = record;
        }
      } else {
        validationResults.clean_records++;
        if (!validationResults.sample_clean_record) {
          validationResults.sample_clean_record = record;
        }
      }
    });
    
    res.json({
      success: true,
      data: validationResults
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint list for debugging
app.get('/api/v1/endpoints', (req, res) => {
  res.json({
    success: true,
    data: {
      tally_sync_endpoints: [
        'POST /api/v1/bulk-sync/{companyId}/{divisionId}',
        'GET /api/v1/metadata/{companyId}/{divisionId}',
        'GET /api/v1/sync-status/{companyId}/{divisionId}',
        'GET /api/v1/stats/{companyId}/{divisionId}',
        'POST /api/v1/query/{companyId}/{divisionId}',
        'GET /api/v1/tables'
      ],
      lovable_compatible_endpoints: [
        'GET /masters/groups/{companyId}/{divisionId}',
        'GET /masters/ledgers/{companyId}/{divisionId}',
        'GET /masters/stock-items/{companyId}/{divisionId}',
        'GET /masters/voucher-types/{companyId}/{divisionId}',
        'GET /masters/cost-centers/{companyId}/{divisionId}',
        'GET /masters/employees/{companyId}/{divisionId}',
        'GET /masters/uoms/{companyId}/{divisionId}',
        'GET /masters/godowns/{companyId}/{divisionId}',
        'GET /vouchers/{companyId}/{divisionId}',
        'GET /accounting/{companyId}/{divisionId}',
        'GET /inventory/{companyId}/{divisionId}'
      ],
      verification_endpoints: [
        'GET /api/v1/voucher/{companyId}/{divisionId}/{voucherNumber}',
        'POST /api/v1/validate-data/{companyId}/{divisionId}',
        'GET /api/v1/endpoints'
      ]
    }
  });
});

// ========================================
// END LOVABLE.DEV COMPATIBLE ENDPOINTS
// ========================================

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
  console.log(`\n📦 TALLY SYNC ENDPOINTS:`);
  console.log(`📦 Bulk Sync: POST /api/v1/bulk-sync/{companyId}/{divisionId}`);
  console.log(`📋 Metadata: GET /api/v1/metadata/{companyId}/{divisionId}`);
  console.log(`📊 Sync Status: GET /api/v1/sync-status/{companyId}/{divisionId}`);
  console.log(`📈 Stats: GET /api/v1/stats/{companyId}/{divisionId}`);
  console.log(`🔍 Query: POST /api/v1/query/{companyId}/{divisionId}`);
  console.log(`📋 Tables: GET /api/v1/tables`);
  console.log(`\n🌐 LOVABLE.DEV COMPATIBLE ENDPOINTS:`);
  console.log(`📊 Groups: GET /masters/groups/{companyId}/{divisionId}`);
  console.log(`💰 Ledgers: GET /masters/ledgers/{companyId}/{divisionId}`);
  console.log(`📦 Stock Items: GET /masters/stock-items/{companyId}/{divisionId}`);
  console.log(`📋 Voucher Types: GET /masters/voucher-types/{companyId}/{divisionId}`);
  console.log(`🏢 Cost Centers: GET /masters/cost-centers/{companyId}/{divisionId}`);
  console.log(`👥 Employees: GET /masters/employees/{companyId}/{divisionId}`);
  console.log(`📏 UOMs: GET /masters/uoms/{companyId}/{divisionId}`);
  console.log(`🏭 Godowns: GET /masters/godowns/{companyId}/{divisionId}`);
  console.log(`💼 Vouchers: GET /vouchers/{companyId}/{divisionId}`);
  console.log(`💰 Accounting: GET /accounting/{companyId}/{divisionId}`);
  console.log(`📦 Inventory: GET /inventory/{companyId}/{divisionId}`);
  console.log(`\n🔍 VERIFICATION ENDPOINTS:`);
  console.log(`📄 Individual Voucher: GET /api/v1/voucher/{companyId}/{divisionId}/{voucherNumber}`);
  console.log(`📋 Endpoint List: GET /api/v1/endpoints`);
  console.log(`\n🗄️ Database: SQLite (${DB_PATH})`);
  console.log(`🆔 UUIDs Required: company_id and division_id must be valid UUIDs`);
  console.log(`✅ Ready for Tally sync from Windows client`);
  console.log(`🌐 Ready for Lovable.dev integration`);
});

module.exports = app;

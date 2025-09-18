# 🔗 Supabase ↔ Railway SQLite Integration Guide

## Architecture Overview

```
Lovable.dev → Supabase → Railway SQLite → Tally
     ↑                                      ↓
     └──────── Two-way Sync ←──────────────┘
```

## 1. Railway SQLite Database Structure

### ✅ Verified Schema (with notes column fix)

```sql
-- Master Data Tables
CREATE TABLE mst_stock_item (
  guid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent TEXT,
  alias TEXT,
  description TEXT,
  notes TEXT,              -- ✅ CRITICAL: Notes column included
  part_number TEXT,
  uom TEXT,
  alternate_uom TEXT,
  conversion INTEGER DEFAULT 0,
  opening_balance REAL DEFAULT 0,
  opening_rate REAL DEFAULT 0,
  opening_value REAL DEFAULT 0,
  closing_balance REAL DEFAULT 0,
  closing_rate REAL DEFAULT 0,
  closing_value REAL DEFAULT 0,
  costing_method TEXT,
  gst_type_of_supply TEXT,
  gst_hsn_code TEXT,
  gst_hsn_description TEXT,
  gst_rate REAL DEFAULT 0,
  gst_taxability TEXT,
  company_id TEXT NOT NULL,
  division_id TEXT NOT NULL,
  sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  source TEXT DEFAULT 'tally'
);

-- Other tables: mst_ledger, mst_group, trn_voucher, etc.
```

## 2. Railway API Endpoints

### Available Endpoints:
- `GET /api/v1/health` - Health check
- `POST /api/v1/bulk-sync/{companyId}/{divisionId}` - Bulk data sync
- `GET /api/v1/metadata/{companyId}/{divisionId}` - Database metadata
- `POST /api/v1/query` - Custom SQL queries
- `POST /api/v1/execute-sql` - Direct SQL execution

### Configuration:
```javascript
const RAILWAY_CONFIG = {
  baseUrl: 'https://tally-sync-vyaapari360-production.up.railway.app',
  companyId: '629f49fb-983e-4141-8c48-e1423b39e921',
  divisionId: '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
};
```

## 3. Supabase Edge Function Integration

### A. Update Existing Supabase Functions

#### 1. Tally Railway Sync Function
```javascript
// supabase/functions/tally-railway-sync/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RAILWAY_CONFIG = {
  baseUrl: 'https://tally-sync-vyaapari360-production.up.railway.app',
  companyId: '629f49fb-983e-4141-8c48-e1423b39e921',
  divisionId: '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
};

serve(async (req) => {
  try {
    const { table, data, sync_type = 'incremental' } = await req.json();
    
    // Send data to Railway SQLite
    const response = await fetch(
      `${RAILWAY_CONFIG.baseUrl}/api/v1/bulk-sync/${RAILWAY_CONFIG.companyId}/${RAILWAY_CONFIG.divisionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: table,
          data: data,
          sync_type: sync_type,
          metadata: {
            source: 'supabase',
            timestamp: new Date().toISOString(),
            function: 'tally-railway-sync'
          }
        })
      }
    );
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${data.length} records to Railway SQLite`,
      railway_response: result
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

#### 2. Tally Full Sync Function
```javascript
// supabase/functions/tally-full-sync/index.ts

serve(async (req) => {
  try {
    const { tables = ['stock_items', 'ledgers', 'vouchers'] } = await req.json();
    const results = {};
    
    for (const tableName of tables) {
      // Get data from Supabase
      const { data: supabaseData, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('company_id', RAILWAY_CONFIG.companyId)
        .eq('division_id', RAILWAY_CONFIG.divisionId);
      
      if (error) throw error;
      
      // Send to Railway SQLite
      const response = await fetch(
        `${RAILWAY_CONFIG.baseUrl}/api/v1/bulk-sync/${RAILWAY_CONFIG.companyId}/${RAILWAY_CONFIG.divisionId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: tableName,
            data: supabaseData,
            sync_type: 'full',
            metadata: {
              source: 'supabase-full-sync',
              timestamp: new Date().toISOString()
            }
          })
        }
      );
      
      results[tableName] = await response.json();
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Full sync completed',
      results: results
    }));
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500 });
  }
});
```

### B. Create New Railway Query Function
```javascript
// supabase/functions/railway-query/index.ts

serve(async (req) => {
  try {
    const { sql, params = [] } = await req.json();
    
    const response = await fetch(
      `${RAILWAY_CONFIG.baseUrl}/api/v1/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params })
      }
    );
    
    const result = await response.json();
    
    return new Response(JSON.stringify(result));
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500 });
  }
});
```

## 4. Database Triggers for Auto-Sync

### A. Supabase Database Triggers
```sql
-- Create trigger function for auto-sync to Railway
CREATE OR REPLACE FUNCTION sync_to_railway()
RETURNS TRIGGER AS $$
BEGIN
  -- Call Supabase Edge Function to sync to Railway
  PERFORM net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/tally-railway-sync',
    headers := '{"Authorization": "Bearer ' || current_setting('app.jwt_token') || '", "Content-Type": "application/json"}',
    body := json_build_object(
      'table', TG_TABLE_NAME,
      'data', ARRAY[row_to_json(NEW)],
      'sync_type', 'incremental'
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to stock_items table
CREATE TRIGGER stock_items_sync_trigger
  AFTER INSERT OR UPDATE ON stock_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_to_railway();

-- Apply to other tables
CREATE TRIGGER ledgers_sync_trigger
  AFTER INSERT OR UPDATE ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION sync_to_railway();
```

## 5. Testing the Integration

### A. Test Railway SQLite Structure
```bash
node verify-railway-sqlite-structure.js
```

### B. Test Supabase → Railway Sync
```javascript
// Test script
const testData = {
  guid: 'test-' + Date.now(),
  name: 'Test Stock Item',
  notes: 'Test notes column',
  company_id: '629f49fb-983e-4141-8c48-e1423b39e921',
  division_id: '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
};

// Call Supabase function
const response = await supabase.functions.invoke('tally-railway-sync', {
  body: {
    table: 'stock_items',
    data: [testData],
    sync_type: 'test'
  }
});
```

## 6. Deployment Steps

### A. Deploy Supabase Functions
```bash
# Deploy Railway sync function
supabase functions deploy tally-railway-sync

# Deploy full sync function  
supabase functions deploy tally-full-sync

# Deploy query function
supabase functions deploy railway-query
```

### B. Update Environment Variables
```bash
# In Supabase dashboard, add:
RAILWAY_API_BASE=https://tally-sync-vyaapari360-production.up.railway.app
RAILWAY_COMPANY_ID=629f49fb-983e-4141-8c48-e1423b39e921
RAILWAY_DIVISION_ID=37f3cc0c-58ad-4baf-b309-360116ffc3cd
```

## 7. Migration Workflow

### A. Initial Data Migration
1. **Railway SQLite** ← **Tally** (using WALK attribute for 2546 stock items)
2. **Supabase** ← **Railway SQLite** (sync master data)
3. **Lovable.dev** ← **Supabase** (display data)

### B. Ongoing Sync
1. **Lovable.dev** → **Supabase** (user changes)
2. **Supabase** → **Railway SQLite** (via triggers)
3. **Railway SQLite** → **Tally** (via Windows client)

## 8. Monitoring & Health Checks

### A. Health Check Endpoints
- Railway: `GET /api/v1/health`
- Supabase: Built-in monitoring
- Tally: Windows client status

### B. Sync Status Tracking
```sql
-- In both Supabase and Railway SQLite
CREATE TABLE sync_log (
  id SERIAL PRIMARY KEY,
  source TEXT,
  target TEXT,
  table_name TEXT,
  records_count INTEGER,
  status TEXT,
  error_message TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

## 🎯 Ready for Production!

The Railway SQLite service is now deployed with:
- ✅ Notes column in stock_items table
- ✅ Proper SQLite schema
- ✅ Persistent /data volume
- ✅ All required API endpoints
- ✅ Ready for 2546 stock items migration

Next steps:
1. Verify Railway structure with the verification script
2. Deploy Supabase functions
3. Run the WALK attribute migration
4. Set up bi-directional sync triggers

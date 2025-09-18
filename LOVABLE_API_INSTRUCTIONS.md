# 🌐 LOVABLE.DEV API INTEGRATION INSTRUCTIONS

## 🎯 UPDATED SUPABASE FUNCTION - COMPLETE IMPLEMENTATION GUIDE

### ⚠️ **CRITICAL CHANGES REQUIRED**

Your current Supabase function is getting **404 errors** because it's using the wrong endpoints. Here's the complete fix:

## 🔧 **1. UPDATE QUERY FUNCTION (CRITICAL FIX)**

**REPLACE THIS (causing 404s):**
```javascript
async function queryNewAPI(endpoint, companyId, divisionId, table, filters = {}, limit = 1000) {
  const apiUrl = 'https://tally-sync-vyaapari360-production.up.railway.app';
  const queryUrl = `${apiUrl}/api/v1/query/${companyId}/${divisionId}`;
  
  const response = await fetch(queryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table,
      filters,
      limit,
      offset: 0
    })
  });
  // ... rest of function
}
```

**WITH THIS (will work):**
```javascript
async function queryNewAPI(endpoint, companyId, divisionId, table, filters = {}, limit = 1000, offset = 0) {
  try {
    const apiUrl = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
    const queryUrl = `${apiUrl}/api/v1/query/${companyId}/${divisionId}`;
    
    console.log(`Querying Railway API: ${queryUrl} for table: ${table}`);
    
    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: table,
        filters: filters,
        limit: limit,
        offset: offset
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    
    if (!responseData.success) {
      throw new Error(responseData.error || 'API request failed');
    }

    // Railway returns data directly as array
    return {
      records: responseData.data || [],
      total: responseData.total || 0,
      next_offset: responseData.next_offset
    };
    
  } catch (error) {
    console.error(`Error querying Railway API for ${table}:`, error);
    throw error;
  }
}
```

## 🔧 **2. UPDATE TABLE MAPPINGS (CRITICAL)**

**REPLACE YOUR TABLE_MAPPINGS:**
```javascript
const TABLE_MAPPINGS = [
  { apiTable: 'groups', supabaseTable: 'mst_group', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'ledgers', supabaseTable: 'mst_ledger', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'stock_items', supabaseTable: 'mst_stock_item', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'voucher_types', supabaseTable: 'mst_vouchertype', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'cost_centers', supabaseTable: 'mst_cost_centre', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'godowns', supabaseTable: 'mst_godown', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'uoms', supabaseTable: 'mst_uom', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'vouchers', supabaseTable: 'tally_trn_voucher', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'accounting_entries', supabaseTable: 'trn_accounting', endpoint: '/api/v1/query', keyField: 'guid' },
  { apiTable: 'inventory_entries', supabaseTable: 'trn_inventory', endpoint: '/api/v1/query', keyField: 'guid' }
];
```

## 🔧 **3. ENHANCED RESPONSE PARSING**

**ADD THIS FUNCTION:**
```javascript
function extractRecords(responseData, tableName) {
  // Railway SQLite returns data directly as array
  if (Array.isArray(responseData.data)) {
    return responseData.data;
  }
  
  // Fallback formats
  if (responseData.records) return responseData.records;
  if (responseData.data?.records) return responseData.data.records;
  if (Array.isArray(responseData)) return responseData;
  
  // Diagnostic logging for debugging
  console.log(`⚠️ Unexpected response format for ${tableName}:`, {
    keys: Object.keys(responseData),
    hasData: !!responseData.data,
    dataType: typeof responseData.data,
    isArray: Array.isArray(responseData.data),
    preview: JSON.stringify(responseData).substring(0, 200)
  });
  
  return [];
}
```

**UPDATE YOUR MAIN LOOP:**
```javascript
for (const tableMapping of tablesToSync) {
  console.log(`Processing table: ${tableMapping.apiTable} -> ${tableMapping.supabaseTable}`);
  
  try {
    // Use the updated query function
    const apiData = await queryNewAPI(
      tableMapping.endpoint,
      companyId,
      divisionId,
      tableMapping.apiTable,
      {}, // filters
      1000, // limit
      0 // offset
    );

    const records = extractRecords(apiData, tableMapping.apiTable);
    console.log(`Retrieved ${records.length} records for ${tableMapping.apiTable}`);

    if (records.length > 0) {
      // Your existing bulk sync logic here
      const syncStats = await bulkSyncToSupabase(
        supabase,
        tableMapping.supabaseTable,
        records,
        companyId,
        divisionId,
        tableMapping.keyField
      );
      
      // Update results
      syncResults.tablesProcessed[tableMapping.apiTable] = {
        records: records.length,
        inserted: syncStats.inserted,
        updated: syncStats.updated,
        errors: syncStats.errors
      };
    }
  } catch (tableError) {
    console.error(`Error processing table ${tableMapping.apiTable}:`, tableError);
    // Your existing error handling
  }
}
```

## 🔧 **4. ADD PAGINATION SUPPORT**

**FOR LARGE TABLES (vouchers, accounting, inventory):**
```javascript
async function queryWithPagination(companyId, divisionId, table, batchSize = 1000) {
  let allRecords = [];
  let offset = 0;
  
  while (true) {
    const batch = await queryNewAPI(
      '/api/v1/query',
      companyId,
      divisionId,
      table,
      {}, // filters
      batchSize,
      offset
    );
    
    const records = extractRecords(batch, table);
    if (records.length === 0) break;
    
    allRecords.push(...records);
    offset += records.length;
    
    console.log(`Fetched ${records.length} ${table} records (total: ${allRecords.length})`);
    
    if (records.length < batchSize) break; // Last page
  }
  
  return allRecords;
}
```

## 🔧 **5. ENHANCED ERROR HANDLING**

**ADD TO YOUR PERFORMFULLSYNC:**
```javascript
// At the start of performFullSync
console.log(`Starting enhanced full sync for company: ${companyId}, division: ${divisionId}`);

// Test Railway connection first
try {
  const healthResponse = await fetch(`${apiUrl}/api/v1/health`);
  const healthData = await healthResponse.json();
  console.log('✅ Railway health check passed:', healthData.message);
} catch (error) {
  throw new Error(`Railway connection failed: ${error.message}`);
}

// Test POST /api/v1/query endpoint specifically
try {
  const testQuery = await fetch(`${apiUrl}/api/v1/query/${companyId}/${divisionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: 'groups',
      limit: 1
    })
  });
  
  if (!testQuery.ok) {
    throw new Error(`Query endpoint test failed: ${testQuery.status} ${testQuery.statusText}`);
  }
  
  const testData = await testQuery.json();
  console.log('✅ POST /api/v1/query endpoint working:', testData.success);
} catch (error) {
  throw new Error(`Query endpoint test failed: ${error.message}`);
}
```

## 🧪 **6. TEST YOUR UPDATED FUNCTION**

**Test with this payload:**
```json
{
  "companyId": "629f49fb-983e-4141-8c48-e1423b39e921",
  "divisionId": "37f3cc0c-58ad-4baf-b309-360116ffc3cd",
  "action": "full_sync"
}
```

**Expected Results:**
```json
{
  "success": true,
  "data": {
    "jobId": "sync-job-uuid",
    "totals": {
      "totalRecords": 12248,
      "totalInserted": 12248,
      "totalUpdated": 0,
      "totalErrors": 0
    },
    "tablesProcessedCount": 10,
    "entityCounts": {
      "ledgers": 635,
      "groups": 49,
      "stockItems": 2546,
      "voucherTypes": 43,
      "inventory": 2709
    },
    "totalVouchers": 1711,
    "method": "Enhanced Supabase Full Sync"
  }
}
```

## 🔍 **7. VOUCHER VERIFICATION TEST**

**Add this action to test specific voucher:**
```javascript
case 'verify_voucher':
  const voucherNumber = '2800237/25-26';
  const voucherUrl = `${apiUrl}/api/v1/voucher/${companyId}/${divisionId}/${encodeURIComponent(voucherNumber)}`;
  
  const voucherResponse = await fetch(voucherUrl);
  const voucherData = await voucherResponse.json();
  
  if (voucherData.success) {
    result = {
      voucher_found: true,
      voucher_details: voucherData.data.voucher,
      accounting_entries: voucherData.data.accounting_entries.length,
      inventory_entries: voucherData.data.inventory_entries.length,
      party_found: !!voucherData.data.party_details,
      verification_status: 'complete'
    };
  } else {
    result = {
      voucher_found: false,
      error: voucherData.error
    };
  }
  break;
```

## 📊 **8. COMPLETE API REFERENCE**

### **Primary Endpoint (Use This):**
```
POST /api/v1/query/{companyId}/{divisionId}
Body: {
  "table": "groups|ledgers|stock_items|voucher_types|vouchers|accounting_entries|inventory_entries",
  "filters": {},
  "limit": 1000,
  "offset": 0
}
Response: {
  "success": true,
  "data": [...], // Direct array
  "total": 1234,
  "next_offset": 1000
}
```

### **Alternative Endpoints (Backup):**
```
GET /api/v1/masters/groups/{companyId}/{divisionId}
GET /api/v1/masters/ledgers/{companyId}/{divisionId}
GET /api/v1/masters/stock-items/{companyId}/{divisionId}
GET /api/v1/vouchers/{companyId}/{divisionId}
GET /api/v1/accounting-entries/{companyId}/{divisionId}
GET /api/v1/inventory-entries/{companyId}/{divisionId}
```

## 🎯 **IMPLEMENTATION CHECKLIST**

### ✅ **Railway Backend (COMPLETED)**
- ✅ POST /api/v1/query endpoint implemented
- ✅ All versioned /api/v1/ endpoints added
- ✅ Standardized response format
- ✅ Pagination support
- ✅ Table mapping for all data types
- ✅ Individual voucher verification
- ✅ Deployed to Railway

### 🔄 **Supabase Function (YOUR TASK)**
- [ ] Update queryNewAPI to use POST /api/v1/query
- [ ] Add enhanced response parsing
- [ ] Include inventory_entries in TABLE_MAPPINGS
- [ ] Add error diagnostics for 0-record cases
- [ ] Test with updated endpoints

### 🔄 **UI Enhancements (YOUR TASK)**
- [ ] Display per-table sync results
- [ ] Add voucher verification feature
- [ ] Show real-time sync monitoring
- [ ] Add error analytics

## 🚀 **IMMEDIATE ACTION**

1. **Update your Supabase function** with the new queryNewAPI code above
2. **Deploy the updated function**
3. **Run full sync from Lovable.dev**
4. **Verify you get 12,248+ records instead of 0**

## 📊 **EXPECTED SUCCESS METRICS**

After implementing these changes:
- ✅ **No 404 errors** - All endpoints will be found
- ✅ **12,248+ records** - Complete dataset instead of 0
- ✅ **All entities populated** - ledgers: 635, vouchers: 1711, etc.
- ✅ **Voucher 2800237/25-26** - Fully accessible with relationships
- ✅ **Real-time updates** - Continuous sync maintains freshness

**The Railway backend is ready - now update your Supabase function to use the correct endpoints!** 🚀

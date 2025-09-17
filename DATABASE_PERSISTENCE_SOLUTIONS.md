# 🗄️ SQLite Database Persistence Solutions

## 🚨 Current Problem
Railway redeploys create a fresh container, which resets the SQLite database file. This means:
- ❌ All data lost on each deployment
- ❌ Need to re-migrate 26,204+ records every time
- ❌ Downtime during data population
- ❌ Inefficient and unreliable

## 🎯 Solution Options

### 🥇 **Option 1: Railway Volume Mount (RECOMMENDED)**

**Implementation:**
```javascript
// In server.js
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? '/data/tally.db'  // Railway volume mount
  : './tally.db';     // Local development

// Ensure data directory exists
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}
```

**Railway Configuration:**
Add to `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/api/v1/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "volumes": [
      {
        "mountPath": "/data",
        "name": "tally-sqlite-data"
      }
    ]
  }
}
```

**Benefits:**
- ✅ Database persists across deployments
- ✅ No data loss
- ✅ Fast deployments (no re-migration needed)
- ✅ Railway native solution

### 🥈 **Option 2: External Database Service**

**Switch to Railway PostgreSQL:**
```javascript
// Update server.js to use Railway PostgreSQL
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Railway provides this
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// PostgreSQL schema (more robust than SQLite)
const createTablesSQL = `
  CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    guid VARCHAR(100) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    -- ... rest of schema
  );
  -- ... other tables
`;
```

**Benefits:**
- ✅ True managed database
- ✅ Better performance for large datasets
- ✅ ACID compliance
- ✅ Concurrent access support

### 🥉 **Option 3: Backup/Restore System**

**Automatic Backup on Deployment:**
```javascript
// Add to server.js
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

async function backupDatabase() {
  if (fs.existsSync(DB_PATH)) {
    const data = fs.readFileSync(DB_PATH);
    await s3.upload({
      Bucket: 'tally-sqlite-backups',
      Key: `backup-${Date.now()}.db`,
      Body: data
    }).promise();
  }
}

async function restoreDatabase() {
  try {
    const objects = await s3.listObjects({
      Bucket: 'tally-sqlite-backups'
    }).promise();
    
    if (objects.Contents.length > 0) {
      const latest = objects.Contents.sort((a, b) => 
        new Date(b.LastModified) - new Date(a.LastModified)
      )[0];
      
      const data = await s3.getObject({
        Bucket: 'tally-sqlite-backups',
        Key: latest.Key
      }).promise();
      
      fs.writeFileSync(DB_PATH, data.Body);
      console.log('✅ Database restored from backup');
    }
  } catch (error) {
    console.log('⚠️ No backup found, starting fresh');
  }
}

// On startup
await restoreDatabase();

// On graceful shutdown
process.on('SIGTERM', async () => {
  await backupDatabase();
  process.exit(0);
});
```

### 🥉 **Option 4: Database-as-a-Service**

**Use Supabase/PlanetScale/Neon:**
```javascript
// Switch to managed PostgreSQL
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// No more SQLite file management
async function upsertData(table, data) {
  const { data: result, error } = await supabase
    .from(table)
    .upsert(data, { onConflict: 'guid' });
  
  return { success: !error, error };
}
```

## 🎯 **RECOMMENDED IMPLEMENTATION**

### **Phase 1: Quick Fix (Railway Volume)**
Update the current SQLite setup to use Railway volumes:

```javascript
// Update server.js
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? '/data/tally.db'  // Persistent volume
  : './tally.db';     // Local development

// Add volume configuration to railway.json
{
  "deploy": {
    "volumes": [
      {
        "mountPath": "/data",
        "name": "tally-sqlite-data"
      }
    ]
  }
}
```

### **Phase 2: Long-term Solution (PostgreSQL)**
Migrate to Railway PostgreSQL for production reliability:

```javascript
// New database configuration
const DATABASE_CONFIG = {
  development: {
    type: 'sqlite',
    path: './tally.db'
  },
  production: {
    type: 'postgresql',
    url: process.env.DATABASE_URL
  }
};
```

## 🔧 **IMMEDIATE ACTION PLAN**

### **Step 1: Add Volume Mount (Immediate)**
```bash
# Update railway.json with volume configuration
# This will persist SQLite database across deployments
```

### **Step 2: Database Migration Strategy**
```javascript
// Add to server.js startup
async function initializeDatabase() {
  const dbExists = fs.existsSync(DB_PATH);
  
  if (!dbExists) {
    console.log('🔄 Fresh database detected, will auto-populate from Tally');
    // Trigger continuous sync to populate
  } else {
    console.log('✅ Existing database found, checking data integrity');
    // Verify data integrity and run incremental sync if needed
  }
}
```

### **Step 3: Smart Migration Detection**
```javascript
// Enhanced continuous sync
async function checkDatabaseStatus() {
  const stats = await getDatabaseStats();
  
  if (stats.total_records < 1000) {
    console.log('🔄 Database appears incomplete, running full migration');
    return 'full_migration_needed';
  } else if (stats.total_records > 10000) {
    console.log('✅ Database appears complete, running incremental sync');
    return 'incremental_sync';
  } else {
    console.log('⚠️ Database partially populated, checking data integrity');
    return 'integrity_check_needed';
  }
}
```

## 🚀 **IMPLEMENTATION PRIORITY**

### **Immediate (Today):**
1. ✅ **Fix JavaScript bugs** (COMPLETED)
2. 🔄 **Add Railway volume mount** for persistence
3. 🔄 **Test deployment without data loss**

### **Short-term (This Week):**
1. 🔄 **Implement backup/restore system**
2. 🔄 **Add database integrity checks**
3. 🔄 **Optimize migration performance**

### **Long-term (Next Month):**
1. 🔄 **Migrate to Railway PostgreSQL**
2. 🔄 **Implement database clustering**
3. 🔄 **Add monitoring and alerting**

## 📊 **EXPECTED BENEFITS**

### **With Volume Mount:**
- ✅ **Zero data loss** on deployments
- ✅ **Instant deployments** (no re-migration)
- ✅ **Continuous operation** during deployments
- ✅ **Reliable Lovable.dev integration**

### **With PostgreSQL Migration:**
- ✅ **Enterprise-grade reliability**
- ✅ **Better performance** for large datasets
- ✅ **Concurrent access** support
- ✅ **Advanced querying** capabilities

## 🎯 **NEXT STEPS**

1. **Wait for current bug fix** to deploy (fixes "index is not defined")
2. **Verify migration completes** successfully
3. **Implement volume mount** to prevent future data loss
4. **Test deployment persistence**

The database persistence issue will be completely resolved with Railway volume mounts! 🚀

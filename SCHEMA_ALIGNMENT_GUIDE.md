# 🔧 SCHEMA ALIGNMENT GUIDE - Railway SQLite to Supabase

## 📋 **OVERVIEW**

This guide will help you align your Railway SQLite database schema with Supabase conventions to eliminate schema mismatches and simplify synchronization.

## 🎯 **OBJECTIVES**

1. **Rename Tables** - Align table names between Railway and Supabase
2. **Rename Columns** - Fix column name mismatches
3. **Update Indexes** - Recreate indexes with new table names
4. **Verify Changes** - Ensure data integrity after modifications

## 🚀 **STEP-BY-STEP EXECUTION**

### **Step 1: Connect to Railway SQLite Database**

#### **Option A: Using Railway CLI**
```bash
# Install Railway CLI if not already installed
npm install -g @railway/cli

# Login to Railway
railway login

# Connect to your project
railway link

# Connect to SQLite database
railway connect
```

#### **Option B: Using Railway Dashboard**
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select your project
3. Click on your SQLite service
4. Go to "Connect" tab
5. Copy the connection string or use the web terminal

#### **Option C: Using SQLite Browser**
1. Download SQLite Browser from [sqlitebrowser.org](https://sqlitebrowser.org/)
2. Use the connection details from Railway dashboard
3. Connect to the database file

### **Step 2: Backup Your Database (CRITICAL)**

```sql
-- Create a backup before making changes
.backup backup_before_schema_alignment.db
```

### **Step 3: Execute Schema Alignment Commands**

#### **3.1 Table Renaming**
Execute these commands one by one:

```sql
-- Rename main tables
ALTER TABLE vouchers RENAME TO tally_trn_voucher;
ALTER TABLE accounting_entries RENAME TO trn_accounting;
ALTER TABLE inventory_entries RENAME TO trn_inventory;
ALTER TABLE groups RENAME TO mst_group;
ALTER TABLE ledgers RENAME TO mst_ledger;
ALTER TABLE stock_items RENAME TO mst_stock_item;
ALTER TABLE voucher_types RENAME TO mst_vouchertype;
ALTER TABLE units RENAME TO mst_uom;
ALTER TABLE godowns RENAME TO mst_godown;
ALTER TABLE cost_centres RENAME TO mst_cost_centre;
```

#### **3.2 Column Renaming**
```sql
-- Fix column name mismatches
ALTER TABLE tally_trn_voucher RENAME COLUMN party_name TO party_ledger_name;
ALTER TABLE mst_uom RENAME COLUMN formalname TO formal_name;
ALTER TABLE trn_inventory RENAME COLUMN order_duedate TO order_due_date;
```

#### **3.3 Index Updates**
```sql
-- Drop old indexes
DROP INDEX IF EXISTS idx_groups_company_division;
DROP INDEX IF EXISTS idx_ledgers_company_division;
DROP INDEX IF EXISTS idx_stock_items_company_division;
DROP INDEX IF EXISTS idx_vouchers_company_division;
DROP INDEX IF EXISTS idx_vouchers_date;
DROP INDEX IF EXISTS idx_accounting_voucher_guid;
DROP INDEX IF EXISTS idx_accounting_voucher_number;
DROP INDEX IF EXISTS idx_inventory_voucher_guid;
DROP INDEX IF EXISTS idx_inventory_voucher_number;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_mst_group_company_division ON mst_group(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_mst_ledger_company_division ON mst_ledger(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_mst_stock_item_company_division ON mst_stock_item(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_tally_trn_voucher_company_division ON tally_trn_voucher(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_tally_trn_voucher_date ON tally_trn_voucher(date);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_company_division ON sync_metadata(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_trn_accounting_voucher_guid ON trn_accounting(voucher_guid);
CREATE INDEX IF NOT EXISTS idx_trn_accounting_voucher_number ON trn_accounting(voucher_number);
CREATE INDEX IF NOT EXISTS idx_trn_inventory_voucher_guid ON trn_inventory(voucher_guid);
CREATE INDEX IF NOT EXISTS idx_trn_inventory_voucher_number ON trn_inventory(voucher_number);
```

### **Step 4: Verification**

#### **4.1 Verify Table Renames**
```sql
-- Check that new tables exist
SELECT name FROM sqlite_master WHERE type='table' AND name='tally_trn_voucher';
SELECT name FROM sqlite_master WHERE type='table' AND name='trn_accounting';
SELECT name FROM sqlite_master WHERE type='table' AND name='trn_inventory';
SELECT name FROM sqlite_master WHERE type='table' AND name='mst_group';
SELECT name FROM sqlite_master WHERE type='table' AND name='mst_ledger';
SELECT name FROM sqlite_master WHERE type='table' AND name='mst_stock_item';
SELECT name FROM sqlite_master WHERE type='table' AND name='mst_vouchertype';
SELECT name FROM sqlite_master WHERE type='table' AND name='mst_uom';
SELECT name FROM sqlite_master WHERE type='table' AND name='mst_godown';
SELECT name FROM sqlite_master WHERE type='table' AND name='mst_cost_centre';
```

#### **4.2 Verify Column Renames**
```sql
-- Check column names
PRAGMA table_info(tally_trn_voucher);
PRAGMA table_info(mst_uom);
PRAGMA table_info(trn_inventory);
```

#### **4.3 Verify Data Integrity**
```sql
-- Check record counts
SELECT 'tally_trn_voucher' as table_name, COUNT(*) as record_count FROM tally_trn_voucher
UNION ALL
SELECT 'trn_accounting', COUNT(*) FROM trn_accounting
UNION ALL
SELECT 'trn_inventory', COUNT(*) FROM trn_inventory
UNION ALL
SELECT 'mst_group', COUNT(*) FROM mst_group
UNION ALL
SELECT 'mst_ledger', COUNT(*) FROM mst_ledger
UNION ALL
SELECT 'mst_stock_item', COUNT(*) FROM mst_stock_item
UNION ALL
SELECT 'mst_vouchertype', COUNT(*) FROM mst_vouchertype
UNION ALL
SELECT 'mst_uom', COUNT(*) FROM mst_uom
UNION ALL
SELECT 'mst_godown', COUNT(*) FROM mst_godown
UNION ALL
SELECT 'mst_cost_centre', COUNT(*) FROM mst_cost_centre;
```

### **Step 5: Update Railway Server Code**

After schema changes, update your `server.js` file to reflect the new table names:

```javascript
// Update table names in server.js
const masterTables = [
  { name: 'mst_group', collection: 'Group', nature: 'Primary' },
  { name: 'mst_ledger', collection: 'Ledger', nature: 'Primary' },
  { name: 'mst_stock_item', collection: 'StockItem', nature: 'Primary' },
  { name: 'mst_vouchertype', collection: 'VoucherType', nature: 'Primary' },
  { name: 'mst_uom', collection: 'Unit', nature: 'Primary' },
  { name: 'mst_godown', collection: 'Godown', nature: 'Primary' },
  { name: 'mst_cost_centre', collection: 'CostCentre', nature: 'Primary' }
];

const transactionTables = [
  { name: 'tally_trn_voucher', collection: 'Voucher', nature: 'Primary' },
  { name: 'trn_accounting', collection: 'Voucher.AllLedgerEntries', nature: 'Derived' },
  { name: 'trn_inventory', collection: 'Voucher.AllInventoryEntries', nature: 'Derived' }
];
```

## ⚠️ **IMPORTANT NOTES**

### **Before Starting:**
1. **Backup your database** - This is critical!
2. **Test in development** - Don't run on production first
3. **Stop sync processes** - Ensure no active syncs during changes
4. **Have rollback plan** - Know how to restore if something goes wrong

### **During Execution:**
1. **Execute commands one by one** - Don't run all at once
2. **Check for errors** - If any command fails, stop and investigate
3. **Verify after each step** - Ensure changes are applied correctly
4. **Monitor system** - Watch for any issues

### **After Completion:**
1. **Update application code** - Modify all references to old table names
2. **Test sync processes** - Ensure everything works with new schema
3. **Update documentation** - Reflect changes in your docs
4. **Monitor performance** - Check if indexes are working properly

## 🔄 **ROLLBACK PROCEDURE**

If something goes wrong:

```sql
-- Restore from backup
.restore backup_before_schema_alignment.db
```

Or manually reverse the changes:

```sql
-- Reverse table renames
ALTER TABLE tally_trn_voucher RENAME TO vouchers;
ALTER TABLE trn_accounting RENAME TO accounting_entries;
ALTER TABLE trn_inventory RENAME TO inventory_entries;
-- ... continue for all tables
```

## ✅ **SUCCESS CRITERIA**

After completing this process, you should have:

1. ✅ All tables renamed to match Supabase conventions
2. ✅ All column names aligned between Railway and Supabase
3. ✅ All indexes recreated with new table names
4. ✅ Data integrity maintained (same record counts)
5. ✅ Voucher relationships intact
6. ✅ No errors in verification queries

## 📞 **SUPPORT**

If you encounter any issues:

1. **Check error messages** - SQLite provides detailed error information
2. **Verify syntax** - Ensure all SQL commands are correct
3. **Check permissions** - Ensure you have write access to the database
4. **Restore from backup** - If needed, restore and try again

**Remember: Always backup before making schema changes!** 🛡️

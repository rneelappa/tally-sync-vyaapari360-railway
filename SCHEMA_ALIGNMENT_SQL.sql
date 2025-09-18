-- =====================================================
-- SCHEMA ALIGNMENT: Railway SQLite → Supabase PostgreSQL
-- =====================================================
-- This script aligns Railway SQLite schema with Supabase schema
-- Execute these commands on your Railway SQLite database

-- =====================================================
-- PART A: TABLE RENAMING
-- =====================================================

-- 1. Rename vouchers table to tally_trn_voucher
ALTER TABLE vouchers RENAME TO tally_trn_voucher;

-- 2. Rename accounting_entries table to trn_accounting  
ALTER TABLE accounting_entries RENAME TO trn_accounting;

-- 3. Rename inventory_entries table to trn_inventory
ALTER TABLE inventory_entries RENAME TO trn_inventory;

-- 4. Rename groups table to mst_group
ALTER TABLE groups RENAME TO mst_group;

-- 5. Rename ledgers table to mst_ledger
ALTER TABLE ledgers RENAME TO mst_ledger;

-- 6. Rename stock_items table to mst_stock_item
ALTER TABLE stock_items RENAME TO mst_stock_item;

-- 7. Rename voucher_types table to mst_vouchertype
ALTER TABLE voucher_types RENAME TO mst_vouchertype;

-- 8. Rename units table to mst_uom
ALTER TABLE units RENAME TO mst_uom;

-- 9. Rename godowns table to mst_godown
ALTER TABLE godowns RENAME TO mst_godown;

-- 10. Rename cost_centres table to mst_cost_centre
ALTER TABLE cost_centres RENAME TO mst_cost_centre;

-- =====================================================
-- PART B: COLUMN RENAMING
-- =====================================================

-- 1. Rename party_name to party_ledger_name in tally_trn_voucher
ALTER TABLE tally_trn_voucher RENAME COLUMN party_name TO party_ledger_name;

-- 2. Rename formalname to formal_name in mst_uom
ALTER TABLE mst_uom RENAME COLUMN formalname TO formal_name;

-- 3. Rename order_duedate to order_due_date in trn_inventory
ALTER TABLE trn_inventory RENAME COLUMN order_duedate TO order_due_date;

-- =====================================================
-- PART C: DATA TYPE ALIGNMENT
-- =====================================================

-- Note: SQLite doesn't support ALTER COLUMN for type changes
-- We'll need to recreate tables with proper types
-- This is a complex operation that requires careful data migration

-- =====================================================
-- PART D: INDEX UPDATES
-- =====================================================

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

-- Create new indexes with aligned table names
CREATE INDEX IF NOT EXISTS idx_mst_group_company_division ON mst_group(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_mst_ledger_company_division ON mst_ledger(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_mst_stock_item_company_division ON mst_stock_item(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_tally_trn_voucher_company_division ON tally_trn_voucher(company_id, division_id);
CREATE INDEX IF NOT EXISTS idx_tally_trn_voucher_date ON tally_trn_voucher(date);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_company_division ON sync_metadata(company_id, division_id);

-- Create indexes for voucher relationships with new table names
CREATE INDEX IF NOT EXISTS idx_trn_accounting_voucher_guid ON trn_accounting(voucher_guid);
CREATE INDEX IF NOT EXISTS idx_trn_accounting_voucher_number ON trn_accounting(voucher_number);
CREATE INDEX IF NOT EXISTS idx_trn_inventory_voucher_guid ON trn_inventory(voucher_guid);
CREATE INDEX IF NOT EXISTS idx_trn_inventory_voucher_number ON trn_inventory(voucher_number);

-- =====================================================
-- PART E: VERIFICATION QUERIES
-- =====================================================

-- Verify table renames
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

-- Verify column renames
PRAGMA table_info(tally_trn_voucher);
PRAGMA table_info(mst_uom);
PRAGMA table_info(trn_inventory);

-- Verify indexes
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';

-- =====================================================
-- PART F: DATA INTEGRITY CHECKS
-- =====================================================

-- Check record counts after rename
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

-- Check voucher relationships
SELECT 
    'Voucher Relationships Check' as check_type,
    COUNT(*) as total_vouchers,
    COUNT(CASE WHEN voucher_guid IS NOT NULL THEN 1 END) as vouchers_with_guid,
    COUNT(CASE WHEN voucher_number IS NOT NULL THEN 1 END) as vouchers_with_number
FROM tally_trn_voucher;

-- Check accounting entries relationships
SELECT 
    'Accounting Relationships Check' as check_type,
    COUNT(*) as total_entries,
    COUNT(CASE WHEN voucher_guid IS NOT NULL THEN 1 END) as entries_with_voucher_guid,
    COUNT(CASE WHEN voucher_number IS NOT NULL THEN 1 END) as entries_with_voucher_number
FROM trn_accounting;

-- Check inventory entries relationships
SELECT 
    'Inventory Relationships Check' as check_type,
    COUNT(*) as total_entries,
    COUNT(CASE WHEN voucher_guid IS NOT NULL THEN 1 END) as entries_with_voucher_guid,
    COUNT(CASE WHEN voucher_number IS NOT NULL THEN 1 END) as entries_with_voucher_number
FROM trn_inventory;

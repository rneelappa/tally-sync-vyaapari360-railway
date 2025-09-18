-- SQL Queries to retrieve SALES Voucher 2800237/25-26 data from Railway SQLite
-- This matches the Tally screenshot showing MABEL ENGINEERS PVT LTD transaction

-- 1. Main Voucher Details
SELECT 
    v.voucher_number,
    v.voucher_type,
    v.date,
    v.party_ledger_name,
    v.amount,
    v.reference,
    v.reference_date,
    v.place_of_supply,
    v.narration,
    v.is_invoice,
    v.company_id,
    v.division_id,
    v.sync_timestamp
FROM vouchers v
WHERE v.company_id = '629f49fb-983e-4141-8c48-e1423b39e921'
  AND v.division_id = '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
  AND v.voucher_number LIKE '%2800237%'
  AND v.party_ledger_name LIKE '%MABEL%';

-- 2. Accounting Entries for this Voucher (Dr/Cr breakdown)
SELECT 
    a.ledger_name,
    a.amount,
    CASE 
        WHEN a.amount > 0 THEN 'Credit'
        WHEN a.amount < 0 THEN 'Debit'
        ELSE 'Zero'
    END as entry_type,
    a.is_party_ledger,
    v.voucher_number,
    v.date
FROM accounting_entries a
JOIN vouchers v ON a.voucher_guid = v.guid
WHERE v.company_id = '629f49fb-983e-4141-8c48-e1423b39e921'
  AND v.division_id = '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
  AND v.voucher_number LIKE '%2800237%'
  AND v.party_ledger_name LIKE '%MABEL%'
ORDER BY ABS(a.amount) DESC;

-- 3. Inventory Details for this Voucher (JINDAL-A item details)
SELECT 
    i.stock_item_name,
    i.quantity,
    i.rate,
    i.amount,
    i.godown,
    v.voucher_number,
    v.date,
    v.party_ledger_name
FROM inventory_entries i
JOIN vouchers v ON i.voucher_guid = v.guid
WHERE v.company_id = '629f49fb-983e-4141-8c48-e1423b39e921'
  AND v.division_id = '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
  AND v.voucher_number LIKE '%2800237%'
  AND v.party_ledger_name LIKE '%MABEL%'
ORDER BY i.amount DESC;

-- 4. Party Account Details (MABEL ENGINEERS PVT LTD.)
SELECT 
    l.name as party_name,
    l.parent as account_group,
    l.opening_balance,
    l.closing_balance,
    l.mailing_name,
    l.mailing_address,
    l.mailing_state,
    l.gstn,
    l.email,
    l.it_pan
FROM ledgers l
WHERE l.company_id = '629f49fb-983e-4141-8c48-e1423b39e921'
  AND l.division_id = '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
  AND l.name LIKE '%MABEL%';

-- 5. Stock Item Master Data (JINDAL-A details)
SELECT 
    s.name as stock_item_name,
    s.description,
    s.base_units,
    s.opening_balance,
    s.opening_rate,
    s.opening_value,
    s.closing_balance,
    s.closing_rate,
    s.closing_value,
    s.gst_hsn_code,
    s.gst_taxability
FROM stock_items s
WHERE s.company_id = '629f49fb-983e-4141-8c48-e1423b39e921'
  AND s.division_id = '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
  AND UPPER(s.name) LIKE '%JINDAL%';

-- 6. Complete Voucher with All Related Data (Comprehensive View)
SELECT 
    -- Voucher Details
    v.voucher_number,
    v.voucher_type,
    v.date,
    v.party_ledger_name,
    v.amount as voucher_amount,
    
    -- Accounting Breakdown
    GROUP_CONCAT(DISTINCT a.ledger_name || ': ₹' || a.amount) as accounting_entries,
    
    -- Inventory Details
    GROUP_CONCAT(DISTINCT i.stock_item_name || ' (' || i.quantity || ' @ ₹' || i.rate || ')') as inventory_items,
    
    -- Counts
    COUNT(DISTINCT a.id) as accounting_entry_count,
    COUNT(DISTINCT i.id) as inventory_entry_count,
    
    -- Totals
    SUM(DISTINCT a.amount) as total_accounting_amount,
    SUM(DISTINCT i.amount) as total_inventory_value

FROM vouchers v
LEFT JOIN accounting_entries a ON v.guid = a.voucher_guid
LEFT JOIN inventory_entries i ON v.guid = i.voucher_guid
WHERE v.company_id = '629f49fb-983e-4141-8c48-e1423b39e921'
  AND v.division_id = '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
  AND v.voucher_number LIKE '%2800237%'
  AND v.party_ledger_name LIKE '%MABEL%'
GROUP BY v.guid, v.voucher_number, v.voucher_type, v.date, v.party_ledger_name, v.amount;

-- 7. GST Entries for this Voucher (INPUT CGST, INPUT SGST)
SELECT 
    a.ledger_name,
    a.amount,
    v.voucher_number,
    CASE 
        WHEN a.ledger_name LIKE '%CGST%' THEN 'Central GST'
        WHEN a.ledger_name LIKE '%SGST%' THEN 'State GST'
        WHEN a.ledger_name LIKE '%IGST%' THEN 'Integrated GST'
        ELSE 'Other Tax'
    END as gst_type
FROM accounting_entries a
JOIN vouchers v ON a.voucher_guid = v.guid
WHERE v.company_id = '629f49fb-983e-4141-8c48-e1423b39e921'
  AND v.division_id = '37f3cc0c-58ad-4baf-b309-360116ffc3cd'
  AND v.voucher_number LIKE '%2800237%'
  AND (a.ledger_name LIKE '%GST%' OR a.ledger_name LIKE '%CGST%' OR a.ledger_name LIKE '%SGST%')
ORDER BY a.amount DESC;

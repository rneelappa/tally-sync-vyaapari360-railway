#!/usr/bin/env node

/**
 * Review Dispatch and Inventory Details
 * Specifically checks complex voucher data like the SALES voucher example
 */

const axios = require('axios');
const config = JSON.parse(require('fs').readFileSync('./windows-client-config.json', 'utf8'));

class DispatchInventoryReviewer {
  constructor() {
    this.config = config;
    this.railwayAPI = config.railway.api_base;
    this.companyId = config.company.id;
    this.divisionId = config.company.division_id;
  }

  async review() {
    console.log('🚚 DISPATCH & INVENTORY DETAILS REVIEW');
    console.log('=======================================\n');
    
    console.log(`🏢 Company: ${this.config.company.name}`);
    console.log(`📋 Reviewing voucher like: SALES 2800237/25-26 with MABEL ENGINEERS PVT LTD.\n`);
    
    try {
      // Step 1: Check if SALES vouchers exist
      await this.checkSalesVouchers();
      
      // Step 2: Check party account details
      await this.checkPartyAccountDetails();
      
      // Step 3: Check dispatch details
      await this.checkDispatchDetails();
      
      // Step 4: Check inventory details
      await this.checkInventoryDetails();
      
      // Step 5: Check GST/Tax details
      await this.checkGSTDetails();
      
      // Step 6: Check complete voucher linkage
      await this.checkCompleteVoucherLinkage();
      
      console.log('\n🎉 Dispatch & Inventory review completed!');
      
    } catch (error) {
      console.error('❌ Review failed:', error.message);
    }
  }

  async checkSalesVouchers() {
    console.log('📊 SALES VOUCHERS CHECK');
    console.log('=======================');
    
    try {
      const salesQuery = {
        sql: `SELECT 
                COUNT(*) as total_sales_vouchers,
                MIN(date) as earliest_date,
                MAX(date) as latest_date,
                SUM(amount) as total_sales_amount
              FROM vouchers 
              WHERE company_id = ? AND division_id = ? 
                AND UPPER(voucher_type) LIKE '%SALES%'`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        salesQuery
      );
      
      if (response.data.success) {
        const stats = response.data.data.results[0];
        console.log(`📊 Total SALES Vouchers: ${stats.total_sales_vouchers}`);
        console.log(`📅 Date Range: ${stats.earliest_date} to ${stats.latest_date}`);
        console.log(`💰 Total Sales Amount: ${stats.total_sales_amount}`);
        
        // Get sample SALES vouchers
        const sampleQuery = {
          sql: `SELECT voucher_number, voucher_type, date, party_ledger_name, amount, narration
                FROM vouchers 
                WHERE company_id = ? AND division_id = ? 
                  AND UPPER(voucher_type) LIKE '%SALES%'
                ORDER BY date DESC 
                LIMIT 5`,
          params: [this.companyId, this.divisionId]
        };
        
        const sampleResponse = await axios.post(
          `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
          sampleQuery
        );
        
        if (sampleResponse.data.success && sampleResponse.data.data.results.length > 0) {
          console.log('\n📋 Sample SALES Vouchers:');
          sampleResponse.data.data.results.forEach(voucher => {
            console.log(`   • ${voucher.voucher_number}: ${voucher.party_ledger_name} - ₹${voucher.amount}`);
          });
        }
      }
    } catch (error) {
      console.log('❌ Could not check SALES vouchers:', error.message);
    }
    
    console.log();
  }

  async checkPartyAccountDetails() {
    console.log('🏢 PARTY ACCOUNT DETAILS CHECK');
    console.log('==============================');
    
    try {
      // Check if MABEL ENGINEERS exists in ledgers
      const partyQuery = {
        sql: `SELECT name, parent, mailing_name, mailing_address, gstn, email
              FROM ledgers 
              WHERE company_id = ? AND division_id = ? 
                AND UPPER(name) LIKE '%MABEL%'`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        partyQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        console.log('✅ MABEL ENGINEERS found in ledgers:');
        response.data.data.results.forEach(ledger => {
          console.log(`   • Name: ${ledger.name}`);
          console.log(`   • Parent Group: ${ledger.parent}`);
          console.log(`   • Mailing Name: ${ledger.mailing_name}`);
          console.log(`   • Address: ${ledger.mailing_address}`);
          console.log(`   • GSTN: ${ledger.gstn}`);
        });
      } else {
        console.log('⚠️  MABEL ENGINEERS not found in ledgers');
      }
      
      // Check party usage in vouchers
      const usageQuery = {
        sql: `SELECT 
                party_ledger_name,
                COUNT(*) as voucher_count,
                SUM(amount) as total_amount
              FROM vouchers 
              WHERE company_id = ? AND division_id = ? 
                AND UPPER(party_ledger_name) LIKE '%MABEL%'
              GROUP BY party_ledger_name`,
        params: [this.companyId, this.divisionId]
      };
      
      const usageResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        usageQuery
      );
      
      if (usageResponse.data.success && usageResponse.data.data.results.length > 0) {
        console.log('\n📊 MABEL ENGINEERS Voucher Usage:');
        usageResponse.data.data.results.forEach(row => {
          console.log(`   • ${row.party_ledger_name}: ${row.voucher_count} vouchers, ₹${row.total_amount}`);
        });
      }
      
    } catch (error) {
      console.log('❌ Could not check party account details:', error.message);
    }
    
    console.log();
  }

  async checkDispatchDetails() {
    console.log('🚚 DISPATCH DETAILS CHECK');
    console.log('=========================');
    
    try {
      // Check if dispatch details are captured in vouchers
      const dispatchQuery = {
        sql: `SELECT 
                voucher_number,
                voucher_type,
                party_ledger_name,
                place_of_supply,
                reference,
                reference_date,
                narration
              FROM vouchers 
              WHERE company_id = ? AND division_id = ? 
                AND (reference IS NOT NULL OR place_of_supply IS NOT NULL OR narration IS NOT NULL)
              ORDER BY date DESC 
              LIMIT 10`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        dispatchQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        console.log('📋 Sample Vouchers with Dispatch Details:');
        response.data.data.results.forEach(voucher => {
          console.log(`   📄 ${voucher.voucher_number} (${voucher.voucher_type}):`);
          console.log(`      Party: ${voucher.party_ledger_name}`);
          console.log(`      Place of Supply: ${voucher.place_of_supply || 'Not specified'}`);
          console.log(`      Reference: ${voucher.reference || 'Not specified'}`);
          console.log(`      Narration: ${voucher.narration?.substring(0, 100) || 'Not specified'}...`);
          console.log();
        });
      } else {
        console.log('⚠️  No vouchers with dispatch details found');
      }
      
      // Check if we have bills table for dispatch details
      const billsQuery = {
        sql: `SELECT COUNT(*) as count FROM bills 
              WHERE company_id = ? AND division_id = ?`,
        params: [this.companyId, this.divisionId]
      };
      
      const billsResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        billsQuery
      );
      
      if (billsResponse.data.success) {
        const billCount = billsResponse.data.data.results[0].count;
        console.log(`📋 Bills/Dispatch Records: ${billCount}`);
      }
      
    } catch (error) {
      console.log('❌ Could not check dispatch details:', error.message);
    }
    
    console.log();
  }

  async checkInventoryDetails() {
    console.log('📦 INVENTORY DETAILS CHECK');
    console.log('==========================');
    
    try {
      // Check for JINDAL-A stock item (from the example)
      const stockQuery = {
        sql: `SELECT name, description, base_units, opening_balance, closing_balance
              FROM stock_items 
              WHERE company_id = ? AND division_id = ? 
                AND UPPER(name) LIKE '%JINDAL%'`,
        params: [this.companyId, this.divisionId]
      };
      
      const stockResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        stockQuery
      );
      
      if (stockResponse.data.success && stockResponse.data.data.results.length > 0) {
        console.log('✅ JINDAL stock items found:');
        stockResponse.data.data.results.forEach(item => {
          console.log(`   • ${item.name}`);
          console.log(`     Description: ${item.description || 'Not specified'}`);
          console.log(`     Base Units: ${item.base_units}`);
          console.log(`     Opening Balance: ${item.opening_balance}`);
          console.log(`     Closing Balance: ${item.closing_balance}`);
        });
      } else {
        console.log('⚠️  JINDAL stock items not found in master data');
      }
      
      // Check inventory movements for JINDAL items
      const movementQuery = {
        sql: `SELECT 
                i.stock_item_name,
                i.quantity,
                i.rate,
                i.amount,
                i.godown,
                v.voucher_number,
                v.voucher_type,
                v.date,
                v.party_ledger_name
              FROM inventory_entries i
              JOIN vouchers v ON i.voucher_guid = v.guid
              WHERE i.company_id = ? AND i.division_id = ? 
                AND UPPER(i.stock_item_name) LIKE '%JINDAL%'
              ORDER BY v.date DESC 
              LIMIT 10`,
        params: [this.companyId, this.divisionId]
      };
      
      const movementResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        movementQuery
      );
      
      if (movementResponse.data.success && movementResponse.data.data.results.length > 0) {
        console.log('\n📦 JINDAL Inventory Movements:');
        movementResponse.data.data.results.forEach(movement => {
          console.log(`   📄 ${movement.voucher_number} (${movement.date}):`);
          console.log(`      Item: ${movement.stock_item_name}`);
          console.log(`      Quantity: ${movement.quantity} @ ${movement.rate} = ₹${movement.amount}`);
          console.log(`      Godown: ${movement.godown || 'Not specified'}`);
          console.log(`      Party: ${movement.party_ledger_name}`);
          console.log();
        });
      } else {
        console.log('⚠️  No JINDAL inventory movements found');
      }
      
    } catch (error) {
      console.log('❌ Could not check inventory details:', error.message);
    }
  }

  async checkGSTDetails() {
    console.log('💳 GST/TAX DETAILS CHECK');
    console.log('========================');
    
    try {
      // Check for GST-related ledgers
      const gstQuery = {
        sql: `SELECT name, parent, gst_registration_type, gstn, tax_rate
              FROM ledgers 
              WHERE company_id = ? AND division_id = ? 
                AND (UPPER(name) LIKE '%GST%' OR UPPER(name) LIKE '%CGST%' OR UPPER(name) LIKE '%SGST%')
              ORDER BY name`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        gstQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        console.log('✅ GST Ledgers found:');
        response.data.data.results.forEach(ledger => {
          console.log(`   • ${ledger.name} (Rate: ${ledger.tax_rate}%)`);
        });
      } else {
        console.log('⚠️  No GST ledgers found');
      }
      
      // Check GST entries in accounting
      const gstAccountingQuery = {
        sql: `SELECT 
                a.ledger_name,
                COUNT(*) as usage_count,
                SUM(a.amount) as total_gst_amount
              FROM accounting_entries a
              WHERE a.company_id = ? AND a.division_id = ? 
                AND (UPPER(a.ledger_name) LIKE '%GST%' OR UPPER(a.ledger_name) LIKE '%CGST%' OR UPPER(a.ledger_name) LIKE '%SGST%')
              GROUP BY a.ledger_name
              ORDER BY usage_count DESC`,
        params: [this.companyId, this.divisionId]
      };
      
      const gstAccountingResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        gstAccountingQuery
      );
      
      if (gstAccountingResponse.data.success && gstAccountingResponse.data.data.results.length > 0) {
        console.log('\n💰 GST Accounting Entries:');
        gstAccountingResponse.data.data.results.forEach(row => {
          console.log(`   • ${row.ledger_name}: ${row.usage_count} entries, ₹${row.total_gst_amount}`);
        });
      }
      
    } catch (error) {
      console.log('❌ Could not check GST details:', error.message);
    }
    
    console.log();
  }

  async checkCompleteVoucherLinkage() {
    console.log('🔗 COMPLETE VOUCHER LINKAGE ANALYSIS');
    console.log('====================================');
    
    try {
      // Find a complex voucher (like the SALES example) and trace all its linkages
      const complexVoucherQuery = {
        sql: `SELECT 
                v.guid,
                v.voucher_number,
                v.voucher_type,
                v.date,
                v.party_ledger_name,
                v.amount,
                v.narration,
                COUNT(DISTINCT a.id) as accounting_entries,
                COUNT(DISTINCT i.id) as inventory_entries,
                SUM(a.amount) as total_accounting,
                SUM(i.amount) as total_inventory_value
              FROM vouchers v
              LEFT JOIN accounting_entries a ON v.guid = a.voucher_guid
              LEFT JOIN inventory_entries i ON v.guid = i.voucher_guid
              WHERE v.company_id = ? AND v.division_id = ?
                AND v.amount > 1000
              GROUP BY v.guid, v.voucher_number, v.voucher_type, v.date, v.party_ledger_name, v.amount, v.narration
              HAVING COUNT(DISTINCT a.id) > 2 OR COUNT(DISTINCT i.id) > 0
              ORDER BY v.amount DESC
              LIMIT 5`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        complexVoucherQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        console.log('📋 Complex Vouchers with Full Linkages:');
        
        for (const voucher of response.data.data.results) {
          console.log(`\n🎯 VOUCHER: ${voucher.voucher_number} (${voucher.voucher_type})`);
          console.log(`   📅 Date: ${voucher.date}`);
          console.log(`   🏢 Party: ${voucher.party_ledger_name}`);
          console.log(`   💰 Amount: ₹${voucher.amount}`);
          console.log(`   📊 Accounting Entries: ${voucher.accounting_entries}`);
          console.log(`   📦 Inventory Entries: ${voucher.inventory_entries}`);
          console.log(`   💰 Accounting Total: ₹${voucher.total_accounting}`);
          console.log(`   📦 Inventory Value: ₹${voucher.total_inventory_value}`);
          
          // Get detailed breakdown for this voucher
          await this.getVoucherBreakdown(voucher.guid);
        }
      } else {
        console.log('⚠️  No complex vouchers found with full linkages');
      }
      
    } catch (error) {
      console.log('❌ Could not check complete voucher linkage:', error.message);
    }
  }

  async getVoucherBreakdown(voucherGuid) {
    try {
      // Get accounting breakdown
      const accountingQuery = {
        sql: `SELECT ledger_name, amount 
              FROM accounting_entries 
              WHERE voucher_guid = ? AND company_id = ? AND division_id = ?
              ORDER BY ABS(amount) DESC`,
        params: [voucherGuid, this.companyId, this.divisionId]
      };
      
      const accountingResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        accountingQuery
      );
      
      if (accountingResponse.data.success && accountingResponse.data.data.results.length > 0) {
        console.log('     💰 Accounting Breakdown:');
        accountingResponse.data.data.results.forEach(entry => {
          console.log(`        • ${entry.ledger_name}: ₹${entry.amount}`);
        });
      }
      
      // Get inventory breakdown
      const inventoryQuery = {
        sql: `SELECT stock_item_name, quantity, rate, amount, godown 
              FROM inventory_entries 
              WHERE voucher_guid = ? AND company_id = ? AND division_id = ?
              ORDER BY ABS(amount) DESC`,
        params: [voucherGuid, this.companyId, this.divisionId]
      };
      
      const inventoryResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        inventoryQuery
      );
      
      if (inventoryResponse.data.success && inventoryResponse.data.data.results.length > 0) {
        console.log('     📦 Inventory Breakdown:');
        inventoryResponse.data.data.results.forEach(entry => {
          console.log(`        • ${entry.stock_item_name}: ${entry.quantity} @ ₹${entry.rate} = ₹${entry.amount}`);
          if (entry.godown) {
            console.log(`          Godown: ${entry.godown}`);
          }
        });
      }
      
    } catch (error) {
      console.log('     ❌ Could not get voucher breakdown');
    }
  }

  async checkDispatchDetails() {
    console.log('🚚 DISPATCH DETAILS CHECK');
    console.log('=========================');
    
    try {
      // Check if dispatch-related fields are captured
      const dispatchFieldsQuery = {
        sql: `SELECT 
                COUNT(*) as total_vouchers,
                COUNT(CASE WHEN reference IS NOT NULL AND reference != '' THEN 1 END) as has_reference,
                COUNT(CASE WHEN place_of_supply IS NOT NULL AND place_of_supply != '' THEN 1 END) as has_place_of_supply,
                COUNT(CASE WHEN narration IS NOT NULL AND narration != '' THEN 1 END) as has_narration
              FROM vouchers 
              WHERE company_id = ? AND division_id = ?`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        dispatchFieldsQuery
      );
      
      if (response.data.success) {
        const stats = response.data.data.results[0];
        console.log(`📊 Dispatch Field Coverage:`);
        console.log(`   📄 Total Vouchers: ${stats.total_vouchers}`);
        console.log(`   📋 With Reference: ${stats.has_reference} (${((stats.has_reference/stats.total_vouchers)*100).toFixed(1)}%)`);
        console.log(`   🌍 With Place of Supply: ${stats.has_place_of_supply} (${((stats.has_place_of_supply/stats.total_vouchers)*100).toFixed(1)}%)`);
        console.log(`   📝 With Narration: ${stats.has_narration} (${((stats.has_narration/stats.total_vouchers)*100).toFixed(1)}%)`);
      }
      
    } catch (error) {
      console.log('❌ Could not check dispatch field coverage:', error.message);
    }
  }
}

// Run review
const reviewer = new DispatchInventoryReviewer();
reviewer.review();

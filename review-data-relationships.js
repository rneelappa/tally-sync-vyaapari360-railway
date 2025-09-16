#!/usr/bin/env node

/**
 * Review Data Relationships
 * Comprehensive review of voucher data and all related linkages
 */

const axios = require('axios');
const config = JSON.parse(require('fs').readFileSync('./windows-client-config.json', 'utf8'));

class DataRelationshipReviewer {
  constructor() {
    this.config = config;
    this.railwayAPI = config.railway.api_base;
    this.companyId = config.company.id;
    this.divisionId = config.company.division_id;
  }

  async review() {
    console.log('🔍 COMPREHENSIVE DATA RELATIONSHIP REVIEW');
    console.log('==========================================\n');
    
    console.log(`🏢 Company: ${this.config.company.name}`);
    console.log(`🆔 Company ID: ${this.companyId}`);
    console.log(`🏭 Division: ${this.config.company.division_name}`);
    console.log(`🆔 Division ID: ${this.divisionId}\n`);
    
    try {
      // Step 1: Get overall statistics
      await this.getOverallStatistics();
      
      // Step 2: Review voucher data structure
      await this.reviewVoucherStructure();
      
      // Step 3: Check accounting linkages
      await this.checkAccountingLinkages();
      
      // Step 4: Check inventory linkages
      await this.checkInventoryLinkages();
      
      // Step 5: Check master data linkages
      await this.checkMasterDataLinkages();
      
      // Step 6: Verify data integrity
      await this.verifyDataIntegrity();
      
      console.log('\n🎉 Data relationship review completed!');
      
    } catch (error) {
      console.error('❌ Review failed:', error.message);
    }
  }

  async getOverallStatistics() {
    console.log('📊 OVERALL STATISTICS');
    console.log('=====================');
    
    try {
      const response = await axios.get(
        `${this.railwayAPI}/api/v1/stats/${this.companyId}/${this.divisionId}`
      );
      
      if (response.data.success) {
        const stats = response.data.data;
        console.log(`📈 Total Records in Railway SQLite: ${stats.total_records}\n`);
        
        console.log('📋 Table Breakdown:');
        Object.entries(stats.table_counts).forEach(([table, count]) => {
          if (count > 0) {
            console.log(`   • ${table}: ${count} records`);
          }
        });
        
        return stats;
      }
    } catch (error) {
      console.log('❌ Could not fetch statistics:', error.message);
      return null;
    }
    
    console.log();
  }

  async reviewVoucherStructure() {
    console.log('\n💼 VOUCHER DATA STRUCTURE REVIEW');
    console.log('=================================');
    
    try {
      // Get sample vouchers to analyze structure
      const voucherQuery = {
        sql: `SELECT * FROM vouchers 
              WHERE company_id = ? AND division_id = ? 
              ORDER BY date DESC 
              LIMIT 5`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        voucherQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        const vouchers = response.data.data.results;
        console.log(`📊 Found ${response.data.data.count} vouchers in database`);
        
        console.log('\n📋 Sample Voucher Structure:');
        const sampleVoucher = vouchers[0];
        Object.keys(sampleVoucher).forEach(key => {
          console.log(`   • ${key}: ${typeof sampleVoucher[key]} = "${sampleVoucher[key]}"`);
        });
        
        console.log('\n📊 Voucher Types Distribution:');
        const voucherTypesQuery = {
          sql: `SELECT voucher_type, COUNT(*) as count 
                FROM vouchers 
                WHERE company_id = ? AND division_id = ? 
                GROUP BY voucher_type 
                ORDER BY count DESC`,
          params: [this.companyId, this.divisionId]
        };
        
        const typesResponse = await axios.post(
          `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
          voucherTypesQuery
        );
        
        if (typesResponse.data.success) {
          typesResponse.data.data.results.forEach(row => {
            console.log(`   • ${row.voucher_type}: ${row.count} vouchers`);
          });
        }
        
        return vouchers;
      } else {
        console.log('⚠️  No vouchers found in database');
        return [];
      }
    } catch (error) {
      console.log('❌ Could not review voucher structure:', error.message);
      return [];
    }
  }

  async checkAccountingLinkages() {
    console.log('\n💰 ACCOUNTING LINKAGES REVIEW');
    console.log('==============================');
    
    try {
      // Check if accounting entries are linked to vouchers
      const accountingQuery = {
        sql: `SELECT 
                COUNT(*) as total_entries,
                COUNT(DISTINCT voucher_guid) as linked_vouchers,
                COUNT(DISTINCT ledger_name) as unique_ledgers
              FROM accounting_entries 
              WHERE company_id = ? AND division_id = ?`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        accountingQuery
      );
      
      if (response.data.success) {
        const stats = response.data.data.results[0];
        console.log(`📊 Accounting Entries: ${stats.total_entries}`);
        console.log(`🔗 Linked to Vouchers: ${stats.linked_vouchers}`);
        console.log(`📋 Unique Ledgers: ${stats.unique_ledgers}`);
        
        // Check linkage integrity
        const linkageQuery = {
          sql: `SELECT 
                  v.voucher_number,
                  v.voucher_type,
                  v.date,
                  COUNT(a.id) as accounting_entries
                FROM vouchers v
                LEFT JOIN accounting_entries a ON v.guid = a.voucher_guid
                WHERE v.company_id = ? AND v.division_id = ?
                GROUP BY v.guid, v.voucher_number, v.voucher_type, v.date
                ORDER BY v.date DESC
                LIMIT 10`,
          params: [this.companyId, this.divisionId]
        };
        
        const linkageResponse = await axios.post(
          `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
          linkageQuery
        );
        
        if (linkageResponse.data.success) {
          console.log('\n📋 Sample Voucher-Accounting Linkages:');
          linkageResponse.data.data.results.forEach(row => {
            console.log(`   • ${row.voucher_number} (${row.voucher_type}): ${row.accounting_entries} entries`);
          });
        }
      }
    } catch (error) {
      console.log('❌ Could not check accounting linkages:', error.message);
    }
  }

  async checkInventoryLinkages() {
    console.log('\n📦 INVENTORY LINKAGES REVIEW');
    console.log('=============================');
    
    try {
      // Check inventory entries linkage
      const inventoryQuery = {
        sql: `SELECT 
                COUNT(*) as total_entries,
                COUNT(DISTINCT voucher_guid) as linked_vouchers,
                COUNT(DISTINCT stock_item_name) as unique_items
              FROM inventory_entries 
              WHERE company_id = ? AND division_id = ?`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        inventoryQuery
      );
      
      if (response.data.success) {
        const stats = response.data.data.results[0];
        console.log(`📊 Inventory Entries: ${stats.total_entries}`);
        console.log(`🔗 Linked to Vouchers: ${stats.linked_vouchers}`);
        console.log(`📋 Unique Stock Items: ${stats.unique_items}`);
        
        // Check inventory-voucher linkages
        const linkageQuery = {
          sql: `SELECT 
                  v.voucher_number,
                  v.voucher_type,
                  COUNT(i.id) as inventory_entries,
                  SUM(i.quantity) as total_quantity
                FROM vouchers v
                LEFT JOIN inventory_entries i ON v.guid = i.voucher_guid
                WHERE v.company_id = ? AND v.division_id = ?
                  AND i.id IS NOT NULL
                GROUP BY v.guid, v.voucher_number, v.voucher_type
                ORDER BY total_quantity DESC
                LIMIT 10`,
          params: [this.companyId, this.divisionId]
        };
        
        const linkageResponse = await axios.post(
          `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
          linkageQuery
        );
        
        if (linkageResponse.data.success && linkageResponse.data.data.results.length > 0) {
          console.log('\n📋 Sample Voucher-Inventory Linkages:');
          linkageResponse.data.data.results.forEach(row => {
            console.log(`   • ${row.voucher_number} (${row.voucher_type}): ${row.inventory_entries} items, Qty: ${row.total_quantity}`);
          });
        } else {
          console.log('\n⚠️  No inventory-voucher linkages found');
        }
      }
    } catch (error) {
      console.log('❌ Could not check inventory linkages:', error.message);
    }
  }

  async checkMasterDataLinkages() {
    console.log('\n📚 MASTER DATA LINKAGES REVIEW');
    console.log('===============================');
    
    try {
      // Check ledger-group relationships
      const ledgerGroupQuery = {
        sql: `SELECT 
                l.name as ledger_name,
                l.parent as parent_group,
                g.name as group_name
              FROM ledgers l
              LEFT JOIN groups g ON l.parent = g.name
              WHERE l.company_id = ? AND l.division_id = ?
                AND l.parent IS NOT NULL
              LIMIT 10`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        ledgerGroupQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        console.log('📋 Sample Ledger-Group Relationships:');
        response.data.data.results.forEach(row => {
          const status = row.group_name ? '✅' : '⚠️';
          console.log(`   ${status} ${row.ledger_name} → ${row.parent_group} ${row.group_name ? '(found)' : '(not found)'}`);
        });
      }
      
      // Check stock item relationships
      const stockQuery = {
        sql: `SELECT COUNT(*) as count FROM stock_items 
              WHERE company_id = ? AND division_id = ?`,
        params: [this.companyId, this.divisionId]
      };
      
      const stockResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        stockQuery
      );
      
      if (stockResponse.data.success) {
        const stockCount = stockResponse.data.data.results[0].count;
        console.log(`📦 Stock Items Available: ${stockCount}`);
      }
      
    } catch (error) {
      console.log('❌ Could not check master data linkages:', error.message);
    }
  }

  async verifyDataIntegrity() {
    console.log('\n🔍 DATA INTEGRITY VERIFICATION');
    console.log('===============================');
    
    try {
      // Check for orphaned records
      const orphanedQuery = {
        sql: `SELECT 
                'accounting_entries' as table_name,
                COUNT(*) as orphaned_count
              FROM accounting_entries a
              LEFT JOIN vouchers v ON a.voucher_guid = v.guid
              WHERE a.company_id = ? AND a.division_id = ?
                AND v.guid IS NULL
              UNION ALL
              SELECT 
                'inventory_entries' as table_name,
                COUNT(*) as orphaned_count
              FROM inventory_entries i
              LEFT JOIN vouchers v ON i.voucher_guid = v.guid
              WHERE i.company_id = ? AND i.division_id = ?
                AND v.guid IS NULL`,
        params: [this.companyId, this.divisionId, this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        orphanedQuery
      );
      
      if (response.data.success) {
        console.log('🔗 Orphaned Records Check:');
        response.data.data.results.forEach(row => {
          const status = row.orphaned_count === 0 ? '✅' : '⚠️';
          console.log(`   ${status} ${row.table_name}: ${row.orphaned_count} orphaned records`);
        });
      }
      
      // Check data completeness
      const completenessQuery = {
        sql: `SELECT 
                'vouchers' as table_name,
                COUNT(*) as total,
                COUNT(CASE WHEN voucher_number IS NOT NULL THEN 1 END) as has_number,
                COUNT(CASE WHEN date IS NOT NULL THEN 1 END) as has_date,
                COUNT(CASE WHEN voucher_type IS NOT NULL THEN 1 END) as has_type
              FROM vouchers
              WHERE company_id = ? AND division_id = ?
              UNION ALL
              SELECT 
                'accounting_entries' as table_name,
                COUNT(*) as total,
                COUNT(CASE WHEN voucher_guid IS NOT NULL THEN 1 END) as has_voucher_link,
                COUNT(CASE WHEN ledger_name IS NOT NULL THEN 1 END) as has_ledger,
                COUNT(CASE WHEN amount IS NOT NULL THEN 1 END) as has_amount
              FROM accounting_entries
              WHERE company_id = ? AND division_id = ?`,
        params: [this.companyId, this.divisionId, this.companyId, this.divisionId]
      };
      
      const completenessResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        completenessQuery
      );
      
      if (completenessResponse.data.success) {
        console.log('\n📊 Data Completeness:');
        completenessResponse.data.data.results.forEach(row => {
          console.log(`   📋 ${row.table_name}:`);
          console.log(`      Total: ${row.total}`);
          console.log(`      Complete records: ${row.has_number || row.has_voucher_link}/${row.total}`);
        });
      }
      
    } catch (error) {
      console.log('❌ Could not verify data integrity:', error.message);
    }
  }

  async checkAccountingLinkages() {
    console.log('\n💰 DETAILED ACCOUNTING LINKAGES');
    console.log('================================');
    
    try {
      // Get detailed accounting analysis
      const detailedQuery = {
        sql: `SELECT 
                v.voucher_number,
                v.voucher_type,
                v.date,
                v.amount as voucher_amount,
                COUNT(a.id) as accounting_entries,
                SUM(a.amount) as total_accounting_amount,
                GROUP_CONCAT(DISTINCT a.ledger_name) as ledgers_involved
              FROM vouchers v
              LEFT JOIN accounting_entries a ON v.guid = a.voucher_guid
              WHERE v.company_id = ? AND v.division_id = ?
              GROUP BY v.guid, v.voucher_number, v.voucher_type, v.date, v.amount
              HAVING COUNT(a.id) > 0
              ORDER BY v.date DESC
              LIMIT 10`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        detailedQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        console.log('📋 Sample Voucher-Accounting Details:');
        response.data.data.results.forEach(row => {
          const balanceCheck = Math.abs(row.voucher_amount - row.total_accounting_amount) < 0.01 ? '✅' : '⚠️';
          console.log(`   ${balanceCheck} ${row.voucher_number} (${row.voucher_type}):`);
          console.log(`      Date: ${row.date}`);
          console.log(`      Voucher Amount: ${row.voucher_amount}`);
          console.log(`      Accounting Total: ${row.total_accounting_amount}`);
          console.log(`      Entries: ${row.accounting_entries}`);
          console.log(`      Ledgers: ${row.ledgers_involved?.substring(0, 100)}...`);
        });
      } else {
        console.log('⚠️  No accounting linkages found');
      }
    } catch (error) {
      console.log('❌ Could not check detailed accounting linkages:', error.message);
    }
  }

  async checkInventoryLinkages() {
    console.log('\n📦 DETAILED INVENTORY LINKAGES');
    console.log('===============================');
    
    try {
      // Get inventory movement analysis
      const inventoryQuery = {
        sql: `SELECT 
                v.voucher_number,
                v.voucher_type,
                v.date,
                COUNT(i.id) as inventory_entries,
                SUM(i.quantity) as total_quantity,
                SUM(i.amount) as total_inventory_value,
                GROUP_CONCAT(DISTINCT i.stock_item_name) as items_involved
              FROM vouchers v
              LEFT JOIN inventory_entries i ON v.guid = i.voucher_guid
              WHERE v.company_id = ? AND v.division_id = ?
              GROUP BY v.guid, v.voucher_number, v.voucher_type, v.date
              HAVING COUNT(i.id) > 0
              ORDER BY total_quantity DESC
              LIMIT 10`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        inventoryQuery
      );
      
      if (response.data.success && response.data.data.results.length > 0) {
        console.log('📋 Sample Voucher-Inventory Details:');
        response.data.data.results.forEach(row => {
          console.log(`   📦 ${row.voucher_number} (${row.voucher_type}):`);
          console.log(`      Date: ${row.date}`);
          console.log(`      Inventory Entries: ${row.inventory_entries}`);
          console.log(`      Total Quantity: ${row.total_quantity}`);
          console.log(`      Total Value: ${row.total_inventory_value}`);
          console.log(`      Items: ${row.items_involved?.substring(0, 100)}...`);
        });
      } else {
        console.log('⚠️  No inventory linkages found');
      }
    } catch (error) {
      console.log('❌ Could not check inventory linkages:', error.message);
    }
  }

  async checkMasterDataLinkages() {
    console.log('\n📚 MASTER DATA LINKAGES');
    console.log('========================');
    
    try {
      // Check if ledgers in accounting entries exist in master data
      const masterLinkageQuery = {
        sql: `SELECT 
                a.ledger_name,
                COUNT(a.id) as usage_count,
                CASE WHEN l.name IS NOT NULL THEN 'Found' ELSE 'Missing' END as master_status
              FROM accounting_entries a
              LEFT JOIN ledgers l ON a.ledger_name = l.name 
                AND l.company_id = a.company_id 
                AND l.division_id = a.division_id
              WHERE a.company_id = ? AND a.division_id = ?
              GROUP BY a.ledger_name, l.name
              ORDER BY usage_count DESC
              LIMIT 15`,
        params: [this.companyId, this.divisionId]
      };
      
      const response = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        masterLinkageQuery
      );
      
      if (response.data.success) {
        console.log('📋 Ledger Master Data Linkages:');
        response.data.data.results.forEach(row => {
          const status = row.master_status === 'Found' ? '✅' : '⚠️';
          console.log(`   ${status} ${row.ledger_name}: ${row.usage_count} uses (${row.master_status})`);
        });
      }
      
      // Check stock item linkages
      const stockLinkageQuery = {
        sql: `SELECT 
                i.stock_item_name,
                COUNT(i.id) as usage_count,
                CASE WHEN s.name IS NOT NULL THEN 'Found' ELSE 'Missing' END as master_status
              FROM inventory_entries i
              LEFT JOIN stock_items s ON i.stock_item_name = s.name 
                AND s.company_id = i.company_id 
                AND s.division_id = i.division_id
              WHERE i.company_id = ? AND i.division_id = ?
              GROUP BY i.stock_item_name, s.name
              ORDER BY usage_count DESC
              LIMIT 10`,
        params: [this.companyId, this.divisionId]
      };
      
      const stockResponse = await axios.post(
        `${this.railwayAPI}/api/v1/query/${this.companyId}/${this.divisionId}`,
        stockLinkageQuery
      );
      
      if (stockResponse.data.success && stockResponse.data.data.results.length > 0) {
        console.log('\n📦 Stock Item Master Data Linkages:');
        stockResponse.data.data.results.forEach(row => {
          const status = row.master_status === 'Found' ? '✅' : '⚠️';
          console.log(`   ${status} ${row.stock_item_name}: ${row.usage_count} uses (${row.master_status})`);
        });
      }
      
    } catch (error) {
      console.log('❌ Could not check master data linkages:', error.message);
    }
  }
}

// Run review
const reviewer = new DataRelationshipReviewer();
reviewer.review();

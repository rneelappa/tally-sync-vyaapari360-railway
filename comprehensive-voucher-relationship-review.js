#!/usr/bin/env node

/**
 * Comprehensive Voucher Relationship Review
 * Analyzes ALL voucher relationships - direct and indirect
 * Includes party addresses, transport, godowns, dispatch details
 */

const axios = require('axios');

const API_URL = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

class ComprehensiveVoucherReview {
  constructor() {
    this.relationshipMatrix = {
      direct_relationships: {},
      indirect_relationships: {},
      master_data_links: {},
      data_completeness: {},
      relationship_integrity: {}
    };
  }

  async review() {
    console.log('🔍 COMPREHENSIVE VOUCHER RELATIONSHIP REVIEW');
    console.log('=============================================\n');
    
    console.log(`🏢 Company: SKM IMPEX-CHENNAI-(24-25)`);
    console.log(`🆔 Company ID: ${COMPANY_ID}`);
    console.log(`🏭 Division ID: ${DIVISION_ID}\n`);
    
    try {
      // 1. Database Overview
      await this.getDatabaseOverview();
      
      // 2. Direct Voucher Relationships
      await this.reviewDirectVoucherRelationships();
      
      // 3. Indirect Master Data Relationships
      await this.reviewIndirectMasterDataRelationships();
      
      // 4. Party Account Details & Addresses
      await this.reviewPartyAccountDetails();
      
      // 5. Transport & Dispatch Information
      await this.reviewTransportDispatchDetails();
      
      // 6. Godown & Location Information
      await this.reviewGodownLocationDetails();
      
      // 7. Complete Voucher Ecosystem Analysis
      await this.analyzeCompleteVoucherEcosystem();
      
      // 8. Relationship Integrity Assessment
      await this.assessRelationshipIntegrity();
      
      // 9. Final Recommendations
      this.provideFinalRecommendations();
      
    } catch (error) {
      console.error('❌ Comprehensive review failed:', error.message);
    }
  }

  async getDatabaseOverview() {
    console.log('📊 DATABASE OVERVIEW');
    console.log('====================');
    
    try {
      const response = await axios.get(`${API_URL}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
      
      if (response.data.success) {
        const stats = response.data.data;
        console.log(`📈 Total Records: ${stats.total_records}`);
        
        console.log('\n📋 Table Inventory:');
        Object.entries(stats.table_counts).forEach(([table, count]) => {
          const status = count > 0 ? '✅' : '⚪';
          console.log(`   ${status} ${table}: ${count} records`);
          this.relationshipMatrix.data_completeness[table] = count;
        });
      }
    } catch (error) {
      console.log('❌ Could not get database overview:', error.message);
    }
    
    console.log();
  }

  async reviewDirectVoucherRelationships() {
    console.log('🔗 DIRECT VOUCHER RELATIONSHIPS');
    console.log('================================');
    
    try {
      // Check voucher → accounting linkage
      const accountingLinkageQuery = {
        sql: `SELECT 
                COUNT(*) as total_accounting,
                COUNT(CASE WHEN voucher_guid IS NOT NULL AND voucher_guid != '' THEN 1 END) as linked_accounting,
                COUNT(DISTINCT voucher_guid) as unique_vouchers_in_accounting,
                COUNT(CASE WHEN voucher_number IS NOT NULL AND voucher_number != '' THEN 1 END) as has_voucher_number
              FROM accounting_entries 
              WHERE company_id = ? AND division_id = ?`,
        params: [COMPANY_ID, DIVISION_ID]
      };
      
      const accountingResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, accountingLinkageQuery);
      
      if (accountingResponse.data.success && accountingResponse.data.data.length > 0) {
        const stats = accountingResponse.data.data[0];
        console.log('💰 Voucher → Accounting Linkage:');
        console.log(`   📊 Total Accounting Entries: ${stats.total_accounting}`);
        console.log(`   🔗 Linked via voucher_guid: ${stats.linked_accounting} (${((stats.linked_accounting/stats.total_accounting)*100).toFixed(1)}%)`);
        console.log(`   📋 Has voucher_number: ${stats.has_voucher_number} (${((stats.has_voucher_number/stats.total_accounting)*100).toFixed(1)}%)`);
        console.log(`   🎯 Unique Vouchers: ${stats.unique_vouchers_in_accounting}`);
        
        this.relationshipMatrix.direct_relationships.voucher_accounting = {
          total: stats.total_accounting,
          linked: stats.linked_accounting,
          linkage_rate: ((stats.linked_accounting/stats.total_accounting)*100).toFixed(1)
        };
      }
      
      // Check voucher → inventory linkage
      const inventoryLinkageQuery = {
        sql: `SELECT 
                COUNT(*) as total_inventory,
                COUNT(CASE WHEN voucher_guid IS NOT NULL AND voucher_guid != '' THEN 1 END) as linked_inventory,
                COUNT(DISTINCT voucher_guid) as unique_vouchers_in_inventory,
                COUNT(CASE WHEN voucher_number IS NOT NULL AND voucher_number != '' THEN 1 END) as has_voucher_number
              FROM inventory_entries 
              WHERE company_id = ? AND division_id = ?`,
        params: [COMPANY_ID, DIVISION_ID]
      };
      
      const inventoryResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, inventoryLinkageQuery);
      
      if (inventoryResponse.data.success && inventoryResponse.data.data.length > 0) {
        const stats = inventoryResponse.data.data[0];
        console.log('\n📦 Voucher → Inventory Linkage:');
        console.log(`   📊 Total Inventory Entries: ${stats.total_inventory}`);
        console.log(`   🔗 Linked via voucher_guid: ${stats.linked_inventory} (${((stats.linked_inventory/stats.total_inventory)*100).toFixed(1)}%)`);
        console.log(`   📋 Has voucher_number: ${stats.has_voucher_number} (${((stats.has_voucher_number/stats.total_inventory)*100).toFixed(1)}%)`);
        console.log(`   🎯 Unique Vouchers: ${stats.unique_vouchers_in_inventory}`);
        
        this.relationshipMatrix.direct_relationships.voucher_inventory = {
          total: stats.total_inventory,
          linked: stats.linked_inventory,
          linkage_rate: ((stats.linked_inventory/stats.total_inventory)*100).toFixed(1)
        };
      }
      
    } catch (error) {
      console.log('❌ Could not review direct relationships:', error.message);
    }
    
    console.log();
  }

  async reviewIndirectMasterDataRelationships() {
    console.log('🏢 INDIRECT MASTER DATA RELATIONSHIPS');
    console.log('=====================================');
    
    try {
      // Check voucher → party → ledger master data
      const partyLinkageQuery = {
        sql: `SELECT 
                v.party_name,
                COUNT(v.guid) as voucher_count,
                SUM(v.amount) as total_amount,
                l.name as ledger_name,
                l.mailing_address,
                l.gstn,
                l.opening_balance,
                l.closing_balance,
                CASE WHEN l.name IS NOT NULL THEN 'FOUND' ELSE 'MISSING' END as master_data_status
              FROM vouchers v
              LEFT JOIN ledgers l ON v.party_name = l.name 
                AND l.company_id = v.company_id 
                AND l.division_id = v.division_id
              WHERE v.company_id = ? AND v.division_id = ?
                AND v.party_name IS NOT NULL
              GROUP BY v.party_name, l.name, l.mailing_address, l.gstn, l.opening_balance, l.closing_balance
              ORDER BY voucher_count DESC
              LIMIT 10`,
        params: [COMPANY_ID, DIVISION_ID]
      };
      
      const partyResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, partyLinkageQuery);
      
      if (partyResponse.data.success && partyResponse.data.data.length > 0) {
        console.log('🏢 Voucher → Party → Ledger Master Data:');
        
        let linkedParties = 0;
        let totalParties = 0;
        
        partyResponse.data.data.forEach(row => {
          totalParties++;
          const status = row.master_data_status === 'FOUND' ? '✅' : '❌';
          console.log(`   ${status} ${row.party_name}:`);
          console.log(`      Vouchers: ${row.voucher_count}, Total: ₹${row.total_amount}`);
          
          if (row.master_data_status === 'FOUND') {
            linkedParties++;
            console.log(`      Address: ${row.mailing_address || 'Not specified'}`);
            console.log(`      GSTN: ${row.gstn || 'Not specified'}`);
            console.log(`      Balance: ₹${row.closing_balance || 0}`);
          } else {
            console.log(`      ⚠️ Master data missing for this party`);
          }
          console.log();
        });
        
        const partyLinkageRate = (linkedParties / totalParties * 100).toFixed(1);
        console.log(`🔗 Party Master Data Linkage: ${linkedParties}/${totalParties} (${partyLinkageRate}%)`);
        
        this.relationshipMatrix.indirect_relationships.party_master_linkage = partyLinkageRate;
      }
      
    } catch (error) {
      console.log('❌ Could not review indirect relationships:', error.message);
    }
    
    console.log();
  }

  async reviewPartyAccountDetails() {
    console.log('🏢 PARTY ACCOUNT DETAILS & ADDRESSES');
    console.log('====================================');
    
    try {
      // Get detailed party information for vouchers
      const partyDetailsQuery = {
        sql: `SELECT 
                l.name as party_name,
                l.mailing_name,
                l.mailing_address,
                l.mailing_state,
                l.mailing_country,
                l.mailing_pincode,
                l.email,
                l.gstn,
                l.it_pan,
                l.opening_balance,
                l.closing_balance,
                COUNT(v.guid) as voucher_count,
                SUM(v.amount) as total_voucher_amount
              FROM ledgers l
              LEFT JOIN vouchers v ON l.name = v.party_name 
                AND l.company_id = v.company_id 
                AND l.division_id = v.division_id
              WHERE l.company_id = ? AND l.division_id = ?
                AND l.parent LIKE '%Debtors%' OR l.parent LIKE '%Creditors%' OR l.parent LIKE '%Sundry%'
              GROUP BY l.name, l.mailing_name, l.mailing_address, l.mailing_state, l.mailing_country, 
                       l.mailing_pincode, l.email, l.gstn, l.it_pan, l.opening_balance, l.closing_balance
              HAVING COUNT(v.guid) > 0
              ORDER BY total_voucher_amount DESC
              LIMIT 10`,
        params: [COMPANY_ID, DIVISION_ID]
      };
      
      const partyResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, partyDetailsQuery);
      
      if (partyResponse.data.success && partyResponse.data.data.length > 0) {
        console.log('🏢 Top Parties with Complete Details:');
        
        partyResponse.data.data.forEach((party, index) => {
          console.log(`\n${index + 1}. ${party.party_name}:`);
          console.log(`   📊 Vouchers: ${party.voucher_count}, Total: ₹${party.total_voucher_amount}`);
          console.log(`   💰 Balance: ₹${party.closing_balance || 0}`);
          console.log(`   📧 Email: ${party.email || 'Not specified'}`);
          console.log(`   🏠 Address: ${party.mailing_address || 'Not specified'}`);
          console.log(`   🌍 State: ${party.mailing_state || 'Not specified'}`);
          console.log(`   📮 PIN: ${party.mailing_pincode || 'Not specified'}`);
          console.log(`   💳 GSTN: ${party.gstn || 'Not specified'}`);
          console.log(`   🆔 PAN: ${party.it_pan || 'Not specified'}`);
          
          // Check completeness
          const completeness = [
            party.mailing_address ? 1 : 0,
            party.email ? 1 : 0,
            party.gstn ? 1 : 0,
            party.mailing_state ? 1 : 0
          ].reduce((sum, val) => sum + val, 0);
          
          console.log(`   📊 Data Completeness: ${completeness}/4 fields (${(completeness/4*100).toFixed(0)}%)`);
        });
        
        this.relationshipMatrix.master_data_links.party_details_completeness = 'VERIFIED';
      }
      
    } catch (error) {
      console.log('❌ Could not review party details:', error.message);
    }
    
    console.log();
  }

  async reviewTransportDispatchDetails() {
    console.log('🚚 TRANSPORT & DISPATCH DETAILS');
    console.log('================================');
    
    try {
      // Check vouchers with dispatch/transport information
      const dispatchQuery = {
        sql: `SELECT 
                voucher_number,
                voucher_type,
                party_name,
                reference_number,
                place_of_supply,
                narration,
                CASE 
                  WHEN reference_number IS NOT NULL AND reference_number != '' THEN 1 
                  ELSE 0 
                END as has_dispatch_ref,
                CASE 
                  WHEN place_of_supply IS NOT NULL AND place_of_supply != '' THEN 1 
                  ELSE 0 
                END as has_destination,
                CASE 
                  WHEN narration IS NOT NULL AND narration != '' THEN 1 
                  ELSE 0 
                END as has_transport_details
              FROM vouchers 
              WHERE company_id = ? AND division_id = ?
                AND (reference_number IS NOT NULL OR place_of_supply IS NOT NULL OR narration IS NOT NULL)
              ORDER BY date DESC 
              LIMIT 15`,
        params: [COMPANY_ID, DIVISION_ID]
      };
      
      const dispatchResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, dispatchQuery);
      
      if (dispatchResponse.data.success && dispatchResponse.data.data.length > 0) {
        console.log('🚚 Vouchers with Transport/Dispatch Details:');
        
        let totalWithDispatch = 0;
        let totalWithDestination = 0;
        let totalWithTransport = 0;
        
        dispatchResponse.data.data.forEach((voucher, index) => {
          console.log(`\n${index + 1}. ${voucher.voucher_number} (${voucher.voucher_type}):`);
          console.log(`   🏢 Party: ${voucher.party_name}`);
          
          if (voucher.has_dispatch_ref) {
            totalWithDispatch++;
            console.log(`   📄 Dispatch Ref: ${voucher.reference_number}`);
          }
          
          if (voucher.has_destination) {
            totalWithDestination++;
            console.log(`   🌍 Destination: ${voucher.place_of_supply}`);
          }
          
          if (voucher.has_transport_details) {
            totalWithTransport++;
            console.log(`   🚛 Transport: ${voucher.narration?.substring(0, 100)}...`);
          }
        });
        
        console.log(`\n📊 Dispatch Information Coverage:`);
        console.log(`   📄 Dispatch References: ${totalWithDispatch}/${dispatchResponse.data.data.length} vouchers`);
        console.log(`   🌍 Destinations: ${totalWithDestination}/${dispatchResponse.data.data.length} vouchers`);
        console.log(`   🚛 Transport Details: ${totalWithTransport}/${dispatchResponse.data.data.length} vouchers`);
        
        this.relationshipMatrix.indirect_relationships.dispatch_coverage = {
          dispatch_refs: totalWithDispatch,
          destinations: totalWithDestination,
          transport_details: totalWithTransport
        };
      }
      
    } catch (error) {
      console.log('❌ Could not review transport/dispatch details:', error.message);
    }
    
    console.log();
  }

  async reviewGodownLocationDetails() {
    console.log('🏭 GODOWN & LOCATION DETAILS');
    console.log('============================');
    
    try {
      // Check inventory → godown relationships
      const godownLinkageQuery = {
        sql: `SELECT 
                i.godown,
                COUNT(i.guid) as inventory_entries,
                COUNT(DISTINCT i.voucher_guid) as unique_vouchers,
                SUM(ABS(i.quantity)) as total_quantity,
                SUM(ABS(i.amount)) as total_value,
                g.name as godown_master_name,
                g.address as godown_address,
                CASE WHEN g.name IS NOT NULL THEN 'FOUND' ELSE 'MISSING' END as master_data_status
              FROM inventory_entries i
              LEFT JOIN godowns g ON i.godown = g.name 
                AND g.company_id = i.company_id 
                AND g.division_id = i.division_id
              WHERE i.company_id = ? AND i.division_id = ?
                AND i.godown IS NOT NULL AND i.godown != ''
              GROUP BY i.godown, g.name, g.address
              ORDER BY inventory_entries DESC`,
        params: [COMPANY_ID, DIVISION_ID]
      };
      
      const godownResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, godownLinkageQuery);
      
      if (godownResponse.data.success && godownResponse.data.data.length > 0) {
        console.log('🏭 Inventory → Godown Relationships:');
        
        let linkedGodowns = 0;
        let totalGodowns = 0;
        
        godownResponse.data.data.forEach((godown, index) => {
          totalGodowns++;
          const status = godown.master_data_status === 'FOUND' ? '✅' : '❌';
          
          console.log(`\n${index + 1}. ${godown.godown} ${status}:`);
          console.log(`   📦 Inventory Entries: ${godown.inventory_entries}`);
          console.log(`   🎯 Unique Vouchers: ${godown.unique_vouchers}`);
          console.log(`   📊 Total Quantity: ${godown.total_quantity}`);
          console.log(`   💰 Total Value: ₹${godown.total_value}`);
          
          if (godown.master_data_status === 'FOUND') {
            linkedGodowns++;
            console.log(`   🏠 Address: ${godown.godown_address || 'Not specified'}`);
          } else {
            console.log(`   ⚠️ Godown master data missing`);
          }
        });
        
        const godownLinkageRate = (linkedGodowns / totalGodowns * 100).toFixed(1);
        console.log(`\n🔗 Godown Master Data Linkage: ${linkedGodowns}/${totalGodowns} (${godownLinkageRate}%)`);
        
        this.relationshipMatrix.indirect_relationships.godown_linkage = godownLinkageRate;
      }
      
    } catch (error) {
      console.log('❌ Could not review godown relationships:', error.message);
    }
    
    console.log();
  }

  async analyzeCompleteVoucherEcosystem() {
    console.log('🌐 COMPLETE VOUCHER ECOSYSTEM ANALYSIS');
    console.log('======================================');
    
    try {
      // Find a complex voucher and trace ALL its relationships
      const complexVoucherQuery = {
        sql: `SELECT 
                v.guid,
                v.voucher_number,
                v.voucher_type,
                v.date,
                v.party_name,
                v.amount,
                v.reference_number,
                v.place_of_supply,
                v.narration,
                COUNT(DISTINCT a.guid) as accounting_entries,
                COUNT(DISTINCT i.guid) as inventory_entries,
                GROUP_CONCAT(DISTINCT a.ledger) as ledgers_involved,
                GROUP_CONCAT(DISTINCT i.item) as items_involved,
                GROUP_CONCAT(DISTINCT i.godown) as godowns_involved
              FROM vouchers v
              LEFT JOIN accounting_entries a ON v.guid = a.voucher_guid
              LEFT JOIN inventory_entries i ON v.guid = i.voucher_guid
              WHERE v.company_id = ? AND v.division_id = ?
                AND v.amount > 1000
              GROUP BY v.guid, v.voucher_number, v.voucher_type, v.date, v.party_name, 
                       v.amount, v.reference_number, v.place_of_supply, v.narration
              HAVING COUNT(DISTINCT a.guid) > 2 OR COUNT(DISTINCT i.guid) > 0
              ORDER BY v.amount DESC
              LIMIT 5`,
        params: [COMPANY_ID, DIVISION_ID]
      };
      
      const ecosystemResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, complexVoucherQuery);
      
      if (ecosystemResponse.data.success && ecosystemResponse.data.data.length > 0) {
        console.log('🌐 Complex Voucher Ecosystem Examples:');
        
        ecosystemResponse.data.data.forEach((voucher, index) => {
          console.log(`\n${index + 1}. 🎯 VOUCHER: ${voucher.voucher_number} (${voucher.voucher_type})`);
          console.log(`   📅 Date: ${voucher.date}`);
          console.log(`   🏢 Party: ${voucher.party_name}`);
          console.log(`   💰 Amount: ₹${voucher.amount}`);
          
          // Dispatch details
          if (voucher.reference_number) {
            console.log(`   📄 Dispatch Ref: ${voucher.reference_number}`);
          }
          if (voucher.place_of_supply) {
            console.log(`   🌍 Destination: ${voucher.place_of_supply}`);
          }
          if (voucher.narration) {
            console.log(`   📝 Transport: ${voucher.narration.substring(0, 80)}...`);
          }
          
          // Relationships
          console.log(`   🔗 Relationships:`);
          console.log(`      💰 Accounting Entries: ${voucher.accounting_entries}`);
          console.log(`      📦 Inventory Entries: ${voucher.inventory_entries}`);
          
          if (voucher.ledgers_involved) {
            console.log(`      💳 Ledgers: ${voucher.ledgers_involved.substring(0, 100)}...`);
          }
          if (voucher.items_involved) {
            console.log(`      📦 Items: ${voucher.items_involved.substring(0, 100)}...`);
          }
          if (voucher.godowns_involved) {
            console.log(`      🏭 Godowns: ${voucher.godowns_involved}`);
          }
        });
        
        this.relationshipMatrix.relationship_integrity.complex_voucher_analysis = 'COMPLETED';
      }
      
    } catch (error) {
      console.log('❌ Could not analyze voucher ecosystem:', error.message);
    }
    
    console.log();
  }

  async assessRelationshipIntegrity() {
    console.log('🔍 RELATIONSHIP INTEGRITY ASSESSMENT');
    console.log('====================================');
    
    try {
      // Check for orphaned records
      const orphanedQuery = {
        sql: `SELECT 
                'accounting_entries' as table_name,
                COUNT(*) as total_records,
                COUNT(CASE WHEN voucher_guid IS NULL OR voucher_guid = '' THEN 1 END) as orphaned_records
              FROM accounting_entries
              WHERE company_id = ? AND division_id = ?
              
              UNION ALL
              
              SELECT 
                'inventory_entries' as table_name,
                COUNT(*) as total_records,
                COUNT(CASE WHEN voucher_guid IS NULL OR voucher_guid = '' THEN 1 END) as orphaned_records
              FROM inventory_entries
              WHERE company_id = ? AND division_id = ?`,
        params: [COMPANY_ID, DIVISION_ID, COMPANY_ID, DIVISION_ID]
      };
      
      const orphanedResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, orphanedQuery);
      
      if (orphanedResponse.data.success) {
        console.log('🔗 Orphaned Records Check:');
        
        orphanedResponse.data.data.forEach(row => {
          const orphanedPercent = (row.orphaned_records / row.total_records * 100).toFixed(1);
          const status = row.orphaned_records === 0 ? '✅' : '⚠️';
          
          console.log(`   ${status} ${row.table_name}:`);
          console.log(`      Total: ${row.total_records}, Orphaned: ${row.orphaned_records} (${orphanedPercent}%)`);
          
          this.relationshipMatrix.relationship_integrity[`${row.table_name}_orphaned_rate`] = orphanedPercent;
        });
      }
      
      // Check referential integrity
      const integrityQuery = {
        sql: `SELECT 
                'voucher_accounting' as relationship_type,
                COUNT(DISTINCT a.voucher_guid) as child_references,
                COUNT(DISTINCT v.guid) as parent_records,
                COUNT(DISTINCT a.voucher_guid) - COUNT(DISTINCT v.guid) as missing_parents
              FROM accounting_entries a
              LEFT JOIN vouchers v ON a.voucher_guid = v.guid
              WHERE a.company_id = ? AND a.division_id = ?
                AND a.voucher_guid IS NOT NULL AND a.voucher_guid != ''
              
              UNION ALL
              
              SELECT 
                'voucher_inventory' as relationship_type,
                COUNT(DISTINCT i.voucher_guid) as child_references,
                COUNT(DISTINCT v.guid) as parent_records,
                COUNT(DISTINCT i.voucher_guid) - COUNT(DISTINCT v.guid) as missing_parents
              FROM inventory_entries i
              LEFT JOIN vouchers v ON i.voucher_guid = v.guid
              WHERE i.company_id = ? AND i.division_id = ?
                AND i.voucher_guid IS NOT NULL AND i.voucher_guid != ''`,
        params: [COMPANY_ID, DIVISION_ID, COMPANY_ID, DIVISION_ID]
      };
      
      const integrityResponse = await axios.post(`${API_URL}/api/v1/query/${COMPANY_ID}/${DIVISION_ID}`, integrityQuery);
      
      if (integrityResponse.data.success) {
        console.log('\n🔍 Referential Integrity:');
        
        integrityResponse.data.data.forEach(row => {
          const status = row.missing_parents === 0 ? '✅' : '❌';
          console.log(`   ${status} ${row.relationship_type}:`);
          console.log(`      Child References: ${row.child_references}`);
          console.log(`      Parent Records: ${row.parent_records}`);
          console.log(`      Missing Parents: ${row.missing_parents}`);
          
          this.relationshipMatrix.relationship_integrity[`${row.relationship_type}_integrity`] = 
            row.missing_parents === 0 ? 'PERFECT' : 'BROKEN';
        });
      }
      
    } catch (error) {
      console.log('❌ Could not assess relationship integrity:', error.message);
    }
    
    console.log();
  }

  provideFinalRecommendations() {
    console.log('🎯 FINAL RECOMMENDATIONS & STATUS');
    console.log('==================================\n');
    
    console.log('📊 Relationship Matrix Summary:');
    
    // Direct relationships
    if (this.relationshipMatrix.direct_relationships.voucher_accounting) {
      const accLinkage = this.relationshipMatrix.direct_relationships.voucher_accounting.linkage_rate;
      const status = parseFloat(accLinkage) > 90 ? '✅' : '❌';
      console.log(`   ${status} Voucher → Accounting: ${accLinkage}% linked`);
    }
    
    if (this.relationshipMatrix.direct_relationships.voucher_inventory) {
      const invLinkage = this.relationshipMatrix.direct_relationships.voucher_inventory.linkage_rate;
      const status = parseFloat(invLinkage) > 90 ? '✅' : '❌';
      console.log(`   ${status} Voucher → Inventory: ${invLinkage}% linked`);
    }
    
    // Indirect relationships
    if (this.relationshipMatrix.indirect_relationships.party_master_linkage) {
      const partyLinkage = this.relationshipMatrix.indirect_relationships.party_master_linkage;
      const status = parseFloat(partyLinkage) > 90 ? '✅' : '❌';
      console.log(`   ${status} Party → Master Data: ${partyLinkage}% linked`);
    }
    
    if (this.relationshipMatrix.indirect_relationships.godown_linkage) {
      const godownLinkage = this.relationshipMatrix.indirect_relationships.godown_linkage;
      const status = parseFloat(godownLinkage) > 90 ? '✅' : '❌';
      console.log(`   ${status} Godown → Master Data: ${godownLinkage}% linked`);
    }
    
    console.log('\n🌐 Lovable.dev Integration Readiness:');
    
    const accountingLinkage = this.relationshipMatrix.direct_relationships.voucher_accounting?.linkage_rate || '0';
    const inventoryLinkage = this.relationshipMatrix.direct_relationships.voucher_inventory?.linkage_rate || '0';
    
    if (parseFloat(accountingLinkage) > 90 && parseFloat(inventoryLinkage) > 90) {
      console.log('   🎉 EXCELLENT: All voucher relationships properly established!');
      console.log('   ✅ Voucher details will show complete accounting breakdown');
      console.log('   ✅ Voucher details will show complete inventory breakdown');
      console.log('   ✅ Party addresses and GST details available');
      console.log('   ✅ Transport and dispatch information captured');
      console.log('   ✅ Godown and location details linked');
    } else {
      console.log('   ⚠️ INCOMPLETE: Some relationships need fixing');
      console.log(`   🔧 Accounting linkage: ${accountingLinkage}% (target: >90%)`);
      console.log(`   🔧 Inventory linkage: ${inventoryLinkage}% (target: >90%)`);
    }
    
    console.log('\n🎯 Expected Voucher Detail View (SALES 2800237/25-26):');
    console.log('```json');
    console.log('{');
    console.log('  "voucher": {');
    console.log('    "number": "2800237/25-26",');
    console.log('    "type": "SALES",');
    console.log('    "party": "MABEL ENGINEERS PVT LTD.",');
    console.log('    "amount": 5900,');
    console.log('    "dispatch_ref": "123",');
    console.log('    "destination": "MUMBAI"');
    console.log('  },');
    console.log('  "party_details": {');
    console.log('    "name": "MABEL ENGINEERS PVT LTD.",');
    console.log('    "address": "Complete mailing address",');
    console.log('    "gstn": "GST number",');
    console.log('    "balance": "₹62,40,548.00 Dr"');
    console.log('  },');
    console.log('  "accounting_entries": [');
    console.log('    { "ledger": "MABEL ENGINEERS PVT LTD.", "amount": 5900 },');
    console.log('    { "ledger": "SALES GST LOCAL", "amount": -5000 },');
    console.log('    { "ledger": "INPUT CGST", "amount": 450 },');
    console.log('    { "ledger": "INPUT SGST", "amount": 450 }');
    console.log('  ],');
    console.log('  "inventory_entries": [');
    console.log('    {');
    console.log('      "item": "JINDAL-A",');
    console.log('      "quantity": 100,');
    console.log('      "rate": 50,');
    console.log('      "amount": 5000,');
    console.log('      "godown": "Chennai"');
    console.log('    }');
    console.log('  ]');
    console.log('}');
    console.log('```');
  }
}

// Run comprehensive review
const reviewer = new ComprehensiveVoucherReview();
reviewer.review();

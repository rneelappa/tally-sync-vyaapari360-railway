#!/usr/bin/env node

/**
 * Monitor Continuous Sync
 * Shows real-time status of the continuous sync process
 */

const axios = require('axios');

const RAILWAY_API = 'https://tally-sync-vyaapari360-railway-production.up.railway.app';
const COMPANY_ID = '629f49fb-983e-4141-8c48-e1423b39e921';
const DIVISION_ID = '37f3cc0c-58ad-4baf-b309-360116ffc3cd';

class SyncMonitor {
  constructor() {
    this.previousStats = null;
    this.monitoringStartTime = Date.now();
  }

  async startMonitoring() {
    console.log('📊 Continuous Sync Monitor');
    console.log('==========================\n');
    
    console.log(`🏢 Company: SKM IMPEX-CHENNAI-(24-25)`);
    console.log(`🆔 Company ID: ${COMPANY_ID}`);
    console.log(`🏭 Division ID: ${DIVISION_ID}`);
    console.log(`🎯 Railway: ${RAILWAY_API}`);
    console.log(`⏰ Started: ${new Date().toLocaleString()}\n`);
    
    // Monitor every 30 seconds
    setInterval(() => {
      this.checkSyncStatus();
    }, 30000);
    
    // Initial check
    await this.checkSyncStatus();
    
    console.log('📊 Monitoring continuous sync...');
    console.log('🔄 Updates every 30 seconds');
    console.log('🛑 Press Ctrl+C to stop monitoring\n');
  }

  async checkSyncStatus() {
    try {
      const response = await axios.get(`${RAILWAY_API}/api/v1/stats/${COMPANY_ID}/${DIVISION_ID}`);
      
      if (response.data.success) {
        const currentStats = response.data.data;
        
        console.log(`📊 ${new Date().toLocaleString()} - Database Status:`);
        
        // Show current counts
        const totalRecords = currentStats.total_records;
        console.log(`   📈 Total Records: ${totalRecords}`);
        
        // Show table breakdown
        Object.entries(currentStats.table_counts).forEach(([table, count]) => {
          if (count > 0) {
            let changeIndicator = '';
            if (this.previousStats && this.previousStats.table_counts[table]) {
              const previousCount = this.previousStats.table_counts[table];
              if (count > previousCount) {
                const newRecords = count - previousCount;
                changeIndicator = ` (+${newRecords} NEW!)`;
              }
            }
            console.log(`   • ${table}: ${count} records${changeIndicator}`);
          }
        });
        
        // Show changes since last check
        if (this.previousStats) {
          const totalChange = totalRecords - this.previousStats.total_records;
          if (totalChange > 0) {
            console.log(`\n🎉 NEW DATA DETECTED: ${totalChange} new records since last check!`);
            
            // Highlight voucher changes
            const voucherChange = currentStats.table_counts.vouchers - (this.previousStats.table_counts.vouchers || 0);
            if (voucherChange > 0) {
              console.log(`   🎯 NEW VOUCHERS: ${voucherChange} new vouchers with all related data!`);
            }
          } else if (totalChange === 0) {
            console.log(`\n📊 No new data (sync running, waiting for Tally changes)`);
          }
        }
        
        this.previousStats = currentStats;
        console.log(''); // Empty line for readability
        
      } else {
        console.log('❌ Could not fetch database status');
      }
      
    } catch (error) {
      console.log(`❌ Monitor error: ${error.message}`);
    }
  }
}

// Start monitoring
const monitor = new SyncMonitor();
monitor.startMonitoring();

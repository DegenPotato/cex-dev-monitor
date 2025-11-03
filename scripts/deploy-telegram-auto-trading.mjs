#!/usr/bin/env node

/**
 * Deploy Telegram Auto-Trading Migration
 * Runs migration 066 to add auto-trading capabilities to production Telegram monitoring
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'monitor.db');
const MIGRATION_PATH = path.join(__dirname, '..', 'migrations', '066_telegram_auto_trading.sql');

async function deployMigration() {
  console.log('🚀 Deploying Telegram Auto-Trading Migration...\n');
  
  // Check if migration file exists
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error('❌ Migration file not found:', MIGRATION_PATH);
    process.exit(1);
  }
  
  // Open database
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  
  try {
    // Check if migration already applied
    const existing = await db.get(
      'SELECT * FROM _migrations WHERE name = ?',
      ['066_telegram_auto_trading.sql']
    );
    
    if (existing) {
      console.log('⚠️  Migration 066 already applied on', new Date(existing.applied_at).toLocaleString());
      console.log('   Skipping to avoid duplicate application.\n');
      return;
    }
    
    // Read migration SQL
    const migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
    
    // Begin transaction
    await db.exec('BEGIN TRANSACTION');
    
    console.log('📋 Applying migration changes:');
    console.log('   - Adding flexible action_on_detection to telegram_monitored_chats');
    console.log('   - Adding auto-buy configuration (amount, wallet, slippage)');
    console.log('   - Adding auto-sell configuration (stop loss, take profit)');
    console.log('   - Creating telegram_trading_positions table');
    console.log('   - Creating position_updates table for WebSocket');
    console.log('   - Adding position tracking to trading_transactions');
    console.log('   - Creating performance indexes\n');
    
    // Execute migration
    await db.exec(migrationSQL);
    
    // Record migration
    await db.run(
      'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      ['066_telegram_auto_trading.sql', Date.now()]
    );
    
    // Commit transaction
    await db.exec('COMMIT');
    
    console.log('✅ Migration 066 applied successfully!\n');
    
    // Show summary of changes
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'telegram_%' ORDER BY name"
    );
    
    console.log('📊 Current Telegram-related tables:');
    for (const table of tables) {
      const count = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
      console.log(`   - ${table.name}: ${count.count} records`);
    }
    
    // Check for active monitored chats
    const activeChats = await db.get(
      'SELECT COUNT(*) as count FROM telegram_monitored_chats WHERE is_active = 1'
    );
    
    console.log(`\n📡 Active monitored chats: ${activeChats.count}`);
    
    // Show new columns
    console.log('\n🆕 New capabilities added to telegram_monitored_chats:');
    console.log('   • action_on_detection (flexible action control)');
    console.log('   • auto_buy_* (automated buying configuration)');
    console.log('   • auto_sell_* (stop loss/take profit settings)');
    console.log('   • auto_monitor_* (price tracking configuration)');
    
    console.log('\n🎯 New comprehensive position tracking table:');
    console.log('   • telegram_trading_positions (40+ metrics per position)');
    console.log('   • Real-time P&L tracking');
    console.log('   • Source attribution');
    console.log('   • Peak/drawdown tracking');
    console.log('   • ROI and performance metrics');
    
    console.log('\n⚡ WebSocket Broadcasting:');
    console.log('   • position_updates table for event queue');
    console.log('   • Real-time frontend updates (no refresh needed!)');
    console.log('   • Events: position_created, trade_executed, price_update, alert, closed');
    
    console.log('\n✨ Next steps:');
    console.log('   1. Restart backend to load new schema');
    console.log('   2. Update TelegramClientService with initiateTrade() method');
    console.log('   3. Create TelegramPositionMonitor service');
    console.log('   4. Add WebSocket broadcasting for position updates');
    console.log('   5. Update frontend with auto-trade configuration UI');
    
  } catch (error) {
    await db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run deployment
deployMigration().catch(console.error);

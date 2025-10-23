#!/usr/bin/env node

/**
 * Script to run the token table unification migration
 * This migrates data from token_mints to token_registry + token_market_data
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'cex-monitor.db');
const MIGRATION_PATH = path.join(__dirname, 'migrations', '031_unify_token_tables.sql');

async function runMigration() {
  console.log('🔄 Starting Token Table Unification Migration...\n');

  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database not found at:', DB_PATH);
    process.exit(1);
  }

  // Check if migration file exists
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error('❌ Migration file not found at:', MIGRATION_PATH);
    process.exit(1);
  }

  // Open database
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  try {
    // Enable foreign keys
    await db.exec('PRAGMA foreign_keys = ON');

    // Check current state
    console.log('📊 Current Database State:');
    
    // Check token_mints
    const tokenMintsCount = await db.get('SELECT COUNT(*) as count FROM token_mints');
    console.log(`  - token_mints: ${tokenMintsCount?.count || 0} records`);
    
    // Check token_registry
    const tokenRegistryExists = await db.get(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='token_registry'
    `);
    
    if (tokenRegistryExists) {
      const tokenRegistryCount = await db.get('SELECT COUNT(*) as count FROM token_registry');
      console.log(`  - token_registry: ${tokenRegistryCount?.count || 0} records`);
    } else {
      console.log(`  - token_registry: Table doesn't exist yet`);
    }
    
    // Check token_market_data
    const marketDataExists = await db.get(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='token_market_data'
    `);
    
    if (marketDataExists) {
      const marketDataCount = await db.get('SELECT COUNT(*) as count FROM token_market_data');
      console.log(`  - token_market_data: ${marketDataCount?.count || 0} records`);
    } else {
      console.log(`  - token_market_data: Table doesn't exist yet`);
    }

    console.log('\n🚀 Running migration...\n');

    // Read migration file
    const migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
    
    // Split by statements (simple split on semicolon)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip ALTER TABLE ... ADD COLUMN IF NOT EXISTS (SQLite doesn't support)
      if (statement.includes('ADD COLUMN IF NOT EXISTS')) {
        console.log(`⏭️  Skipping unsupported SQLite syntax: ALTER TABLE ADD COLUMN IF NOT EXISTS`);
        skipCount++;
        continue;
      }

      try {
        await db.exec(statement);
        
        // Log important operations
        if (statement.includes('INSERT OR IGNORE INTO token_registry')) {
          const result = await db.get('SELECT changes() as changes');
          console.log(`✅ Migrated ${result?.changes || 0} tokens to token_registry`);
        } else if (statement.includes('INSERT OR REPLACE INTO token_market_data')) {
          const result = await db.get('SELECT changes() as changes');
          console.log(`✅ Migrated ${result?.changes || 0} price records to token_market_data`);
        } else if (statement.includes('CREATE VIEW')) {
          console.log(`✅ Created compatibility view`);
        } else if (statement.includes('CREATE INDEX')) {
          console.log(`✅ Created index`);
        }
        
        successCount++;
      } catch (error) {
        // Ignore certain errors
        if (error.message.includes('already exists')) {
          skipCount++;
        } else {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          errorCount++;
        }
      }
    }

    console.log('\n📊 Migration Results:');
    console.log(`  - Successful operations: ${successCount}`);
    console.log(`  - Skipped (already exists): ${skipCount}`);
    console.log(`  - Errors: ${errorCount}`);

    // Show final state
    console.log('\n📊 Final Database State:');
    
    const finalTokenRegistry = await db.get('SELECT COUNT(*) as count FROM token_registry');
    console.log(`  - token_registry: ${finalTokenRegistry?.count || 0} records`);
    
    const finalMarketData = await db.get('SELECT COUNT(*) as count FROM token_market_data');
    console.log(`  - token_market_data: ${finalMarketData?.count || 0} records`);

    // Check if view works
    try {
      const viewTest = await db.get('SELECT COUNT(*) as count FROM token_mints_view');
      console.log(`  - token_mints_view: ${viewTest?.count || 0} records (backward compatibility)`);
    } catch (e) {
      // View might not exist
    }

    // Show sample data
    console.log('\n📝 Sample Migrated Data:');
    const samples = await db.all(`
      SELECT 
        tr.token_mint,
        tr.token_symbol,
        tr.first_source_type,
        tmd.price_usd,
        tmd.market_cap_usd
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      LIMIT 5
    `);

    samples.forEach(sample => {
      console.log(`  - ${sample.token_symbol || 'Unknown'}: $${sample.price_usd || 'N/A'} (Source: ${sample.first_source_type})`);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('\n⚠️  Note: The old token_mints table has NOT been dropped yet.');
    console.log('    Once you verify everything works, you can drop it manually.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the migration
runMigration().catch(console.error);

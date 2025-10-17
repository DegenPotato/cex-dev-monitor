/**
 * Run YouTube Integration Migration
 * Adds YouTube-related columns and tables to the database
 * Uses sql.js (same as the main application)
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'monitor.db');
const MIGRATION_PATH = join(__dirname, '..', 'migrations', '002_youtube_integration.sql');

console.log('🎵 YouTube Integration Migration');
console.log('================================');
console.log(`📁 Database: ${DB_PATH}`);
console.log(`📝 Migration: ${MIGRATION_PATH}`);

async function runMigration() {
  try {
    // Initialize sql.js
    const SQL = await initSqlJs();
    console.log('✅ sql.js initialized');

    // Load database
    if (!existsSync(DB_PATH)) {
      throw new Error(`Database not found: ${DB_PATH}`);
    }

    const buffer = readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);
    console.log('✅ Database loaded');

    // Read migration file
    const migrationSQL = readFileSync(MIGRATION_PATH, 'utf-8');
    console.log('✅ Migration file loaded');

    // Split into individual statements and execute
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Executing ${statements.length} migration statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        console.log(`\n  [${i + 1}/${statements.length}] ${statement.substring(0, 60)}...`);
        db.run(statement + ';');
        console.log('  ✓ Success');
      } catch (error: any) {
        // Ignore "duplicate column" errors - means migration already ran
        if (error.message.includes('duplicate column') || 
            error.message.includes('already exists') ||
            error.message.includes('table youtube_playlists already exists') ||
            error.message.includes('table youtube_history already exists')) {
          console.log('  ⚠ Already exists, skipping');
        } else {
          console.error(`  ❌ Error: ${error.message}`);
          console.error(`  Statement: ${statement}`);
          throw error;
        }
      }
    }

    // Verify the changes
    const tableInfo = db.exec("PRAGMA table_info(users)");
    const columns = tableInfo.length > 0 ? tableInfo[0].values.map((row: any) => row[1]) : [];
    const hasYoutubeEnabled = columns.includes('youtube_enabled');
    const hasYoutubeEmail = columns.includes('youtube_email');

    console.log('\n📊 Verification:');
    console.log(`  youtube_enabled column: ${hasYoutubeEnabled ? '✅' : '❌'}`);
    console.log(`  youtube_email column: ${hasYoutubeEmail ? '✅' : '❌'}`);

    // Check new tables
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tables = tablesResult.length > 0 ? tablesResult[0].values.map((row: any) => row[0]) : [];
    const hasPlaylistsTable = tables.includes('youtube_playlists');
    const hasHistoryTable = tables.includes('youtube_history');

    console.log(`  youtube_playlists table: ${hasPlaylistsTable ? '✅' : '❌'}`);
    console.log(`  youtube_history table: ${hasHistoryTable ? '✅' : '❌'}`);

    // Save database back to file
    const data = db.export();
    const newBuffer = Buffer.from(data);
    writeFileSync(DB_PATH, newBuffer);
    console.log('✅ Database saved');

    db.close();
    console.log('\n✅ Migration completed successfully!');
    console.log('🔄 Please restart the WebSocket server to apply changes.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

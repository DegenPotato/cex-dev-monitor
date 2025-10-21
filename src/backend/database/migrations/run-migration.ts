/**
 * Run a specific migration file
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../data/cex_monitor.db');

async function runMigration(migrationFile: string) {
  console.log(`🔄 Running migration: ${migrationFile}`);
  
  const db = new Database(DB_PATH);
  
  try {
    const sqlPath = path.join(__dirname, migrationFile);
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    // Split by semicolon and run each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    db.exec('BEGIN TRANSACTION');
    
    for (const statement of statements) {
      console.log(`  Executing: ${statement.substring(0, 100)}...`);
      db.exec(statement);
    }
    
    db.exec('COMMIT');
    
    console.log(`✅ Migration completed: ${migrationFile}`);
  } catch (error) {
    console.error(`❌ Migration failed:`, error);
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

// Get migration file from command line
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Please specify a migration file');
  console.error('Usage: node run-migration.js <migration-file.sql>');
  process.exit(1);
}

runMigration(migrationFile).catch(err => {
  console.error(err);
  process.exit(1);
});

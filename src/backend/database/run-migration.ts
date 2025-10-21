/**
 * Run migration using existing helpers (sql.js)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(migrationFile: string) {
  console.log(`🔄 Running migration: ${migrationFile}`);
  
  try {
    const sqlPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    // Split by semicolon and filter out comments and empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    const db = await getDb();
    
    console.log(`  Executing ${statements.length} statement(s)...`);
    
    for (const statement of statements) {
      try {
        console.log(`  ✓ ${statement.substring(0, 60)}...`);
        db.run(statement);
      } catch (error: any) {
        console.error(`  ❌ Failed on statement: ${statement.substring(0, 100)}`);
        throw error;
      }
    }
    
    console.log(`✅ Migration completed: ${migrationFile}`);
  } catch (error) {
    console.error(`❌ Migration failed:`, error);
    throw error;
  }
}

// Get migration file from command line
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Please specify a migration file');
  console.error('Usage: tsx run-migration.ts <migration-file.sql>');
  console.error('Example: tsx run-migration.ts 007_telegram_multi_account_forwarding.sql');
  process.exit(1);
}

runMigration(migrationFile).catch(err => {
  console.error(err);
  process.exit(1);
});

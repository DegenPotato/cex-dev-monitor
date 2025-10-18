import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'monitor.db');

console.log('🔧 Adding updated_at column to users table');
console.log('==========================================');
console.log(`📁 Database: ${DB_PATH}`);

async function addColumn() {
  try {
    const SQL = await initSqlJs();
    console.log('✅ sql.js initialized');

    if (!existsSync(DB_PATH)) {
      throw new Error(`Database not found: ${DB_PATH}`);
    }

    const buffer = readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);
    console.log('✅ Database loaded');

    // Check if column already exists
    const tableInfo = db.exec("PRAGMA table_info(users);");
    const columns = tableInfo[0]?.values || [];
    const hasUpdatedAt = columns.some((col: any) => col[1] === 'updated_at');

    if (hasUpdatedAt) {
      console.log('ℹ️  Column already exists, skipping');
      db.close();
      return;
    }

    // Add the column (SQLite doesn't allow CURRENT_TIMESTAMP in ALTER TABLE)
    console.log('➕ Adding updated_at column...');
    db.run('ALTER TABLE users ADD COLUMN updated_at TEXT');
    
    // Update all rows with current timestamp
    console.log('🔄 Updating all rows...');
    db.run("UPDATE users SET updated_at = datetime('now')");

    console.log('✅ Column added successfully');

    // Save database
    const data = db.export();
    const newBuffer = Buffer.from(data);
    writeFileSync(DB_PATH, newBuffer);
    console.log('✅ Database saved');

    db.close();
    console.log('✨ Migration complete!');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

addColumn();

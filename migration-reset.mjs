import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

// Get migration filename from command line
const filename = process.argv[2];

if (!filename) {
  console.error('❌ Please specify migration filename to reset');
  console.error('Usage: node migration-reset.mjs <filename>');
  console.error('Example: node migration-reset.mjs 007_telegram_multi_account_forwarding.sql');
  process.exit(1);
}

console.log(`🔄 Resetting migration: ${filename}`);

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

try {
  // Check if it exists
  const check = db.exec('SELECT * FROM _migrations WHERE filename = ?', [filename]);
  
  if (check.length === 0 || check[0].values.length === 0) {
    console.log('⚠️  Migration not found in _migrations table (already reset or never applied)');
  } else {
    // Delete the migration record
    db.run('DELETE FROM _migrations WHERE filename = ?', [filename]);
    console.log(`✅ Deleted ${filename} from _migrations table`);
    
    // Save database
    const data = db.export();
    writeFileSync('./monitor.db', data);
    console.log('💾 Database saved');
  }
  
  console.log('\n📋 You can now re-run: node run-all-migrations.mjs');
  
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  db.close();
}

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';

// Get migration filename from command line
const filename = process.argv[2];

if (!filename) {
  console.error('❌ Please specify migration filename to reset');
  console.error('Usage: node migration-reset.mjs <filename>');
  console.error('Example: node migration-reset.mjs 007_telegram_multi_account_forwarding.sql');
  process.exit(1);
}

console.log(`🔄 Resetting migration: ${filename}`);

// Create backup before making changes
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `./monitor.db.backup-${timestamp}`;

try {
  copyFileSync('./monitor.db', backupPath);
  console.log(`💾 Backup created: ${backupPath}`);
} catch (err) {
  console.warn('⚠️  Could not create backup:', err.message);
  console.warn('   Continuing anyway...');
}

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

try {
  // Check if it exists
  const check = db.exec('SELECT * FROM _migrations WHERE filename = ?', [filename]);
  
  if (check.length === 0 || check[0].values.length === 0) {
    console.log('⚠️  Migration not found in _migrations table (already reset or never applied)');
  } else {
    const migrationData = check[0].values[0];
    const appliedAt = new Date(migrationData[2] * 1000).toISOString();
    
    console.log(`📋 Found migration:`);
    console.log(`   ID: ${migrationData[0]}`);
    console.log(`   File: ${migrationData[1]}`);
    console.log(`   Applied: ${appliedAt}`);
    
    // Delete the migration record
    db.run('DELETE FROM _migrations WHERE filename = ?', [filename]);
    console.log(`✅ Deleted ${filename} from _migrations table`);
    
    // Save database
    const data = db.export();
    writeFileSync('./monitor.db', data);
    console.log('💾 Database saved');
  }
  
  console.log('\n📋 Next steps:');
  console.log('   1. Fix the migration SQL if needed');
  console.log('   2. Run: node run-all-migrations.mjs');
  console.log(`   3. If something goes wrong, restore from: ${backupPath}`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(`\n🔧 To restore backup: cp ${backupPath} monitor.db`);
  process.exit(1);
} finally {
  db.close();
}

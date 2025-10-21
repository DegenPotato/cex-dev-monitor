import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Running Telegram Multi-Account & Forwarding migration...');

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

// Read and execute the SQL file
const sqlContent = readFileSync('./src/backend/database/migrations/007_telegram_multi_account_forwarding.sql', 'utf8');

// Remove comments first
const noComments = sqlContent
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

// Split by semicolon, handling multi-line statements
const statements = noComments
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`📋 Found ${statements.length} statements to execute`);

statements.forEach((statement, i) => {
  try {
    db.run(statement + ';');
    console.log(`✅ Statement ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
      console.log(`⚠️  Statement ${i + 1}/${statements.length}: Already exists (skipped)`);
    } else {
      console.error(`❌ Statement ${i + 1}/${statements.length} failed:`, err.message);
      console.error(`   Statement: ${statement.substring(0, 100)}...`);
    }
  }
});

// Verify tables were created
try {
  const forwardingRules = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_forwarding_rules'");
  const forwardingHistory = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_forwarding_history'");
  
  if (forwardingRules.length > 0 && forwardingHistory.length > 0) {
    console.log('✅ telegram_forwarding_rules table exists');
    console.log('✅ telegram_forwarding_history table exists');
  }
  
  // Check if telegram_account_id column was added
  const columns = db.exec("PRAGMA table_info(telegram_monitored_chats)");
  const hasAccountId = columns[0]?.values.some(col => col[1] === 'telegram_account_id');
  if (hasAccountId) {
    console.log('✅ telegram_account_id column added to telegram_monitored_chats');
  }
} catch (err) {
  console.error('⚠️  Verification failed:', err.message);
}

const data = db.export();
writeFileSync('./monitor.db', data);
db.close();

console.log('✅ Migration completed successfully!');

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'monitor.db');
const migrationPath = path.join(__dirname, 'migrations', '005_enhance_telegram_user_accounts.sql');

console.log('🔄 Running Enhanced Telegram User Accounts Migration...');
console.log(`📁 Database: ${dbPath}`);
console.log(`📁 Migration: ${migrationPath}`);

try {
  // Check if migration file exists
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  // Read migration SQL
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  // Open database
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Split SQL into individual statements
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📊 Found ${statements.length} SQL statements to execute`);

  // Execute each statement
  let successCount = 0;
  let skipCount = 0;
  
  for (const statement of statements) {
    try {
      db.exec(statement + ';');
      successCount++;
      
      // Log what we're doing
      if (statement.includes('ALTER TABLE')) {
        const match = statement.match(/ADD COLUMN (\w+)/i);
        if (match) {
          console.log(`  ✅ Added column: ${match[1]}`);
        }
      } else if (statement.includes('CREATE INDEX')) {
        const match = statement.match(/CREATE INDEX.*?(\w+) ON/i);
        if (match) {
          console.log(`  ✅ Created index: ${match[1]}`);
        }
      }
    } catch (error) {
      // Column might already exist, that's okay
      if (error.message.includes('duplicate column name') || 
          error.message.includes('already exists')) {
        skipCount++;
        console.log(`  ⏭️  Skipped (already exists)`);
      } else {
        console.error(`  ❌ Error executing statement:`, error.message);
        console.error(`  Statement: ${statement.substring(0, 100)}...`);
        throw error;
      }
    }
  }

  db.close();

  console.log('\n✅ Migration completed successfully!');
  console.log(`   ${successCount} statements executed`);
  console.log(`   ${skipCount} statements skipped (already applied)`);
  console.log('\n📊 Enhanced telegram_user_accounts table now includes:');
  console.log('   • Complete user profile data (name, username, phone)');
  console.log('   • Telegram verification and status flags');
  console.log('   • Premium and bot account indicators');
  console.log('   • Online/activity status tracking');
  console.log('   • Account restrictions and privacy settings');
  console.log('   • Profile photos and emoji status');
  console.log('   • Connection quality metrics');
  console.log('   • Usage statistics (chats, messages, contracts)');
  console.log('   • Raw profile data backup (JSON)');
  console.log('\n🚀 Ready to store comprehensive Telegram account data!');

} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

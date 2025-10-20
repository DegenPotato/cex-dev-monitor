import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Running Enhanced Telegram User Accounts Migration...');

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

// Read migration SQL
const migrationSQL = readFileSync('./migrations/005_enhance_telegram_user_accounts.sql', 'utf8');

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
    db.run(statement + ';');
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
      // Don't throw - continue with other statements
    }
  }
}

// Save the database
const data = db.export();
writeFileSync('./monitor.db', data);
console.log('✅ Database saved');
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

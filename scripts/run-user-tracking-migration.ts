import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  console.log('🔧 Running user tracking enhancement migration...\n');

  try {
    // Open database
    const dbPath = join(__dirname, '..', 'wallet-monitor.db');
    const db = new Database(dbPath);
    
    console.log('📁 Database path:', dbPath);
    console.log('✅ Database connection established\n');

    // Read migration file
    const migrationPath = join(__dirname, '..', 'migrations', '003_enhance_user_tracking.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📝 Executing SQL statements...\n');

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let skipCount = 0;

    for (const statement of statements) {
      try {
        db.exec(statement);
        
        // Extract what we're doing from the statement
        if (statement.toUpperCase().includes('ALTER TABLE')) {
          const columnMatch = statement.match(/ADD COLUMN\s+(\w+)/i);
          if (columnMatch) {
            console.log(`✅ Added column: ${columnMatch[1]}`);
          }
        } else if (statement.toUpperCase().includes('CREATE INDEX')) {
          const indexMatch = statement.match(/CREATE INDEX.*?(\w+)\s+ON/i);
          if (indexMatch) {
            console.log(`✅ Created index: ${indexMatch[1]}`);
          }
        }
        successCount++;
      } catch (error: any) {
        if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
          const item = error.message.includes('column') ? 'Column' : 'Index';
          console.log(`⏭️  ${item} already exists, skipping...`);
          skipCount++;
        } else {
          console.error(`❌ Error executing statement:`, error.message);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   📝 Total statements: ${statements.length}`);

    // Verify columns exist
    console.log('\n🔍 Verifying new columns...');
    const tableInfo = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = tableInfo.map((col: any) => col.name);
    
    const requiredColumns = ['login_count', 'google_account_linked', 'last_activity'];
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length === 0) {
      console.log('✅ All required columns present');
    } else {
      console.log('⚠️  Missing columns:', missingColumns);
    }

    db.close();
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

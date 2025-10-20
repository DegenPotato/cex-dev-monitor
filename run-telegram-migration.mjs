import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Running Telegram integration migration...');

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

// Read and execute the Telegram migration SQL file
const telegramMigration = readFileSync('./migrations/004_telegram_integration.sql', 'utf8');

// Split by statements (crude but works for our SQL)
const statements = telegramMigration
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

let successCount = 0;
let errorCount = 0;

statements.forEach((statement, i) => {
  try {
    db.run(statement + ';');
    console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
    successCount++;
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log(`⏭️  Statement ${i + 1}/${statements.length} already exists`);
      successCount++;
    } else {
      console.error(`❌ Statement ${i + 1} failed:`, err.message);
      console.error(`Statement was: ${statement.substring(0, 100)}...`);
      errorCount++;
    }
  }
});

// Save the database
const data = db.export();
writeFileSync('./monitor.db', data);
console.log('✅ Database saved');
db.close();

console.log(`\n📊 Migration Summary:`);
console.log(`   ✅ Success: ${successCount}`);
console.log(`   ❌ Errors: ${errorCount}`);
console.log('✅ Telegram migration complete!');

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Running chat details migration...');

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

// Read and execute the migration SQL file
const migrationSql = readFileSync('./migrations/005_add_chat_details.sql', 'utf8');

// Split by statements
const statements = migrationSql
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
    if (err.message.includes('duplicate column name')) {
      console.log(`⏭️  Statement ${i + 1}/${statements.length} - column already exists`);
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
console.log('✅ Chat details migration complete!');

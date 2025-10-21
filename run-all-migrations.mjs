import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

console.log('🔄 Running database migrations...');

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

// Create migrations tracking table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL,
    applied_at INTEGER NOT NULL
  )
`);

// Get list of already applied migrations
const appliedMigrations = new Set();
try {
  const result = db.exec('SELECT filename FROM _migrations');
  if (result.length > 0) {
    result[0].values.forEach(row => appliedMigrations.add(row[0]));
  }
} catch (err) {
  console.error('⚠️  Could not read migrations table:', err.message);
}

console.log(`📋 Already applied: ${appliedMigrations.size} migration(s)`);

// Read all SQL files from migrations directory
const migrationsDir = './src/backend/database/migrations';
const migrationFiles = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort(); // Alphabetical order (001_, 002_, etc.)

console.log(`📁 Found ${migrationFiles.length} migration file(s)`);

let appliedCount = 0;
let skippedCount = 0;

for (const filename of migrationFiles) {
  // Skip if already applied
  if (appliedMigrations.has(filename)) {
    console.log(`⏭️  SKIP: ${filename} (already applied)`);
    skippedCount++;
    continue;
  }

  console.log(`\n▶️  APPLYING: ${filename}`);
  
  try {
    // Read SQL file
    const sqlPath = join(migrationsDir, filename);
    const sqlContent = readFileSync(sqlPath, 'utf8');
    
    // Remove comments
    const noComments = sqlContent
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    
    // Split by semicolon
    const statements = noComments
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`   📝 Executing ${statements.length} statement(s)...`);
    
    // Execute each statement
    let successCount = 0;
    for (let i = 0; i < statements.length; i++) {
      try {
        db.run(statements[i] + ';');
        successCount++;
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
          console.log(`   ⚠️  Statement ${i + 1}: Already exists (OK)`);
          successCount++;
        } else {
          console.error(`   ❌ Statement ${i + 1} failed: ${err.message}`);
          console.error(`      ${statements[i].substring(0, 100)}...`);
          throw err; // Stop migration on error
        }
      }
    }
    
    // Record migration as applied
    const now = Math.floor(Date.now() / 1000);
    db.run('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)', [filename, now]);
    
    console.log(`   ✅ SUCCESS: ${successCount}/${statements.length} statements executed`);
    appliedCount++;
    
  } catch (err) {
    console.error(`   ❌ FAILED: ${filename}`);
    console.error(`      Error: ${err.message}`);
    // Continue with next migration or stop?
    // For now, we'll stop on first failure
    break;
  }
}

// Save database
const data = db.export();
writeFileSync('./monitor.db', data);
db.close();

console.log('\n' + '='.repeat(60));
console.log(`✅ Migration complete!`);
console.log(`   Applied: ${appliedCount}`);
console.log(`   Skipped: ${skippedCount}`);
console.log(`   Total:   ${migrationFiles.length}`);
console.log('='.repeat(60));

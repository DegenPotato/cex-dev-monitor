import initSqlJs from 'sql.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

console.log('📊 Migration Status Report\n');

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

try {
  // Get all applied migrations
  const appliedResult = db.exec('SELECT * FROM _migrations ORDER BY applied_at ASC');
  const applied = new Map();
  
  if (appliedResult.length > 0 && appliedResult[0].values.length > 0) {
    appliedResult[0].values.forEach(row => {
      applied.set(row[1], {
        id: row[0],
        filename: row[1],
        appliedAt: row[2]
      });
    });
  }
  
  // Get all migration files
  const migrationsDir = './src/backend/database/migrations';
  const migrationFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  console.log(`📁 Total migration files: ${migrationFiles.length}`);
  console.log(`✅ Applied migrations: ${applied.size}`);
  console.log(`⏳ Pending migrations: ${migrationFiles.length - applied.size}\n`);
  
  console.log('═'.repeat(80));
  console.log('MIGRATION STATUS'.padEnd(60) + 'APPLIED AT');
  console.log('═'.repeat(80));
  
  for (const filename of migrationFiles) {
    const status = applied.has(filename);
    const icon = status ? '✅' : '⏳';
    const appliedAt = status 
      ? new Date(applied.get(filename).appliedAt * 1000).toISOString().replace('T', ' ').substring(0, 19)
      : 'PENDING';
    
    console.log(`${icon} ${filename.padEnd(57)} ${appliedAt}`);
  }
  
  console.log('═'.repeat(80));
  
  // Show recent migrations
  if (applied.size > 0) {
    console.log('\n📅 Most recent migrations:');
    const recent = Array.from(applied.values())
      .sort((a, b) => b.appliedAt - a.appliedAt)
      .slice(0, 5);
    
    recent.forEach((m, i) => {
      const date = new Date(m.appliedAt * 1000).toISOString().replace('T', ' ').substring(0, 19);
      console.log(`   ${i + 1}. ${m.filename} (${date})`);
    });
  }
  
  // Check for orphaned migrations (in DB but file deleted)
  const orphaned = [];
  applied.forEach((m, filename) => {
    if (!migrationFiles.includes(filename)) {
      orphaned.push(filename);
    }
  });
  
  if (orphaned.length > 0) {
    console.log('\n⚠️  Orphaned migrations (in database but file deleted):');
    orphaned.forEach(f => console.log(`   - ${f}`));
  }
  
  // Summary
  console.log('\n📋 Summary:');
  console.log(`   Total: ${migrationFiles.length} migrations`);
  console.log(`   Applied: ${applied.size}`);
  console.log(`   Pending: ${migrationFiles.length - applied.size}`);
  if (orphaned.length > 0) {
    console.log(`   Orphaned: ${orphaned.length}`);
  }
  
  // Next steps
  if (migrationFiles.length - applied.size > 0) {
    console.log('\n🚀 To apply pending migrations:');
    console.log('   node run-all-migrations.mjs');
  } else {
    console.log('\n✨ All migrations are up to date!');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.message.includes('no such table: _migrations')) {
    console.log('\n💡 Tip: Run migrations first to create tracking table');
    console.log('   node run-all-migrations.mjs');
  }
} finally {
  db.close();
}

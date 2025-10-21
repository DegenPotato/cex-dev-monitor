#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'database.sqlite');

try {
  const db = new Database(dbPath);
  
  console.log('🗑️  Clearing telegram message history...');
  
  const result1 = db.prepare('DELETE FROM telegram_message_history').run();
  console.log(`   ✅ Deleted ${result1.changes} messages`);
  
  const result2 = db.prepare('DELETE FROM telegram_chat_fetch_status').run();
  console.log(`   ✅ Deleted ${result2.changes} fetch status entries`);
  
  db.prepare('VACUUM').run();
  console.log('   ✅ Database vacuumed');
  
  db.close();
  console.log('✅ Done!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

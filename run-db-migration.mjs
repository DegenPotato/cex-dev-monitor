import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

const migrations = [
  // Add tracking columns
  `ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN google_account_linked BOOLEAN DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN last_activity TIMESTAMP`,
  
  // Create user_sessions table
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // Create user_youtube_accounts table
  `CREATE TABLE IF NOT EXISTS user_youtube_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    google_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMP NOT NULL,
    scope TEXT,
    is_primary BOOLEAN DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // Create indexes
  `CREATE INDEX IF NOT EXISTS idx_users_login_count ON users(login_count)`,
  `CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)`,
  `CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity)`,
  `CREATE INDEX IF NOT EXISTS idx_users_google_linked ON users(google_account_linked)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user_id ON user_youtube_accounts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_accounts_email ON user_youtube_accounts(email)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_accounts_google_user_id ON user_youtube_accounts(google_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_accounts_expires ON user_youtube_accounts(expires_at)`
];

migrations.forEach((sql, i) => {
  try {
    db.run(sql);
    console.log(`✅ Migration ${i + 1}/${migrations.length} executed`);
  } catch (err) {
    if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
      console.log(`⏭️  Migration ${i + 1}/${migrations.length} already exists`);
    } else {
      console.error(`❌ Migration ${i + 1} failed:`, err.message);
    }
  }
});

const data = db.export();
writeFileSync('./monitor.db', data);
console.log('✅ Database saved');
db.close();
console.log('✅ Migration complete!');

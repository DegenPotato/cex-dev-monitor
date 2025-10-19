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
  
  // Add YouTube columns to users
  `ALTER TABLE users ADD COLUMN youtube_enabled BOOLEAN DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN youtube_email TEXT`,
  `ALTER TABLE users ADD COLUMN youtube_preferences TEXT`,
  `ALTER TABLE users ADD COLUMN last_youtube_sync TIMESTAMP`,
  
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
  
  // Create youtube_playlists table
  `CREATE TABLE IF NOT EXISTS youtube_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    playlist_name TEXT NOT NULL,
    playlist_data TEXT NOT NULL,
    is_favorite BOOLEAN DEFAULT 0,
    play_count INTEGER DEFAULT 0,
    last_played TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  
  // Create youtube_history table
  `CREATE TABLE IF NOT EXISTS youtube_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    video_id TEXT NOT NULL,
    video_title TEXT NOT NULL,
    video_thumbnail TEXT,
    channel_title TEXT,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
  `CREATE INDEX IF NOT EXISTS idx_youtube_accounts_expires ON user_youtube_accounts(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_playlists_user ON youtube_playlists(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_playlists_favorite ON youtube_playlists(is_favorite)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_history_user ON youtube_history(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_history_video ON youtube_history(video_id)`,
  `CREATE INDEX IF NOT EXISTS idx_youtube_history_played_at ON youtube_history(played_at)`,
  
  // Add token_pools table for OHLCV data
  `CREATE TABLE IF NOT EXISTS token_pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mint_address TEXT NOT NULL,
    pool_address TEXT NOT NULL,
    pool_name TEXT,
    dex TEXT,
    base_token TEXT,
    quote_token TEXT,
    volume_24h_usd REAL,
    liquidity_usd REAL,
    price_usd REAL,
    is_primary INTEGER DEFAULT 0,
    discovered_at INTEGER NOT NULL,
    last_verified INTEGER,
    UNIQUE(mint_address, pool_address),
    FOREIGN KEY (mint_address) REFERENCES token_mints(mint_address)
  )`,
  
  `CREATE INDEX IF NOT EXISTS idx_token_pools_mint ON token_pools(mint_address)`,
  `CREATE INDEX IF NOT EXISTS idx_token_pools_pool ON token_pools(pool_address)`,
  `CREATE INDEX IF NOT EXISTS idx_token_pools_primary ON token_pools(mint_address, is_primary)`,
  
  // Add migrated_pool_address column to token_mints for storing post-migration Raydium pool
  `ALTER TABLE token_mints ADD COLUMN migrated_pool_address TEXT`
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

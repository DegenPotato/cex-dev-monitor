import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '../../../monitor.db');

let db: SqlJsDatabase;

async function initSqlJsDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    return new SQL.Database(buffer);
  } else {
    return new SQL.Database();
  }
}

// Helper to save database to disk
export function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
  }
}

// Save database periodically
setInterval(saveDatabase, 30000); // Save every 30 seconds

// Save on exit
process.on('exit', saveDatabase);
process.on('SIGINT', () => {
  saveDatabase();
  process.exit(0);
});

export async function getDb(): Promise<SqlJsDatabase> {
  if (!db) {
    db = await initSqlJsDb();
  }
  return db;
}

export async function initDatabase() {
  db = await getDb();
  
  // Check if table exists with old schema
  const tableInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='monitored_wallets'");
  const needsMigration = tableInfo.length > 0 && 
    tableInfo[0].values.length > 0 &&
    typeof tableInfo[0].values[0][0] === 'string' &&
    tableInfo[0].values[0][0].includes('address TEXT UNIQUE');
  
  if (needsMigration) {
    console.log('🔄 Migrating monitored_wallets table to support multiple monitoring types per wallet...');
    
    // Create new table with composite unique constraint
    db.run(`
      CREATE TABLE monitored_wallets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        source TEXT,
        first_seen INTEGER NOT NULL,
        last_activity INTEGER,
        is_active INTEGER DEFAULT 1,
        is_fresh INTEGER DEFAULT 0,
        wallet_age_days REAL,
        previous_tx_count INTEGER DEFAULT 0,
        is_dev_wallet INTEGER DEFAULT 0,
        tokens_deployed INTEGER DEFAULT 0,
        dev_checked INTEGER DEFAULT 0,
        metadata TEXT,
        label TEXT,
        monitoring_type TEXT DEFAULT 'pumpfun',
        rate_limit_rps REAL DEFAULT 1,
        rate_limit_enabled INTEGER DEFAULT 1,
        history_checked INTEGER DEFAULT 0,
        last_history_check INTEGER,
        last_processed_signature TEXT,
        last_processed_slot INTEGER,
        last_processed_time INTEGER,
        UNIQUE(address, monitoring_type)
      );
    `);
    
    // Copy data from old table
    db.run(`
      INSERT INTO monitored_wallets_new 
      SELECT * FROM monitored_wallets;
    `);
    
    // Drop old table and rename new one
    db.run(`DROP TABLE monitored_wallets;`);
    db.run(`ALTER TABLE monitored_wallets_new RENAME TO monitored_wallets;`);
    
    console.log('✅ Migration complete: (address, monitoring_type) is now composite unique key');
  } else {
    // Create table with new schema
    db.run(`
      CREATE TABLE IF NOT EXISTS monitored_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        source TEXT,
        first_seen INTEGER NOT NULL,
        last_activity INTEGER,
        is_active INTEGER DEFAULT 1,
        is_fresh INTEGER DEFAULT 0,
        wallet_age_days REAL,
        previous_tx_count INTEGER DEFAULT 0,
        is_dev_wallet INTEGER DEFAULT 0,
        tokens_deployed INTEGER DEFAULT 0,
        dev_checked INTEGER DEFAULT 0,
        metadata TEXT,
        label TEXT,
        monitoring_type TEXT DEFAULT 'pumpfun',
        rate_limit_rps REAL DEFAULT 1,
        rate_limit_enabled INTEGER DEFAULT 1,
        history_checked INTEGER DEFAULT 0,
        last_history_check INTEGER,
        last_processed_signature TEXT,
        last_processed_slot INTEGER,
        last_processed_time INTEGER,
        UNIQUE(address, monitoring_type)
      );
    `);
  }

  // Migration: Add new columns if they don't exist
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN is_dev_wallet INTEGER DEFAULT 0;`);
    console.log('✅ Added is_dev_wallet column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN tokens_deployed INTEGER DEFAULT 0;`);
    console.log('✅ Added tokens_deployed column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN dev_checked INTEGER DEFAULT 0;`);
    console.log('✅ Added dev_checked column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN history_checked INTEGER DEFAULT 0;`);
    console.log('✅ Added history_checked column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN last_history_check INTEGER;`);
    console.log('✅ Added last_history_check column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN monitoring_type TEXT DEFAULT 'pumpfun';`);
    console.log('✅ Added monitoring_type column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN label TEXT;`);
    console.log('✅ Added label column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN rate_limit_rps INTEGER DEFAULT 1;`);
    console.log('✅ Added rate_limit_rps column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN rate_limit_enabled INTEGER DEFAULT 1;`);
    console.log('✅ Added rate_limit_enabled column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN last_processed_signature TEXT;`);
    console.log('✅ Added last_processed_signature column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN last_processed_slot INTEGER;`);
    console.log('✅ Added last_processed_slot column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE monitored_wallets ADD COLUMN last_processed_time INTEGER;`);
    console.log('✅ Added last_processed_time column');
  } catch (e) {
    // Column already exists, ignore
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS source_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      purpose TEXT DEFAULT 'funding',
      is_monitoring INTEGER DEFAULT 1,
      added_at INTEGER NOT NULL,
      total_recipients INTEGER DEFAULT 0,
      total_sent_sol REAL DEFAULT 0,
      last_activity INTEGER,
      notes TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT UNIQUE NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      block_time INTEGER,
      status TEXT DEFAULT 'confirmed'
    );

    CREATE TABLE IF NOT EXISTS token_mints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mint_address TEXT UNIQUE NOT NULL,
      creator_address TEXT NOT NULL,
      name TEXT,
      symbol TEXT,
      timestamp INTEGER NOT NULL,
      platform TEXT DEFAULT 'pumpfun',
      starting_mcap REAL,
      current_mcap REAL,
      ath_mcap REAL,
      last_updated INTEGER,
      metadata TEXT
    );
  `);

  // Migration: Add signature column to token_mints
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN signature TEXT;`);
    console.log('✅ Added signature column to token_mints');
  } catch (e) {
    // Column already exists, ignore
  }

  // Migration: Add market cap columns to token_mints if they don't exist
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN starting_mcap REAL;`);
    console.log('✅ Added starting_mcap column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN current_mcap REAL;`);
    console.log('✅ Added current_mcap column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN ath_mcap REAL;`);
    console.log('✅ Added ath_mcap column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN last_updated INTEGER;`);
    console.log('✅ Added last_updated column');
  } catch (e) {
    // Column already exists, ignore
  }

  db.run(`

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
    CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address);
    CREATE INDEX IF NOT EXISTS idx_token_mints_creator ON token_mints(creator_address);
    CREATE INDEX IF NOT EXISTS idx_monitored_wallets_active ON monitored_wallets(is_active);
    CREATE INDEX IF NOT EXISTS idx_source_wallets_monitoring ON source_wallets(is_monitoring);
  `);

  // Set default config
    db.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', ['cex_wallet', 'DwdrYTtTWHfnfJBiN2RH6EgPbquDQLjZTfTwpykPEq1g']);
    db.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', ['threshold_sol', '1']);
    db.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', ['max_threshold_sol', '6.9']);
    
    // Rate limiter settings (for when proxies are disabled)
    db.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', ['ratelimit_max_requests_10s', '90']);
    db.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', ['ratelimit_max_concurrent', '35']);
    db.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', ['ratelimit_min_delay_ms', '105']);
    
    // Global concurrency limiter (prevents request bursts across all services)
    db.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', ['global_max_concurrent', '20']);

  // Migrate existing CEX wallet to source_wallets table
  db.run(`
    INSERT OR IGNORE INTO source_wallets (address, name, purpose, is_monitoring, added_at, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    'DwdrYTtTWHfnfJBiN2RH6EgPbquDQLjZTfTwpykPEq1g',
    'CEX 1',
    'funding',
    1,
    Date.now(),
    'Original funding wallet'
  ]);

  // Add ChangeNow wallet
  db.run(`
    INSERT OR IGNORE INTO source_wallets (address, name, purpose, is_monitoring, added_at, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    'G2YxRa6wt1qePMwfJzdXZG62ej4qaTC7YURzuh2Lwd3t',
    'ChangeNow (CEX 2)',
    'funding',
    0, // Start with monitoring OFF
    Date.now(),
    'ChangeNow SOL funding wallet'
  ]);

  saveDatabase();
  console.log('✅ Database initialized');
}

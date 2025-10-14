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

// Alias for synchronous access (must be called after initDatabase)
export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
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
    
    // Copy data from old table with column mapping and defaults for new columns
    db.run(`
      INSERT INTO monitored_wallets_new (
        id, address, source, first_seen, last_activity, is_active, is_fresh,
        wallet_age_days, previous_tx_count, is_dev_wallet, tokens_deployed, dev_checked,
        metadata, label, monitoring_type, rate_limit_rps, rate_limit_enabled,
        history_checked, last_history_check, last_processed_signature,
        last_processed_slot, last_processed_time
      )
      SELECT 
        id, address, source, first_seen, last_activity, is_active, is_fresh,
        wallet_age_days, previous_tx_count, 
        COALESCE(is_dev_wallet, 0),
        COALESCE(tokens_deployed, 0),
        COALESCE(dev_checked, 0),
        metadata,
        COALESCE(label, NULL),
        COALESCE(monitoring_type, 'pumpfun'),
        COALESCE(rate_limit_rps, 1),
        COALESCE(rate_limit_enabled, 1),
        COALESCE(history_checked, 0),
        COALESCE(last_history_check, NULL),
        COALESCE(last_processed_signature, NULL),
        COALESCE(last_processed_slot, NULL),
        COALESCE(last_processed_time, NULL)
      FROM monitored_wallets;
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
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN price_usd REAL;`);
    console.log('✅ Added price_usd column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN price_sol REAL;`);
    console.log('✅ Added price_sol column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN graduation_percentage REAL;`);
    console.log('✅ Added graduation_percentage column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN launchpad_completed INTEGER DEFAULT 0;`);
    console.log('✅ Added launchpad_completed column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN launchpad_completed_at INTEGER;`);
    console.log('✅ Added launchpad_completed_at column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN migrated_pool_address TEXT;`);
    console.log('✅ Added migrated_pool_address column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN total_supply TEXT;`);
    console.log('✅ Added total_supply column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN market_cap_usd REAL;`);
    console.log('✅ Added market_cap_usd column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN coingecko_coin_id TEXT;`);
    console.log('✅ Added coingecko_coin_id column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN gt_score REAL;`);
    console.log('✅ Added gt_score column');
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    db.run(`ALTER TABLE token_mints ADD COLUMN description TEXT;`);
    console.log('✅ Added description column');
  } catch (e) {
    // Column already exists, ignore
  }

  // Migrate token_pools table for multi-pool support
  try {
    db.run(`ALTER TABLE token_pools ADD COLUMN base_token TEXT;`);
    console.log('✅ Added base_token column to token_pools');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.run(`ALTER TABLE token_pools ADD COLUMN quote_token TEXT;`);
    console.log('✅ Added quote_token column to token_pools');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.run(`ALTER TABLE token_pools ADD COLUMN volume_24h_usd REAL;`);
    console.log('✅ Added volume_24h_usd column to token_pools');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.run(`ALTER TABLE token_pools ADD COLUMN liquidity_usd REAL;`);
    console.log('✅ Added liquidity_usd column to token_pools');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.run(`ALTER TABLE token_pools ADD COLUMN price_usd REAL;`);
    console.log('✅ Added price_usd column to token_pools');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.run(`ALTER TABLE token_pools ADD COLUMN is_primary INTEGER DEFAULT 0;`);
    console.log('✅ Added is_primary column to token_pools');
  } catch (e) {
    // Column already exists, ignore
  }

  // Migrate ohlcv_backfill_progress for per-pool tracking
  try {
    db.run(`ALTER TABLE ohlcv_backfill_progress ADD COLUMN pool_address TEXT;`);
    console.log('✅ Added pool_address column to ohlcv_backfill_progress');
  } catch (e) {
    // Column already exists, ignore
  }

  // CRITICAL FIX: Rebuild token_pools table with correct UNIQUE constraint
  // Old: UNIQUE(mint_address) - only 1 pool per token
  // New: UNIQUE(mint_address, pool_address) - multiple pools per token
  try {
    // Check if old constraint exists
    const tableInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='token_pools'");
    const tableSql = tableInfo[0]?.values[0]?.[0] as string || '';
    
    // If table has old single-column UNIQUE constraint, rebuild it
    if (tableSql.includes('mint_address TEXT NOT NULL UNIQUE') || 
        (tableSql.includes('UNIQUE(mint_address)') && !tableSql.includes('pool_address'))) {
      console.log('⚠️  Rebuilding token_pools table with multi-pool support...');
      
      // Backup existing data
      db.run(`CREATE TABLE token_pools_backup AS SELECT * FROM token_pools`);
      
      // Drop old table
      db.run(`DROP TABLE token_pools`);
      
      // Recreate with correct schema
      db.run(`
        CREATE TABLE token_pools (
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
          UNIQUE(mint_address, pool_address)
        )
      `);
      
      // Restore data (keeping only first pool per token for now)
      db.run(`
        INSERT OR IGNORE INTO token_pools 
        SELECT * FROM token_pools_backup
      `);
      
      // Drop backup
      db.run(`DROP TABLE token_pools_backup`);
      
      console.log('✅ token_pools table rebuilt with multi-pool support');
    }
  } catch (e) {
    console.log('⚠️  Could not rebuild token_pools (may already be correct):', e);
  }

  // CRITICAL FIX: Rebuild ohlcv_backfill_progress with pool-based tracking
  // Old: UNIQUE(mint_address, timeframe) - per-token tracking
  // New: UNIQUE(pool_address, timeframe) - per-pool tracking
  try {
    const progressInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='ohlcv_backfill_progress'");
    const progressSql = progressInfo[0]?.values[0]?.[0] as string || '';
    
    // If table has old mint-based UNIQUE constraint, rebuild it
    if (progressSql.includes('UNIQUE(mint_address, timeframe)') && 
        !progressSql.includes('UNIQUE(pool_address, timeframe)')) {
      console.log('⚠️  Rebuilding ohlcv_backfill_progress for per-pool tracking...');
      
      // Clear old progress data (incompatible structure)
      db.run(`DROP TABLE IF EXISTS ohlcv_backfill_progress`);
      
      // Recreate with correct schema
      db.run(`
        CREATE TABLE ohlcv_backfill_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mint_address TEXT NOT NULL,
          pool_address TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          oldest_timestamp INTEGER,
          newest_timestamp INTEGER,
          backfill_complete INTEGER DEFAULT 0,
          last_fetch_at INTEGER,
          fetch_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          last_error TEXT,
          UNIQUE(pool_address, timeframe)
        )
      `);
      
      console.log('✅ ohlcv_backfill_progress table rebuilt for per-pool tracking');
    }
  } catch (e) {
    console.log('⚠️  Could not rebuild ohlcv_backfill_progress (may already be correct):', e);
  }

  // CRITICAL FIX: Rebuild ohlcv_data with pool-based UNIQUE constraint
  // Old: UNIQUE(mint_address, timeframe, timestamp) - per-token dedup
  // New: UNIQUE(pool_address, timeframe, timestamp) - per-pool dedup
  try {
    const ohlcvInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='ohlcv_data'");
    const ohlcvSql = ohlcvInfo[0]?.values[0]?.[0] as string || '';
    
    // If table has old mint-based UNIQUE constraint, rebuild it
    if (ohlcvSql.includes('UNIQUE(mint_address, timeframe, timestamp)')) {
      console.log('⚠️  Rebuilding ohlcv_data for per-pool storage...');
      
      // Clear old OHLCV data (incompatible with multi-pool)
      db.run(`DROP TABLE IF EXISTS ohlcv_data`);
      
      // Recreate with correct schema
      db.run(`
        CREATE TABLE ohlcv_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mint_address TEXT NOT NULL,
          pool_address TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(pool_address, timeframe, timestamp)
        )
      `);
      
      console.log('✅ ohlcv_data table rebuilt for per-pool storage');
    }
  } catch (e) {
    console.log('⚠️  Could not rebuild ohlcv_data (may already be correct):', e);
  }

  // OHLCV Data Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS token_pools (
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
      UNIQUE(mint_address, pool_address)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ohlcv_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mint_address TEXT NOT NULL,
      pool_address TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(pool_address, timeframe, timestamp)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ohlcv_backfill_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mint_address TEXT NOT NULL,
      pool_address TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      oldest_timestamp INTEGER,
      newest_timestamp INTEGER,
      backfill_complete INTEGER DEFAULT 0,
      last_fetch_at INTEGER,
      fetch_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_error TEXT,
      UNIQUE(pool_address, timeframe)
    );
  `);

  db.run(`

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
    CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address);
    
    CREATE INDEX IF NOT EXISTS idx_token_pools_mint ON token_pools(mint_address);
    CREATE INDEX IF NOT EXISTS idx_token_pools_pool ON token_pools(pool_address);
    CREATE INDEX IF NOT EXISTS idx_token_pools_primary ON token_pools(mint_address, is_primary);
    
    CREATE INDEX IF NOT EXISTS idx_ohlcv_pool_timeframe ON ohlcv_data(pool_address, timeframe);
    CREATE INDEX IF NOT EXISTS idx_backfill_progress_pool ON ohlcv_backfill_progress(pool_address);
    
    CREATE INDEX IF NOT EXISTS idx_ohlcv_mint_timeframe ON ohlcv_data(mint_address, timeframe);
    CREATE INDEX IF NOT EXISTS idx_ohlcv_timestamp ON ohlcv_data(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv_data(pool_address, timeframe, timestamp);
    
    CREATE INDEX IF NOT EXISTS idx_backfill_progress_mint ON ohlcv_backfill_progress(mint_address);
    CREATE INDEX IF NOT EXISTS idx_backfill_progress_incomplete ON ohlcv_backfill_progress(backfill_complete);
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

-- Migration: GeckoTerminal Networks and DEXes
-- Date: 2024-10-24
-- Purpose: Store all supported networks and DEXes from GeckoTerminal
-- Updates: Daily sync to keep data current

-- Table for all supported blockchain networks
CREATE TABLE IF NOT EXISTS gecko_networks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network_id TEXT NOT NULL UNIQUE,  -- e.g., 'eth', 'solana', 'bsc'
  
  -- Network details
  name TEXT NOT NULL,               -- e.g., 'Ethereum', 'Solana'
  coingecko_asset_platform_id TEXT, -- CoinGecko platform identifier
  
  -- Network stats (to be added as we gather more data)
  total_tokens INTEGER DEFAULT 0,
  total_pools INTEGER DEFAULT 0,
  total_dexes INTEGER DEFAULT 0,
  
  -- Metadata
  is_active INTEGER DEFAULT 1,
  is_testnet INTEGER DEFAULT 0,
  chain_type TEXT,                  -- 'evm', 'solana', 'cosmos', etc.
  native_token_symbol TEXT,         -- 'ETH', 'SOL', 'BNB', etc.
  
  -- Update tracking
  first_seen_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_updated INTEGER DEFAULT (strftime('%s', 'now')),
  last_sync_at INTEGER,
  
  -- Raw data from API
  raw_data TEXT                     -- JSON string of full API response
);

-- Table for all DEXes across all networks
CREATE TABLE IF NOT EXISTS gecko_dexes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dex_id TEXT NOT NULL,             -- e.g., 'uniswap-v3', 'raydium'
  network_id TEXT NOT NULL,         -- Foreign key to gecko_networks
  
  -- DEX details
  name TEXT NOT NULL,               -- e.g., 'Uniswap V3', 'Raydium'
  dex_type TEXT,                    -- 'amm', 'clmm', 'orderbook', etc.
  
  -- DEX stats (to be populated later)
  total_pools INTEGER DEFAULT 0,
  total_volume_24h_usd REAL DEFAULT 0,
  total_liquidity_usd REAL DEFAULT 0,
  
  -- Metadata
  is_active INTEGER DEFAULT 1,
  factory_address TEXT,              -- Main factory contract address
  router_address TEXT,               -- Main router contract address
  
  -- Update tracking
  first_seen_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_updated INTEGER DEFAULT (strftime('%s', 'now')),
  last_sync_at INTEGER,
  
  -- Raw data
  raw_data TEXT,                    -- JSON string of full API response
  
  UNIQUE(dex_id, network_id),
  FOREIGN KEY (network_id) REFERENCES gecko_networks(network_id) ON DELETE CASCADE
);

-- Table to track network<->token relationships
CREATE TABLE IF NOT EXISTS token_networks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL,         -- Token address/mint
  network_id TEXT NOT NULL,         -- Which network this token is on
  
  -- Token details on this network
  is_native INTEGER DEFAULT 0,      -- Is this the native token of the network?
  is_wrapped INTEGER DEFAULT 0,     -- Is this a wrapped version?
  bridge_from_network TEXT,         -- If bridged, from which network?
  
  -- Contract details
  token_address TEXT NOT NULL,      -- Actual contract address on this network
  decimals INTEGER,
  
  -- Stats on this network
  holders_count INTEGER,
  total_supply REAL,
  circulating_supply REAL,
  
  -- Market data on this network
  price_usd REAL,
  market_cap_usd REAL,
  volume_24h_usd REAL,
  liquidity_usd REAL,
  
  -- Metadata
  deployment_timestamp INTEGER,
  deployer_address TEXT,
  
  -- Update tracking
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(token_mint, network_id),
  FOREIGN KEY (network_id) REFERENCES gecko_networks(network_id) ON DELETE CASCADE,
  FOREIGN KEY (token_mint) REFERENCES token_registry(token_mint) ON DELETE CASCADE
);

-- Table to track token<->DEX relationships
CREATE TABLE IF NOT EXISTS token_dexes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL,
  network_id TEXT NOT NULL,
  dex_id TEXT NOT NULL,
  
  -- Pool/Pair details
  pool_address TEXT,                -- Main pool/pair address
  pair_symbol TEXT,                 -- e.g., 'TOKEN/SOL'
  base_token_address TEXT,
  quote_token_address TEXT,
  
  -- Liquidity details
  liquidity_usd REAL,
  liquidity_base REAL,
  liquidity_quote REAL,
  
  -- Volume metrics
  volume_24h_usd REAL,
  volume_7d_usd REAL,
  volume_30d_usd REAL,
  
  -- Trading metrics
  trades_24h INTEGER,
  trades_7d INTEGER,
  unique_traders_24h INTEGER,
  
  -- Price data
  price_usd REAL,
  price_quote REAL,
  price_change_24h REAL,
  
  -- Fee structure
  swap_fee_bps INTEGER,             -- Basis points (e.g., 30 = 0.3%)
  lp_fee_bps INTEGER,
  protocol_fee_bps INTEGER,
  
  -- Status
  is_active INTEGER DEFAULT 1,
  is_primary_market INTEGER DEFAULT 0,  -- Is this the main trading venue?
  
  -- Timestamps
  pool_created_at INTEGER,
  first_trade_at INTEGER,
  last_trade_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(token_mint, network_id, dex_id, pool_address),
  FOREIGN KEY (network_id) REFERENCES gecko_networks(network_id) ON DELETE CASCADE,
  FOREIGN KEY (dex_id, network_id) REFERENCES gecko_dexes(dex_id, network_id) ON DELETE CASCADE,
  FOREIGN KEY (token_mint) REFERENCES token_registry(token_mint) ON DELETE CASCADE
);

-- Sync status tracking
CREATE TABLE IF NOT EXISTS gecko_sync_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL,          -- 'networks', 'dexes', 'tokens'
  network_id TEXT,                  -- NULL for global syncs
  
  -- Sync details
  last_sync_at INTEGER,
  next_sync_at INTEGER,
  sync_interval_seconds INTEGER DEFAULT 86400,  -- 24 hours default
  
  -- Status
  status TEXT DEFAULT 'pending',    -- 'pending', 'running', 'completed', 'failed'
  last_error TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Statistics
  total_items_synced INTEGER DEFAULT 0,
  items_added INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_removed INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(sync_type, network_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gecko_networks_active ON gecko_networks(is_active, network_id);
CREATE INDEX IF NOT EXISTS idx_gecko_networks_chain_type ON gecko_networks(chain_type);

CREATE INDEX IF NOT EXISTS idx_gecko_dexes_network ON gecko_dexes(network_id, is_active);
CREATE INDEX IF NOT EXISTS idx_gecko_dexes_volume ON gecko_dexes(total_volume_24h_usd DESC);

CREATE INDEX IF NOT EXISTS idx_token_networks_token ON token_networks(token_mint, network_id);
CREATE INDEX IF NOT EXISTS idx_token_networks_network ON token_networks(network_id);
CREATE INDEX IF NOT EXISTS idx_token_networks_volume ON token_networks(volume_24h_usd DESC);

CREATE INDEX IF NOT EXISTS idx_token_dexes_token ON token_dexes(token_mint, network_id);
CREATE INDEX IF NOT EXISTS idx_token_dexes_dex ON token_dexes(dex_id, network_id);
CREATE INDEX IF NOT EXISTS idx_token_dexes_liquidity ON token_dexes(liquidity_usd DESC);
CREATE INDEX IF NOT EXISTS idx_token_dexes_volume ON token_dexes(volume_24h_usd DESC);

CREATE INDEX IF NOT EXISTS idx_gecko_sync_status ON gecko_sync_status(sync_type, status, next_sync_at);

-- Views for common queries

-- View: Active networks with stats
CREATE VIEW IF NOT EXISTS active_networks_summary AS
SELECT 
  gn.*,
  COUNT(DISTINCT gd.dex_id) as active_dexes_count,
  COUNT(DISTINCT tn.token_mint) as active_tokens_count
FROM gecko_networks gn
LEFT JOIN gecko_dexes gd ON gn.network_id = gd.network_id AND gd.is_active = 1
LEFT JOIN token_networks tn ON gn.network_id = tn.network_id
WHERE gn.is_active = 1
GROUP BY gn.network_id;

-- View: Token distribution across networks
CREATE VIEW IF NOT EXISTS token_network_distribution AS
SELECT 
  token_mint,
  COUNT(DISTINCT network_id) as network_count,
  GROUP_CONCAT(network_id) as networks,
  SUM(volume_24h_usd) as total_volume_24h,
  SUM(liquidity_usd) as total_liquidity
FROM token_networks
GROUP BY token_mint;

-- View: Most active DEXes
CREATE VIEW IF NOT EXISTS most_active_dexes AS
SELECT 
  gd.*,
  gn.name as network_name,
  COUNT(DISTINCT td.token_mint) as unique_tokens,
  SUM(td.volume_24h_usd) as total_volume_24h,
  SUM(td.liquidity_usd) as total_liquidity
FROM gecko_dexes gd
JOIN gecko_networks gn ON gd.network_id = gn.network_id
LEFT JOIN token_dexes td ON gd.dex_id = td.dex_id AND gd.network_id = td.network_id
WHERE gd.is_active = 1
GROUP BY gd.dex_id, gd.network_id
ORDER BY total_volume_24h DESC;

-- View: Cross-chain tokens (tokens on multiple networks)
CREATE VIEW IF NOT EXISTS cross_chain_tokens AS
SELECT 
  tr.token_mint,
  tr.token_symbol,
  tr.token_name,
  COUNT(DISTINCT tn.network_id) as chain_count,
  GROUP_CONCAT(DISTINCT tn.network_id) as chains,
  SUM(tn.volume_24h_usd) as total_volume_all_chains,
  MAX(tn.volume_24h_usd) as highest_volume_chain_volume,
  (
    SELECT network_id 
    FROM token_networks 
    WHERE token_mint = tr.token_mint 
    ORDER BY volume_24h_usd DESC 
    LIMIT 1
  ) as primary_chain
FROM token_registry tr
JOIN token_networks tn ON tr.token_mint = tn.token_mint
GROUP BY tr.token_mint
HAVING chain_count > 1
ORDER BY chain_count DESC, total_volume_all_chains DESC;

-- Initial data for known networks (Solana focus but extensible)
INSERT OR IGNORE INTO gecko_networks (network_id, name, coingecko_asset_platform_id, chain_type, native_token_symbol) VALUES
('solana', 'Solana', 'solana', 'solana', 'SOL'),
('eth', 'Ethereum', 'ethereum', 'evm', 'ETH'),
('bsc', 'BNB Chain', 'binance-smart-chain', 'evm', 'BNB'),
('base', 'Base', 'base', 'evm', 'ETH'),
('arbitrum', 'Arbitrum', 'arbitrum-one', 'evm', 'ETH'),
('polygon_pos', 'Polygon POS', 'polygon-pos', 'evm', 'MATIC'),
('avax', 'Avalanche', 'avalanche', 'evm', 'AVAX'),
('ton', 'TON', 'the-open-network', 'ton', 'TON'),
('sui-network', 'Sui Network', 'sui', 'move', 'SUI'),
('sei-network', 'Sei Network', 'sei-network', 'cosmos', 'SEI');

-- Initial sync status entries
INSERT OR IGNORE INTO gecko_sync_status (sync_type, sync_interval_seconds, status) VALUES
('networks', 86400, 'pending'),     -- Sync networks daily
('dexes', 86400, 'pending'),        -- Sync DEXes daily  
('tokens', 3600, 'pending');        -- Sync token data hourly

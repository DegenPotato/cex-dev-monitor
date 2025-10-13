export interface MonitoredWallet {
  id?: number;
  address: string;
  source?: string;
  first_seen: number;
  last_activity?: number;
  is_active: number;
  is_fresh: number;
  wallet_age_days?: number;
  previous_tx_count: number;
  is_dev_wallet: number;
  tokens_deployed: number;
  dev_checked: number;
  history_checked?: number;
  last_history_check?: number;
  last_processed_signature?: string; // Checkpoint: last signature we processed
  last_processed_slot?: number; // Checkpoint: last block slot
  last_processed_time?: number; // Checkpoint: last transaction timestamp
  label?: string;
  monitoring_type?: string;
  rate_limit_rps?: number; // Requests per second (default: 1)
  rate_limit_enabled?: number; // Rate limiting on/off (default: 1)
  metadata?: string;
}

export interface Transaction {
  id?: number;
  signature: string;
  from_address: string;
  to_address: string;
  amount: number;
  timestamp: number;
  block_time?: number;
  status: string;
}

export interface TokenMint {
  id?: number;
  mint_address: string;
  creator_address: string;
  name?: string;
  symbol?: string;
  timestamp: number;
  platform: string;
  signature?: string;
  starting_mcap?: number;
  current_mcap?: number;
  ath_mcap?: number;
  price_usd?: number;
  price_sol?: number;
  graduation_percentage?: number;
  launchpad_completed?: number; // 0 or 1 (SQLite boolean)
  launchpad_completed_at?: number; // Timestamp
  migrated_pool_address?: string;
  total_supply?: string;
  market_cap_usd?: number;
  coingecko_coin_id?: string;
  last_updated?: number;
  metadata?: string;
}

export interface Config {
  key: string;
  value: string;
}

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
  last_updated?: number;
  metadata?: string;
}

export interface Config {
  key: string;
  value: string;
}

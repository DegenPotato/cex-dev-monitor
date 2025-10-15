-- Authentication and Referral System Migration
-- Adds role-based authentication, JWT token management, and 10-level referral tracking

-- Core users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL UNIQUE COLLATE NOCASE,
    solana_wallet_address TEXT UNIQUE COLLATE NOCASE,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'user', -- 'user', 'admin', 'super_admin'
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'banned', 'inactive'
    referral_code TEXT UNIQUE NOT NULL,
    referred_by INTEGER, -- ID of referrer (not code, for easier chain traversal)
    chip_balance INTEGER DEFAULT 0,
    total_referrals INTEGER DEFAULT 0,
    total_commission_earned REAL DEFAULT 0.0,
    referral_tier INTEGER DEFAULT 1,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referred_by) REFERENCES users(id)
);

-- Authentication challenges for nonce-based signature verification
CREATE TABLE IF NOT EXISTS auth_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL COLLATE NOCASE,
    nonce TEXT NOT NULL,
    message TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_address, nonce)
);

-- User sessions for JWT token tracking and revocation
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Referral configuration (commission rates per tier)
CREATE TABLE IF NOT EXISTS referral_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_level INTEGER NOT NULL UNIQUE,
    commission_rate REAL NOT NULL, -- percentage (e.g., 0.10 for 10%)
    min_referrals INTEGER DEFAULT 0,
    max_commission REAL, -- optional cap on commission
    bonus_multiplier REAL DEFAULT 1.0,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reward transactions log for referral commissions and other rewards
CREATE TABLE IF NOT EXISTS reward_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    transaction_type TEXT NOT NULL, -- 'earn', 'spend', 'referral_commission', 'social', 'daily_bonus'
    amount REAL NOT NULL,
    points_awarded INTEGER DEFAULT 0,
    description TEXT NOT NULL,
    metadata TEXT, -- JSON for additional data (referral details, level, etc)
    status TEXT DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'cancelled'
    blockchain_tx_hash TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System configuration table
CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT NOT NULL UNIQUE,
    config_value TEXT NOT NULL, -- JSON string
    config_type TEXT NOT NULL DEFAULT 'general', -- 'general', 'referral', 'admin'
    description TEXT,
    updated_by TEXT, -- admin wallet who made the change
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_solana_wallet ON users(solana_wallet_address COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_wallet ON auth_challenges(wallet_address COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_user ON reward_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_wallet ON reward_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_type ON reward_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);
CREATE INDEX IF NOT EXISTS idx_system_config_type ON system_config(config_type);

-- Insert default referral tier configuration
INSERT INTO referral_config (tier_level, commission_rate, min_referrals, bonus_multiplier) VALUES
(1, 0.05, 0, 1.0),   -- Tier 1: 5% commission, direct referral
(2, 0.03, 0, 1.0),   -- Tier 2: 3% commission, 2nd level
(3, 0.02, 0, 1.0),   -- Tier 3: 2% commission, 3rd level
(4, 0.015, 0, 1.0),  -- Tier 4: 1.5% commission, 4th level
(5, 0.01, 0, 1.0),   -- Tier 5: 1% commission, 5th level
(6, 0.008, 0, 1.0),  -- Tier 6: 0.8% commission, 6th level
(7, 0.006, 0, 1.0),  -- Tier 7: 0.6% commission, 7th level
(8, 0.004, 0, 1.0),  -- Tier 8: 0.4% commission, 8th level
(9, 0.002, 0, 1.0),  -- Tier 9: 0.2% commission, 9th level
(10, 0.001, 0, 1.0)  -- Tier 10: 0.1% commission, 10th level
ON CONFLICT(tier_level) DO NOTHING;

-- Insert default system configuration
INSERT INTO system_config (config_key, config_value, config_type, description) VALUES
('referral_system_enabled', 'true', 'referral', 'Enable/disable referral reward system'),
('max_referral_levels', '10', 'referral', 'Maximum referral chain depth'),
('admin_wallets', '[]', 'admin', 'JSON array of admin wallet addresses'),
('jwt_access_token_expiry', '900', 'general', 'Access token expiry in seconds (15 min)'),
('jwt_refresh_token_expiry', '604800', 'general', 'Refresh token expiry in seconds (7 days)')
ON CONFLICT(config_key) DO NOTHING;

-- Fix wallet_address to allow NULL for Solana-only users
-- The NOT NULL constraint prevents Solana wallet creation

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- First backup the existing users
CREATE TABLE IF NOT EXISTS users_backup AS SELECT * FROM users;

-- Drop the old table
DROP TABLE IF EXISTS users;

-- Recreate with wallet_address as nullable
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE COLLATE NOCASE,
    solana_wallet_address TEXT UNIQUE COLLATE NOCASE,
    username TEXT NOT NULL UNIQUE,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    referral_code TEXT UNIQUE,
    referred_by INTEGER,
    last_login INTEGER,
    login_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (referred_by) REFERENCES users(id)
);

-- Restore data (specify columns to handle schema differences)
INSERT INTO users (id, wallet_address, solana_wallet_address, username, role, status, referral_code, referred_by, last_login, login_count, created_at, updated_at)
SELECT id, wallet_address, solana_wallet_address, username, role, status, referral_code, referred_by, last_login, login_count, created_at, updated_at
FROM users_backup;

-- Drop backup
DROP TABLE users_backup;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_solana_wallet ON users(solana_wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

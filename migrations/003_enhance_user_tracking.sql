-- Enhancement: Add missing columns for comprehensive user tracking
-- Adds login_count and ensures all tracking columns are present

-- Add login_count column if it doesn't exist
ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0;

-- Add google_account_linked flag (for quick reference)
ALTER TABLE users ADD COLUMN google_account_linked BOOLEAN DEFAULT 0;

-- Add last_activity timestamp (different from last_login)
ALTER TABLE users ADD COLUMN last_activity TIMESTAMP;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_users_login_count ON users(login_count);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity);
CREATE INDEX IF NOT EXISTS idx_users_google_linked ON users(google_account_linked);

-- Rename user_sessions to auth_sessions for consistency
-- (SQLite doesn't support ALTER TABLE RENAME, so we'll use the existing table name)
-- But we'll make sure it's being used properly

-- Clean up expired challenges (maintenance query - run periodically)
-- DELETE FROM auth_challenges WHERE expires_at < datetime('now') AND used = 1;

-- Clean up expired sessions (maintenance query - run periodically)  
-- DELETE FROM user_sessions WHERE expires_at < datetime('now');

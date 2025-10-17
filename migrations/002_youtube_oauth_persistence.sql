-- YouTube OAuth Persistence Migration
-- Stores YouTube/Google OAuth tokens and user data for session persistence

-- YouTube OAuth tokens table
CREATE TABLE IF NOT EXISTS user_youtube_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    google_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    
    -- OAuth tokens (encrypted in production)
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMP NOT NULL,
    scope TEXT,
    
    -- User preferences
    is_primary BOOLEAN DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    
    -- Metadata
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, google_user_id)
);

-- YouTube playlists cache (optional, for faster loading)
CREATE TABLE IF NOT EXISTS user_youtube_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_account_id INTEGER NOT NULL,
    playlist_id TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail TEXT,
    item_count INTEGER DEFAULT 0,
    
    -- Cache management
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (youtube_account_id) REFERENCES user_youtube_accounts(id) ON DELETE CASCADE,
    UNIQUE(youtube_account_id, playlist_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user_id ON user_youtube_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_email ON user_youtube_accounts(email);
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_google_user_id ON user_youtube_accounts(google_user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_expires ON user_youtube_accounts(expires_at);
CREATE INDEX IF NOT EXISTS idx_youtube_playlists_account_id ON user_youtube_playlists(youtube_account_id);
CREATE INDEX IF NOT EXISTS idx_youtube_playlists_playlist_id ON user_youtube_playlists(playlist_id);

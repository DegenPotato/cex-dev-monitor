-- YouTube Integration Migration
-- Adds YouTube music preferences and playlist storage for users

-- Step 1: Add YouTube-related columns to users table
ALTER TABLE users ADD COLUMN youtube_enabled BOOLEAN DEFAULT 0;

ALTER TABLE users ADD COLUMN youtube_email TEXT;

ALTER TABLE users ADD COLUMN youtube_preferences TEXT;

ALTER TABLE users ADD COLUMN last_youtube_sync TIMESTAMP;

-- Step 2: Create youtube_playlists table
CREATE TABLE IF NOT EXISTS youtube_playlists (
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
);

-- Step 3: Create youtube_history table
CREATE TABLE IF NOT EXISTS youtube_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    video_id TEXT NOT NULL,
    video_title TEXT NOT NULL,
    video_thumbnail TEXT,
    channel_title TEXT,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_youtube_playlists_user ON youtube_playlists(user_id);

CREATE INDEX IF NOT EXISTS idx_youtube_playlists_favorite ON youtube_playlists(is_favorite);

CREATE INDEX IF NOT EXISTS idx_youtube_history_user ON youtube_history(user_id);

CREATE INDEX IF NOT EXISTS idx_youtube_history_video ON youtube_history(video_id);

CREATE INDEX IF NOT EXISTS idx_youtube_history_played_at ON youtube_history(played_at);

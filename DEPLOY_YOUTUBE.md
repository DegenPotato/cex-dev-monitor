# YouTube Integration Deployment Guide

## 🎵 What We Added

### Database Changes
- ✅ `users.youtube_enabled` - Boolean flag
- ✅ `users.youtube_email` - User's YouTube email
- ✅ `users.youtube_preferences` - JSON preferences (volume, shuffle, repeat)
- ✅ `users.last_youtube_sync` - Last sync timestamp
- ✅ `youtube_playlists` table - User's custom playlists
- ✅ `youtube_history` table - Playback history

### Backend Changes
- ✅ New route: `/api/youtube/*` - All YouTube endpoints
- ✅ Removed Google OAuth dependency
- ✅ Uses existing JWT authentication
- ✅ Stores playlists & preferences in database

### Frontend Changes
- ✅ UnifiedMusicPlayer - Toggle between Local & YouTube
- ✅ Uses existing auth (no Google OAuth needed)
- ✅ Playlists stored per user in database
- ✅ History tracking for analytics

---

## 🚀 Deployment Steps

### Step 1: Push Code to GitHub
```bash
git add -A
git commit -m "🎵 YouTube Integration - Database migration + API routes"
git push
```

### Step 2: Deploy to Production Server
```bash
# SSH into server and pull latest code
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "cd /var/www/cex-monitor && git pull"
```

### Step 3: Run Migration on Production Database
```bash
# SSH into server and run migration
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 << 'EOF'
cd /var/www/cex-monitor

# Run the migration script
npx tsx scripts/run-youtube-migration.ts

# Verify migration
sqlite3 database.db "PRAGMA table_info(users);" | grep youtube
sqlite3 database.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'youtube%';"
EOF
```

### Step 4: Restart PM2 Server
```bash
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "pm2 restart cex-monitor"
```

### Step 5: Verify Deployment
```bash
# Check logs
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "pm2 logs cex-monitor --lines 50"

# Test API endpoint
curl https://alpha.sniff.agency/api/youtube/preferences \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔄 Quick Deploy (All-in-One)
```bash
git add -A && \
git commit -m "🎵 YouTube Integration" && \
git push && \
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "\
  cd /var/www/cex-monitor && \
  git pull && \
  npx tsx scripts/run-youtube-migration.ts && \
  pm2 restart cex-monitor && \
  pm2 logs cex-monitor --lines 20"
```

---

## 📡 New API Endpoints

### YouTube Preferences
```http
GET  /api/youtube/preferences      # Get user's YouTube settings
POST /api/youtube/preferences      # Update YouTube settings
```

### YouTube Playlists
```http
GET    /api/youtube/playlists      # Get all user playlists
POST   /api/youtube/playlists      # Create/update playlist
DELETE /api/youtube/playlists/:id  # Delete playlist
POST   /api/youtube/playlists/:id/play  # Increment play count
```

### YouTube History
```http
GET  /api/youtube/history          # Get playback history
POST /api/youtube/history          # Add to history
```

---

## 🧪 Testing After Deployment

### Test YouTube Enable
```bash
curl -X POST https://alpha.sniff.agency/api/youtube/preferences \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "enabled": true,
    "email": "user@example.com",
    "preferences": {"volume": 75, "shuffle": false, "repeat": "off"}
  }'
```

### Test Playlist Creation
```bash
curl -X POST https://alpha.sniff.agency/api/youtube/playlists \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Favorites",
    "videos": [
      {
        "id": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
        "channelTitle": "Rick Astley"
      }
    ],
    "isFavorite": true
  }'
```

---

## 🐛 Troubleshooting

### Migration Already Applied
If you see "duplicate column" errors, that's normal - migration is idempotent.

### Server Won't Restart
```bash
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "pm2 logs cex-monitor --err"
```

### Database Locked
```bash
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "lsof /var/www/cex-monitor/database.db"
```

### Routes Not Found
Check server logs for TypeScript compilation errors:
```bash
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "pm2 logs cex-monitor | grep -i error"
```

---

## 🎯 What Users Will See

1. **Music Player Node** in Matrix scene
2. **Toggle Button**: 💿 Local ↔ 📺 YouTube
3. **YouTube Tab**: 
   - Search YouTube videos
   - View their saved playlists
   - Add videos to queue
4. **All data saved** to their account automatically
5. **No Google OAuth** - uses existing authentication

---

## 📊 Database Schema

### users (new columns)
```sql
youtube_enabled BOOLEAN DEFAULT 0
youtube_email TEXT
youtube_preferences TEXT  -- JSON
last_youtube_sync TIMESTAMP
```

### youtube_playlists
```sql
id INTEGER PRIMARY KEY
user_id INTEGER (FK to users)
playlist_name TEXT
playlist_data TEXT  -- JSON array of videos
is_favorite BOOLEAN
play_count INTEGER
last_played TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

### youtube_history
```sql
id INTEGER PRIMARY KEY
user_id INTEGER (FK to users)
video_id TEXT
video_title TEXT
video_thumbnail TEXT
channel_title TEXT
played_at TIMESTAMP
duration INTEGER  -- seconds
```

---

**Ready to deploy!** Run the "Quick Deploy" command above.

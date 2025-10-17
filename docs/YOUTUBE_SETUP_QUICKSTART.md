# YouTube Music Integration - Quick Setup Guide

## 🚀 5-Minute Setup

### Step 1: Google Cloud Console Setup (2 minutes)

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Create a new project (or select existing one)
   - Name it something like "CEX Monitor YouTube"

2. **Enable YouTube Data API v3**
   ```
   → APIs & Services → Enable APIs and Services
   → Search for "YouTube Data API v3"
   → Click Enable
   ```

3. **Create API Key** (for searching videos)
   ```
   → APIs & Services → Credentials
   → Create Credentials → API Key
   → Copy the API key
   → (Optional) Restrict key to YouTube Data API v3
   ```

4. **Create OAuth 2.0 Client ID** (for user authentication)
   ```
   → APIs & Services → Credentials
   → Create Credentials → OAuth Client ID
   → Application type: Web application
   → Name: "CEX Monitor YouTube Auth"
   → Authorized JavaScript origins:
      - http://localhost:5173 (development)
      - https://your-production-domain.com (production)
   → Authorized redirect URIs:
      - http://localhost:5173 (development)
      - https://your-production-domain.com (production)
   → Click Create
   → Copy the Client ID
   ```

### Step 2: Add Environment Variables (1 minute)

1. **Create `.env.local` file** in your project root:
   ```env
   VITE_YOUTUBE_API_KEY=your_api_key_from_step_3
   VITE_GOOGLE_OAUTH_CLIENT_ID=your_client_id_from_step_4.apps.googleusercontent.com
   ```

2. **Restart development server**:
   ```bash
   npm run dev
   ```

### Step 3: Test It! (2 minutes)

1. **Open the Matrix Scene**
   - Navigate to the Matrix universe
   - Click the Experience Settings button (✨) in bottom-right

2. **Switch to YouTube**
   - Expand the Audio section
   - Click "📺 YouTube" button to switch source

3. **Connect Google Account**
   - Click "Connect Google Account"
   - Sign in with your Google account
   - Grant permissions for YouTube access

4. **Start Playing Music!**
   - Search for your favorite music
   - Browse your YouTube playlists
   - Add tracks to queue
   - Enjoy!

## 🎯 Features You Get

### ✅ What Works Now
- ✅ Source toggle (Local MP3s ↔ YouTube)
- ✅ Google OAuth login
- ✅ Search YouTube music
- ✅ Load your playlists
- ✅ Playback controls (play/pause/skip)
- ✅ Volume control
- ✅ Queue management
- ✅ **AD-FREE experience** (YouTube IFrame Player honors Premium status)

### 🎵 Ad Skipping
**Good News:** If you have YouTube Premium, ads are automatically skipped!
**Without Premium:** Ads may appear, but the player will skip them automatically when possible.

## 📊 API Usage & Limits

### Free Tier Limits
- **Daily Quota**: 10,000 units/day (more than enough!)
- **Search**: 100 units per request (can do ~100 searches/day)
- **Playlists**: 1 unit per request (can fetch 1000+ playlists/day)

### Typical Usage
- Average user: ~50 searches/day = 5,000 units
- Playlist loads: ~10/day = 10 units
- **Total**: ~5,010 units/day (well within limit)

## 🔒 Security

### What's Protected
- ✅ API keys in environment variables (not in code)
- ✅ OAuth tokens stored securely in browser
- ✅ No keys committed to Git (.env.local is gitignored)
- ✅ HTTPS-only in production

### What to Never Do
- ❌ DON'T commit `.env.local` to Git
- ❌ DON'T share your API keys publicly
- ❌ DON'T hardcode credentials in code

## 🐛 Troubleshooting

### "YouTube API not loading"
- Check browser console for errors
- Verify API key is correct in `.env.local`
- Make sure dev server was restarted after adding keys

### "Google Sign-In Failed"
- Verify OAuth Client ID is correct
- Check that your domain is in "Authorized JavaScript origins"
- Clear browser cache and try again

### "Search Not Working"
- Check you're signed in with Google
- Verify YouTube Data API v3 is enabled
- Check daily quota hasn't been exceeded (unlikely)

### "Videos Won't Play"
- Some videos are age-restricted or region-locked
- Check console for specific error codes
- Try a different video/playlist

## 💰 Cost Analysis

### Free Forever
YouTube API is **FREE** for typical usage:
- 10,000 units/day free
- No credit card required
- No hidden costs

### If You Exceed (unlikely)
- $0.05 per 1,000 units
- Would need 200+ searches/day to exceed free tier
- Can set spending limits in Google Cloud Console

## 🎨 UI Location

### Where to Find Controls
```
Matrix Scene → Experience Settings (✨ bottom-right)
└─ Audio Section
   ├─ Source Toggle: 💿 Local MPs / 📺 YouTube
   ├─ Connect Google Account (if not connected)
   ├─ Search Bar
   ├─ Your Playlists
   ├─ Playback Controls
   ├─ Volume Slider
   └─ Queue Management
```

## 🚀 Advanced Usage

### Custom Playlists
1. Create playlists in YouTube
2. Refresh the Matrix scene
3. Your playlists appear automatically

### Keyboard Shortcuts (coming soon)
- `Space`: Play/Pause
- `→`: Next track
- `←`: Previous track
- `↑/↓`: Volume

### Integration with Visualizer (coming soon)
- Beat detection from YouTube audio
- Sync particle effects with music
- Visual spectrum analyzer

## 📚 Additional Resources

- [YouTube Data API Docs](https://developers.google.com/youtube/v3)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Full Integration Guide](./YOUTUBE_AUDIO_INTEGRATION.md)

## ✨ Enjoy Your Music!

You now have access to millions of tracks from YouTube while navigating the cyberpunk universe. Rock on! 🎸🚀

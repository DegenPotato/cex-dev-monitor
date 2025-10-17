# YouTube Audio Integration

## Overview
Integration of YouTube as an alternative audio source, allowing users to play their own music from YouTube while navigating the Matrix universe.

## APIs Required

### 1. YouTube IFrame Player API
- **Purpose**: Embed and control YouTube video playback
- **Docs**: https://developers.google.com/youtube/iframe_api_reference
- **Features**: Play, pause, volume control, track events
- **No API Key Required**: For basic playback

### 2. YouTube Data API v3
- **Purpose**: Search videos, access playlists
- **Docs**: https://developers.google.com/youtube/v3
- **Requires**: API Key (free tier: 10,000 units/day)
- **Features**: Search, get user playlists, video details

### 3. Google OAuth 2.0
- **Purpose**: Access user's YouTube account
- **Docs**: https://developers.google.com/identity/protocols/oauth2
- **Scopes Needed**:
  - `https://www.googleapis.com/auth/youtube.readonly`
  - `https://www.googleapis.com/auth/userinfo.profile`

## Architecture

### Audio Source Toggle
```typescript
type AudioSource = 'local' | 'youtube';

interface AudioSettings {
  source: AudioSource;
  localPlaylist: string[];
  youtubePlaylist: YouTubeVideo[];
  youtubeAuth: {
    isConnected: boolean;
    accessToken?: string;
  };
}
```

### YouTube Player Integration
```typescript
// Global YouTube player instance
let youtubePlayer: YT.Player | null = null;

// Load YouTube IFrame API
const loadYouTubeAPI = () => {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
};

// Initialize player
const initYouTubePlayer = (videoId: string) => {
  youtubePlayer = new YT.Player('youtube-player', {
    height: '0',
    width: '0',
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
};
```

### Google OAuth Flow
```typescript
// Initialize Google OAuth
const initGoogleAuth = () => {
  gapi.load('auth2', () => {
    gapi.auth2.init({
      client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
    });
  });
};

// Sign in
const signInToYouTube = async () => {
  const auth2 = gapi.auth2.getAuthInstance();
  await auth2.signIn();
  const token = auth2.currentUser.get().getAuthResponse().access_token;
  return token;
};
```

### YouTube Data API Usage
```typescript
// Search videos
const searchYouTube = async (query: string, token: string) => {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?` +
    `part=snippet&q=${encodeURIComponent(query)}&` +
    `type=video&videoCategoryId=10&` +  // Music category
    `maxResults=25&key=${API_KEY}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return response.json();
};

// Get user's playlists
const getUserPlaylists = async (token: string) => {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/playlists?` +
    `part=snippet&mine=true&maxResults=50&key=${API_KEY}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return response.json();
};
```

## UI Components

### 1. Audio Source Toggle
Location: Experience Settings Panel
```
[🎵 Audio Source]
○ Local Playlist (MP3s)
○ YouTube Music
```

### 2. YouTube Connection
```
[📺 YouTube]
[ Connect Google Account ] (if not connected)
- OR -
✓ Connected: user@gmail.com [ Disconnect ]
```

### 3. YouTube Music Controls
```
[Search YouTube Music]
[________________] 🔍

[My Playlists]
- Chill Vibes (23 videos)
- Cyberpunk Mix (45 videos)
- Space Ambient (12 videos)

[Currently Playing]
🎵 Synthwave Dreams - Artist Name
[◀] [⏸] [▶] [🔀] [🔁]
```

## Implementation Steps

### Phase 1: Basic YouTube Player
1. ✅ Create YouTubeAudioProvider context
2. ✅ Load YouTube IFrame API
3. ✅ Implement basic playback controls
4. ✅ Add source toggle in AudioContext

### Phase 2: Google OAuth
1. ✅ Set up Google Cloud Console project
2. ✅ Implement OAuth flow
3. ✅ Store access tokens securely
4. ✅ Handle token refresh

### Phase 3: Playlist Integration
1. ✅ Fetch user playlists
2. ✅ Display in UI
3. ✅ Allow playlist selection
4. ✅ Queue management

### Phase 4: Search & Discovery
1. ✅ Implement YouTube search
2. ✅ Display search results
3. ✅ Add to queue functionality
4. ✅ Save favorites

## Environment Variables

```env
# .env.local
VITE_YOUTUBE_API_KEY=your_api_key_here
VITE_GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
VITE_GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
```

## Security Considerations

1. **API Keys**: Store in environment variables, not in code
2. **Access Tokens**: Store in httpOnly cookies or secure storage
3. **Token Refresh**: Implement automatic token refresh
4. **Rate Limiting**: Respect YouTube API quotas (10,000 units/day)
5. **CORS**: Configure proper CORS headers for API requests

## Cost Analysis

### YouTube Data API v3 Costs
- **Free Tier**: 10,000 units per day
- **Search**: 100 units per request
- **Playlist Items**: 1 unit per request
- **Video Details**: 1 unit per request

**Daily Estimate**:
- 50 searches = 5,000 units
- 100 playlist fetches = 100 units
- **Total**: ~5,100 units/day (well within free tier)

## Benefits

1. **User Content**: Users can play their own music
2. **No Storage**: No need to host MP3 files
3. **Vast Library**: Access to millions of tracks
4. **Personalization**: Use user's saved playlists
5. **Discovery**: Search and find new music

## Limitations

1. **Internet Required**: Can't work offline
2. **Ad-Supported**: Free tier may have ads
3. **API Quotas**: Limited daily requests
4. **YouTube ToS**: Must comply with terms of service
5. **Playback Restrictions**: Some videos may be age-restricted or region-locked

## Alternative: SoundCloud API

If YouTube proves problematic, consider SoundCloud:
- Similar API structure
- Music-focused platform
- Easier licensing for music playback

## Next Steps

1. Create Google Cloud Console project
2. Enable YouTube Data API v3
3. Create OAuth 2.0 credentials
4. Implement YouTubeAudioProvider
5. Add UI toggle in Experience Settings
6. Test with user playlists
7. Deploy and monitor API usage

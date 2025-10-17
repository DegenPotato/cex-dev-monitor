# YouTube OAuth Session Persistence

This document explains how YouTube/Google account linking works with persistent session storage.

## Overview

Users can link their Google/YouTube account once, and the authentication will persist across sessions. They won't need to re-authenticate every time they visit the site.

## Architecture

### Database Schema

```sql
-- Stores YouTube OAuth tokens per user
CREATE TABLE user_youtube_accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,  -- Links to users table
    google_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    access_token TEXT NOT NULL,  -- OAuth access token
    refresh_token TEXT,  -- For token renewal (future)
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMP NOT NULL,
    scope TEXT,
    is_primary BOOLEAN DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    UNIQUE(user_id, google_user_id)
);

-- Optional: Cache user's YouTube playlists
CREATE TABLE user_youtube_playlists (
    id INTEGER PRIMARY KEY,
    youtube_account_id INTEGER NOT NULL,
    playlist_id TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail TEXT,
    item_count INTEGER,
    last_synced_at TIMESTAMP,
    UNIQUE(youtube_account_id, playlist_id)
);
```

### Backend Components

1. **YouTubeAccountProvider** (`src/backend/providers/YouTubeAccountProvider.ts`)
   - Database CRUD operations
   - Token management
   - Playlist caching

2. **YouTubeAuthService** (`src/backend/services/YouTubeAuthService.ts`)
   - REST API endpoints
   - JWT authentication middleware
   - Session management

### Frontend Integration

**YouTubeAudioContext** (`src/contexts/YouTubeAudioContext.tsx`)
- Auto-loads saved account on mount
- Saves tokens after successful OAuth
- Handles sign-out and token revocation

## API Endpoints

All endpoints require JWT authentication (`Authorization: Bearer <token>`).

### Save/Update Account
```http
POST /api/youtube/account/save
Content-Type: application/json

{
  "google_user_id": "123456789",
  "email": "user@gmail.com",
  "access_token": "ya29.a0...",
  "refresh_token": "1//...",  // optional
  "expires_in": 3600,  // seconds
  "scope": "https://www.googleapis.com/auth/youtube.readonly"
}
```

### Get Saved Account
```http
GET /api/youtube/account
Authorization: Bearer <jwt_token>

Response:
{
  "success": true,
  "account": {
    "id": 1,
    "email": "user@gmail.com",
    "google_user_id": "123456789",
    "access_token": "ya29.a0...",
    "refresh_token": "1//...",
    "expires_at": "2025-10-17T10:00:00.000Z",
    "scope": "https://www.googleapis.com/auth/youtube.readonly",
    "is_expired": false,
    "last_used_at": "2025-10-17T09:00:00.000Z"
  }
}
```

### Refresh Token (Future Enhancement)
```http
POST /api/youtube/account/refresh
Content-Type: application/json

{
  "access_token": "ya29.a0...",
  "expires_in": 3600
}
```

### Revoke Account (Sign Out)
```http
POST /api/youtube/account/revoke
Authorization: Bearer <jwt_token>
```

### Cache Playlists (Optional)
```http
POST /api/youtube/playlists/cache
Content-Type: application/json

{
  "playlists": [
    {
      "id": "PLxxx",
      "title": "My Playlist",
      "thumbnail": "https://...",
      "itemCount": 42
    }
  ]
}
```

### Get Cached Playlists
```http
GET /api/youtube/playlists/cache
Authorization: Bearer <jwt_token>
```

## User Flow

### First-Time Connection

1. User clicks "Connect YouTube" button
2. Google OAuth popup opens
3. User grants permissions
4. Frontend receives access token
5. Frontend calls `/api/youtube/account/save`
6. Backend stores encrypted token in database
7. User is authenticated ✅

### Returning User

1. User loads the app
2. `YouTubeAudioContext` mounts
3. Auto-calls `/api/youtube/account`
4. If saved account exists and not expired:
   - Restores access token
   - Sets `isAuthenticated = true`
   - Loads user's playlists
5. User can immediately play YouTube music ✅

### Token Expiry

- Access tokens typically expire after 1 hour
- Future enhancement: Implement refresh token flow
- Current behavior: User must re-authenticate when expired

### Sign Out

1. User clicks "Disconnect YouTube"
2. Frontend revokes token with Google
3. Frontend calls `/api/youtube/account/revoke`
4. Backend marks account as inactive
5. Local state cleared

## Security Considerations

### Current Implementation
- ✅ Tokens stored in database (server-side)
- ✅ JWT authentication required for all endpoints
- ✅ User can only access their own tokens
- ✅ Soft delete on revoke (can audit later)

### Future Enhancements
- 🔄 Encrypt tokens at rest (use crypto library)
- 🔄 Implement refresh token flow
- 🔄 Token rotation on refresh
- 🔄 Audit log for token usage
- 🔄 Automatic token refresh before expiry

## Token Encryption (Future)

```typescript
// Example encryption helper
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(text: string): string {
  const [ivHex, authTagHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## Migration

Run migration to add tables:

```bash
# Development
sqlite3 data/database.db < migrations/002_youtube_oauth_persistence.sql

# Production
# Migration will run automatically on server restart
```

## Testing

### Manual Testing Checklist

- [ ] Sign in with Google → Token saved
- [ ] Reload page → Auto-logged in
- [ ] Sign out → Token revoked
- [ ] Reload page → Not logged in
- [ ] Token expiry → Requires re-auth
- [ ] Multiple users → Each has own tokens
- [ ] Playlist caching → Fast loading

### Database Verification

```sql
-- Check saved accounts
SELECT * FROM user_youtube_accounts;

-- Check if token expired
SELECT 
  email, 
  datetime(expires_at) as expires,
  CASE 
    WHEN datetime(expires_at) < datetime('now', '+5 minutes') 
    THEN 'EXPIRED' 
    ELSE 'VALID' 
  END as status
FROM user_youtube_accounts;

-- Cached playlists
SELECT 
  a.email,
  p.title,
  p.item_count,
  datetime(p.last_synced_at) as synced
FROM user_youtube_playlists p
JOIN user_youtube_accounts a ON a.id = p.youtube_account_id;
```

## Troubleshooting

### "No auth token" warning
- User is not logged in to the main app
- YouTube account requires wallet authentication first

### "Token expired" error
- Access token has expired (1 hour lifetime)
- User needs to re-authenticate
- Future: Implement refresh token flow

### Account not loading on mount
- Check browser console for errors
- Verify JWT token in localStorage
- Check backend logs for API errors
- Verify migration was applied

### Multiple accounts per user
- Currently supports one primary account per user
- If user signs in with different Google account, it updates existing record
- Add `is_primary` flag to support multiple accounts

## Performance

### Database Indexes
```sql
CREATE INDEX idx_youtube_accounts_user_id ON user_youtube_accounts(user_id);
CREATE INDEX idx_youtube_accounts_expires ON user_youtube_accounts(expires_at);
CREATE INDEX idx_youtube_playlists_account_id ON user_youtube_playlists(youtube_account_id);
```

### Caching Strategy
- Playlist cache reduces API calls
- Cache invalidation: 24 hours
- Refresh cache on user request
- Store thumbnails as URLs (not blobs)

## Monitoring

### Metrics to Track
- Token expiry rate
- Re-authentication frequency
- API call patterns
- Cache hit rate
- Failed authentication attempts

### Logs to Monitor
```typescript
console.log('✅ YouTube account saved:', userId, email);
console.log('✅ Restored YouTube session:', email);
console.log('⚠️ Saved token is expired:', email);
console.log('❌ Failed to save YouTube account:', error);
```

## Future Enhancements

1. **Refresh Token Flow**
   - Automatically refresh expired tokens
   - No user intervention needed
   - Seamless experience

2. **Multi-Account Support**
   - Allow users to link multiple Google accounts
   - Switch between accounts easily
   - Keep all in sync

3. **Playlist Sync**
   - Background sync of playlists
   - Real-time updates from YouTube
   - Offline playlist viewing

4. **OAuth Scope Management**
   - Request minimal scopes initially
   - Upgrade permissions as needed
   - Clear scope explanations

5. **Security Audit**
   - Token encryption at rest
   - Audit log for all token access
   - Anomaly detection
   - Automatic token rotation

## References

- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [JWT Authentication](https://jwt.io/)
- [Token Refresh Flow](https://developers.google.com/identity/protocols/oauth2/web-server#offline)

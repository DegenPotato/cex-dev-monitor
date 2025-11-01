# Trading WebSocket Connection Fix

## Problem
WebSocket connection to `wss://api.sniff.agency/socket.io/` was failing with:
```
WebSocket connection to 'wss://api.sniff.agency/socket.io/?EIO=4&transport=websocket' failed
```

## Root Cause
The `tradingStore.ts` was using `config.apiUrl` which could cause protocol mismatches in production environments.

## Solution Applied
Changed Socket.IO client initialization to use `window.location.origin` pattern (same as working `RealtimeChartToggle.tsx`):

**File:** `src/stores/tradingStore.ts` (Line 123)

**Before:**
```typescript
const socket = io(`${API_BASE_URL}/trading`, {
  withCredentials: true,
  transports: ['websocket', 'polling']
});
```

**After:**
```typescript
const socket = io(window.location.origin + '/trading', {
  withCredentials: true,
  transports: ['websocket', 'polling'],
  path: '/socket.io'  // Explicit path for clarity
});
```

## Why This Works

### 1. Automatic Protocol Handling
- `window.location.origin` returns full URL with correct protocol
- In production: `https://alpha.sniff.agency` or `https://sniff.agency`
- In development: `http://localhost:5173`
- Socket.IO automatically converts `https://` → `wss://` for WebSocket upgrade

### 2. Backend Configuration ✅
**File:** `src/backend/server.ts` (Lines 76-96)
```typescript
const io = new SocketIOServer(httpServer, {
  cors: { /* ... */ },
  transports: ['websocket', 'polling']
});

const tradingWebSocketService = getTradingWebSocketService();
tradingWebSocketService.initialize(io);
```

**Namespace:** `/trading` is properly configured in `TradingWebSocketService.ts`

### 3. Nginx Configuration ✅
**File:** `nginx.conf` (Lines 49-67)
```nginx
location /socket.io/ {
    proxy_pass http://localhost:3001/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # ... proper headers for WebSocket
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;
}
```

### 4. Working Reference
The same pattern is successfully used in `RealtimeChartToggle.tsx` (Line 41):
```typescript
const socketInstance = io(window.location.origin, {
  withCredentials: true,
  transports: ['websocket', 'polling']
});
```

## Verification Checklist

After deploying this fix, verify:

1. **Frontend Build & Deploy**
   ```bash
   npm run build
   # Deploy to Vercel/production
   ```

2. **Test Connection**
   - Open browser DevTools → Console
   - Navigate to Fetcher/Trading tab
   - Should see: `📈 Trading WebSocket connected`
   - Should NOT see: WebSocket connection failed errors

3. **Test Functionality**
   - Portfolio stats should update in real-time
   - SOL price should show current value (not hardcoded)
   - Wallet balances should sync automatically

4. **Network Tab Check**
   - Look for WebSocket connection to `/socket.io/?EIO=4&transport=websocket`
   - Status should be `101 Switching Protocols` (success)
   - Not `400`, `404`, or connection failures

## Connection Flow

```
Frontend (Browser)
    ↓
window.location.origin + '/trading'
    ↓
https://sniff.agency/trading
    ↓
Socket.IO Client: wss://sniff.agency/socket.io/?namespace=/trading
    ↓
Nginx: /socket.io/ location block
    ↓
Backend: localhost:3001/socket.io/
    ↓
Socket.IO Server: /trading namespace
    ↓
TradingWebSocketService.initialize()
```

## Related Files
- ✅ `src/stores/tradingStore.ts` - Fixed Socket.IO client
- ✅ `src/backend/server.ts` - Backend Socket.IO server setup
- ✅ `src/backend/services/TradingWebSocketService.ts` - Trading namespace handler
- ✅ `nginx.conf` - Nginx proxy configuration
- ✅ `src/components/charts/RealtimeChartToggle.tsx` - Working reference implementation

## Additional Notes

### Environment Variables
The fix removes dependency on `VITE_API_URL` for Socket.IO connections, making it more reliable across environments.

### CORS
Socket.IO server already configured with proper CORS in `server.ts`:
- Allows credentials
- Matches Express CORS rules
- Supports Vercel preview deployments

### Fallback Transport
The `transports: ['websocket', 'polling']` configuration ensures:
1. Tries WebSocket first (fastest, most efficient)
2. Falls back to long-polling if WebSocket fails
3. Automatically handles upgrades

## Deployment

No server-side changes needed - this is a frontend-only fix:
```bash
# 1. Commit changes
git add src/stores/tradingStore.ts
git commit -m "fix: Trading WebSocket connection using window.location.origin"

# 2. Push and deploy
git push origin main

# 3. Vercel will auto-deploy (or manual deploy if needed)
```

Server nginx configuration is already correct and doesn't need changes.

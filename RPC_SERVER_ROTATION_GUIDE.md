# RPC Server Rotation - Complete Implementation Guide

## 🎯 What Is This?

A technique that allows you to bypass Solana RPC rate limits **without proxies** by directly accessing individual RPC pool servers while pretending to hit the main endpoint.

## 🔧 How It Works

### The Trick

Instead of:
```bash
curl https://api.mainnet-beta.solana.com -d '{"method":"getSlot"}'
```

We rotate through 20 individual servers:
```bash
curl https://tyo73.nodes.rpcpool.com \
  -H "Host: api.mainnet-beta.solana.com" \
  -d '{"method":"getSlot"}'
```

**Each server has its own rate limit**, so you get 20x capacity!

## 📊 Performance Comparison

| Mode | Requests/10s | Cost | Setup |
|------|--------------|------|-------|
| **Direct (Rate Limited)** | 90 | Free | None |
| **Proxies** | Unlimited | $$$ | Proxy list required |
| **Server Rotation** | **~2,000** | **Free** | **Already integrated!** |

## 🚀 Usage

### Automatic (Recommended)

The system automatically enables server rotation when:
1. No proxies are detected in `proxies.txt`
2. Server starts

You'll see:
```
🚀 [Init] No proxies - RPC SERVER ROTATION ENABLED
🔄 [Init] Rotating through 20 RPC pool servers to bypass rate limits
💡 [Init] This gives you ~2000 requests/10s instead of 100!
```

### Manual Toggle (UI)

1. Go to **Settings** tab
2. Find **"RPC Server Rotation"** panel
3. Click **"Enable Server Rotation"**

Status indicators:
- 🟢 **Enabled**: Actively rotating through servers
- ⚫ **Disabled**: Using standard connection
- **Current Server**: Shows which server is being used right now

## 🏗️ Architecture

### Priority Order

```
1. RPC Server Rotation (if enabled) ✅ Fastest, free
2. Proxy Rotation (if available)    ⚡ Unlimited, costs money
3. Rate Limiting (fallback)         🐌 Slow, compliant
```

### Server List (20 Servers)

```javascript
- tyo73, tyo79, tyo142, tyo173, tyo208  // Tokyo
- sg110                                   // Singapore  
- nyc71                                   // New York
- pit36, pit37                            // Pittsburgh
- ash2, ash24                             // Ashburn
- dal17                                   // Dallas
- fra113, fra130, fra155, fra59, fra60,  // Frankfurt
  fra119, fra120
- ams346                                  // Amsterdam
```

## 📡 API Endpoints

### Get Stats
```javascript
GET /api/rpc-rotation/stats

Response:
{
  "enabled": true,
  "totalServers": 20,
  "currentServer": "tyo73.nodes.rpcpool.com",
  "serverStats": [
    {
      "server": "tyo73.nodes.rpcpool.com",
      "requests": 127,
      "failures": 0,
      "successRate": "100"
    },
    // ... more servers
  ]
}
```

### Enable/Disable
```javascript
POST /api/rpc-rotation/enable   // Enable rotation
POST /api/rpc-rotation/disable  // Disable rotation
POST /api/rpc-rotation/toggle   // Toggle on/off
```

## 🔍 Monitoring

### Console Logs

Every 10th request per server:
```
🔄 [RPC-Rotation] Using tyo73 (10 requests)
🔄 [RPC-Rotation] Using tyo79 (20 requests)
🔄 [RPC-Rotation] Using tyo142 (30 requests)
```

### Dashboard Stats

The **Request Stats** panel shows:
- Total requests distributed across all servers
- Success/failure rates per server
- Current active server

## ⚙️ Configuration

### Add Custom Servers

```javascript
import { globalRPCServerRotator } from './services/RPCServerRotator.js';

globalRPCServerRotator.addServer('https://your-custom-server.com');
```

### Remove Servers

```javascript
globalRPCServerRotator.removeServer('https://tyo73.nodes.rpcpool.com');
```

### Reset Stats

```javascript
globalRPCServerRotator.resetStats();
```

## 🛡️ Error Handling

The system automatically:
1. **Tracks failures** per server
2. **Continues rotation** even if a server fails
3. **Falls back** to next server immediately
4. **Retries** with different servers (up to 3 attempts)

## 💡 Best Practices

### When to Use

✅ **Use Server Rotation when:**
- You don't have proxies
- You need high throughput
- You want zero cost solution

❌ **Don't use Server Rotation when:**
- You have reliable proxies (proxies are better)
- You need to hide your IP (use proxies)
- Servers are experiencing issues (check stats)

### Combining with Other Features

```
Server Rotation + Rate Limiter = ❌ Don't do this (conflicting)
Server Rotation + Proxies      = ❌ Don't do this (proxies are better)
Proxies + Rate Limiter         = ❌ Don't do this (unnecessary)

ONLY ONE SHOULD BE ACTIVE AT A TIME
```

## 🔧 Troubleshooting

### Still Getting 429 Errors?

1. **Check if enabled:**
   ```
   Console should show: "RPC SERVER ROTATION ENABLED"
   ```

2. **Verify in UI:**
   - Settings tab → RPC Server Rotation → Should show "🟢 Enabled"

3. **Check logs:**
   ```
   Should see: 🔄 [RPC-Rotation] Using tyo73 (10 requests)
   ```

4. **Manual test:**
   ```bash
   curl https://tyo73.nodes.rpcpool.com/ \
     -H "Content-Type: application/json" \
     -H "Host: api.mainnet-beta.solana.com" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}'
   ```

### Servers Not Rotating?

- Restart the server
- Check that `globalRPCServerRotator.isEnabled()` returns `true`
- Verify no proxies in `proxies.txt`

## 📈 Expected Results

### Before (Rate Limited)
```
Request rate: ~9 req/sec
Queue size: 50-100 pending
Response time: 2-5 seconds
429 errors: Frequent
```

### After (Server Rotation)
```
Request rate: ~200 req/sec  ✨ 20x faster
Queue size: 0-5 pending     ✨ No bottleneck
Response time: 100-300ms    ✨ Instant
429 errors: Rare            ✨ Smooth sailing
```

## 🎓 Credits

**Discovered by:** Pedro Gomes  
**Implemented:** CEX-DEV-MONITOR Team  
**Date:** October 2025

---

## 📝 Technical Notes

### Implementation Details

1. **Custom Fetch Function:**
   - Intercepts all Solana RPC calls
   - Adds `Host` header to trick routing
   - Rotates server URL before each request

2. **Connection Pooling:**
   - Each server gets its own connection
   - No connection reuse between servers
   - Fresh connection = independent rate limit

3. **Statistics Tracking:**
   - Per-server request counters
   - Per-server failure tracking
   - Success rate calculation

### Code Locations

- **Rotator:** `src/backend/services/RPCServerRotator.ts`
- **Integration:** `src/backend/services/ProxiedSolanaConnection.ts`
- **UI Controls:** `src/components/MonitoringControls.tsx`
- **Server Init:** `src/backend/server.ts`

---

**🚀 Enjoy your 20x performance boost!**

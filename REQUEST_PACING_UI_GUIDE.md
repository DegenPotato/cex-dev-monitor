# Request Pacing - UI Configuration Guide

## ✅ **Feature Complete!**

Request pacing is now **fully configurable through the UI** with persistent storage.

---

## 🎛️ **How to Configure**

### Step 1: Open Settings

1. Go to **Dashboard** → **Settings** tab
2. Scroll down to **"⚡ Request Pacing"** section

### Step 2: Adjust Delay

Use the **Request Delay (ms)** slider/input:

| Value | Throughput | Use Case |
|-------|------------|----------|
| **10ms** | ~100 req/sec | Fast (may hit limits) |
| **15ms** | ~66 req/sec | **Balanced ✓ (recommended)** |
| **20ms** | ~50 req/sec | Safe |
| **25ms** | ~40 req/sec | Very safe |

### Step 3: Save

Click **"Save Configuration"** button

---

## 📊 **What It Does**

### Controls Request Timing For:

**1. DevWalletAnalyzer**
- Checks up to 1000 transactions for pump.fun token deployments
- Adds configurable delay between each transaction check
- Example: 461 tx × 15ms = ~7 seconds analysis time

**2. PumpFunMonitor**
- Checks last 20 transactions for token mints
- Adds configurable delay between each check
- Example: 20 tx × 15ms = 300ms

---

## 🔧 **Technical Details**

### Backend API Endpoints:

**GET `/api/request-pacing/config`**
```json
{
  "requestDelayMs": 15
}
```

**POST `/api/request-pacing/config`**
```json
{
  "requestDelayMs": 20
}
```

**Response:**
```json
{
  "success": true,
  "requestDelayMs": 20,
  "message": "Request pacing updated to 20ms"
}
```

### Database Storage:

- **Key:** `request_pacing_delay_ms`
- **Value:** Integer (milliseconds)
- **Default:** 15ms if not set

### Services Updated:

```typescript
// Updates are applied to:
- DevWalletAnalyzer.setRequestDelay(delayMs)
- PumpFunMonitor.setRequestDelay(delayMs)
```

---

## 📈 **Impact Examples**

### Scenario 1: Wallet with 100 Transactions

| Delay | Analysis Time | Throughput | Rate Limit Risk |
|-------|---------------|------------|-----------------|
| 10ms | 1 second | 100 req/sec | Medium ⚠️ |
| 15ms | 1.5 seconds | 66 req/sec | Low ✅ |
| 20ms | 2 seconds | 50 req/sec | Very Low ✅ |
| 25ms | 2.5 seconds | 40 req/sec | Minimal ✅ |

### Scenario 2: Wallet with 461 Transactions

| Delay | Analysis Time | Throughput | Rate Limit Risk |
|-------|---------------|------------|-----------------|
| 10ms | 4.6 seconds | 100 req/sec | High ❌ |
| 15ms | 6.9 seconds | 66 req/sec | Low ✅ |
| 20ms | 9.2 seconds | 50 req/sec | Very Low ✅ |
| 25ms | 11.5 seconds | 40 req/sec | Minimal ✅ |

### Scenario 3: Wallet with 1000 Transactions

| Delay | Analysis Time | Throughput | Rate Limit Risk |
|-------|---------------|------------|-----------------|
| 10ms | 10 seconds | 100 req/sec | High ❌ |
| 15ms | 15 seconds | 66 req/sec | Low ✅ |
| 20ms | 20 seconds | 50 req/sec | Very Low ✅ |
| 25ms | 25 seconds | 40 req/sec | Minimal ✅ |

---

## 🎯 **Recommendations**

### For Most Users: 15ms (Default)
- ✅ Balanced speed and safety
- ✅ Handles most wallets smoothly
- ✅ Works with both proxies and RPC rotation
- ✅ ~7 seconds for 461 tx wallet

### When to Increase (20-25ms):
- You're still seeing occasional 429 errors
- You have low-quality proxies
- You want maximum safety
- Analysis time isn't critical

### When to Decrease (10-12ms):
- You have high-quality proxies
- You're using RPC rotation successfully
- You need faster analysis
- You're willing to risk occasional retries

---

## 🔄 **How It Works**

### Flow:

```
User changes delay in UI → 15ms
    ↓
Frontend saves to backend
    ↓
Backend stores in database (request_pacing_delay_ms = "15")
    ↓
Backend updates services:
  - DevWalletAnalyzer.setRequestDelay(15)
  - PumpFunMonitor.setRequestDelay(15)
    ↓
Next wallet analysis uses new delay
    ↓
Each transaction check waits 15ms before next request
    ↓
Smooth, paced request distribution across servers
```

### On Server Restart:

```
Server starts
    ↓
Loads saved delay from database
    ↓
Applies to all services
    ↓
Console: "🎛️  [Init] Request pacing loaded: 15ms"
```

---

## 📝 **UI Location**

**Dashboard → Settings Tab**

```
Settings
├─ CEX Wallet Address
├─ Thresholds
├─ Rate Limiter Settings (Proxies Disabled)
└─ ⚡ Request Pacing ← HERE!
   ├─ Request Delay (ms): [15]
   ├─ Guidance:
   │  • 10ms = ~100 req/sec (fast, may hit limits)
   │  • 15ms = ~66 req/sec (balanced ✓)
   │  • 20ms = ~50 req/sec (safe)
   │  └─ 25ms = ~40 req/sec (very safe)
   └─ [Save Configuration]
```

---

## 🔍 **Monitoring**

### Console Logs:

**On Startup:**
```bash
🎛️  [Init] Request pacing loaded: 15ms
```

**On Configuration Change:**
```bash
🎛️  [DevAnalyzer] Request delay updated to 20ms
🎛️  [PumpFunMonitor] Request delay updated to 20ms
```

**During Analysis:**
```bash
📊 [DevAnalyzer] Analyzing 461 transactions...
   Progress: 100/461 checked, 0 mints found
   Progress: 200/461 checked, 0 mints found
   # Analysis spread over ~7 seconds with 15ms pacing
✅ [DevAnalyzer] Analysis complete
```

---

## 💡 **Tips**

### Finding Your Optimal Setting:

1. **Start with default (15ms)**
2. **Monitor for 429 errors** in console
3. **If you see errors:** Increase to 20ms or 25ms
4. **If no errors:** Can try 12ms or 10ms for faster analysis
5. **Adjust based on your setup:**
   - Good proxies → Lower delay OK
   - RPC rotation only → 15ms recommended
   - No proxies, no rotation → 20-25ms safer

### Real-World Examples:

**User A (10,000 proxies):**
- Setting: 10ms
- Result: Fast analysis, no issues
- Note: Proxies handle the load

**User B (RPC rotation, no proxies):**
- Setting: 15ms
- Result: Smooth, occasional retry
- Note: Balanced performance

**User C (No proxies, no rotation):**
- Setting: 25ms
- Result: Slow but 100% reliable
- Note: Safety first approach

---

## ✅ **Summary**

**Before:** Hardcoded 15ms delay in source code  
**After:** Fully configurable through UI with persistent storage

**Features:**
- ✅ UI control in Settings panel
- ✅ Real-time updates (no restart needed)
- ✅ Persistent storage in database
- ✅ Applied to all analysis services
- ✅ Helpful guidance and examples
- ✅ Instant feedback in console logs

**Your rate limiter is now fully under your control! 🎛️**

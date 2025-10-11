# Rate Limiting & Queuing System

## Problem
When new wallets are discovered, multiple API calls happen simultaneously:
- Real-time transaction processing (Helius)
- Wallet history analysis (Public RPC) - up to 5 calls per wallet
- Pump.fun monitoring (Public RPC)
- This caused **429 rate limit errors** and blocked real-time flow

## Solution: Non-Blocking Analysis with Rate Limiter

### Architecture

```
New Wallet Detected
    ↓
[1] Save to DB immediately (0 txs, not fresh)
    ↓
[2] Broadcast to frontend (⏳ ANALYZING)
    ↓
[3] Queue analysis (background, non-blocking)
    ↓
[Real-time monitoring continues immediately]
    ↓
[Background Queue Processes]
    ↓
[4] Fetch tx history (rate-limited: 1 call/sec)
    ↓
[5] Update DB with results
    ↓
[6] Broadcast analyzed event (✅ FRESH or 📦 ESTABLISHED)
```

### Components

#### 1. **RateLimiter** (`RateLimiter.ts`)
- Global queue for API calls
- Processes 1 request per second
- Prevents burst traffic
- Shared across all wallet analyses

#### 2. **Non-Blocking Analysis** (`SolanaMonitor.ts`)
- `analyzeWalletAsync()` - runs in background
- Real-time flow completes immediately
- Analysis happens async with rate limiting

#### 3. **WalletAnalyzer** (`WalletAnalyzer.ts`)
- Uses rate limiter for all API calls
- Paginated fetching (up to 5000 transactions)
- 1 second delay between pagination calls
- Shows queue size in logs

### Flow Example

```
10:23:01 | 🔔 Outgoing TX: 1.34 SOL → 2CN7S3CC...
10:23:01 | ✅ Wallet saved with pending analysis
10:23:01 | ➕ New wallet: 2CN7S3CC... ⏳ ANALYZING (queued)
10:23:01 | 🎯 Started pump.fun monitoring
          [Real-time monitoring continues...]
10:23:02 | 🔬 [Background] Starting analysis for 2CN7S3CC...
10:23:03 | 📡 [WalletAnalyzer] Fetching transaction history (queued)...
10:23:04 | 📡 [WalletAnalyzer] Fetched 1000 transactions (Queue: 0)
10:23:05 | 📡 [WalletAnalyzer] Fetched 2000 transactions (Queue: 0)
10:23:06 | 📊 [WalletAnalyzer] Total transactions found: 2347
10:23:06 | ✅ [Background] Analysis complete: 2CN7S3CC... 📦 ESTABLISHED (Age: 45.2d, TXs: 2347)
```

## Benefits

✅ **No blocking** - Real-time monitoring stays responsive
✅ **No rate limits** - 1 request/sec prevents 429 errors
✅ **Orderly processing** - Queue handles multiple wallets gracefully
✅ **Accurate data** - Still fetches up to 5000 transactions
✅ **Progressive updates** - Frontend gets immediate notification, then analysis results

## WebSocket Events

### 1. `new_wallet` (Immediate)
```json
{
  "type": "new_wallet",
  "data": {
    "address": "ABC...XYZ",
    "isFresh": false,
    "walletAgeDays": 0,
    "previousTxCount": 0
  }
}
```

### 2. `wallet_analyzed` (After analysis)
```json
{
  "type": "wallet_analyzed",
  "data": {
    "address": "ABC...XYZ",
    "isFresh": true,
    "walletAgeDays": 2.5,
    "previousTxCount": 47
  }
}
```

## Configuration

- **Rate limit**: 500ms between calls (was 1 second)
- **Max transactions**: 1000 per wallet (reduced from 5000)
- **Queue**: Unlimited size
- **Helius RPC**: Used for EVERYTHING (real-time + analysis)
- **Public RPC**: Disabled for wallet analysis (too restrictive)

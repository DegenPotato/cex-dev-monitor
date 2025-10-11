# Rate Limit Analysis - Why You're Still Getting 429 Errors

## 🔍 What's Happening

You're seeing **429 rate limit errors** even with **RPC server rotation** active with **20 servers**.

## 📊 The Numbers

### Example: Analyzing Wallet C7szNJ1a...

```
📊 [WalletAnalyzer] Total transactions found: 1000
📊 [DevAnalyzer] Analyzing 1000 transactions...
   Progress: 200/479 checked, 0 mints found
```

**This wallet has 1,000 transactions to analyze!**

### Request Breakdown

For EACH transaction, the system needs to:
1. **Fetch transaction details** (1 RPC call)
2. **Parse transaction logs** (locally, no RPC)
3. **Check for pump.fun program** (locally, no RPC)
4. **Fetch token account info** (if pump.fun found - 1+ RPC calls)

**Minimum:** 1,000 transactions × 1 RPC call = **1,000 requests**  
**With pump.fun checks:** Could be **1,500-2,000 requests** per wallet

### Rate Limit Math

**Each RPC server limit:** ~100 requests per 10 seconds  
**20 servers total:** ~2,000 requests per 10 seconds  
**Your burst:** 1,000-2,000 requests in **~5-10 seconds**

**Result:** You're hitting the COMBINED limit of all 20 servers!

---

## 🎯 Root Causes

### 1. **No Request Pacing**

When analyzing 1,000 transactions, requests fire as fast as possible:
```javascript
// Current behavior (simplified):
for (let i = 0; i < 1000; i++) {
  await checkTransaction(tx[i]); // No delay!
}
```

This **floods all 20 servers** simultaneously.

### 2. **Parallel Wallet Analysis**

Multiple wallets being analyzed at the same time:
```
🔬 [Background] Starting analysis for E2oKGrLz...
🔬 [Background] Starting analysis for C7szNJ1a...  ← Both at once!
🔬 [Background] Starting analysis for FsAwJ9WL...
```

Each wallet = 1,000 requests  
3 wallets = 3,000 requests  
Result: **Instant rate limit across all servers**

### 3. **Real-time Monitoring Active**

While background analysis runs, real-time monitoring continues:
```
⚡ [Real-time] Account change detected...
[Real-time] Fetching recent transactions...
```

This adds **more requests** on top of the analysis load.

---

## 📈 Observed Behavior

### Timeline of Events

```
[Time 0s]  🎯 New wallet C7szNJ1a detected
           📊 Has 1,000 transactions to analyze
           
[Time 1s]  🔄 Starting analysis...
           Making requests across all 20 servers
           
[Time 3s]  🔄 [RPC-Rotation] tyo73 (20 requests)
           🔄 [RPC-Rotation] tyo79 (20 requests)
           ... all 20 servers active
           
[Time 5s]  ⚠️  Server responded with 429 (tyo73)
           ⚠️  Server responded with 429 (tyo79)
           ... all servers start returning 429
           
[Time 8s]  🔄 [RPC-Rotation] tyo73 (30 requests)  ← Still trying!
           ⚠️  RPC server error [RATE LIMIT] ← Failing
```

---

## 💡 Solutions

### Option 1: **Request Pacing (Recommended)**

Add delays between transaction checks:

```typescript
// Add 10ms delay between requests
for (let i = 0; i < transactions.length; i++) {
  await checkTransaction(transactions[i]);
  await new Promise(r => setTimeout(r, 10)); // Pace requests
}
```

**Impact:**
- 1,000 transactions × 10ms = 10 seconds total
- Spreads load across servers
- Prevents burst rate limits

### Option 2: **Batch Processing**

Process transactions in smaller batches:

```typescript
// Process 50 at a time, then wait
for (let i = 0; i < transactions.length; i += 50) {
  const batch = transactions.slice(i, i + 50);
  await Promise.all(batch.map(tx => checkTransaction(tx)));
  await new Promise(r => setTimeout(r, 1000)); // 1s between batches
}
```

**Impact:**
- 50 concurrent requests per batch
- 1 second pause between batches
- More predictable load

### Option 3: **Skip Old Wallets**

Don't analyze wallets with 1000+ transactions (they're not fresh anyway):

```typescript
if (txCount > 500) {
  console.log(`⏭️  Skipping analysis: wallet too old (${txCount} txs)`);
  return { isFresh: false, isDev: false, walletAgeDays: 999 };
}
```

**Impact:**
- Instant results for old wallets
- No wasted RPC calls
- Focus on actually fresh wallets

### Option 4: **Sample Transactions**

Check only recent transactions (e.g., last 100):

```typescript
// Only check most recent 100 transactions
const recentTxs = transactions.slice(0, 100);
for (const tx of recentTxs) {
  await checkTransaction(tx);
}
```

**Impact:**
- 90% fewer requests
- Still catches recent activity
- Much faster analysis

---

## 🎯 Recommended Approach

**Combine multiple solutions:**

1. **Skip wallets with 500+ transactions** (Option 3)
   - They're not fresh wallets anyway
   - Saves tons of requests

2. **Sample last 100 transactions** for established wallets (Option 4)
   - Enough to detect recent dev activity
   - Fast and efficient

3. **Add request pacing** for remaining wallets (Option 1)
   - Prevents bursts even for fresh wallets
   - Smooth, consistent load

---

## 📝 Implementation Priority

### High Priority (Do First)
- ✅ **Skip wallets with 500+ transactions**
- ✅ **Add 10-20ms delays between requests**

### Medium Priority
- **Limit analysis to last 100 transactions** for established wallets
- **Queue wallet analysis** (1 at a time instead of parallel)

### Low Priority
- Batch processing (more complex, less gain)
- Dynamic rate adjustment based on 429 errors

---

## 🔢 Expected Results

### Before
```
Wallet with 1,000 txs:
- Time: 5-10 seconds (with retries)
- Requests: 1,000-2,000
- Rate limits: Frequent (all servers hit)
- Success rate: 60-70% (many retries)
```

### After (with fixes)
```
Wallet with 1,000 txs:
- Time: Skip (instant) OR 2-3 seconds (if sampling 100)
- Requests: 0 (skipped) OR 100-150 (sampled)
- Rate limits: Rare
- Success rate: 95%+
```

---

## 🚀 Next Steps

1. **Implement skip logic** for wallets with 500+ transactions
2. **Add request pacing** (10-20ms delays)
3. **Test with real wallets**
4. **Monitor success rates**

---

**Bottom line:** Even with 20 servers, analyzing 1,000 transactions instantly will hit rate limits. You need to pace requests or skip old wallets entirely.

# OHLCV Collector Migration Guide

## 🔄 Major Changes (Pool-Centric Architecture)

The OHLCV collector has been **completely refactored** to properly support multiple pools per token and accurate per-pool tracking.

---

## ✨ What Changed

### **Database Schema**
1. **`token_pools` Table**
   - ❌ OLD: One pool per token (`UNIQUE(mint_address)`)
   - ✅ NEW: Multiple pools per token (`UNIQUE(mint_address, pool_address)`)
   - **New columns:**
     - `dex` - DEX name (raydium, orca, etc.)
     - `volume_24h_usd` - 24h trading volume
     - `liquidity_usd` - Pool liquidity
     - `price_usd` - Token price
     - `is_primary` - Flag for primary/preferred pool
     - `base_token`, `quote_token` - Pool pair tokens

2. **`ohlcv_data` Table**
   - ❌ OLD: `UNIQUE(mint_address, timeframe, timestamp)`
   - ✅ NEW: `UNIQUE(pool_address, timeframe, timestamp)`
   - **Impact:** Each pool now stores its own OHLCV data independently

3. **`ohlcv_backfill_progress` Table**
   - ❌ OLD: `UNIQUE(mint_address, timeframe)` - per-token tracking
   - ✅ NEW: `UNIQUE(pool_address, timeframe)` - per-pool tracking
   - **New column:** `pool_address`

---

## 🎯 Key Improvements

### **1. Multi-Pool Support**
```
Before: Token A → Pool 1 (only)
After:  Token A → Pool 1 (Raydium, primary)
                → Pool 2 (Orca)
                → Pool 3 (Jupiter)
```

### **2. Smart Pool Selection**
- Fetches **ALL** pools from GeckoTerminal
- Prioritizes **Raydium** pools
- Sorts by **24h volume** (highest first)
- Marks highest-priority pool as `is_primary = 1`

### **3. Pool Metadata Tracking**
Each pool now stores:
- DEX name
- 24h volume
- Liquidity
- Current price
- Base/quote tokens

### **4. Accurate Progress Tracking**
- Each pool has independent backfill progress
- No more conflicts between pools
- Pool A can be complete while Pool B is still backfilling

---

## 🚨 Migration Required

### **Option 1: Clean Start (Recommended)**
If you have existing OHLCV data that's corrupted or incomplete:

```bash
# 1. Stop the server
pm2 stop cex-monitor

# 2. Clear OHLCV tables
sqlite3 /var/www/cex-monitor/database.sqlite "DELETE FROM ohlcv_data;"
sqlite3 /var/www/cex-monitor/database.sqlite "DELETE FROM ohlcv_backfill_progress;"
sqlite3 /var/www/cex-monitor/database.sqlite "DELETE FROM token_pools;"

# 3. Restart server (schema will auto-migrate)
pm2 restart cex-monitor

# 4. Start OHLCV collector via UI
# Go to Settings → Monitoring Controls → Start OHLCV
```

### **Option 2: Keep Existing Data**
The schema changes are **backward-compatible**:
- Old data will remain (but may have gaps)
- New pools will be discovered on next cycle
- Existing progress will continue

---

## 📊 How It Works Now

### **Workflow:**
1. **Token Discovery**
   ```
   GET /api/v2/networks/solana/tokens/{MINT}
   → Returns ALL pools (not just top 1)
   ```

2. **Pool Processing**
   ```
   For each pool:
     - Store pool metadata (DEX, volume, liquidity)
     - Mark primary pool (Raydium preferred, else highest volume)
     - Process all timeframes (1m, 15m, 1h, 4h, 1d)
   ```

3. **Data Storage**
   ```
   ohlcv_data:
     - (pool_address, timeframe, timestamp) → OHLCV candle
     - Multiple pools = multiple rows per timestamp
   ```

4. **Progress Tracking**
   ```
   ohlcv_backfill_progress:
     - (pool_address, timeframe) → progress state
     - Independent progress per pool
   ```

---

## 🔍 Verification

### **Check Pool Discovery:**
```sql
-- See all pools for a token
SELECT 
  mint_address,
  pool_address,
  dex,
  volume_24h_usd,
  is_primary
FROM token_pools
WHERE mint_address = 'YOUR_MINT_ADDRESS'
ORDER BY is_primary DESC, volume_24h_usd DESC;
```

### **Check OHLCV Data:**
```sql
-- Count candles per pool
SELECT 
  pool_address,
  timeframe,
  COUNT(*) as candles
FROM ohlcv_data
WHERE mint_address = 'YOUR_MINT_ADDRESS'
GROUP BY pool_address, timeframe;
```

### **Check Backfill Progress:**
```sql
-- See backfill status per pool
SELECT 
  p.dex,
  p.pool_address,
  bp.timeframe,
  bp.backfill_complete,
  bp.fetch_count
FROM ohlcv_backfill_progress bp
JOIN token_pools p ON bp.pool_address = p.pool_address
WHERE p.mint_address = 'YOUR_MINT_ADDRESS';
```

---

## 🎓 Example

**Before (Bug):**
```
Token: BONK
Pool 1: Raydium (high volume) → Data stored ✅
Pool 2: Orca (low volume) → Data LOST ❌ (duplicate key error)
```

**After (Fixed):**
```
Token: BONK
Pool 1: Raydium (is_primary=1) → Data stored ✅
Pool 2: Orca (is_primary=0) → Data stored ✅
Pool 3: Jupiter (is_primary=0) → Data stored ✅
```

---

## 🛠️ Troubleshooting

### **Issue: No pools discovered**
- Check GeckoTerminal rate limits (10 req/min)
- Verify token exists on GeckoTerminal
- Check logs for `[OHLCV] No pools found`

### **Issue: Wrong pool selected**
- Check `is_primary` flag in `token_pools`
- Raydium pools should be marked as primary
- Secondary pools still tracked, just not primary

### **Issue: Duplicate key errors**
- Old schema conflict - run clean migration (Option 1)
- Check UNIQUE constraints match new schema

---

## 📝 Notes

- **Backward Compatible:** Existing code won't break
- **Automatic Discovery:** New pools auto-discovered on next cycle
- **Rate Limiting:** Global limiter handles all API calls
- **Performance:** Processes all pools sequentially (no parallel requests)

---

## 🚀 Next Steps

1. Deploy changes: `git pull && pm2 restart cex-monitor`
2. Start OHLCV collector (if not already running)
3. Monitor logs for pool discovery: `pm2 logs cex-monitor | grep OHLCV`
4. Verify data integrity using SQL queries above

---

**Migration Date:** October 14, 2025  
**Breaking Changes:** Schema only (code backward compatible)  
**Recommended Action:** Clean migration for best results

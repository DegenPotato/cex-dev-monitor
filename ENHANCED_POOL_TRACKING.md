# Enhanced Pool Discovery & Activity Tracking

## Overview
Implemented comprehensive pool discovery using GeckoTerminal's `/search/pools` endpoint, which finds ALL pools containing a token (not just "top pools"). Every single data point from the API response is now captured and stored.

---

## 🎯 Key Improvements

### 1. **Better Pool Discovery**
**Old Method:** `/networks/solana/tokens/{mintAddress}` - Only returns "top pools"  
**New Method:** `/search/pools?query={mintAddress}&network=solana` - Finds ALL pools

This ensures we discover:
- Small/new pools that aren't "top" yet
- Pools on obscure DEXes
- Historical pools that may be inactive
- Multiple pool pairs (token/SOL, token/USDC, etc.)

### 2. **Comprehensive Data Capture**
Every field from the API response is now stored:

**Pricing Data:**
- `base_token_price_usd` - Token price in USD
- `base_token_price_native_currency` - Token price in SOL
- `quote_token_price_usd` - Pair token price in USD
- `quote_token_price_native_currency` - Pair token price in SOL
- `base_token_price_quote_token` - Relative price
- `quote_token_price_base_token` - Inverse price

**Market Metrics:**
- `fdv_usd` - Fully Diluted Valuation
- `market_cap_usd` - Current market cap
- `reserve_in_usd` - Total liquidity in pool

**Activity Metrics (per timeframe: m5, m15, m30, h1, h6, h24):**
- Transaction counts (buys, sells)
- Unique traders (buyers, sellers)
- Volume in USD
- Price change percentages

---

## 📊 Database Schema

### Main Tables

#### `pool_info`
Core pool metadata:
```sql
- pool_address (PRIMARY KEY)
- token_mint (foreign key to token_mints)
- name (e.g., "BAO / SOL")
- base_token_address, base_token_symbol
- quote_token_address, quote_token_symbol
- dex_id (e.g., "meteora-damm-v2")
- pool_created_at
- last_updated
```

#### `pool_pricing`
Real-time pricing snapshots:
```sql
- All 6 price fields (USD/native for base/quote/relative)
- fdv_usd, market_cap_usd, reserve_in_usd
- timestamp
```

#### `pool_price_changes`
Price movements across timeframes:
```sql
- m5, m15, m30, h1, h6, h24 (percentage changes)
- timestamp
```

#### `pool_transactions`
Trading activity per timeframe:
```sql
- timeframe (m5, m15, etc.)
- buys, sells, buyers, sellers
- timestamp
```

#### `pool_volume`
Volume data across timeframes:
```sql
- m5_usd through h24_usd
- timestamp
```

### Aggregated View

#### `pool_activity_summary`
Convenient view joining latest data from all tables:
```sql
SELECT 
  pool_name, dex_id,
  base_token_price_usd, 
  price_change_24h,
  volume_24h_usd,
  buys_24h, sells_24h,
  reserve_in_usd
FROM ...
```

---

## 🔄 Implementation Flow

```
1. Token Discovery
   └─> PoolActivityTracker.searchPoolsForToken(mintAddress)
       ├─> GET /search/pools?query={mint}&network=solana
       ├─> Parse ALL pools found
       └─> Store complete data for each pool

2. Data Storage
   └─> PoolActivityTracker.storePoolData()
       ├─> Insert/Update pool_info
       ├─> Insert pool_pricing snapshot
       ├─> Insert pool_price_changes
       ├─> Insert pool_transactions (all timeframes)
       └─> Insert pool_volume data

3. OHLCV Integration
   └─> OHLCVCollector.ensurePoolAddresses()
       ├─> First: Use PoolActivityTracker for discovery
       ├─> Store all discovered pools
       └─> Continue with OHLCV backfilling
```

---

## 📈 Usage Examples

### Track All Pools for a Token
```typescript
const poolTracker = new PoolActivityTracker();
const poolCount = await poolTracker.trackPoolsForToken(mintAddress);
console.log(`Found and tracked ${poolCount} pools`);
```

### Get Pool Activity Summary
```typescript
const summary = await poolTracker.getPoolActivitySummary(mintAddress);
// Returns all pools with latest metrics, sorted by volume
```

### Get Transaction Trends
```typescript
const trends = await poolTracker.getPoolTransactionTrends(poolAddress, 24);
// Returns average buy/sell activity over last 24 hours
```

---

## 🚀 Benefits

### For Analysis
1. **Complete Pool Coverage** - Find ALL pools, not just popular ones
2. **Historical Activity** - Track how pools evolved over time
3. **Cross-DEX Comparison** - See which DEX has most activity
4. **Trader Behavior** - Track unique buyers vs sellers
5. **Liquidity Monitoring** - Watch reserve changes

### For Trading
1. **Arbitrage Detection** - Price differences across pools
2. **Volume Analysis** - Identify most liquid pools
3. **Trend Detection** - Spot increasing/decreasing activity
4. **Entry/Exit Timing** - Use transaction flow data

### For System
1. **Single API Call** - Get all pools at once
2. **Comprehensive Storage** - No data point wasted
3. **Efficient Updates** - Batch process pool data
4. **Historical Record** - Complete audit trail

---

## 🎯 Key Queries

### Find Most Active Pools
```sql
SELECT * FROM pool_activity_summary 
WHERE token_mint = ? 
ORDER BY volume_24h_usd DESC;
```

### Track Pool Evolution
```sql
SELECT 
  timestamp,
  base_token_price_usd,
  reserve_in_usd,
  (SELECT SUM(buys) FROM pool_transactions 
   WHERE pool_address = p.pool_address 
   AND timeframe = 'h1' 
   AND timestamp = p.timestamp) as hourly_buys
FROM pool_pricing p
WHERE pool_address = ?
ORDER BY timestamp;
```

### Compare DEX Performance
```sql
SELECT 
  dex_id,
  COUNT(*) as pool_count,
  SUM(volume_24h_usd) as total_volume,
  AVG(reserve_in_usd) as avg_liquidity
FROM pool_activity_summary
WHERE token_mint = ?
GROUP BY dex_id
ORDER BY total_volume DESC;
```

---

## 🔍 API Endpoint Used

```
GET https://api.geckoterminal.com/api/v2/search/pools
  ?query={mintAddress}
  &network=solana
  &include=base_token,quote_token,dex
```

**Why this endpoint?**
- Returns ALL pools containing the token
- Not limited to "top" pools
- Includes pools where token is quote currency
- More comprehensive than token endpoint

---

## 📝 Migration

Run the migration to create all necessary tables:
```bash
node run-db-migration.mjs migrations/035_enhanced_pool_activity.sql
```

---

## ⚡ Performance Considerations

1. **Rate Limiting** - Uses global GeckoTerminal rate limiter
2. **Batch Processing** - Stores all pool data in one transaction
3. **Indexed Queries** - All foreign keys and lookup fields indexed
4. **Incremental Updates** - Only fetch new data on subsequent runs

---

## 🎉 Summary

This enhancement provides:
- **100% Pool Discovery** - Find every pool, not just popular ones
- **Complete Data Capture** - Store every single API field
- **Historical Tracking** - Build comprehensive activity history
- **Multi-Timeframe Analysis** - m5 through h24 metrics
- **Cross-DEX Intelligence** - Compare performance across platforms

The result is a complete picture of a token's trading ecosystem! 🚀

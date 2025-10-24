# Database Cleanup Plan 🧹

## Current Overlapping Tables & Issues

### Token Storage (3 tables doing similar things!)
1. **token_mints** - OLD, should be deprecated
2. **token_registry** - NEW master list (KEEP THIS)
3. **token_market_data** - Currently a VIEW (from migration 037)

### Price/Market Data (2 tables!)
1. **gecko_token_data** - Time-series (100+ rows per token) 🔥
2. **token_market_data** - VIEW pulling from gecko_token_data

### Pool Data (2 tables!)
1. **token_pools** - Stores pool addresses & activity tiers (KEEP)
2. **gecko_pool_data** - Detailed pool metrics from GeckoTerminal

### OHLCV Data (3 tables!)
1. **ohlcv_data** - Main OHLCV storage (KEEP)
2. **ohlcv_realtime** - Real-time tracking
3. **pool_activity_metrics** - Activity tracking for pools

---

## 🎯 **CLEANUP STRATEGY**

### **Phase 1: Consolidate Token Data**
```sql
-- KEEP: token_registry (master list)
-- REMOVE: token_mints (migrate remaining data first)
-- MODIFY: gecko_token_data to store ONLY latest (not time-series)
```

### **Phase 2: Simplify Market Data**
```sql
-- CHANGE: gecko_token_data from time-series to single-row-per-token
-- KEEP: token_market_data as VIEW (auto-populated)
-- ADD: gecko_token_history for historical data (if needed)
```

### **Phase 3: Unify Pool Data**
```sql
-- KEEP: token_pools (with activity tiers)
-- MERGE: gecko_pool_data into token_pools
-- Remove duplicate columns
```

### **Phase 4: Clean OHLCV**
```sql
-- KEEP: ohlcv_data (main storage)
-- MERGE: ohlcv_realtime into pool_activity_metrics
-- KEEP: pool_activity_metrics for tier management
```

---

## 📊 **FINAL ARCHITECTURE (After Cleanup)**

### **Core Tables (6 total)**
1. **token_registry** - Master token list with basic info
2. **gecko_token_latest** - Latest price/market data (1 row per token)
3. **token_pools** - All pool data + activity tiers
4. **ohlcv_data** - Historical OHLCV candles
5. **pool_activity_metrics** - Activity tracking & tier management
6. **gecko_token_history** - Optional: Keep last 24h of price history

### **Views**
- **token_market_data** - Convenience view joining registry + gecko_latest

---

## 🔧 **Migration Scripts Needed**

### **Migration 038: Cleanup gecko_token_data**
```sql
-- Create new table for latest data only
CREATE TABLE gecko_token_latest AS
SELECT * FROM gecko_token_data WHERE fetched_at IN (
  SELECT MAX(fetched_at) FROM gecko_token_data GROUP BY mint_address
);

-- Optional: Keep recent history
CREATE TABLE gecko_token_history AS 
SELECT * FROM gecko_token_data 
WHERE fetched_at > strftime('%s', 'now') - 86400; -- Last 24 hours

-- Drop the bloated table
DROP TABLE gecko_token_data;

-- Rename to original
ALTER TABLE gecko_token_latest RENAME TO gecko_token_data;

-- Add unique constraint
CREATE UNIQUE INDEX idx_gecko_token_mint ON gecko_token_data(mint_address);
```

### **Migration 039: Remove token_mints**
```sql
-- Final migration check
INSERT OR IGNORE INTO token_registry (token_mint, token_symbol, token_name, creator_address, platform)
SELECT mint_address, symbol, name, creator_address, platform 
FROM token_mints;

-- Drop old table
DROP TABLE IF EXISTS token_mints;
```

### **Migration 040: Merge pool tables**
```sql
-- Add gecko columns to token_pools
ALTER TABLE token_pools ADD COLUMN base_token_price_usd REAL;
ALTER TABLE token_pools ADD COLUMN quote_token_price_usd REAL;
ALTER TABLE token_pools ADD COLUMN price_change_24h REAL;

-- Copy data
UPDATE token_pools tp
SET base_token_price_usd = (
  SELECT base_token_price_usd FROM gecko_pool_data gpd 
  WHERE gpd.pool_address = tp.pool_address
);

-- Drop redundant table
DROP TABLE IF EXISTS gecko_pool_data;
```

---

## ⚡ **Code Changes Required**

### **TokenPriceOracle.ts**
Change from creating new rows to updating existing:
```typescript
// Old: INSERT every time
await execute(`INSERT INTO gecko_token_data...`);

// New: INSERT OR REPLACE (single row per token)
await execute(`
  INSERT OR REPLACE INTO gecko_token_data (mint_address, ...) 
  VALUES (?, ...)
`);
```

### **API Endpoints**
Remove expensive ATH subqueries since we'll track it in the table:
```sql
-- Old: Expensive subquery
(SELECT MAX(price_usd) FROM gecko_token_data WHERE mint_address = ?)

-- New: Direct column
gecko_token_data.ath_price_usd
```

---

## 📈 **Benefits After Cleanup**

1. **Database Size**: From 700K+ rows/day to ~500 rows total
2. **Query Speed**: 100x faster (no more scanning thousands of rows)
3. **Clarity**: Each table has ONE clear purpose
4. **Maintenance**: Easier to understand and maintain
5. **Performance**: Token Sniffer tab loads instantly

---

## 🚀 **Execution Order**

1. **Stop services**: `pm2 stop cex-monitor`
2. **Backup database**: `cp backend/database.db backend/database.backup.db`
3. **Run migration 038**: Fix gecko_token_data bloat
4. **Update TokenPriceOracle.ts**: Change to UPDATE instead of INSERT
5. **Run migration 039**: Remove token_mints
6. **Run migration 040**: Merge pool tables
7. **Update API endpoints**: Remove subqueries
8. **Restart**: `pm2 start cex-monitor`

---

## ⚠️ **Data to Preserve**

Before cleanup, ensure we keep:
- All token mint addresses
- Pool addresses and mappings
- User preferences and settings
- Telegram forwarding configs
- Trading wallet data

## 🎯 **End Result**

From **15+ overlapping tables** down to **6 focused tables**:
- Each table has ONE job
- No duplicate data
- Fast queries
- Clear architecture

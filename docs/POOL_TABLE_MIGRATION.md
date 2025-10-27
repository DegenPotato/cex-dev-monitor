# Pool Table Migration Guide

## Problem
All OHLCV collectors are using a non-existent `token_pools` table. The correct table is `pool_info`.

## Schema Comparison

### ❌ Old (Non-existent): `token_pools`
```sql
mint_address
pool_address
dex
volume_24h_usd
liquidity_usd
price_usd
is_primary
discovered_at
last_verified
activity_tier
last_activity_check
```

### ✅ Correct: `pool_info`
```sql
pool_address        TEXT    PK
token_mint          TEXT    (NOT mint_address!)
name                TEXT
base_token_address  TEXT
base_token_symbol   TEXT
quote_token_address TEXT
quote_token_symbol  TEXT
dex_id              TEXT    (NOT dex!)
pool_created_at     INTEGER (NOT discovered_at!)
last_updated        INTEGER (NOT last_verified!)
```

## Column Mapping

| Old Column | New Column | Notes |
|------------|------------|-------|
| `mint_address` | `token_mint` | Different name! |
| `pool_address` | `pool_address` | Same ✅ |
| `dex` | `dex_id` | Different name! |
| `discovered_at` | `pool_created_at` | Different name! |
| `last_verified` | `last_updated` | Different name! |
| `volume_24h_usd` | ❌ REMOVED | Use `pool_volume` table |
| `liquidity_usd` | ❌ REMOVED | Use `pool_pricing` table |
| `price_usd` | ❌ REMOVED | Use `pool_pricing` table |
| `is_primary` | ❌ REMOVED | No longer tracked |
| `activity_tier` | ❌ REMOVED | Use `ohlcv_update_schedule` |

## New Related Tables

### `pool_volume` - Volume metrics
```sql
pool_address
m5_usd, m15_usd, m30_usd, h1_usd, h6_usd, h24_usd
timestamp
```

### `pool_pricing` - Price/liquidity data
```sql
pool_address
base_token_price_usd
base_token_price_native
quote_token_price_usd
quote_token_price_native
fdv_usd
market_cap_usd
reserve_in_usd (liquidity)
timestamp
```

### `pool_price_changes` - Price change %
```sql
pool_address
m5, m15, m30, h1, h6, h24
timestamp
```

### `pool_transactions` - TX data
```sql
pool_address
timeframe
buys, sells, buyers, sellers
timestamp
```

## Migration Strategy

### For OHLCV Collectors:
1. **Purpose**: OHLCV collectors only need to know which pools exist for a token
2. **What they need**: `pool_address` and `dex_id` - that's it!
3. **What they DON'T need**: volume, liquidity, pricing (not their responsibility)

### Simplified Queries:
```typescript
// OLD (broken):
const pools = await queryAll(`
  SELECT pool_address, dex, volume_24h_usd, liquidity_usd
  FROM token_pools
  WHERE mint_address = ?
  ORDER BY is_primary DESC, volume_24h_usd DESC
`, [mintAddress]);

// NEW (correct):
const pools = await queryAll(`
  SELECT pool_address, dex_id
  FROM pool_info
  WHERE token_mint = ?
  ORDER BY pool_created_at DESC
`, [mintAddress]);
```

### Simplified Inserts:
```typescript
// OLD (broken):
await execute(`
  INSERT INTO token_pools
  (mint_address, pool_address, dex, volume_24h_usd, liquidity_usd, price_usd, is_primary, discovered_at, last_verified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [mintAddress, poolAddress, dex, vol, liq, price, isPrimary, now, now]);

// NEW (correct - minimal data):
await execute(`
  INSERT OR REPLACE INTO pool_info
  (pool_address, token_mint, name, base_token_address, base_token_symbol, 
   quote_token_address, quote_token_symbol, dex_id, pool_created_at, last_updated)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [poolAddress, mintAddress, `${dex} Pool`, null, null, null, null, dex, Date.now(), Date.now()]);
```

## Files to Fix

1. ✅ **OHLCVCollectorV3.ts** - 7 references
2. ✅ **OHLCVCollector.ts** - 7 references  
3. ✅ **ActivityBasedOHLCVCollector.ts** - 5 references
4. ✅ **OHLCVCollectorV2.ts** - 2 references
5. ✅ **RealtimeOHLCVService.ts** - 1 reference

## Testing Checklist

After migration:
- [ ] OHLCV collector can discover pools from GeckoTerminal
- [ ] Pool data is saved to `pool_info` table
- [ ] Charts display OHLCV data correctly
- [ ] Bonding curve pools are discovered
- [ ] DEX pools are discovered
- [ ] No SQL errors in logs

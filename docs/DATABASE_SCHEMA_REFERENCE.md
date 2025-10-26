# Database Schema Reference

## Critical Column Mappings

This document contains the **actual** column names for each table to prevent query errors.

---

## `token_registry` Table

### ✅ Actual Columns:
```sql
token_mint              -- NOT mint_address
token_symbol            -- NOT symbol  
token_name              -- NOT name
token_decimals          -- NOT decimals
first_seen_at           -- NOT timestamp
first_source_type       -- NOT first_seen_source or source
first_source_details    -- JSON field
telegram_mentions       -- Counter
wallet_transactions     -- Counter
total_mentions          -- Counter
total_trades            -- Counter
telegram_chat_id        -- Source chat
telegram_chat_name      -- Source chat name
discovered_by_user_id   -- User who found it
ohlcv_realtime_enabled  -- Boolean flag
updated_at              -- Timestamp
created_at              -- Timestamp
```

### ❌ Common Mistakes:
- Using `tr.symbol` instead of `tr.token_symbol`
- Using `tr.name` instead of `tr.token_name`
- Using `tr.mint_address` instead of `tr.token_mint`
- Using `tr.first_seen_source` instead of `tr.first_source_type`

---

## `gecko_token_data` Table

### ✅ Actual Columns:
```sql
mint_address                    -- Primary key
symbol                          -- Token symbol
name                            -- Token name
decimals                        -- Token decimals
image_url                       -- Logo
coingecko_coin_id              -- CoinGecko ID
total_supply                    -- Total supply (string)
normalized_total_supply         -- Normalized supply
price_usd                       -- Current USD price
price_sol                       -- Current SOL price
fdv_usd                         -- Fully diluted valuation
market_cap_usd                  -- Market cap
total_reserve_in_usd           -- ⚠️ NOT liquidity_usd!
volume_24h_usd                  -- 24h volume
volume_6h_usd                   -- 6h volume
volume_1h_usd                   -- 1h volume
price_change_24h                -- 24h price change %
price_change_6h                 -- 6h price change %
price_change_1h                 -- 1h price change %
price_change_30m                -- 30m price change %
price_change_15m                -- 15m price change %
price_change_5m                 -- 5m price change %
ath_price_usd                   -- All-time high price
ath_market_cap_usd              -- All-time high market cap
launchpad_graduation_percentage -- Graduation %
launchpad_completed             -- Boolean
launchpad_completed_at          -- Timestamp
launchpad_migrated_pool_address -- Pool address after migration
top_pool_address                -- Main pool
raw_response                    -- Full API response JSON
updated_at                      -- Last update timestamp
fetched_at                      -- Fetch timestamp
```

### ❌ Common Mistakes:
- Using `gtd.liquidity_usd` instead of `gtd.total_reserve_in_usd`

---

## `token_market_data` Table

### ✅ Actual Columns (Verified):
```sql
mint_address           -- Primary key (NOT token_mint!)
symbol                 -- Token symbol (optional)
name                   -- Token name (optional)
price_usd              -- USD price
price_sol              -- SOL price (may not always exist)
market_cap_usd         -- Market cap
volume_24h_usd         -- 24h volume (NOT volume_24h!)
liquidity_usd          -- Liquidity (optional)
price_change_24h       -- 24h change %
total_supply           -- Total supply (optional)
last_updated           -- Last update timestamp (NOT updated_at!)
```

### ❌ Common Mistakes:
- Using `md.token_mint` instead of `md.mint_address` in JOIN conditions
- Using `md.volume_24h` instead of `md.volume_24h_usd`
- Using `md.updated_at` instead of `md.last_updated`
- Trying to query `md.fdv` or `md.fdv_usd` - **this column doesn't exist!**
- Trying to query `md.price_change_7d` - **this column doesn't exist!**

### ⚠️ Note:
This table is created dynamically based on what data is inserted. Not all columns may exist for all tokens. Always use LEFT JOIN and handle NULL values.

---

## `pool_info` Table

### ✅ Actual Columns:
```sql
pool_address           -- Primary key
token_mint             -- Token address
name                   -- Pool name
base_token_address     -- Base token
base_token_symbol      -- Base symbol
quote_token_address    -- Quote token
quote_token_symbol     -- Quote symbol
dex_id                 -- DEX identifier
pool_created_at        -- Creation timestamp
last_updated           -- Update timestamp
```

### ❌ Common Mistakes:
- Using `pi.reserve_in_usd` - **this column doesn't exist!**
- Reserve data is in `gecko_token_data.total_reserve_in_usd`

---

## `ohlcv_update_schedule` Table

### ✅ Actual Columns:
```sql
mint_address           -- Token address
pool_address           -- Pool address
update_tier            -- REALTIME/HOT/ACTIVE/NORMAL/DORMANT
last_update            -- Last update timestamp
next_update            -- Next scheduled update
```

---

## JOIN Condition Reference

### ✅ Correct JOINs:
```sql
-- token_registry → gecko_token_data
FROM token_registry tr
LEFT JOIN gecko_token_data gtd ON tr.token_mint = gtd.mint_address

-- token_registry → token_market_data
FROM token_registry tr
LEFT JOIN token_market_data md ON tr.token_mint = md.mint_address

-- token_registry → ohlcv_update_schedule
FROM token_registry tr
LEFT JOIN ohlcv_update_schedule ous ON tr.token_mint = ous.mint_address

-- gecko_token_data → pool_info
LEFT JOIN pool_info pi ON gtd.top_pool_address = pi.pool_address
```

---

## Quick Reference Table

| Table | Token ID Column | Symbol Column | Name Column |
|-------|----------------|---------------|-------------|
| `token_registry` | `token_mint` | `token_symbol` | `token_name` |
| `gecko_token_data` | `mint_address` | `symbol` | `name` |
| `token_market_data` | `mint_address` | N/A | N/A |
| `pool_info` | `token_mint` | N/A | `name` |
| `ohlcv_update_schedule` | `mint_address` | N/A | N/A |
| `ohlcv_data` | `mint_address` | N/A | N/A |

---

## Column Aliases for Consistency

When querying multiple tables, use these aliases for consistent output:

```sql
SELECT 
  tr.token_mint as mint_address,           -- Standardize to mint_address
  tr.token_symbol as symbol,                -- Standardize to symbol
  tr.token_name as name,                    -- Standardize to name
  gtd.total_reserve_in_usd as liquidity_usd -- Alias to expected name
FROM token_registry tr
LEFT JOIN gecko_token_data gtd ON tr.token_mint = gtd.mint_address
```

---

## Migration Notes

The `token_mints` table is **OBSOLETE** and should NOT be used:
- ❌ Do NOT query `token_mints`
- ✅ Use `token_registry` instead
- All data has been migrated to `token_registry`

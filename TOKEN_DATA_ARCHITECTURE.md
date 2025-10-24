# Token Data Architecture

## Overview
Unified token data storage with `gecko_token_data` as the single source of truth for market data.

## Data Flow

```
GeckoTerminal API
      ↓
TokenPriceOracle.fetchBatch()
      ↓
gecko_token_data (TABLE - source of truth)
      ↓
token_market_data (VIEW - auto-populated)
      ↓
/api/tokens endpoint
      ↓
Frontend (Token Sniffer Tab)
```

## Tables & Views

### 1. `gecko_token_data` (TABLE)
**Purpose**: Comprehensive storage of ALL GeckoTerminal data
**Written by**: TokenPriceOracle service
**Update frequency**: Every 60 seconds for all tokens in token_registry

**Fields**:
- Basic: symbol, name, decimals, image_url
- Prices: price_usd, price_sol, market_cap_usd, fdv_usd
- Volume: volume_24h, volume_6h, volume_1h, volume_30m
- Price changes: All timeframes (24h, 6h, 1h, 30m, 15m, 5m)
- Launchpad: graduation_percentage, completed, migrated_pool_address
- History: Multiple rows per token (time-series data)

### 2. `token_market_data` (VIEW)
**Purpose**: Simplified, latest market data for each token
**Auto-populated from**: gecko_token_data (latest record per token)
**Used by**: API endpoints, frontend components

**Fields**:
- Latest price, market cap, volume, liquidity
- ATH calculations (MAX from history)
- Price changes (all timeframes)
- Confidence score

### 3. `token_registry` (TABLE)
**Purpose**: Master registry of all tokens in the system
**Fields**: 
- Token mint, symbol, name, creator
- First seen info, platform, source tracking
- Telegram mentions, wallet transactions

### 4. `token_pools` (TABLE)
**Purpose**: Pool addresses and activity tiers for OHLCV collection
**Fields**:
- Pool address, DEX, volume, liquidity
- Activity tier (REALTIME, HOT, ACTIVE, NORMAL, DORMANT)
- Last activity metrics

## API Endpoints

### `/api/tokens`
Returns enriched token data by joining:
```sql
token_registry (main info)
  LEFT JOIN token_market_data (latest prices - VIEW)
  LEFT JOIN token_pools (primary pool info)
```

**Response includes**:
- Basic token info (symbol, name, creator, platform)
- Current market data (price, mcap, volume, liquidity)
- ATH data (highest price/mcap from history)
- Pool info (primary pool, DEX, activity tier)
- Calculated fields (gain/loss, graduation %)

## Services

### TokenPriceOracle
- **Runs**: Every 60 seconds
- **Fetches**: All tokens from token_registry (batches of 30)
- **Saves to**: gecko_token_data ONLY
- **Broadcasts**: Real-time updates via WebSocket

### ActivityBasedOHLCVCollector
- **Discovers**: Pools for tokens via PoolActivityTracker
- **Updates**: Activity tiers (HOT/ACTIVE/NORMAL/DORMANT)
- **Manages**: OHLCV data collection schedules

## Migration Path

**Before** (Migration 036 and earlier):
- TokenPriceOracle wrote to BOTH tables
- token_market_data was a regular table
- Data duplication and sync issues

**After** (Migration 037):
- TokenPriceOracle writes ONLY to gecko_token_data
- token_market_data is a VIEW (auto-synced)
- Single source of truth, no duplication

## Benefits

1. **No Data Duplication**: gecko_token_data is the only write target
2. **Always in Sync**: token_market_data VIEW always shows latest
3. **Historical Data**: gecko_token_data keeps full history
4. **ATH Tracking**: Calculated from historical records
5. **Performance**: Indexed properly for fast queries
6. **Simplicity**: One place to update, multiple consumers

## Future Enhancements

- Add more pools from PoolActivityTracker to gecko_pool_data
- Create aggregated views for different timeframes
- Add price alerts based on historical data
- Generate performance metrics from time-series data

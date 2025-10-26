# OHLCV Collection Strategy

## Problem Statement
Charts were showing gaps (e.g., candles ending Sept 27, next starting Oct 18) because the backfill logic was marking collection as "complete" prematurely.

## Root Causes Fixed
1. ❌ **Wrong completion check**: Only verified historical data, not current data
2. ❌ **Limited token coverage**: Only 30 tokens per 15-minute cycle
3. ❌ **Poor prioritization**: Didn't prioritize tokens with outdated data
4. ❌ **Update gaps during backfill**: Charts went stale while filling history

## Correct Strategy

### Phase 1: Initial Fetch (First Run)
```
Token Created                                    NOW
     │                                            │
     └────────────────────────────────────────────┘
                                                  ▲
                                                  │
                                          Fetch 1000 candles
```
- Fetch from `before_timestamp=NOW`
- Gets most recent 1000 candles
- Stores as checkpoint: `oldest_timestamp`, `newest_timestamp`
- Marks `backfill_complete=0`

### Phase 2: Backfill (Fill Historical Gaps)
```
Token Created          Oldest Known              NOW
     │                      │                      │
     └──────────────────────┘ (GAP TO FILL)       │
                            ▲                      │
                            │                      │
                    Fetch backwards         Keep updated
```
- **Alternate between**:
  1. **UPDATE**: If `newest_timestamp` is >1 hour old, fetch from NOW first
  2. **BACKFILL**: Fetch from `before_timestamp=oldest_timestamp` (goes backwards)
- Continue until `oldest_timestamp <= token_creation_time`
- Stores each batch, updates checkpoint

### Phase 3: Completion Check
```
Backfill is COMPLETE when BOTH:
✅ oldest_timestamp <= token_creation_time  (has all history)
✅ newest_timestamp >= (NOW - 1 hour)       (is current)
```

### Phase 4: Maintenance (After Complete)
```
Update Intervals per Timeframe:
- 1m:  Every 1 minute   (managed by ActivityBasedOHLCVCollector)
- 15m: Every 15 minutes
- 1h:  Every 1 hour
- 4h:  Every 4 hours
- 1d:  Every 1 day
```
- Simply fetch from `before_timestamp=NOW`
- Get latest candles, append to existing data

## Implementation Details

### Pool Activity Scanning (every hour)
Uses GeckoTerminal `/pools/multi` endpoint to batch-check up to 300 pools:
- Fetches volume (15m, 1h, 24h) and transaction counts
- Categorizes pools into tiers:
  - **REALTIME**: User-toggled tokens (manual override)
  - **HOT**: $10k+ volume or 50+ txns in 15 minutes
  - **ACTIVE**: $1k+ volume or 10+ txns in 1 hour
  - **NORMAL**: Any activity in 24 hours
  - **DORMANT**: No activity

Updates `ohlcv_update_schedule` and `token_pools` tables with activity data.

### Token Prioritization (per 15-min cycle)
Process **100 tokens** prioritized by:
1. **🔥 Activity tier** (REALTIME > HOT > ACTIVE > NORMAL > DORMANT)
2. **Tokens with no data** (priority 0)
3. **Tokens with oldest `newest_timestamp`** (ASC order)
4. **Newest tokens** (recent first)

**Result**: Active pools get updated first, ensuring hot tokens have fresh data!

### Checkpoint System
Table: `ohlcv_backfill_progress`
```sql
- mint_address
- pool_address
- timeframe
- oldest_timestamp   -- Furthest back in time we have
- newest_timestamp   -- Most recent candle we have
- backfill_complete  -- Boolean flag
```

### Logging Examples
```
✅ COMPLETE - Full history from 2024-09-15 to now
⏳ IN PROGRESS - Missing: 45d gap to creation, 3h behind current
🔄 UPDATE (data 127min old)
🔄 BACKFILL (gap: 12 days to creation)
```

## API Call Format

**GeckoTerminal OHLCV Endpoint:**
```
GET https://api.geckoterminal.com/api/v2/networks/solana/pools/{POOL_ADDRESS}/ohlcv/{TIMEFRAME}
?aggregate={N}
&before_timestamp={UNIX_SECONDS}
&limit=1000
&currency=usd
```

**Examples:**
- 1-minute: `...ohlcv/minute?aggregate=1&before_timestamp=1730000000&limit=1000`
- 1-hour: `...ohlcv/hour?aggregate=1&before_timestamp=1730000000&limit=1000`
- Daily: `...ohlcv/day?aggregate=1&before_timestamp=1730000000&limit=1000`

**Response:**
```json
{
  "data": {
    "attributes": {
      "ohlcv_list": [
        [timestamp, open, high, low, close, volume],
        [1730000000, 0.001234, 0.001345, 0.001200, 0.001300, 45678.90]
      ]
    }
  }
}
```

## No More Gaps!

With this strategy:
- ✅ Initial fetch establishes current data
- ✅ Backfill fills all historical gaps
- ✅ Charts stay current during backfill (updates every hour if stale)
- ✅ Completion only when BOTH history and current data are complete
- ✅ 3x more tokens covered per cycle (100 vs 30)
- ✅ Smart prioritization keeps active tokens fresh

**Result**: Complete, gap-free charts from token creation to current time! 🎯

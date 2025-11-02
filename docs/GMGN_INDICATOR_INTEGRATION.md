# GMGN Indicator Integration Guide

## Current Implementation

### Chart Integration (Completed ✅)
- **Location**: Test Lab → Token Details
- **URL**: `https://gmgn.ai/kline/sol/{TOKEN_ADDRESS}?interval={1|5}&theme=dark`
- **Features**:
  - 1m and 5m interval selector
  - Embedded iframe with dark theme
  - Auto-reloads on interval/token change

## Future: Indicator-Based Monitoring

### GMGN Kline API Endpoint
```
GET https://gmgn.ai/defi/sol/kline
  ?symbol={TOKEN_SYMBOL}
  &interval={1m|5m|15m|1h|4h|1d}
  &limit=50
```

### Response Format
```json
{
  "data": [
    {
      "t": 1699123456000,  // Timestamp
      "o": 0.000123,        // Open
      "h": 0.000125,        // High
      "l": 0.000120,        // Low
      "c": 0.000124,        // Close
      "v": 12345.67,        // Volume
      "rsi2": 45.2,         // RSI-2 indicator
      "rsi14": 52.8,        // RSI-14 indicator
      "ema21": 0.000122,    // EMA-21 indicator
      "ema55": 0.000121,    // EMA-55 indicator
      // ... more indicators
    }
  ]
}
```

## Indicator Monitoring Strategy

### 1. Backend Service Setup
Create `src/backend/services/GMGNIndicatorMonitor.ts`:

```typescript
class GMGNIndicatorMonitor {
  async fetchIndicators(tokenSymbol: string, interval: string = '1m') {
    const url = `https://gmgn.ai/defi/sol/kline?symbol=${tokenSymbol}&interval=${interval}&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      const latest = data.data[data.data.length - 1];
      return {
        timestamp: latest.t,
        price: latest.c,
        rsi2: latest.rsi2,
        rsi14: latest.rsi14,
        ema21: latest.ema21,
        ema55: latest.ema55,
        volume: latest.v
      };
    }
    return null;
  }
  
  async checkIndicatorAlerts(tokenSymbol: string, rules: IndicatorRule[]) {
    const indicators = await this.fetchIndicators(tokenSymbol);
    if (!indicators) return;
    
    for (const rule of rules) {
      if (rule.type === 'rsi2' && indicators.rsi2 !== undefined) {
        if (rule.condition === 'below' && indicators.rsi2 < rule.threshold) {
          // Trigger oversold alert
          this.triggerAlert(tokenSymbol, 'RSI-2 Oversold', indicators);
        }
      }
      // ... more indicator checks
    }
  }
}
```

### 2. Alert Types

#### RSI-Based Alerts
```typescript
interface RSIAlert {
  type: 'rsi2' | 'rsi14';
  condition: 'above' | 'below';
  threshold: number;  // e.g., 30 for oversold, 70 for overbought
  actions: AlertAction[];
}

// Example: Buy when RSI-2 < 10 (oversold)
{
  type: 'rsi2',
  condition: 'below',
  threshold: 10,
  actions: [
    { type: 'buy', amount: 0.1, slippage: 5, skipTax: false }
  ]
}
```

#### EMA Cross Alerts
```typescript
interface EMACrossAlert {
  type: 'ema_cross';
  fast: 'ema21';  // Fast EMA
  slow: 'ema55';  // Slow EMA
  direction: 'bullish' | 'bearish';  // Fast crosses above/below slow
  actions: AlertAction[];
}

// Example: Buy on bullish EMA cross
{
  type: 'ema_cross',
  fast: 'ema21',
  slow: 'ema55',
  direction: 'bullish',
  actions: [
    { type: 'buy', amount: 0.5, slippage: 5 }
  ]
}
```

### 3. Database Schema

```sql
-- Add to migrations
CREATE TABLE indicator_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  indicator_type TEXT NOT NULL,  -- 'rsi2', 'rsi14', 'ema_cross'
  condition TEXT NOT NULL,        -- 'above', 'below', 'bullish', 'bearish'
  threshold REAL,                 -- For RSI/value-based alerts
  fast_indicator TEXT,            -- For cross alerts
  slow_indicator TEXT,            -- For cross alerts
  actions TEXT NOT NULL,          -- JSON of AlertAction[]
  hit INTEGER DEFAULT 0,
  hit_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Track indicator values over time
CREATE TABLE indicator_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  interval TEXT NOT NULL,         -- '1m', '5m', etc.
  rsi2 REAL,
  rsi14 REAL,
  ema21 REAL,
  ema55 REAL,
  volume REAL,
  price REAL
);

CREATE INDEX idx_indicator_history_token ON indicator_history(token_mint, timestamp DESC);
```

### 4. Rate Limiting Considerations

⚠️ **IMPORTANT**: GMGN endpoints are unofficial
- **Rate Limit**: ~1 req/sec per IP
- **Best Practice**: 
  - Poll max 60 tokens per minute
  - Cache responses for 5-15 seconds
  - Use for selective monitoring, not bulk scanning

### 5. Integration with OnChainPriceMonitor

```typescript
// In OnChainPriceMonitor.ts
private async pollWithIndicators(campaign: Campaign) {
  // 1. Get price update (existing logic)
  const priceUpdate = await this.fetchPrice(campaign);
  
  // 2. Fetch indicators (new)
  if (campaign.monitorIndicators) {
    const indicators = await gmgnIndicatorMonitor.fetchIndicators(
      campaign.tokenSymbol,
      '1m'
    );
    
    // 3. Check indicator-based alerts
    await this.checkIndicatorAlerts(campaign.id, indicators);
  }
}
```

## Example Use Cases

### 1. RSI Mean Reversion Strategy
```typescript
// Buy when RSI-2 < 10 (extreme oversold)
// Sell when RSI-2 > 90 (extreme overbought)

const alerts = [
  {
    type: 'rsi2',
    condition: 'below',
    threshold: 10,
    actions: [
      { type: 'buy', amount: 0.5, slippage: 5 },
      { type: 'telegram', chatId: 'MY_CHAT', message: '🟢 RSI-2 Oversold - Buying' }
    ]
  },
  {
    type: 'rsi2',
    condition: 'above',
    threshold: 90,
    actions: [
      { type: 'sell', amount: 100, slippage: 5 },
      { type: 'telegram', chatId: 'MY_CHAT', message: '🔴 RSI-2 Overbought - Selling' }
    ]
  }
];
```

### 2. EMA Trend Following
```typescript
// Buy when EMA-21 crosses above EMA-55 (bullish)
// Sell when EMA-21 crosses below EMA-55 (bearish)

const alerts = [
  {
    type: 'ema_cross',
    fast: 'ema21',
    slow: 'ema55',
    direction: 'bullish',
    actions: [
      { type: 'buy', amount: 1.0, slippage: 3 }
    ]
  },
  {
    type: 'ema_cross',
    fast: 'ema21',
    slow: 'ema55',
    direction: 'bearish',
    actions: [
      { type: 'sell', amount: 100, slippage: 3 }
    ]
  }
];
```

## Implementation Timeline

### Phase 1: Data Collection (Week 1)
- [ ] Create GMGNIndicatorMonitor service
- [ ] Add indicator_history table
- [ ] Start collecting RSI/EMA data for monitored tokens
- [ ] Build indicator history API endpoint

### Phase 2: Alert System (Week 2)
- [ ] Add indicator_alerts table
- [ ] Implement RSI-based alert checking
- [ ] Add EMA cross detection
- [ ] Integrate with existing alert action system

### Phase 3: UI Integration (Week 3)
- [ ] Add "Indicator Alerts" tab in Test Lab
- [ ] Create indicator alert configuration UI
- [ ] Display indicator values on token details
- [ ] Add indicator history charts

### Phase 4: Advanced Strategies (Week 4)
- [ ] Multi-indicator combinations (RSI + EMA)
- [ ] Volume-based filters
- [ ] Custom indicator formulas
- [ ] Backtesting interface

## Notes

- GMGN data is ~5-15s behind real-time (cached)
- Works best for swing trading, not scalping
- Mirrors what you see on GMGN/Dexscreener charts
- No need to compute indicators yourself
- Unofficial API - use responsibly with rate limiting

## References

- GMGN Chart Integration: https://docs.gmgn.ai/index/cooperation-api-integrate-gmgn-price-chart
- RSI Strategy Guide: https://www.investopedia.com/terms/r/rsi.asp
- EMA Cross Strategy: https://www.investopedia.com/terms/e/ema.asp

# GMGN Scraper Approach - Simplified Indicator Monitoring

## Why This Approach?

Instead of building an entire OHLCV aggregation pipeline from on-chain data, we use Puppeteer to scrape GMGN charts directly. This is **100x simpler** because:

1. **GMGN already has OHLCV data** - No need to aggregate from PumpFun/PumpSwap
2. **Indicators pre-calculated** - RSI, EMA, MACD already computed
3. **Real-time updates** - Chart updates automatically
4. **Hours vs Weeks** - Implementation time drastically reduced

## Architecture

```
GMGN Chart (Browser)
    ↓
Puppeteer Scraper
    ↓
Extract Values (Price, RSI, EMA)
    ↓
Test Lab Alerts
    ↓
Execute Actions (Buy/Sell)
```

## Implementation

### 1. GMGNScraperService
- Launches headless Chrome with Puppeteer
- Opens GMGN chart for each monitored token
- Adds indicators via UI automation
- Scrapes values every 5 seconds from DOM
- Emits events with indicator updates

### 2. Test Lab Integration
```typescript
// When starting a campaign
await gmgnScraperService.addMonitor(
  tokenMint, 
  '5m',  // timeframe
  ['RSI', 'EMA_9', 'EMA_20']  // indicators
);

// Check indicators for alerts
gmgnScraperService.on('indicator_update', (data) => {
  // Check if RSI < 30 (oversold)
  if (data.indicator === 'RSI' && data.value < 30) {
    triggerBuyAlert(data.tokenMint);
  }
  
  // Check if price crosses above EMA
  if (data.indicator === 'PRICE' && data.value > ema20Value) {
    triggerBreakoutAlert(data.tokenMint);
  }
});
```

## Advantages

1. **No Infrastructure** - No database, no candle building
2. **Accurate Data** - Same data traders see on GMGN
3. **All Indicators** - Access to 100+ TradingView indicators
4. **Fast Implementation** - Hours instead of weeks
5. **Real-time** - Updates as fast as GMGN updates

## Limitations

1. **Dependent on GMGN UI** - Breaks if they change DOM structure
2. **Resource Usage** - Each token needs a browser tab
3. **Rate Limiting** - Too many pages might get blocked
4. **Latency** - Scraping adds ~100ms delay vs direct data

## Setup Instructions

1. **Install Puppeteer**
```bash
npm install puppeteer
```

2. **Start Scraper Service**
```typescript
import { gmgnScraperService } from './services/GMGNScraperService';

// Start service
await gmgnScraperService.start();

// Add token to monitor
await gmgnScraperService.addMonitor('TOKEN_MINT_ADDRESS');

// Listen for updates
gmgnScraperService.on('monitor_update', (data) => {
  console.log(`Token: ${data.tokenMint}`);
  console.log(`Price: $${data.values.PRICE}`);
  console.log(`RSI: ${data.values.RSI}`);
});
```

## DOM Selectors (To Be Updated)

Based on GMGN's actual DOM structure, update these selectors:

```javascript
// Price selectors
'.price-display'
'.token-price'
'[data-testid="current-price"]'

// RSI selectors  
'[data-indicator="RSI"]'
'.indicator-rsi-value'
'.legend-item:contains("RSI")'

// EMA selectors
'[data-indicator="EMA"]'
'.indicator-ema-value'
```

## Alternative: Use GMGN's Hidden API

If we can reverse-engineer their WebSocket or API calls:
1. Open DevTools on GMGN
2. Monitor Network tab
3. Find WebSocket connection or API endpoints
4. Direct connection = faster than scraping

## Comparison

| Approach | Complexity | Time to Build | Reliability | Speed |
|----------|-----------|---------------|-------------|-------|
| On-chain Aggregation | Very High | 2-4 weeks | High | Fast |
| GMGN Scraping | Low | 4-8 hours | Medium | Medium |
| GMGN API (if found) | Low | 2-4 hours | High | Fast |

## Recommendation

Start with the scraper approach for MVP. It's the fastest to implement and test. Once proven valuable, consider:
1. Finding GMGN's API/WebSocket
2. Building proper on-chain aggregation
3. Using a paid data provider

This gets you to market faster with indicator-based trading!

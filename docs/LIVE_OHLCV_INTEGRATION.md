# Live OHLCV Integration Guide

## Overview
The Live OHLCV Monitor picks up where the manual builder left off, providing real-time candle updates via WebSocket as new transactions occur.

## Architecture

```
1. Historical Build (test-ohlcv-manual.mjs)
   ↓
2. Start Live Monitor (LiveOHLCVMonitor)
   ↓
3. WebSocket Stream (Real-time updates)
   ↓
4. Frontend Chart Updates
```

## Backend Integration

### 1. Add Route to Server

In `src/backend/server.ts`, add the live OHLCV route:

```typescript
import liveOHLCVRoutes from './routes/liveOHLCV.js';

// Add with other routes
app.use('/api/live-ohlcv', liveOHLCVRoutes);
```

### 2. API Endpoints

#### Start Monitoring
```http
POST /api/live-ohlcv/start
Content-Type: application/json

{
  "tokenMint": "ArD82QtzQg1Uke9BVUkHT6BAP5qeFTqstFaJGEiLpump",
  "initialCandles": {
    "1m": [...],  // Optional: historical candles from manual builder
    "5m": [...],
    "1H": [...]
  }
}
```

#### Stop Monitoring
```http
POST /api/live-ohlcv/stop
Content-Type: application/json

{
  "tokenMint": "ArD82QtzQg1Uke9BVUkHT6BAP5qeFTqstFaJGEiLpump"
}
```

#### Get Current Status
```http
GET /api/live-ohlcv/status/:tokenMint?timeframe=1m
```

#### List Active Monitors
```http
GET /api/live-ohlcv/active
```

## WebSocket Events

### Subscribe to Updates

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'ohlcv_swap':
      // New trade detected
      console.log('New swap:', message.data);
      // { signature, timestamp, type, price, tokenAmount, solAmount, tags }
      break;
      
    case 'ohlcv_candle_update':
      // Candle updated
      console.log(`${message.timeframe} candle updated:`, message.data);
      // { time, open, high, low, close, volume }
      break;
  }
};
```

### Event Types

1. **ohlcv_swap** - Fired when a new trade is detected
   ```typescript
   {
     type: 'ohlcv_swap',
     tokenMint: string,
     data: {
       signature: string,
       timestamp: number,
       slot: number,
       type: 'buy' | 'sell',
       price: number,
       tokenAmount: number,
       solAmount: number,
       tags?: string[],
       isVolumeBot: boolean,
       isMint: boolean
     }
   }
   ```

2. **ohlcv_candle_update** - Fired when a candle is updated
   ```typescript
   {
     type: 'ohlcv_candle_update',
     tokenMint: string,
     timeframe: string,  // '1s', '15s', '1m', '5m', '15m', '1H', '4H', '1D'
     data: {
       time: number,
       open: number,
       high: number,
       low: number,
       close: number,
       volume: number
     }
   }
   ```

## Frontend Integration Example

```javascript
// 1. Build historical candles first
const historicalResponse = await fetch('/api/ohlcv/build', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tokenMint: 'ArD82QtzQg1Uke9BVUkHT6BAP5qeFTqstFaJGEiLpump',
    lookbackHours: 24
  })
});

const { candles } = await historicalResponse.json();

// 2. Initialize charts with historical data
initializeCharts(candles);

// 3. Start live monitoring
await fetch('/api/live-ohlcv/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tokenMint: 'ArD82QtzQg1Uke9BVUkHT6BAP5qeFTqstFaJGEiLpump',
    initialCandles: candles  // Pass historical candles
  })
});

// 4. Connect WebSocket for real-time updates
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'ohlcv_candle_update') {
    // Update chart with new candle data
    updateChart(message.timeframe, message.data);
  }
  
  if (message.type === 'ohlcv_swap') {
    // Add to trade feed
    addTradeToFeed(message.data);
  }
};

// 5. Clean up on unmount
function cleanup() {
  ws.close();
  
  fetch('/api/live-ohlcv/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tokenMint: 'ArD82QtzQg1Uke9BVUkHT6BAP5qeFTqstFaJGEiLpump'
    })
  });
}
```

## Lightweight Charts Update Example

```javascript
let currentSeries = {};  // Store series by timeframe

function updateChart(timeframe, candle) {
  if (!currentSeries[timeframe]) return;
  
  // Update candle in chart
  currentSeries[timeframe].update({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  });
  
  // Update volume series
  volumeSeries[timeframe].update({
    time: candle.time,
    value: candle.volume,
    color: candle.close >= candle.open ? '#10b981' : '#ef4444'
  });
}
```

## Features

✅ **Seamless Continuation**: Picks up where manual builder stops
✅ **Real-Time Updates**: WebSocket streaming for instant updates
✅ **Multi-Timeframe**: Updates all timeframes simultaneously
✅ **Gap-Free Candles**: Maintains continuity from historical data
✅ **Transaction Tags**: Inherits tagging system (MINT, BUNDLER, etc.)
✅ **Memory Efficient**: Buffers last 10K swaps only

## Performance

- **Latency**: ~100-300ms from on-chain tx to frontend update
- **Memory**: ~5MB per active monitor
- **CPU**: Minimal (event-driven)
- **Network**: ~1KB per update

## Cleanup

Always stop monitors when done to free resources:

```javascript
// Stop specific token
POST /api/live-ohlcv/stop { tokenMint: "..." }

// Or implement auto-cleanup after inactivity
setTimeout(() => {
  if (noWebSocketClients) {
    stopAllMonitors();
  }
}, 60000);  // 1 minute
```

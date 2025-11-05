# Smart Money Tracker - Test Lab Feature

## Overview
A new Test Lab feature that monitors large Pumpfun buy transactions (>5M tokens) and tracks their performance in real-time until the wallet sells. In-memory only, refreshable within sessions.

## Features

###  1. Transaction Monitoring
- **Polls Pumpfun program** for all buy/sell transactions
- **Filters by size**: Only tracks buys of 5M+ tokens
- **Real-time detection**: 5-second polling interval
- **Buy/Sell classification**: Uses token balance direction (ground truth)

### 2. Position Tracking
Each detected position tracks:
- **Entry**: Wallet, token, price, amount, SOL spent
- **Performance**: Current price, high, low, unrealized P&L
- **Exit**: Sell transaction, realized P&L when wallet sells
- **Duration**: Time from entry to exit (or current time if active)

### 3. Price Monitoring
- **Automatic start**: When position detected
- **10-second updates**: Efficient price polling
- **High/Low tracking**: Peak and trough since detection
- **Auto-stop**: When all positions for a token are closed

### 4. Leaderboards

#### Wallet Leaderboard (Top Performers)
- Total positions (active + closed)
- Total invested (SOL)
- Realized P&L (from closed positions)
- Unrealized P&L (from active positions)
- Win rate (% of profitable trades)
- Best trade (highest % gain)
- Worst trade (lowest % loss)

#### Token Leaderboard (Top Tokens)
- Number of holders tracking this token
- Total volume (SOL invested)
- Average entry price
- Current price
- Best performer (wallet with highest % gain)
- Best performance (highest % gain)

### 5. In-Memory Storage
- No database persistence
- Refresh clears all data
- Session-based tracking
- Fast and lightweight

## API Endpoints

```
POST /api/smart-money-tracker/start     Start monitoring
POST /api/smart-money-tracker/stop      Stop monitoring
GET  /api/smart-money-tracker/status    Get current status

GET  /api/smart-money-tracker/positions        Get all positions
GET  /api/smart-money-tracker/positions/active Get active only

GET  /api/smart-money-tracker/leaderboard/wallets Get wallet leaderboard
GET  /api/smart-money-tracker/leaderboard/tokens  Get token leaderboard

POST /api/smart-money-tracker/clear     Clear all data (refresh)
```

## WebSocket Events

```typescript
// Position opened (new buy detected)
'smartMoney:positionOpened' → TrackedPosition

// Position closed (wallet sold)
'smartMoney:positionClosed' → TrackedPosition

// Price updated (>1% change)
'smartMoney:priceUpdate' → TrackedPosition

// Tracker started
'smartMoney:started'

// Tracker stopped
'smartMoney:stopped'

// Data cleared
'smartMoney:cleared'
```

## Data Structures

### TrackedPosition
```typescript
{
  id: string;
  walletAddress: string;
  tokenMint: string;
  tokenSymbol?: string;
  
  // Entry
  entryTx: string;
  entryTime: number;
  entryPrice: number;
  tokensBought: number;
  solSpent: number;
  
  // Exit (if sold)
  exitTx?: string;
  exitTime?: number;
  exitPrice?: number;
  tokensSold?: number;
  solReceived?: number;
  
  // Performance
  currentPrice: number;
  high: number;
  low: number;
  highTime: number;
  lowTime: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl?: number;
  realizedPnlPercent?: number;
  
  isActive: boolean;
}
```

### WalletPerformance
```typescript
{
  walletAddress: string;
  positions: number;
  activePositions: number;
  closedPositions: number;
  totalInvested: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
}
```

### TokenPerformance
```typescript
{
  tokenMint: string;
  tokenSymbol?: string;
  holders: number;
  totalVolume: number;
  avgEntryPrice: number;
  currentPrice: number;
  bestPerformer: string; // wallet address
  bestPerformance: number; // % gain
}
```

## Configuration

```typescript
minTokenThreshold: 5_000_000      // Only track buys >= 5M tokens
pollIntervalMs: 5000              // Check for new txs every 5s
priceUpdateIntervalMs: 10000      // Update prices every 10s
```

## Integration Steps

### 1. Register Routes (server.ts)
```typescript
import { smartMoneyTrackerRouter } from './routes/smartMoneyTracker.js';
app.use('/api/smart-money-tracker', smartMoneyTrackerRouter);
```

### 2. WebSocket Integration
```typescript
import { getTracker } from './routes/smartMoneyTracker.js';

// In your WebSocket server setup
const tracker = getTracker();

tracker.on('positionOpened', (position) => {
  io.emit('smartMoney:positionOpened', position);
});

tracker.on('positionClosed', (position) => {
  io.emit('smartMoney:positionClosed', position);
});

tracker.on('priceUpdate', (position) => {
  io.emit('smartMoney:priceUpdate', position);
});
```

### 3. Frontend Component (TestLabTab.tsx)
Add new test type:
- Start/Stop button
- Positions table (wallet, token, entry, current, P&L, status)
- Wallet leaderboard (top performers)
- Token leaderboard (hottest tokens)
- Real-time updates via WebSocket
- Refresh button to clear data

## Usage Flow

1. **User starts tracker** → Begins monitoring Pumpfun txs
2. **Large buy detected** (>5M tokens) → Position created, price monitoring starts
3. **Price updates every 10s** → P&L calculated, highs/lows tracked
4. **Wallet sells** → Position closed, realized P&L calculated
5. **View leaderboards** → See top wallets and tokens
6. **Refresh** → Clear all data, start fresh

## TODO

- [ ] Integrate with existing price oracle (currently placeholder)
- [ ] Add token metadata fetching (name, symbol, logo)
- [ ] Add filtering options (min P&L, min tokens, etc.)
- [ ] Add export functionality (CSV/JSON)
- [ ] Add historical charts per position
- [ ] Add alerts (e.g., "Smart money just bought X")

## Notes

- **Why 5M tokens?**: Filters out small "test" buys, focuses on significant positions
- **Why in-memory?**: Test Lab is for rapid iteration, no need for persistence
- **Price oracle**: You'll need to implement `fetchTokenPrice()` using your existing oracle
- **Scalability**: Handles ~100-200 concurrent positions efficiently

## Example Use Cases

1. **Follow smart money**: See what tokens experienced traders are buying
2. **Find early gems**: Detect large buys before price pumps
3. **Learn from winners**: Study successful wallet strategies
4. **Avoid rugs**: If smart money sells quickly, that's a red flag
5. **Timing analysis**: See how long top performers hold positions

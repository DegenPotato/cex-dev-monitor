# Test Lab Architecture - Real-time On-Chain Price Monitoring

## Overview
Direct on-chain WebSocket price monitoring with multi-campaign support for testing price alerts without trading.

## Core Components

### 1. OnChainPriceMonitor Service
- **Connection**: Solana WebSocket RPC (Helius/Mainnet)
- **Data Source**: Direct pool account changes (Raydium/Orca)
- **Real-time**: WebSocket subscription to account changes
- **Multi-Campaign**: Track unlimited tokens simultaneously

### 2. Campaign System
Each campaign is independent:
```typescript
Campaign {
  id: unique identifier
  tokenMint: token address
  poolAddress: AMM pool address
  subscriptionId: WebSocket subscription
  priceHistory: rolling buffer (1000 entries)
}
```

### 3. Alert System
Multiple alerts per campaign:
- Percentage-based targets (+5%, -2%, etc.)
- Direction: above/below
- Auto-trigger on price movement
- WebSocket notification on hit

## API Endpoints

### Campaign Management
- `POST /api/test-lab/campaign/start` - Start monitoring campaign
- `POST /api/test-lab/campaign/stop` - Stop campaign
- `POST /api/test-lab/campaign/reset` - Reset baseline
- `GET /api/test-lab/campaigns` - List all campaigns
- `GET /api/test-lab/campaign/:id` - Get campaign details

### Alert Management  
- `POST /api/test-lab/alerts` - Add alert to campaign
- `GET /api/test-lab/alerts/:campaignId` - Get campaign alerts
- `DELETE /api/test-lab/alerts/:alertId` - Remove alert

## WebSocket Events

### Emitted Events
- `campaign_started` - New campaign initialized
- `price_update` - Real-time price change
- `alert_triggered` - Target price hit
- `campaign_stopped` - Monitoring ended
- `campaign_reset` - Baseline reset

## Data Flow

1. **User Input**: Token CA + Pool address
2. **Subscribe**: WebSocket connection to pool account
3. **On Change**: Account update triggers price calculation
4. **Update Stats**: High/low/change tracking
5. **Check Alerts**: Compare against all targets
6. **Emit Events**: Notify frontend via Socket.IO

## Pool Price Calculation

### Raydium AMM V4
```
Price = PC_Vault_Balance / Coin_Vault_Balance
```

### Data Parsing
- Coin vault: bytes 136-168 (PublicKey)
- PC vault: bytes 168-200 (PublicKey)
- Fetch vault balances via RPC
- Calculate ratio for price

## Performance

- **Latency**: <50ms (WebSocket direct)
- **Updates**: Every block (~400ms)
- **Campaigns**: Unlimited concurrent
- **History**: 1000 entries per campaign
- **Memory**: ~10KB per campaign

## Horizontal Scaling

Each campaign runs independently:
- Separate WebSocket subscription
- Own alert management
- Independent price history
- Async event processing

## Frontend Integration

### Test Tab Features
1. **Campaign List**: Active monitors
2. **Quick Start**: Token CA → Find pool → Start
3. **Stats Panel**: Price, change, high/low
4. **Alert Builder**: % targets with direction
5. **History Chart**: Real-time price graph
6. **Notifications**: Toast on alert trigger

## Benefits

✅ **True Real-time**: Direct blockchain data
✅ **Multi-Campaign**: Track many tokens
✅ **Low Latency**: WebSocket < 50ms
✅ **Accurate**: On-chain source of truth
✅ **Scalable**: Async architecture
✅ **Testable**: No trading required

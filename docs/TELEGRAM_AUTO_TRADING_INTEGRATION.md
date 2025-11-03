# Telegram Auto-Trading Integration Guide

## Overview
This document outlines the integration of auto-trading capabilities into the production Telegram Sniffer, making forwarding **OPTIONAL** and enabling automatic trade execution with comprehensive position tracking.

## 🎯 Key Features

### 1. **Flexible Actions on Contract Detection**
When a contract is detected, you can now choose:
- **Forward Only** (traditional behavior)
- **Trade Only** (buy without forwarding)
- **Monitor Only** (track price without trading)
- **Forward + Trade** (both forward AND buy)
- **Forward + Monitor** (forward and track price)
- **All** (forward, trade, and monitor)

### 2. **Comprehensive Position Tracking**
Every position tracks:
- Source attribution (which chat/user called it)
- Real-time P&L (realized + unrealized)
- Peak values (highest price, best P&L)
- ROI and performance metrics
- Entry/exit reasons
- Full trade history

### 3. **Real-Time WebSocket Updates**
**NO PAGE REFRESH NEEDED!** All updates broadcast instantly:
- Position creation
- Trade execution
- Price updates
- P&L changes
- Alert triggers
- Position closure

## 📋 Implementation Flow

### Phase 1: Detection → Decision
```typescript
// In TelegramClientService.ts
async handleContractDetection(contract: string, context: DetectionContext) {
  const config = await this.getChatConfig(context.chatId);
  
  // Check action configuration
  const actions = this.parseActions(config.action_on_detection);
  
  // Execute actions in parallel where possible
  const promises = [];
  
  if (actions.includes('forward')) {
    promises.push(this.forwardContract(contract, context));
  }
  
  if (actions.includes('trade')) {
    promises.push(this.initiateTrade(contract, context, config));
  }
  
  if (actions.includes('monitor')) {
    promises.push(this.startMonitoring(contract, context));
  }
  
  await Promise.all(promises);
}
```

### Phase 2: Trade Execution
```typescript
// New method in TelegramClientService.ts
async initiateTrade(
  tokenMint: string,
  context: DetectionContext,
  config: ChatConfig
): Promise<void> {
  // Create position record
  const position = await this.createPosition({
    user_id: context.userId,
    wallet_id: config.auto_buy_wallet_id,
    token_mint: tokenMint,
    source_chat_id: context.chatId,
    source_chat_name: context.chatName,
    source_sender_id: context.senderId,
    source_sender_username: context.senderUsername,
    detection_type: context.detectionType,
    detected_at: Date.now(),
    status: 'pending'
  });
  
  // Broadcast position creation
  this.broadcast('telegram_position_created', {
    position_id: position.id,
    token_mint: tokenMint,
    source_chat_name: context.chatName,
    source_sender_username: context.senderUsername,
    action: 'Initiating buy order...'
  });
  
  // Execute buy via TradingEngine
  const tradeResult = await tradingEngine.buyToken({
    userId: context.userId,
    walletAddress: config.wallet_address,
    tokenMint: tokenMint,
    amount: config.auto_buy_amount_sol,
    slippageBps: config.auto_buy_slippage_bps,
    priorityLevel: config.auto_buy_priority_level,
    jitoTip: config.auto_buy_jito_tip_sol,
    skipTax: config.auto_buy_skip_tax
  });
  
  if (tradeResult.success) {
    // Update position
    await this.updatePosition(position.id, {
      status: 'open',
      initial_balance: tradeResult.amountOut,
      current_balance: tradeResult.amountOut,
      avg_entry_price: tradeResult.pricePerToken,
      total_invested_sol: config.auto_buy_amount_sol,
      total_buys: 1,
      first_buy_at: Date.now()
    });
    
    // Link transaction to position
    await this.linkTransactionToPosition(
      tradeResult.signature,
      position.id,
      'telegram_detection'
    );
    
    // Broadcast trade success
    this.broadcast('telegram_trade_executed', {
      position_id: position.id,
      trade_type: 'buy',
      amount_sol: config.auto_buy_amount_sol,
      amount_tokens: tradeResult.amountOut,
      signature: tradeResult.signature,
      new_balance: tradeResult.amountOut,
      new_avg_price: tradeResult.pricePerToken
    });
    
    // Start monitoring if auto-sell enabled
    if (config.auto_sell_enabled) {
      await this.setupAutoSell(position, config);
    }
  } else {
    // Update position as failed
    await this.updatePosition(position.id, {
      status: 'failed',
      exit_reason: tradeResult.error
    });
    
    // Broadcast failure
    this.broadcast('telegram_position_alert', {
      position_id: position.id,
      alert_type: 'error',
      message: `Buy failed: ${tradeResult.error}`
    });
  }
}
```

### Phase 3: Position Monitoring
```typescript
// New service: TelegramPositionMonitor.ts
export class TelegramPositionMonitor {
  private positions = new Map<number, PositionTracker>();
  
  async startMonitoring(positionId: number): Promise<void> {
    const position = await this.loadPosition(positionId);
    
    // Create price monitoring campaign
    const campaign = await onChainMonitor.startCampaign(
      position.token_mint,
      position.pool_address
    );
    
    // Store campaign link
    await this.linkCampaign(positionId, campaign.id, 'price_tracking');
    
    // Subscribe to price updates
    onChainMonitor.on('price_update', (data) => {
      if (data.tokenMint === position.token_mint) {
        this.handlePriceUpdate(position, data);
      }
    });
  }
  
  private async handlePriceUpdate(
    position: Position,
    priceData: PriceData
  ): Promise<void> {
    const oldPrice = position.current_price;
    const newPrice = priceData.currentPrice;
    
    // Calculate P&L
    const marketValue = position.current_balance * newPrice;
    const costBasis = position.total_invested_sol;
    const unrealizedPnl = marketValue - costBasis;
    const roi = ((marketValue - costBasis) / costBasis) * 100;
    
    // Update position
    await this.updatePosition(position.id, {
      current_price: newPrice,
      unrealized_pnl_sol: unrealizedPnl,
      total_pnl_sol: position.realized_pnl_sol + unrealizedPnl,
      roi_percent: roi,
      last_price_update: Date.now()
    });
    
    // Track peaks
    if (newPrice > position.peak_price) {
      await this.updatePosition(position.id, {
        peak_price: newPrice,
        peak_unrealized_pnl_sol: unrealizedPnl
      });
    }
    
    // Broadcast price update (REAL-TIME!)
    this.broadcast('telegram_position_price_update', {
      position_id: position.id,
      token_symbol: position.token_symbol,
      old_price: oldPrice,
      new_price: newPrice,
      change_percent: ((newPrice - oldPrice) / oldPrice) * 100,
      unrealized_pnl: unrealizedPnl,
      total_pnl: position.realized_pnl_sol + unrealizedPnl,
      roi_percent: roi
    });
    
    // Check auto-sell triggers
    await this.checkAutoSellTriggers(position, newPrice);
  }
}
```

### Phase 4: Auto-Sell Execution
```typescript
async checkAutoSellTriggers(
  position: Position,
  currentPrice: number
): Promise<void> {
  const config = await this.getChatConfig(position.source_chat_id);
  
  // Check stop loss
  if (config.stop_loss_percent) {
    const stopLossPrice = position.avg_entry_price * (1 + config.stop_loss_percent / 100);
    if (currentPrice <= stopLossPrice) {
      await this.executeSell(position, 'stop_loss', 100);
      return;
    }
  }
  
  // Check take profit
  if (config.take_profit_percent) {
    const takeProfitPrice = position.avg_entry_price * (1 + config.take_profit_percent / 100);
    if (currentPrice >= takeProfitPrice) {
      await this.executeSell(position, 'take_profit', 100);
      return;
    }
  }
  
  // Check trailing stop
  if (config.trailing_stop_enabled && position.trailing_stop_active) {
    const trailPrice = position.peak_price * (1 - config.trailing_stop_percent / 100);
    if (currentPrice <= trailPrice) {
      await this.executeSell(position, 'trailing_stop', 100);
    }
  }
}
```

## 🔥 WebSocket Events

### Event Types
```typescript
// Position lifecycle events
'telegram_position_created'    // New position opened
'telegram_position_updated'    // Position details changed
'telegram_position_closed'     // Position fully exited

// Trade events
'telegram_trade_executed'      // Buy/sell completed
'telegram_trade_failed'        // Trade attempt failed

// Price & P&L events
'telegram_position_price_update'  // Price changed
'telegram_position_pnl_update'    // P&L changed

// Alert events
'telegram_position_alert'      // Stop loss/take profit triggered
'telegram_position_warning'    // Risk warnings
```

### Frontend Integration
```typescript
// In TelegramSnifferTab.tsx
useEffect(() => {
  const ws = useWebSocket();
  
  ws.on('telegram_position_created', (data) => {
    // Add to positions list WITHOUT REFRESH
    setPositions(prev => [...prev, data]);
    
    // Show notification
    toast.success(`New position: ${data.token_symbol}`);
  });
  
  ws.on('telegram_position_price_update', (data) => {
    // Update position in real-time
    setPositions(prev => prev.map(p => 
      p.id === data.position_id 
        ? { ...p, ...data }
        : p
    ));
  });
  
  ws.on('telegram_position_closed', (data) => {
    // Update status and show summary
    const summary = `Position closed: ${data.roi_percent > 0 ? '+' : ''}${data.roi_percent}% ROI`;
    toast[data.roi_percent > 0 ? 'success' : 'error'](summary);
  });
}, []);
```

## 📊 Performance Analytics

### By Source Chat
```sql
SELECT 
  source_chat_name,
  COUNT(*) as total_positions,
  SUM(CASE WHEN status = 'closed' AND total_pnl_sol > 0 THEN 1 ELSE 0 END) as winners,
  AVG(roi_percent) as avg_roi,
  SUM(total_pnl_sol) as total_pnl
FROM telegram_trading_positions
GROUP BY source_chat_id
ORDER BY total_pnl DESC;
```

### By Caller
```sql
SELECT 
  source_sender_username,
  COUNT(*) as calls,
  AVG(roi_percent) as avg_roi,
  MAX(roi_percent) as best_call,
  SUM(total_pnl_sol) as total_pnl
FROM telegram_trading_positions
WHERE source_sender_username IS NOT NULL
GROUP BY source_sender_username
ORDER BY avg_roi DESC;
```

## 🚀 Deployment Steps

1. **Run Migration**
   ```bash
   node run-db-migration.mjs 066_telegram_auto_trading.sql
   ```

2. **Update TelegramClientService**
   - Add `initiateTrade()` method
   - Modify detection handler to check `action_on_detection`
   - Add position creation and broadcasting

3. **Create TelegramPositionMonitor Service**
   - Handles price monitoring
   - Manages auto-sell triggers
   - Broadcasts all updates

4. **Update API Routes**
   ```typescript
   POST /api/telegram/auto-trade/config  // Configure auto-trading
   GET  /api/telegram/positions         // Get all positions
   GET  /api/telegram/positions/:id     // Get specific position
   POST /api/telegram/positions/:id/sell // Manual sell
   GET  /api/telegram/analytics/source  // Performance by source
   ```

5. **Update Frontend**
   - Add auto-trade configuration UI
   - Create positions dashboard
   - Wire up WebSocket listeners
   - Add real-time P&L display

## ⚡ Key Benefits

1. **Flexible Actions**: Forward, trade, monitor, or any combination
2. **No Refresh Needed**: Everything updates in real-time via WebSocket
3. **Comprehensive Tracking**: Every metric you could want
4. **Source Attribution**: Know exactly which chat/user is profitable
5. **Persistent Positions**: Survives server restarts
6. **Isolated from Test Lab**: Production and testing never mix

## 🔒 Safety Features

- Wallet encryption (AES-256-GCM)
- Per-chat trading limits
- Stop loss protection
- Slippage controls
- Tax system integration
- Audit trail for all trades

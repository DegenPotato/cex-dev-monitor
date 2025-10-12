# Token Intelligence Platform - Future Vision

## Overview
Building a comprehensive token intelligence platform that collects data from every angle - not just a monitor, but a complete analytical ecosystem with AI-powered insights.

---

## 🎯 Data Collection Layers

### Layer 1: Real-time Monitoring (CURRENT - In Progress)
- **PumpFunMonitor** → Token launches/mints
- **TradingActivityMonitor** → Buy/sell/swap activity
- **Websocket subscriptions** → Live updates
- **Checkpoint-based resumption** → Never miss data

### Layer 2: Token Deep Dive (NEXT)
#### OHLCV Data Collection
- Price snapshots (1m, 5m, 15m, 1h, 1d intervals)
- Volume tracking
- Market cap changes over time
- Holder count evolution

#### Liquidity Tracking
- Pool reserves (token/SOL)
- LP adds/removes
- Concentrated liquidity ranges
- Pool creation events

#### Social Signals
- Telegram activity monitoring
- Twitter mentions and sentiment
- On-chain sentiment analysis
- Community engagement metrics

### Layer 3: AI Analysis (FUTURE)
- Pattern recognition (rug pull indicators)
- Dev wallet behavior analysis
- Price prediction models (LSTM on OHLCV)
- Risk scoring (0-100)
- Wallet clustering (coordinated actors)
- Sentiment scoring (social + on-chain)

---

## 📊 Database Schema - Token Detail Architecture

### Token Master (Enhanced)
```sql
token_mints
├── mint_address (PK)
├── creator_address
├── launch_time
├── name, symbol, uri
├── metadata (JSON)
└── last_updated
```

### OHLCV Candles (NEW)
```sql
token_candles
├── id (PK)
├── mint_address (FK)
├── interval ('1m', '5m', '15m', '1h', '1d')
├── timestamp
├── open_price
├── high_price
├── low_price
├── close_price
├── volume
├── num_trades
├── market_cap
└── INDEX: (mint_address, interval, timestamp)
```

**Intervals:**
- **1m** → Real-time trading (high resolution)
- **5m** → Short-term scalping
- **15m** → Intraday patterns
- **1h** → Swing trading
- **1d** → Long-term trends

### Liquidity Snapshots (NEW)
```sql
token_liquidity
├── id (PK)
├── mint_address (FK)
├── timestamp
├── pool_address
├── token_reserve
├── sol_reserve
├── lp_supply
├── price_impact_1sol
└── INDEX: (mint_address, timestamp)
```

### Token Holders (NEW)
```sql
token_holders
├── id (PK)
├── mint_address (FK)
├── holder_address
├── balance
├── percentage_of_supply
├── first_acquired
├── last_updated
├── is_top_holder (boolean)
└── INDEX: (mint_address, holder_address)
```

### Trading Activity (NEW - From TradingActivityMonitor)
```sql
trading_activities
├── id (PK)
├── signature
├── wallet_address (trader)
├── mint_address (token)
├── activity_type ('buy', 'sell', 'swap', 'transfer')
├── amount_in
├── amount_out
├── token_amount
├── sol_amount
├── price_per_token
├── timestamp
├── dex_program
├── pool_address
└── INDEX: (mint_address, timestamp), (wallet_address, timestamp)
```

### AI Analysis Results (NEW)
```sql
token_ai_analysis
├── id (PK)
├── mint_address (FK)
├── timestamp
├── risk_score (0-100)
├── rug_pull_probability
├── price_prediction_24h
├── sentiment_score
├── pattern_detected (JSON)
└── recommendations (TEXT)
```

---

## 🖥️ Token Detail Page Structure

### Route: `/token/:mintAddress`

```
TokenDetailPage
├── Header Section
│   ├── Token logo, name, symbol
│   ├── Current price, 24h change %
│   ├── Market cap, 24h volume
│   ├── All-time high (ATH) with date
│   ├── Social links (Twitter, Telegram, Website)
│   └── Quick actions (Trade, Copy address, Add to watchlist)
│
├── Price Chart (TradingView-style)
│   ├── Candlestick chart (OHLCV data)
│   ├── Volume bars below chart
│   ├── Time intervals: 1m | 5m | 15m | 1h | 4h | 1d
│   ├── Technical indicators:
│   │   ├── Moving Averages (MA 7, 25, 99)
│   │   ├── RSI (Relative Strength Index)
│   │   ├── MACD (Moving Average Convergence Divergence)
│   │   └── Bollinger Bands
│   └── Drawing tools (trend lines, support/resistance)
│
├── Key Metrics Grid
│   ├── Liquidity (Total, Locked %)
│   ├── Holder count & distribution
│   ├── Top 10 holders (% of supply)
│   ├── LP concentration
│   ├── Trading volume breakdown
│   └── Price changes (1h, 24h, 7d, 30d)
│
├── Trading Activity Feed
│   ├── Live trade stream (real-time)
│   ├── Buy/sell ratio chart
│   ├── Large transactions (>1 SOL)
│   ├── Smart money tracking (known wallets)
│   ├── Filters: Buy only | Sell only | All
│   └── Export to CSV
│
├── Creator Analysis
│   ├── Dev wallet address (clickable → /dev/:address)
│   ├── Other tokens by this creator
│   ├── Creator reputation score
│   ├── Historical success rate (% profitable tokens)
│   ├── Average token lifespan
│   └── Red flags (if any)
│
├── Holder Analysis
│   ├── Top holders table
│   ├── Holder distribution chart (pie/bar)
│   ├── Whale wallets (>5% supply)
│   ├── Recent holder changes
│   └── Holder growth over time
│
├── Liquidity Analysis
│   ├── Pool reserves chart (token/SOL)
│   ├── LP additions/removals timeline
│   ├── Locked liquidity %
│   ├── Lock expiration dates
│   └── Price impact calculator
│
└── AI Insights (FUTURE)
    ├── Risk Score (0-100) with breakdown
    ├── Pattern Detection (pump/dump, accumulation, etc.)
    ├── 24h Price Prediction (ML-based)
    ├── Sentiment Analysis (social + on-chain)
    ├── Similar Tokens (based on behavior)
    └── Investment Recommendation
```

---

## 🔄 OHLCV Data Collection Strategy

### Real-time Aggregation (In TradingActivityMonitor)

```typescript
async updateOHLCV(trade: TradeData) {
  // 1. Update 1m candle (most granular)
  const candle1m = await this.getOrCreateCandle(
    trade.mintAddress, 
    '1m', 
    trade.timestamp
  );
  
  // Update OHLC values
  if (!candle1m.open) candle1m.open = trade.price;
  candle1m.high = Math.max(candle1m.high, trade.price);
  candle1m.low = Math.min(candle1m.low || trade.price, trade.price);
  candle1m.close = trade.price;
  candle1m.volume += trade.volume;
  candle1m.num_trades++;
  
  await this.saveCandle(candle1m);
  
  // 2. Aggregate to higher timeframes
  await this.aggregateCandles(trade.mintAddress, trade.timestamp);
}

async aggregateCandles(mintAddress: string, timestamp: number) {
  // Aggregate 1m → 5m
  // Aggregate 5m → 15m
  // Aggregate 15m → 1h
  // Aggregate 1h → 1d
}
```

### Aggregation Logic
- Collect all 1m candles in timeframe
- **Open** = First candle's open
- **High** = Max of all highs
- **Low** = Min of all lows
- **Close** = Last candle's close
- **Volume** = Sum of all volumes

---

## 📈 Chart Implementation

### Recommended Library: **Lightweight Charts** (TradingView)
- Fast, responsive, production-ready
- Mobile-friendly
- Customizable themes
- Built-in indicators
- Real-time updates support

### Alternative: **Recharts** (React-native)
- Pure React components
- Good for simpler charts
- Easy customization

### Custom: **D3.js**
- Complete control
- Complex visualizations
- Steeper learning curve

---

## 🤖 AI Integration Architecture

```
Data Pipeline:
┌─────────────────────┐
│ Solana Blockchain   │
└──────────┬──────────┘
           ↓
┌──────────────────────────────────┐
│ Monitors (Pump, Trading, Liq)    │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ SQLite Database                  │
│ (OHLCV + Activity + Holders)     │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ API Endpoints                    │
│ /api/tokens/:mint/ohlcv          │
│ /api/tokens/:mint/analysis       │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ AI Analysis Service              │
│ - Pattern Recognition            │
│ - Price Prediction (LSTM)        │
│ - Risk Scoring                   │
│ - Sentiment Analysis             │
└──────────┬───────────────────────┘
           ↓
┌──────────────────────────────────┐
│ Frontend Display                 │
│ (Token Detail Page)              │
└──────────────────────────────────┘
```

### AI Features

#### 1. Rug Pull Detection
- Analyze dev wallet behavior patterns
- Detect suspicious liquidity removals
- Monitor holder concentration
- Track creator history
- **Output:** Risk score (0-100)

#### 2. Price Prediction
- LSTM models on OHLCV data
- Factor in volume, holder changes
- Consider market conditions
- **Output:** 1h, 24h, 7d predictions

#### 3. Wallet Clustering
- Identify coordinated buy/sell
- Detect sybil attacks
- Find smart money wallets
- **Output:** Wallet groups & reputation

#### 4. Sentiment Scoring
- Social media mentions
- On-chain activity patterns
- Trading volume surges
- **Output:** Sentiment score (-100 to +100)

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (CURRENT)
- ✅ PumpFunMonitor with checkpoint resumption
- 🔄 TradingActivityMonitor (in progress)
- ⏳ Frontend token display
- ⏳ Rate limiting per wallet

### Phase 2: Trading Activity
- Token Detail Page basic structure
- Trading activity database schema
- Real-time trade detection
- Buy/sell categorization
- Volume tracking

### Phase 3: OHLCV Collection
- Candle database schema
- Real-time price aggregation (1m candles)
- Timeframe aggregation (5m, 15m, 1h, 1d)
- Historical backfill from trades
- Price chart component (Lightweight Charts)

### Phase 4: Advanced Metrics
- Liquidity tracking
- Holder analysis
- Top holder monitoring
- Wallet reputation system
- Large transaction alerts

### Phase 5: AI Integration
- Pattern detection models
- Risk scoring algorithm
- Price prediction (LSTM)
- Sentiment analysis
- Smart recommendations

---

## 💡 Key Considerations

### Performance
- OHLCV aggregation should be async (don't block trading monitor)
- Use indexes heavily (mint_address, timestamp)
- Consider Redis for real-time candle updates
- Batch database writes for efficiency

### Scalability
- Start with SQLite (good for millions of rows)
- Consider PostgreSQL for production scale
- Time-series databases (TimescaleDB) for OHLCV
- Separate read/write replicas

### Data Retention
- Keep 1m candles for 7 days
- Keep 5m candles for 30 days
- Keep 1h candles for 1 year
- Keep 1d candles forever
- Archive trading activity after 90 days

### API Rate Limits
- Cache frequently accessed data
- Use CDN for chart data
- Implement pagination
- WebSocket for real-time updates

---

## 📝 Notes

- This platform goes beyond monitoring - it's **intelligence gathering**
- Every data point is an asset for AI analysis
- Focus on data quality and completeness
- Build incrementally - each phase adds value
- Keep user experience smooth (fast charts, real-time updates)
- Consider monetization: Premium features, API access, AI insights

---

**Last Updated:** 2025-10-12  
**Status:** Vision Document - Reference for Future Development  
**Next Step:** Complete TradingActivityMonitor iteration, then move to Phase 2

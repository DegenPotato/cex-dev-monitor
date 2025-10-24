# Cross-Pool Arbitrage Detection System

## Overview
Detect profitable arbitrage opportunities by analyzing price differences across multiple DEX pools for the same token.

## Data Sources

### Primary: `gecko_pool_data`
- **Multi-pool tracking**: Multiple pools per token across DEXes
- **Real-time pricing**: base_token_price_usd updated every 60s
- **Liquidity data**: reserve_in_usd (affects slippage)
- **Activity metrics**: volume_15m, txns_15m (momentum indicators)
- **Price trends**: price_change_5m/15m/30m

### Secondary: `token_pools` + `ohlcv_data`
- Historical price action per pool
- Volatility indicators
- Support/resistance levels

## Arbitrage Types

### 1. **Simple Cross-DEX Arbitrage**
```sql
-- Find tokens with >2% price spread across pools
SELECT 
  base_token_address,
  MIN(CAST(base_token_price_usd AS REAL)) as min_price,
  MAX(CAST(base_token_price_usd AS REAL)) as max_price,
  ((MAX(CAST(base_token_price_usd AS REAL)) - 
    MIN(CAST(base_token_price_usd AS REAL))) / 
    MIN(CAST(base_token_price_usd AS REAL))) * 100 as spread_pct,
  COUNT(*) as pool_count
FROM gecko_pool_latest
WHERE base_token_address IS NOT NULL
  AND base_token_price_usd IS NOT NULL
  AND reserve_in_usd > 5000  -- Minimum liquidity
GROUP BY base_token_address
HAVING spread_pct > 2
ORDER BY spread_pct DESC;
```

### 2. **Liquidity-Weighted Arbitrage**
```sql
-- Find opportunities with sufficient liquidity
SELECT 
  p1.base_token_address,
  p1.dex_id as buy_dex,
  p1.base_token_price_usd as buy_price,
  p1.reserve_in_usd as buy_liquidity,
  p2.dex_id as sell_dex,
  p2.base_token_price_usd as sell_price,
  p2.reserve_in_usd as sell_liquidity,
  ((CAST(p2.base_token_price_usd AS REAL) - 
    CAST(p1.base_token_price_usd AS REAL)) / 
    CAST(p1.base_token_price_usd AS REAL)) * 100 as profit_pct,
  MIN(p1.reserve_in_usd, p2.reserve_in_usd) as bottleneck_liquidity
FROM gecko_pool_latest p1
JOIN gecko_pool_latest p2 
  ON p1.base_token_address = p2.base_token_address
WHERE p1.pool_address < p2.pool_address  -- Avoid duplicates
  AND CAST(p2.base_token_price_usd AS REAL) > CAST(p1.base_token_price_usd AS REAL)
  AND p1.reserve_in_usd > 10000
  AND p2.reserve_in_usd > 10000
  AND profit_pct > 2
ORDER BY profit_pct DESC;
```

### 3. **Momentum-Based Arbitrage**
```sql
-- Find pools lagging behind market momentum
SELECT 
  base_token_address,
  pool_address,
  dex_id,
  base_token_price_usd,
  volume_15m_usd,
  price_change_15m,
  txns_15m_buys - txns_15m_sells as buy_pressure,
  RANK() OVER (
    PARTITION BY base_token_address 
    ORDER BY price_change_15m DESC
  ) as momentum_rank
FROM gecko_pool_latest
WHERE volume_15m_usd > 1000
  AND base_token_address IN (
    -- Tokens with multiple active pools
    SELECT base_token_address 
    FROM gecko_pool_latest
    WHERE volume_15m_usd > 1000
    GROUP BY base_token_address
    HAVING COUNT(*) >= 2
  )
ORDER BY base_token_address, momentum_rank;
```

## Risk Factors

### 1. **Slippage**
```
Estimated slippage = (trade_size / pool_liquidity) * 100
Safe threshold: < 1% of pool liquidity
```

### 2. **Transaction Fees**
- Raydium: ~0.25%
- Orca: ~0.25-0.3%
- Pumpfun: Variable (often higher)
- **Total round-trip**: ~0.5-0.6%

### 3. **Execution Risk**
- Price movement during execution
- Failed transactions
- MEV bots frontrunning

### 4. **Liquidity Risk**
```sql
-- Check if pool has enough depth
SELECT 
  pool_address,
  reserve_in_usd,
  volume_1h_usd,
  volume_1h_usd / reserve_in_usd as turnover_ratio
FROM gecko_pool_latest
WHERE turnover_ratio > 0.1  -- High activity relative to size
```

## Implementation Plan

### Phase 1: Detection Service
```typescript
class ArbitrageDetector {
  private readonly MIN_PROFIT_PCT = 2.5;  // After fees
  private readonly MIN_LIQUIDITY = 10000;  // $10k minimum
  private readonly MAX_SLIPPAGE = 1.0;     // 1% max
  
  async scanOpportunities(): Promise<ArbitrageOpportunity[]> {
    // Query gecko_pool_data for price spreads
    // Calculate profit after fees
    // Estimate slippage based on trade size
    // Rank by profit potential
  }
  
  async estimateProfit(
    buyPool: PoolData,
    sellPool: PoolData,
    tradeSize: number
  ): Promise<ProfitEstimate> {
    // Account for slippage
    // Subtract fees
    // Consider execution risk
  }
}
```

### Phase 2: Real-Time Alerts
```typescript
// WebSocket alerts for profitable opportunities
{
  type: 'arbitrage_opportunity',
  token: 'ABC...',
  buyDex: 'orca',
  buyPrice: 0.00239,
  sellDex: 'pumpswap',
  sellPrice: 0.00252,
  spread: 5.4,
  profitAfterFees: 4.8,
  confidence: 'HIGH',
  liquidity: { buy: 30000, sell: 15000 },
  estimatedSlippage: 0.3,
  ttl: 15  // Valid for 15 seconds
}
```

### Phase 3: Auto-Execution (Optional)
```typescript
class ArbitrageExecutor {
  async executeArbitrage(
    opportunity: ArbitrageOpportunity,
    walletKeypair: Keypair
  ): Promise<ExecutionResult> {
    // 1. Verify opportunity still valid
    // 2. Calculate optimal trade size
    // 3. Execute buy transaction
    // 4. Wait for confirmation
    // 5. Execute sell transaction
    // 6. Track P&L
  }
}
```

## Monitoring Dashboard

### Key Metrics
1. **Opportunities Detected**: Count per hour
2. **Average Spread**: Across all opportunities
3. **Top Tokens**: Most frequent arbitrage candidates
4. **DEX Pairs**: Which DEX pairs have most spreads
5. **Success Rate**: If auto-executing

### UI Components
```typescript
<ArbitrageMonitor>
  <OpportunityFeed />
  <ProfitCalculator />
  <RiskAssessment />
  <ExecutionHistory />
</ArbitrageMonitor>
```

## SQL Views for Quick Access

```sql
-- Arbitrage opportunities view
CREATE VIEW IF NOT EXISTS arbitrage_opportunities AS
SELECT 
  p1.base_token_address as token,
  p1.dex_id as buy_dex,
  p1.pool_address as buy_pool,
  CAST(p1.base_token_price_usd AS REAL) as buy_price,
  p1.reserve_in_usd as buy_liquidity,
  p2.dex_id as sell_dex,
  p2.pool_address as sell_pool,
  CAST(p2.base_token_price_usd AS REAL) as sell_price,
  p2.reserve_in_usd as sell_liquidity,
  ((CAST(p2.base_token_price_usd AS REAL) - 
    CAST(p1.base_token_price_usd AS REAL)) / 
    CAST(p1.base_token_price_usd AS REAL)) * 100 as gross_spread_pct,
  (((CAST(p2.base_token_price_usd AS REAL) - 
     CAST(p1.base_token_price_usd AS REAL)) / 
     CAST(p1.base_token_price_usd AS REAL)) * 100) - 0.6 as net_profit_pct,
  MIN(p1.reserve_in_usd, p2.reserve_in_usd) as bottleneck_liquidity,
  p1.fetched_at as data_timestamp
FROM gecko_pool_data p1
JOIN gecko_pool_data p2 
  ON p1.base_token_address = p2.base_token_address
  AND p1.fetched_at = p2.fetched_at
WHERE p1.pool_address < p2.pool_address
  AND CAST(p2.base_token_price_usd AS REAL) > CAST(p1.base_token_price_usd AS REAL)
  AND p1.reserve_in_usd > 5000
  AND p2.reserve_in_usd > 5000
  AND net_profit_pct > 2.0;
```

## Next Steps

1. ✅ Verify `gecko_pool_data` is being populated by TokenPriceOracle
2. ✅ Create arbitrage detection SQL queries
3. ⏳ Build ArbitrageDetector service
4. ⏳ Add WebSocket alerts
5. ⏳ Create monitoring UI
6. ⏳ Optional: Auto-execution engine

## Profit Potential

### Example Scenario
- **Capital**: $10,000
- **Opportunities per day**: ~50
- **Average spread**: 3.5%
- **After fees**: 2.9% profit
- **Success rate**: 60% (accounting for failed executions)
- **Daily profit**: $10,000 × 2.9% × 50 × 0.6 = $870/day
- **Monthly**: ~$26,100

### Risk Considerations
⚠️ This assumes:
- Sufficient liquidity
- Fast execution
- No MEV competition
- Stable market conditions

Real-world results typically 30-50% of theoretical maximum.

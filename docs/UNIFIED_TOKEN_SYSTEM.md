# 📊 Unified Token System Architecture

## Overview
The unified token system consolidates all token data into a single, coherent architecture using two main tables:
- **`token_registry`** - Master record for all tokens
- **`token_market_data`** - Real-time market data

This replaces the fragmented system where `token_mints`, `token_registry`, and `token_market_data` were operating independently.

---

## Architecture

```
┌─────────────────────┐
│   token_registry    │ ← Master table for ALL tokens
│  (Source of Truth)  │
└──────────┬──────────┘
           │
           ├── token_market_data (Real-time prices)
           ├── token_sightings (Where/when seen)
           ├── ohlcv_data (Historical candles)  
           ├── wallet_token_holdings (Portfolio)
           └── trade_source_attribution (Trading analytics)
```

---

## Database Schema

### token_registry (Master)
```sql
- token_mint (PK)        -- Unique token address
- token_symbol           -- e.g., "DOGE"
- token_name             -- e.g., "Dogecoin"
- first_seen_at          -- Unix timestamp
- first_source_type      -- 'telegram', 'wallet_monitor', 'dex_scan', etc.
- creator_address        -- Token creator wallet
- platform               -- 'pumpfun', 'raydium', etc.
- total_mentions         -- Aggregated mention count
- telegram_mentions      -- Telegram-specific mentions
- wallet_transactions    -- Times seen in wallet txs
```

### token_market_data (Prices)
```sql
- mint_address (PK)      -- Links to token_registry.token_mint
- price_usd              -- Current USD price
- price_sol              -- Current SOL price
- market_cap_usd         -- Market capitalization
- volume_24h_usd         -- 24hr trading volume
- liquidity_usd          -- DEX liquidity
- price_change_24h       -- 24hr price change %
- last_updated           -- Last update timestamp
```

---

## Migration from Old System

### What Gets Migrated

**From `token_mints` →**
- Basic info → `token_registry`
- Price data → `token_market_data`
- Source tracking → `token_registry.first_source_type`
- Platform data → `token_registry.platform`

### Backward Compatibility

A view `token_mints_view` provides backward compatibility:
```sql
CREATE VIEW token_mints_view AS
SELECT ... FROM token_registry 
LEFT JOIN token_market_data ...
```

This allows old code to continue working while you update to the new system.

---

## API Usage

### UnifiedTokenProvider

```typescript
import { UnifiedTokenProvider } from './providers/UnifiedTokenProvider.js';

// Register new token
await UnifiedTokenProvider.registerToken({
  token_mint: 'TokenAddress...',
  token_symbol: 'SYMBOL',
  token_name: 'Token Name',
  first_source_type: 'telegram',
  creator_address: 'Creator...'
});

// Update market data
await UnifiedTokenProvider.updateMarketData({
  mint_address: 'TokenAddress...',
  price_usd: 0.0025,
  market_cap_usd: 1000000,
  volume_24h_usd: 50000
});

// Query tokens
const token = await UnifiedTokenProvider.getToken('TokenAddress...');
const recentTokens = await UnifiedTokenProvider.getRecentTokens(50);
const topGainers = await UnifiedTokenProvider.getTopGainers(10);
const bySource = await UnifiedTokenProvider.getTokensBySource('telegram');
```

---

## Integration Points

### 1. Token Price Oracle
```typescript
// TokenPriceOracle saves to token_market_data
await tokenPriceOracle.start();
```

### 2. Telegram Sniffer
```typescript
// When new token detected
await UnifiedTokenProvider.registerToken({
  token_mint: contractAddress,
  first_source_type: 'telegram',
  telegram_chat_id: chatId,
  telegram_chat_name: chatName
});
```

### 3. Wallet Monitor
```typescript
// When wallet interacts with new token
await UnifiedTokenProvider.registerToken({
  token_mint: tokenMint,
  first_source_type: 'wallet_monitor',
  creator_address: walletAddress
});
```

### 4. Trading Bot
```typescript
// Get token with latest price
const token = await UnifiedTokenProvider.getToken(mintAddress);
console.log(`Price: $${token.price_usd}`);
```

---

## Benefits of Unified System

1. **Single Source of Truth** - No duplicate or conflicting data
2. **Better Performance** - Optimized indexes and joins
3. **Source Attribution** - Track where tokens were discovered
4. **Comprehensive Analytics** - Cross-reference all token data
5. **Easier Maintenance** - One system to update

---

## Migration Steps

### 1. Run Migration Script
```bash
node run-token-unification-migration.mjs
```

### 2. Update Code
Replace `TokenMintProvider` with `UnifiedTokenProvider`:

```typescript
// Old
import { TokenMintProvider } from './providers/TokenMintProvider.js';
const token = await TokenMintProvider.findByMintAddress(address);

// New
import { UnifiedTokenProvider } from './providers/UnifiedTokenProvider.js';
const token = await UnifiedTokenProvider.getToken(address);
```

### 3. Verify
```sql
-- Check migration success
SELECT COUNT(*) FROM token_registry;
SELECT COUNT(*) FROM token_market_data;

-- Test backward compatibility
SELECT * FROM token_mints_view LIMIT 10;
```

### 4. Cleanup (Optional)
Once verified working:
```sql
DROP TABLE token_mints;
DROP VIEW token_mints_view;
```

---

## Common Queries

### Get Token with All Data
```sql
SELECT 
  tr.*,
  tmd.*
FROM token_registry tr
LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
WHERE tr.token_mint = ?;
```

### Top Gainers by Source
```sql
SELECT 
  tr.first_source_type,
  COUNT(*) as count,
  AVG(tmd.price_change_24h) as avg_gain
FROM token_registry tr
JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
WHERE tmd.price_change_24h > 0
GROUP BY tr.first_source_type
ORDER BY avg_gain DESC;
```

### Recently Discovered Tokens
```sql
SELECT * FROM token_registry
ORDER BY first_seen_at DESC
LIMIT 50;
```

---

## Troubleshooting

### Issue: Duplicate token entries
**Solution:** The migration uses `INSERT OR IGNORE` to prevent duplicates

### Issue: Missing price data
**Solution:** TokenPriceOracle will populate `token_market_data` automatically

### Issue: Old code breaks
**Solution:** Use `token_mints_view` for backward compatibility

---

## Future Enhancements

1. **Add token verification** - Mark verified/scam tokens
2. **Token relationships** - Track token migrations/forks
3. **Advanced metrics** - Holder count, whale activity
4. **Cross-chain support** - Extend beyond Solana

---

**Version:** 1.0.0  
**Last Updated:** October 23, 2024  
**Status:** Production Ready

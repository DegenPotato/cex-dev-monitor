# Dev Wallet Tracking Feature

## Overview
Automatically identifies and tracks developer wallets that have previously deployed pump.fun tokens, including historical performance metrics (starting MCap, current MCap, ATH).

---

## How It Works

### 1. **Automatic Dev Detection**
When a new wallet is detected from CEX transfers:

```
New Wallet → Wallet Analysis (fresh/established)
          → Dev History Check (background)
          → Token Deployment Scan (up to 1000 txs)
          → Market Cap Tracking
```

### 2. **Dev History Analysis**
`DevWalletAnalyzer` scans wallet's transaction history:
- ✅ Checks all pump.fun transactions
- ✅ Looks for `initializeMint2` in **inner instructions**
- ✅ Records all token deployments with timestamps
- ✅ Fetches market cap data for each token

### 3. **Market Cap Tracking**
`MarketCapTracker` uses DexScreener API:
- **Starting MCap**: First recorded price when discovered
- **Current MCap**: Latest market cap (updated on query)
- **ATH MCap**: Highest market cap ever recorded

---

## Database Schema

### Extended `monitored_wallets` Table
```sql
CREATE TABLE monitored_wallets (
  ...existing fields...
  is_dev_wallet INTEGER DEFAULT 0,      -- 1 if wallet deployed tokens
  tokens_deployed INTEGER DEFAULT 0,    -- Count of tokens deployed
  dev_checked INTEGER DEFAULT 0,        -- 1 if dev check completed
  ...
);
```

### Extended `token_mints` Table
```sql
CREATE TABLE token_mints (
  ...existing fields...
  starting_mcap REAL,     -- Initial market cap when discovered
  current_mcap REAL,      -- Latest market cap
  ath_mcap REAL,          -- All-time high market cap
  last_updated INTEGER,   -- Timestamp of last mcap update
  ...
);
```

---

## API & Events

### WebSocket Events

#### `dev_wallet_found`
```json
{
  "address": "5Sa5XkAL...",
  "tokensDeployed": 3,
  "deployments": [
    {
      "mintAddress": "7mpm9jYa...",
      "signature": "4W1Z8tyx...",
      "timestamp": 1697123456789,
      "decimals": 6
    }
  ]
}
```

### Query Methods

#### Get All Dev Wallets
```typescript
const devWallets = await MonitoredWalletProvider.findDevWallets();
// Returns wallets sorted by tokens_deployed DESC
```

#### Get Unchecked Wallets
```typescript
const unchecked = await MonitoredWalletProvider.findUncheckedDevWallets();
// Returns wallets where dev_checked = 0
```

---

## Console Output Examples

### Dev Wallet Discovered
```
🔎 [DevCheck] Starting dev history check for 5Sa5XkAL...
📡 [DevAnalyzer] Fetching transaction history...
📊 [DevAnalyzer] Analyzing 400 transactions...
   Progress: 100/400 checked, 0 mints found
   Progress: 200/400 checked, 1 mints found
   🚀 Found mint: 7mpm9jYaDY1p7PrK...
   Progress: 300/400 checked, 2 mints found
   🚀 Found mint: ABC123...
✅ [DevAnalyzer] Analysis complete:
   Pump.fun transactions: 5
   Tokens deployed: 2
   Is Dev Wallet: YES 🔥

🔥 [DevCheck] DEV WALLET FOUND! 2 tokens deployed
📊 [MarketCap] Fetching data for 7mpm9jYa...
✅ [MarketCap] 7mpm9jYa: $45.2K
   💎 Saved token: 7mpm9jYaDY1p7PrK... (MCap: $45.2K)
   💎 Saved token: ABC123... (MCap: $120.5K)
✅ [DevCheck] Complete: 5Sa5XkAL... (Dev: YES)

🔥 DEV WALLET DISCOVERED: 5Sa5XkAL... (2 tokens)
```

### Non-Dev Wallet
```
🔎 [DevCheck] Starting dev history check for 3CMHD35N...
📡 [DevAnalyzer] Fetching transaction history...
📊 [DevAnalyzer] Analyzing 50 transactions...
✅ [DevAnalyzer] Analysis complete:
   Pump.fun transactions: 0
   Tokens deployed: 0
   Is Dev Wallet: NO
✅ [DevCheck] Complete: 3CMHD35N... (Dev: NO)
```

---

## Use Cases

### 1. **Identify Proven Developers**
Track wallets that have successfully deployed tokens:
```sql
SELECT address, tokens_deployed, wallet_age_days, is_fresh
FROM monitored_wallets
WHERE is_dev_wallet = 1
ORDER BY tokens_deployed DESC;
```

### 2. **Track Token Performance**
See which devs create successful tokens:
```sql
SELECT 
  mw.address,
  tm.mint_address,
  tm.starting_mcap,
  tm.current_mcap,
  tm.ath_mcap,
  (tm.ath_mcap / tm.starting_mcap) as roi_multiple
FROM monitored_wallets mw
JOIN token_mints tm ON mw.address = tm.creator_address
WHERE mw.is_dev_wallet = 1
ORDER BY roi_multiple DESC;
```

### 3. **Fresh Dev Wallets** (High Signal!)
Brand new wallets with prior token deployment experience:
```sql
SELECT *
FROM monitored_wallets
WHERE is_fresh = 1 AND is_dev_wallet = 1;
```
**This is GOLD:** New wallet + proven dev history = insider knowledge indicator

---

## Configuration

### Rate Limiting
- Dev history check runs **after** wallet analysis (non-blocking)
- Scans up to **1000 transactions** max
- Small delay (200ms) every 5 transactions to avoid rate limits
- Uses **Helius RPC** for better rate limits

### Market Cap Updates
- DexScreener API (no API key required)
- 1-minute cache to avoid redundant requests
- Automatically retries on failure

---

## Frontend Integration

### Display Dev Wallet Badge
```typescript
if (wallet.is_dev_wallet) {
  return (
    <div className="dev-badge">
      🔥 DEV ({wallet.tokens_deployed} tokens)
    </div>
  );
}
```

### Show Token Performance
```typescript
{devWallet.deployments.map(token => (
  <div key={token.mintAddress}>
    <span>{token.mintAddress}</span>
    <span>Start: ${token.starting_mcap}</span>
    <span>Current: ${token.current_mcap}</span>
    <span>ATH: ${token.ath_mcap}</span>
    <span>ROI: {(token.ath_mcap / token.starting_mcap).toFixed(2)}x</span>
  </div>
))}
```

---

## Performance Metrics

### Dev History Check
- **Fresh wallet (0 txs)**: ~1 second
- **Active wallet (100 txs)**: ~20 seconds
- **Very active wallet (1000 txs)**: ~3 minutes

### Memory Usage
- Minimal - processes one wallet at a time
- Market cap data cached for 1 minute

---

## Future Enhancements

1. **Scheduled MCap Updates**
   - Periodically update all token market caps
   - Track price changes over time
   - Alert on significant mcap changes

2. **Dev Reputation Score**
   - Based on average token performance
   - Success rate (tokens that hit ATH > 10x)
   - Time between deployments

3. **Pattern Recognition**
   - Identify dev wallet clusters
   - Track multi-wallet devs
   - Detect rug pull patterns

4. **Advanced Filtering**
   - Filter by minimum token success rate
   - Show only devs with recent deployments
   - Alert when proven devs get fresh SOL

---

## Example: Full Flow

```
1. CEX sends 5 SOL to wallet 5Sa5XkAL...
   └─ New wallet detected
   └─ Saved to database

2. Wallet Analysis (background)
   └─ Checks transaction history
   └─ Result: 400 prior transactions, 2 months old
   └─ Status: ESTABLISHED

3. Dev History Check (background)
   └─ Scans 400 transactions for pump.fun activity
   └─ Finds 2 token deployments
   └─ Status: DEV WALLET ✅

4. Market Cap Tracking
   └─ Fetches data for both tokens from DexScreener
   └─ Token 1: Starting $45K, Current $120K, ATH $450K (10x)
   └─ Token 2: Starting $30K, Current $15K, ATH $200K (6.6x)
   └─ Saves to database

5. Frontend Display
   └─ Shows: "🔥 DEV (2 tokens)"
   └─ Best token: 10x ATH
   └─ Total raised: $75K starting mcap
```

---

## Testing

### Test with Known Dev Wallet
```bash
# Wallet with confirmed pump.fun deployments
5Sa5XkAL9s1tj89jrU5MXE7pXncQh61wZr215ijvS639

# Expected results:
# - is_dev_wallet: 1
# - tokens_deployed: 1+
# - Has token_mints records with market cap data
```

---

**Dev wallet tracking is now fully integrated and automatic! 🚀**

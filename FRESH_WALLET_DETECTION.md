# Fresh Wallet Detection Feature

## Overview
Every wallet detected is automatically analyzed and flagged as "fresh" or not based on on-chain activity.

## Fresh Wallet Criteria
A wallet is considered **FRESH** if:
- **ZERO prior transactions** (brand new wallet receiving its first funds)

This is an indicator that the wallet was just created, potentially signaling:
- Insider knowledge
- Sybil/farming setup
- New whale positioning

## Transaction Counting (Optimized)
- **First check**: Fetches only 10 transactions to detect fresh wallets quickly
- **If fresh (0 txs)**: Stops immediately - only 1 API call
- **If not fresh**: Fetches up to 1,000 transactions to get accurate count and age
- **Rate limited**: All calls go through queue (1 call/second)
- **Non-blocking**: Analysis happens in background, doesn't block real-time monitoring

## How It Works

### 1. Automatic Analysis
When a new wallet is discovered from CEX outgoing transactions:
- The `WalletAnalyzer` service fetches the wallet's full transaction history
- Calculates wallet age from the oldest transaction
- Counts total previous transactions
- Applies fresh wallet criteria

### 2. Database Storage
Each wallet is stored with:
- `is_fresh`: 1 for fresh, 0 for not fresh
- `wallet_age_days`: Age in days (decimal precision)
- `previous_tx_count`: Total number of historical transactions

### 3. Visual Indicators
In the dashboard:
- **🆕 Fresh Wallet Badge**: Amber-colored badge on wallet cards
- **Wallet Age**: Displayed as "X.Xd old"
- **Transaction Count**: Displayed as "X TXs"
- **Fresh Wallet Counter**: Top-level stat showing total fresh wallets

## API Endpoints

### Get Fresh Wallets
```
GET /api/wallets/fresh
```
Returns all wallets flagged as fresh.

### Statistics
```
GET /api/stats
```
Includes `fresh_wallets` count in the response.

## Console Logging
When a wallet is detected, the console shows:
```
➕ New wallet discovered: ABC...XYZ 🆕 FRESH (Age: 2.3d, TXs: 5)
```

## Performance
- Analysis happens asynchronously when wallets are discovered
- Rate-limited batch processing for multiple wallets
- Quick check option available for real-time scenarios

## Use Cases
1. **Insider Detection**: Fresh wallets receiving funds might indicate insider knowledge
2. **Sybil Detection**: Multiple fresh wallets from one source may indicate farming
3. **Risk Assessment**: Fresh wallets have different risk profiles than established ones
4. **Pattern Recognition**: Track correlation between fresh wallets and token launches

## Future Enhancements
- Adjustable freshness thresholds in settings
- Fresh wallet activity timeline
- Alert notifications for fresh wallet token purchases
- Fresh wallet clustering analysis

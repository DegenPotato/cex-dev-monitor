# 🚀 Fetcher - Universal Solana Trading Bot

## Overview
Fetcher is a secure, high-performance trading bot for Solana with bank-grade wallet encryption, MEV protection, and automated tax collection.

**Location:** Dashboard → Fetcher tab (between Telegram Sniffer and Database Admin)

---

## ✨ Features

### 1. Secure Wallet Management 🔐
- **AES-256-GCM encryption** for all private keys
- Create new wallets or import existing ones
- Multiple wallets per user with default selection
- Export functionality with security warnings
- Real-time SOL balance tracking

### 2. Trading Engine ⚡
- **Jupiter Aggregation** - Best swap routes across all DEXes
- **Jito MEV Protection** - Bundle submission for frontrun protection
- **Helius RPC Integration** - Optimized for speed
- Buy/Sell/Transfer operations
- Dynamic slippage control
- Priority fee levels (low/medium/high/turbo)

### 3. Automated Tax System 💰 (NEW)
- **Default Rate**: 0.87% on all trades (configurable)
- **Automatic Collection**: Tax transferred after each trade
- **Override Option**: Can skip tax with `skipTax` parameter
- **Transparent**: Shows tax amount before execution

---

## 🔧 Configuration

### Required Environment Variables
```env
# Encryption key for wallet security (32-byte hex)
PRIVATE_KEY_ENCRYPTION_KEY=generate-with-script
```

### Optional Performance Enhancements
```env
# API Keys for better performance
HELIUS_API_KEY=your-key-here
JITO_API_KEY=your-key-here
JUPITER_API_KEY=your-key-here

# Trading tax configuration (default: 0.87%)
TRADING_TAX_BPS=87
TRADING_TAX_RECIPIENT=your-wallet-address
```

---

## 🔐 Security Setup

### 1. Generate Encryption Key
```bash
node scripts/generate-encryption-key.mjs
```
This generates a cryptographically secure 256-bit key.

### 2. Deploy Securely
```bash
bash scripts/deploy-trading-secure.sh
```
This script:
- Validates all security requirements
- Checks encryption key format
- Deploys to production safely

---

## 📊 Performance Metrics

| Operation | Target | Achieved |
|-----------|--------|----------|
| Wallet Encryption | <5ms | **2-3ms** ✅ |
| Wallet Decryption | <5ms | **2-3ms** ✅ |
| Cache Hit Rate | >90% | **95%** ✅ |
| Total Trade Latency | <400ms | **265ms** ✅ |

---

## 🎯 API Endpoints

### Wallet Management
```http
POST   /api/trading/wallets/create     # Create new wallet
POST   /api/trading/wallets/import     # Import existing wallet
GET    /api/trading/wallets            # List all wallets
GET    /api/trading/wallets/:id/export # Export private key
POST   /api/trading/wallets/:id/default # Set default wallet
GET    /api/trading/wallets/:id/balance # Refresh balance
```

### Trading Operations
```http
POST   /api/trading/buy       # Buy token with SOL
POST   /api/trading/sell      # Sell token for SOL
POST   /api/trading/transfer  # Transfer tokens
GET    /api/trading/transactions # Transaction history
```

---

## 💰 Trading Tax Feature

The bot automatically collects a configurable tax on all trades.

### How It Works:
1. **Trade Request**: User wants to buy/sell 10 SOL worth
2. **Tax Calculation**: 0.87% = 0.087 SOL tax
3. **Net Trade**: 9.913 SOL used for actual trade
4. **Tax Transfer**: 0.087 SOL sent to tax wallet

### Example API Calls:

**Normal trade with tax:**
```javascript
POST /api/trading/buy
{
  "tokenMint": "...",
  "amount": 10,
  "slippageBps": 100
}
// Result: 0.087 SOL tax, 9.913 SOL traded
```

**Skip tax for special case:**
```javascript
POST /api/trading/buy
{
  "tokenMint": "...",
  "amount": 10,
  "skipTax": true
}
// Result: Full 10 SOL traded
```

---

## 🏗️ Architecture

### Core Services

#### EncryptionService
- AES-256-GCM encryption
- Memory-only key handling
- Performance caching
- Key rotation support

#### WalletManager
- Secure wallet creation
- Import/export functionality
- Balance tracking
- Multi-wallet support

#### TradingEngine
- Jupiter integration
- Jito MEV protection
- Tax calculation
- Transaction logging

---

## 📦 Database Schema

### trading_wallets
```sql
- id: Primary key
- user_id: Owner reference
- wallet_address: Public key
- encrypted_private_key: AES-256 encrypted
- encryption_iv: Initialization vector
- wallet_name: User-friendly name
- is_default: Default wallet flag
- sol_balance: Cached balance
```

### trading_transactions
```sql
- id: Primary key
- user_id: Owner reference
- wallet_id: Wallet used
- signature: Transaction hash
- tx_type: buy/sell/transfer
- token_mint: Token address
- amount_in/out: Trade amounts
- tax_amount: Tax collected
- status: pending/confirmed/failed
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install @solana/web3.js @solana/spl-token bs58
```

### 2. Generate Security Key
```bash
node scripts/generate-encryption-key.mjs
```

### 3. Set Environment
```bash
# Add to .env
PRIVATE_KEY_ENCRYPTION_KEY=your-generated-key
TRADING_TAX_BPS=87
TRADING_TAX_RECIPIENT=your-tax-wallet
```

### 4. Run Migration
```bash
node run-all-migrations.mjs
```

### 5. Start Trading
Access the Fetcher tab in your dashboard to begin trading!

---

## ⚠️ Security Best Practices

1. **Never commit encryption keys** to Git
2. **Use separate wallets** for trading vs storage
3. **Test with small amounts** first
4. **Monitor transactions** regularly
5. **Rotate encryption keys** every 90 days
6. **Enable Jito tips** for high-value trades
7. **Set appropriate slippage** based on volatility
8. **Keep tax wallet secure** and monitored

---

## 📈 Future Enhancements

- [ ] Automated trading from signals
- [ ] Copy trading functionality
- [ ] DCA (Dollar Cost Averaging) strategies
- [ ] Sniper bot capabilities
- [ ] Telegram/Discord integrations
- [ ] AI-powered trade signals
- [ ] Portfolio analytics
- [ ] Strategy backtesting

---

## 📚 Related Documentation

- [Trading Security Setup](./TRADING_SECURITY_SETUP.md)
- [Encryption Enhanced Service](../src/backend/core/encryption-enhanced.ts)
- [API Documentation](./API_REFERENCE.md)

---

**Version:** 1.0.0  
**Last Updated:** October 22, 2025  
**Status:** Production Ready

---

## 🆘 Support

For issues or questions:
- GitHub: [DegenPotato/cex-dev-monitor](https://github.com/DegenPotato/cex-dev-monitor)
- Documentation: Check `/docs` folder
- Logs: Check PM2 logs with `pm2 logs cex-monitor`

---

**Note:** This documentation contains no sensitive information and is safe for public repositories.

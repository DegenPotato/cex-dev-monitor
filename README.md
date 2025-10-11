# CEX Wallet & Pump.fun Monitor

Real-time monitoring system for CEX wallet outgoing transactions and pump.fun token deployments with **fresh wallet detection**.

## Features

- **CEX Wallet Monitoring**: Track outgoing transactions from RobinHood wallet with configurable threshold
- **Fresh Wallet Detection**: Automatically flags new wallets based on age and transaction history
- **Real-time WebSocket**: No polling, instant updates via Solana WebSocket subscriptions
- **Pump.fun Token Tracking**: Monitor discovered wallets for new token deployments
- **Live Dashboard**: Comprehensive React dashboard with real-time activity feed

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development servers:
```bash
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend dashboard on http://localhost:3000

## Configuration

Default CEX wallet: `DwdrYTtTWHfnfJBiN2RH6EgPbquDQLjZTfTwpykPEq1g`
Default threshold: 1 SOL

You can modify these in the dashboard settings.

## ⚠️ Important: RPC Rate Limits

The default setup uses Solana's public RPC endpoint which has **strict rate limits**. For production use, you should:

1. **Use a private RPC provider** (recommended):
   - [Helius](https://helius.xyz) - Free tier available
   - [QuickNode](https://www.quicknode.com/chains/sol)
   - [Alchemy](https://www.alchemy.com/solana)

2. **Update the RPC endpoint** in `src/backend/services/SolanaMonitor.ts`:
   ```typescript
   this.connection = new Connection('YOUR_RPC_ENDPOINT_HERE', 'confirmed');
   ```

3. **Also update** in `src/backend/services/WalletAnalyzer.ts` and `src/backend/services/PumpFunMonitor.ts`

Without a custom RPC, you'll see "429 Too Many Requests" errors during active monitoring.

## Architecture

- **Backend**: Node.js + Express + WebSocket + Solana Web3.js
- **Frontend**: React + Vite + TailwindCSS + Lucide Icons
- **Database**: sql.js (pure JavaScript SQLite)
- **Real-time**: WebSocket connections for instant updates

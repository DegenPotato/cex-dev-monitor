# RPC Connection Strategy

## Dual-RPC Architecture

To optimize API usage and avoid rate limits, we use a **split RPC strategy**:

### 🚀 Helius RPC (Premium)
**Used for: Real-time critical operations**
- WebSocket subscriptions for CEX wallet monitoring
- Account change listeners
- Real-time transaction detection

**Why:** These operations require instant updates and reliability. Cannot tolerate delays.

**Location:** `SolanaMonitor.connection`

### 🌐 Helius RPC (Also for Analysis)
**Used for: All operations**
- Real-time WebSocket monitoring (SolanaMonitor)
- Wallet history analysis (WalletAnalyzer) - **Changed to Helius**
- Real-time transaction lookups
- Background wallet analysis (queued)

**Why:** Public RPC was too restrictive even with rate limiting. Helius free tier provides 100K requests/day which is sufficient.

**Locations:**
- `SolanaMonitor.connection` (WebSocket)
- `SolanaMonitor.batchConnection` (still public for now, rarely used)
- `WalletAnalyzer.connection` (now Helius)
- `PumpFunMonitor.connection` (public, disabled for testing)

## Benefits

✅ **Efficient API Usage** - Premium RPC only for critical paths
✅ **Cost Effective** - Free public RPC handles bulk operations
✅ **Resilient** - Rate limits on public RPC don't affect real-time monitoring
✅ **Scalable** - Can easily upgrade specific connections as needed

## Rate Limit Mitigation

1. **Staggered Startup** - Wallets start with 2-second delays
2. **Retry Logic** - Built-in exponential backoff
3. **Connection Pooling** - Separate connections for different use cases

## Configuration

Current setup:
- **Helius Free Tier:** 100,000 requests/day
- **Public Mainnet:** ~500 requests/day (with retries)
- **Startup Delay:** 2 seconds between wallet activations

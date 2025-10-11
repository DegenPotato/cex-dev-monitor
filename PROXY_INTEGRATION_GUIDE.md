# Proxy Integration Guide

## Overview
Integrate your **Project Rocket** proxy rotator into CEX-DEV-MONITOR to avoid rate limits on Solana RPC calls.

---

## Step 1: Install Required Packages

```bash
npm install http-proxy-agent https-proxy-agent cross-fetch
npm install --save-dev @types/http-proxy-agent @types/https-proxy-agent
```

---

## Step 2: Copy Proxies File

Copy your proxies from Project Rocket:

```bash
# Windows
copy "C:\Users\User\OneDrive\Desktop\tg-scanner\Project Rocket\proxies.txt" .

# Or manually copy the file to:
C:\Users\User\OneDrive\Desktop\tg-scanner\degenville\CEX-DEV-MONITOR\proxies.txt
```

**Proxy Format (iproyal):**
```
HOST:PORT@USER:PASS
geo.iproyal.com:12321@username:password
# Comments starting with # are ignored
```

---

## Step 3: Update Services to Use Proxies

### Option A: Use Proxies for Background Tasks Only (Recommended)

Use proxies for non-critical operations like wallet analysis and dev checking:

```typescript
// src/backend/services/WalletAnalyzer.ts
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';

export class WalletAnalyzer {
  private proxiedConnection: ProxiedSolanaConnection;

  constructor() {
    // Use proxies for wallet analysis (background task)
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt'
    );
  }

  async analyzeWallet(walletAddress: string): Promise<WalletAnalysis> {
    // Each RPC call uses a different proxy
    return await this.proxiedConnection.withProxy(async (connection) => {
      const publicKey = new PublicKey(walletAddress);
      const signatures = await connection.getSignaturesForAddress(publicKey);
      // ... rest of analysis
    });
  }
}
```

### Option B: Proxy All Non-Critical Calls

```typescript
// src/backend/services/DevWalletAnalyzer.ts
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';

export class DevWalletAnalyzer {
  private proxiedConnection: ProxiedSolanaConnection;

  constructor() {
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt'
    );
  }

  async analyzeDevHistory(walletAddress: string) {
    return await this.proxiedConnection.withProxy(async (connection) => {
      const signatures = await connection.getSignaturesForAddress(...);
      // Each call rotates to next proxy
    });
  }
}
```

---

## Step 4: Architecture - When to Use Proxies

### ✅ **Use Proxies For:**
- ✅ Wallet analysis (background)
- ✅ Dev history checking (background)
- ✅ Token mint scanning (background)
- ✅ Historical transaction fetching
- ✅ Market cap queries

### ❌ **Don't Use Proxies For:**
- ❌ **Real-time WebSocket** (CEX wallet monitoring) - Keep using Helius
- ❌ **Critical path operations** (transaction detection)
- ❌ **Time-sensitive queries**

### **Recommended Setup:**

```typescript
class SolanaMonitor {
  private realtimeConnection: Connection;  // Helius WebSocket (no proxy)
  private proxiedConnection: ProxiedSolanaConnection;  // Proxied public RPC

  constructor() {
    // Real-time: Use Helius (fast, reliable, no proxy)
    this.realtimeConnection = new Connection(
      'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
      'confirmed'
    );
    
    // Background tasks: Use proxied public RPC (avoid rate limits)
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt'
    );
  }

  // Real-time monitoring (WebSocket)
  async startMonitoring(wallet: string) {
    this.realtimeConnection.onAccountChange(...); // No proxy
  }

  // Background analysis (uses proxies)
  async analyzeWallet(wallet: string) {
    return await this.proxiedConnection.withProxy(async (conn) => {
      return await conn.getSignaturesForAddress(...);
    });
  }
}
```

---

## Step 5: Test Proxy Integration

### Test Script

Create `test-proxy-integration.ts`:

```typescript
import { ProxiedSolanaConnection } from './src/backend/services/ProxiedSolanaConnection.js';
import { PublicKey } from '@solana/web3.js';

async function testProxies() {
  console.log('🧪 Testing Proxy Integration\n');

  const proxied = new ProxiedSolanaConnection(
    'https://api.mainnet-beta.solana.com',
    { commitment: 'confirmed' },
    './proxies.txt'
  );

  console.log(`Proxy Enabled: ${proxied.isProxyEnabled()}`);
  console.log(`Proxy Stats:`, proxied.getProxyStats());

  // Test 5 calls with different proxies
  const testWallet = new PublicKey('DwdrYTtTWHfnfJBiN2RH6EgPbquDQLjZTfTwpykPEq1g');

  for (let i = 0; i < 5; i++) {
    console.log(`\n[Test ${i + 1}] Making proxied request...`);
    
    try {
      const result = await proxied.withProxy(async (connection) => {
        const balance = await connection.getBalance(testWallet);
        return balance / 1e9;
      });
      
      console.log(`✅ Success! Balance: ${result.toFixed(2)} SOL`);
    } catch (error: any) {
      console.error(`❌ Failed:`, error.message);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Final Stats:`, proxied.getProxyStats());
}

testProxies();
```

Run test:
```bash
npx tsx test-proxy-integration.ts
```

**Expected Output:**
```
🧪 Testing Proxy Integration

🔐 Proxy Manager initialized: 10009 proxies loaded
🌍 First proxy: geo.iproyal.com:12321@AFq***:***
✅ Proxied Solana Connection initialized (10009 proxies)
Proxy Enabled: true
Proxy Stats: { totalProxies: 10009, currentIndex: 0, usageCount: 0, hasProxies: true }

[Test 1] Making proxied request...
🔄 Using proxy #1/10009: geo.iproyal.com:12321@AFq***:***
✅ Success! Balance: 5.23 SOL

[Test 2] Making proxied request...
🔄 Using proxy #2/10009: geo.iproyal.com:12322@BGs***:***
✅ Success! Balance: 5.23 SOL
...
```

---

## Step 6: Monitor Proxy Usage

Add proxy stats to your API:

```typescript
// src/backend/server.ts
app.get('/api/proxy-stats', (req, res) => {
  const stats = proxiedConnection.getProxyStats();
  res.json({
    enabled: proxiedConnection.isProxyEnabled(),
    ...stats,
    rotationRate: `${stats.usageCount} requests / ${stats.totalProxies} proxies`
  });
});
```

---

## Benefits

### ✅ **Avoid Rate Limits**
- Distribute requests across 10,000+ IPs
- Public Solana RPC often rate-limits aggressive callers
- Each dev history check = ~1000 requests = now spread across 1000 IPs

### ✅ **Cost Savings**
- Reduce dependency on paid Helius RPC
- Use free public RPC with proxy rotation
- Keep Helius for critical real-time operations only

### ✅ **Reliability**
- If one proxy fails, automatically rotates to next
- 10,000+ proxies = high fault tolerance
- Round-robin ensures even distribution

---

## Cost Analysis

### Without Proxies:
- Helius Free Tier: **100K requests/day**
- 1 wallet analysis = ~1000 requests
- **Limit: ~100 wallets/day**

### With Proxies:
- Public RPC: **Unlimited** (with proxy rotation)
- 10,000 proxies × 100 requests each = **1M+ requests/day**
- **No practical limit on wallet analysis**

---

## Troubleshooting

### Issue: "No proxies available"
**Solution:** Copy `proxies.txt` from Project Rocket to CEX-DEV-MONITOR root

### Issue: "Failed to create proxy agent"
**Solution:** Check proxy format in `proxies.txt` (should be `HOST:PORT@USER:PASS`)

### Issue: Slow responses
**Solution:** 
- Proxies are slower than direct connections
- Only use for background tasks, not real-time monitoring
- Keep Helius for WebSocket subscriptions

### Issue: Many failed requests
**Solution:** 
- Some proxies may be dead/slow
- The system auto-rotates to next proxy on failure
- With 10K proxies, a few failures don't matter

---

## Recommended Final Setup

```typescript
// Real-time monitoring: Helius (fast, reliable)
const realtimeConnection = new Connection(
  'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  'confirmed'
);

// Background analysis: Proxied public RPC (unlimited)
const proxiedConnection = new ProxiedSolanaConnection(
  'https://api.mainnet-beta.solana.com',
  { commitment: 'confirmed' },
  './proxies.txt'
);

// Use appropriately:
realtimeConnection.onAccountChange(...);  // Real-time
await proxiedConnection.withProxy(conn => conn.getSignatures(...));  // Background
```

---

## Next Steps

1. Install packages: `npm install http-proxy-agent https-proxy-agent cross-fetch`
2. Copy `proxies.txt` from Project Rocket
3. Update `WalletAnalyzer` and `DevWalletAnalyzer` to use proxies
4. Test with `test-proxy-integration.ts`
5. Monitor proxy usage via `/api/proxy-stats`

**Result:** Unlimited background analysis with zero rate limits! 🚀

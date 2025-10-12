import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { PublicKey } from '@solana/web3.js';
import { initDatabase } from './database/connection.js';
import { SolanaMonitor } from './services/SolanaMonitor.js';
import { PumpFunMonitor } from './services/PumpFunMonitor.js';
import { MonitoredWalletProvider } from './providers/MonitoredWalletProvider.js';
import { SourceWalletProvider } from './providers/SourceWalletProvider.js';
import { TransactionProvider } from './providers/TransactionProvider.js';
import { TokenMintProvider } from './providers/TokenMintProvider.js';
import { ConfigProvider } from './providers/ConfigProvider.js';
import { RequestStatsTracker } from './services/RequestStatsTracker.js';
import { globalRateLimiter } from './services/RateLimiter.js';
import { globalRPCServerRotator } from './services/RPCServerRotator.js';
import { globalAnalysisQueue } from './services/AnalysisQueue.js';
import { globalConcurrencyLimiter } from './services/GlobalConcurrencyLimiter.js';
import { defiActivityAnalyzer } from './services/DefiActivityAnalyzer.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// CORS configuration for production (Vercel frontend)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all Vercel preview/production domains
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    // Check explicit allowed origins
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Initialize database
await initDatabase();

// Load rate limiter configuration from database
const rateLimitMaxRequests = await ConfigProvider.get('ratelimit_max_requests_10s');
const rateLimitMaxConcurrent = await ConfigProvider.get('ratelimit_max_concurrent');
const rateLimitMinDelay = await ConfigProvider.get('ratelimit_min_delay_ms');

globalRateLimiter.updateConfig({
  maxRequestsPer10s: rateLimitMaxRequests ? parseInt(rateLimitMaxRequests) : 90,
  maxConcurrentConnections: rateLimitMaxConcurrent ? parseInt(rateLimitMaxConcurrent) : 35,
  minDelayMs: rateLimitMinDelay ? parseInt(rateLimitMinDelay) : 105
});

// Load global concurrency limiter configuration
const globalMaxConcurrent = await ConfigProvider.get('global_max_concurrent');
globalConcurrencyLimiter.setMaxConcurrent(globalMaxConcurrent ? parseInt(globalMaxConcurrent) : 20);

// IMPORTANT: Enable RPC server rotation BEFORE initializing monitors
// This allows the connections to detect it's enabled from the start
console.log('🔧 [Init] Checking for proxies...');
const testProxyManager = (await import('./services/ProxyManager.js')).ProxyManager;
const testProxy = new testProxyManager('./proxies.txt');
const hasProxies = testProxy.hasProxies();

if (hasProxies) {
  // Proxies available - disable both rate limiting and server rotation
  globalRateLimiter.disable();
  globalRPCServerRotator.disable();
  console.log('🚀 [Init] Proxies FOUND - Will use proxy rotation');
} else {
  // No proxies - enable RPC server rotation BEFORE creating connections
  globalRPCServerRotator.enable();
  globalRateLimiter.disable(); // Don't need rate limiting with server rotation
  console.log('🚀 [Init] No proxies - RPC SERVER ROTATION ENABLED');
  console.log('🔄 [Init] Rotating through 20 RPC pool servers to bypass rate limits');
  console.log('💡 [Init] This gives you ~2000 requests/10s instead of 100!');
}

// Initialize Solana monitor (connections will now detect rotation is enabled)
const solanaMonitor = new SolanaMonitor();
const pumpFunMonitor = new PumpFunMonitor();

// Load request pacing configuration from database
(async () => {
  try {
    const savedDelay = await ConfigProvider.get('request_pacing_delay_ms');
    if (savedDelay) {
      const delayMs = parseInt(savedDelay);
      solanaMonitor.getDevWalletAnalyzer().setRequestDelay(delayMs);
      pumpFunMonitor.setRequestDelay(delayMs);
      console.log(`🎛️  [Init] Request pacing loaded: ${delayMs}ms`);
    } else {
      console.log(`🎛️  [Init] Using default request pacing: 15ms`);
    }
  } catch (error) {
    console.error('⚠️  [Init] Error loading request pacing config:', error);
  }
})();

// Cleanup: Remove CEX wallet from monitored_wallets if it exists (it should only be a source)
(async () => {
  try {
    const cexWallet = await ConfigProvider.get('cex_wallet');
    if (cexWallet) {
      const existing = await MonitoredWalletProvider.findByAddress(cexWallet);
      if (existing) {
        console.log('🧹 [Cleanup] Removing CEX wallet from monitored_wallets table...');
        await MonitoredWalletProvider.delete(cexWallet);
        console.log('✅ [Cleanup] CEX wallet removed - it should only be a transaction source');
      }
    }
  } catch (error) {
    console.error('⚠️  [Cleanup] Error removing CEX wallet:', error);
  }
})();

console.log('✅ [Init] Services initialized - Use Settings panel to start monitoring');

// WebSocket clients
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket client connected');
  clients.add(ws);

  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });

  // Send initial data
  ws.send(JSON.stringify({
    type: 'connected',
    data: {
      message: 'Connected to CEX Monitor',
      timestamp: Date.now()
    }
  }));
});

// Broadcast to all clients
function broadcast(type: string, data: any) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Set up event listeners
solanaMonitor.on('transaction', (data) => {
  broadcast('transaction', data);
});

solanaMonitor.on('new_wallet', (data) => {
  broadcast('new_wallet', data);
  // Automatically start monitoring new wallet for pump.fun
  pumpFunMonitor.startMonitoringWallet(data.address);
});

solanaMonitor.on('wallet_analyzed', (data) => {
  // Broadcast analysis results to frontend
  broadcast('wallet_analyzed', data);
});

pumpFunMonitor.on('token_mint', (data) => {
  broadcast('token_mint', data);
});

solanaMonitor.on('dev_wallet_found', (data) => {
  broadcast('dev_wallet_found', data);
  console.log(`🔥 DEV WALLET DISCOVERED: ${data.address.slice(0, 8)}... (${data.tokensDeployed} tokens)`);
});

// API Routes

// Get config
app.get('/api/config', async (_req, res) => {
  const config = await ConfigProvider.getAll();
  res.json(config);
});

// Update config
app.post('/api/config', async (req, res) => {
  const { key, value } = req.body;
  await ConfigProvider.set(key, value);
  
  if (key === 'threshold_sol') {
    solanaMonitor.updateThreshold(parseFloat(value));
  } else if (key === 'max_threshold_sol') {
    solanaMonitor.updateMaxThreshold(parseFloat(value));
  }
  
  res.json({ success: true });
});

// Start monitoring CEX wallet
app.post('/api/monitor/start', async (_req, res) => {
  try {
    const cexWallet = await ConfigProvider.get('cex_wallet');
    if (!cexWallet) {
      return res.status(400).json({ error: 'CEX wallet not configured' });
    }

    // Resume analysis queue
    globalAnalysisQueue.resume();
    
    await solanaMonitor.startMonitoring(cexWallet);
    res.json({ success: true, wallet: cexWallet });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop monitoring
app.post('/api/monitor/stop', async (_req, res) => {
  try {
    const cexWallet = await ConfigProvider.get('cex_wallet');
    if (!cexWallet) {
      return res.status(400).json({ error: 'CEX wallet not configured' });
    }

    // Stop and clear analysis queue
    globalAnalysisQueue.stop();
    
    await solanaMonitor.stopMonitoring(cexWallet);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get monitored wallets
app.get('/api/wallets', async (_req, res) => {
  const wallets = await MonitoredWalletProvider.findAll();
  res.json(wallets);
});

// Get active wallets
app.get('/api/wallets/active', async (_req, res) => {
  const wallets = await MonitoredWalletProvider.findActive();
  res.json(wallets);
});

// Get fresh wallets
app.get('/api/wallets/fresh', async (_req, res) => {
  const wallets = await MonitoredWalletProvider.findFreshWallets();
  res.json(wallets);
});

// Get dev wallets (NEW!)
app.get('/api/wallets/devs', async (_req, res) => {
  const wallets = await MonitoredWalletProvider.findDevWallets();
  res.json(wallets);
});

// Add test dev wallet for manual analysis
app.post('/api/wallets/test-dev', async (req, res) => {
  const { address, name, limit } = req.body;
  
  if (!address) {
    return res.status(400).json({ error: 'Wallet address is required' });
  }

  try {
    console.log(`🧪 [Test] Adding test dev wallet: ${address} (limit: ${limit || 1000})`);
    
    // Fetch wallet info from blockchain first
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const proxiedConnection = walletAnalyzer.getProxiedConnection();
    
    // Fetch transaction count and age
    const pubkey = new PublicKey(address);
    const signatures = await proxiedConnection.withProxy(conn => 
      conn.getSignaturesForAddress(pubkey, { limit: 10 })
    );
    
    const txCount = signatures.length;
    const firstTxTime = signatures.length > 0 ? (signatures[signatures.length - 1].blockTime || 0) * 1000 : Date.now();
    const walletAgeDays = (Date.now() - firstTxTime) / (1000 * 60 * 60 * 24);
    const isFresh = txCount < 10 && walletAgeDays < 7;
    
    // Check if wallet already exists
    let wallet = await MonitoredWalletProvider.findByAddress(address);
    
    if (!wallet) {
      // Create new wallet entry with fetched data
      await MonitoredWalletProvider.create({
        address,
        source: name || 'manual_test',
        first_seen: Date.now(),
        is_active: 1,
        is_fresh: isFresh ? 1 : 0,
        previous_tx_count: txCount,
        wallet_age_days: walletAgeDays,
        is_dev_wallet: 0,
        tokens_deployed: 0,
        dev_checked: 0
      });
      
      wallet = await MonitoredWalletProvider.findByAddress(address);
    }
    
    // Trigger dev wallet analysis with custom limit
    console.log(`🔬 [Test] Starting dev analysis for ${address}...`);
    const devAnalyzer = solanaMonitor.getDevWalletAnalyzer();
    const devAnalysis = await devAnalyzer.analyzeDevHistory(address, limit || 1000);
    
    // Update wallet with results
    await MonitoredWalletProvider.update(address, {
      is_dev_wallet: devAnalysis.isDevWallet ? 1 : 0,
      tokens_deployed: devAnalysis.tokensDeployed,
      dev_checked: 1
    });
    
    // Save tokens if dev wallet
    if (devAnalysis.isDevWallet && devAnalysis.deployments.length > 0) {
      for (const deployment of devAnalysis.deployments) {
        const existing = await TokenMintProvider.findByMintAddress(deployment.mintAddress);
        if (!existing) {
          await TokenMintProvider.create({
            mint_address: deployment.mintAddress,
            creator_address: address,
            timestamp: deployment.timestamp,
            platform: 'pumpfun',
            signature: deployment.signature
          });
        }
      }
    }
    
    const finalWallet = await MonitoredWalletProvider.findByAddress(address);
    
    console.log(`✅ [Test] Analysis complete for ${address}`);
    console.log(`   - Is Dev Wallet: ${devAnalysis.isDevWallet}`);
    console.log(`   - Tokens Deployed: ${devAnalysis.tokensDeployed}`);
    console.log(`   - Wallet Age: ${finalWallet?.wallet_age_days?.toFixed(1)} days`);
    console.log(`   - Total TXs: ${finalWallet?.previous_tx_count || 0}`);
    
    res.json({
      success: true,
      wallet: finalWallet,
      analysis: {
        isDevWallet: devAnalysis.isDevWallet,
        tokensDeployed: devAnalysis.tokensDeployed,
        deployments: devAnalysis.deployments
      }
    });
  } catch (error: any) {
    console.error('❌ [Test] Error analyzing test dev wallet:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Unknown error during analysis' 
    });
  }
});

// Analyze wallet's DeFi activities
app.get('/api/wallets/:address/defi-activities', async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit as string) || 1000;
  
  try {
    console.log(`📊 [API] Analyzing DeFi activities for ${address}...`);
    const proxiedConnection = solanaMonitor.getWalletAnalyzer().getProxiedConnection();
    
    // Execute the analysis through the proxied connection
    const profile = await proxiedConnection.withProxy(async (connection) => {
      return await defiActivityAnalyzer.analyzeWallet(connection, address, limit);
    });
    
    res.json({
      success: true,
      profile
    });
  } catch (error: any) {
    console.error('Error analyzing DeFi activities:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle wallet monitoring
app.post('/api/wallets/:address/toggle', async (req, res) => {
  const { address } = req.params;
  const wallet = await MonitoredWalletProvider.findByAddress(address);
  
  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  const newState = wallet.is_active ? 0 : 1;
  await MonitoredWalletProvider.setActive(address, newState === 1);

  if (newState === 1) {
    pumpFunMonitor.startMonitoringWallet(address);
  } else {
    pumpFunMonitor.stopMonitoringWallet(address);
  }

  res.json({ success: true, is_active: newState });
});

// ============================================
// Source Wallet Endpoints (CEX wallets, etc.)
// ============================================

// Get all source wallets with stats
app.get('/api/source-wallets', async (_req, res) => {
  try {
    const wallets = await SourceWalletProvider.getAllStats();
    res.json(wallets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get active source wallets (being monitored)
app.get('/api/source-wallets/active', async (_req, res) => {
  try {
    const wallets = await SourceWalletProvider.findActive();
    res.json(wallets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific source wallet with stats
app.get('/api/source-wallets/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const wallet = await SourceWalletProvider.getStats(address);
    
    if (!wallet) {
      return res.status(404).json({ error: 'Source wallet not found' });
    }
    
    res.json(wallet);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new source wallet
app.post('/api/source-wallets', async (req, res) => {
  try {
    const { address, name, purpose, is_monitoring, notes } = req.body;
    
    if (!address || !name) {
      return res.status(400).json({ error: 'Address and name are required' });
    }
    
    const id = await SourceWalletProvider.create({
      address,
      name,
      purpose: purpose || 'funding',
      is_monitoring: is_monitoring ?? 1,
      added_at: Date.now(),
      notes: notes || null
    });
    
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update source wallet
app.patch('/api/source-wallets/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const updates = req.body;
    
    await SourceWalletProvider.update(address, updates);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle source wallet monitoring
app.post('/api/source-wallets/:address/toggle', async (req, res) => {
  try {
    const { address } = req.params;
    const wallet = await SourceWalletProvider.findByAddress(address);
    
    if (!wallet) {
      return res.status(404).json({ error: 'Source wallet not found' });
    }
    
    const newState = wallet.is_monitoring === 1 ? 0 : 1;
    await SourceWalletProvider.toggleMonitoring(address, newState === 1);
    
    // Start or stop monitoring this source wallet
    if (newState === 1) {
      await solanaMonitor.startMonitoring(address);
      console.log(`✅ Started monitoring source wallet: ${wallet.name}`);
    } else {
      await solanaMonitor.stopMonitoring(address);
      console.log(`⏸️  Stopped monitoring source wallet: ${wallet.name}`);
    }
    
    res.json({ success: true, is_monitoring: newState === 1 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete source wallet
app.delete('/api/source-wallets/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Stop monitoring first if active
    const wallet = await SourceWalletProvider.findByAddress(address);
    if (wallet && wallet.is_monitoring === 1) {
      await solanaMonitor.stopMonitoring(address);
    }
    
    await SourceWalletProvider.delete(address);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get transactions
app.get('/api/transactions', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const transactions = await TransactionProvider.findRecent(limit);
  res.json(transactions);
});

// Get transactions for specific wallet
app.get('/api/transactions/:address', async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;
  const transactions = await TransactionProvider.findByFromAddress(address, limit);
  res.json(transactions);
});

// Get token mints
app.get('/api/tokens', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const tokens = await TokenMintProvider.findRecent(limit);
  res.json(tokens);
});

// Get token mints by creator
app.get('/api/tokens/creator/:address', async (req, res) => {
  const { address } = req.params;
  const tokens = await TokenMintProvider.findByCreator(address);
  res.json(tokens);
});

// Get statistics
app.get('/api/stats', async (_req, res) => {
  const wallets = await MonitoredWalletProvider.findAll();
  const activeWallets = await MonitoredWalletProvider.findActive();
  const freshWallets = await MonitoredWalletProvider.findFreshWallets();
  const devWallets = await MonitoredWalletProvider.findDevWallets();
  const recentTransactions = await TransactionProvider.findRecent(100);
  const recentTokens = await TokenMintProvider.findRecent(100);

  const now = Date.now();
  const last24h = now - (24 * 60 * 60 * 1000);

  const stats = {
    total_wallets: wallets.length,
    active_wallets: activeWallets.length,
    fresh_wallets: freshWallets.length,
    dev_wallets: devWallets.length,
    total_transactions: recentTransactions.length,
    transactions_24h: recentTransactions.filter(tx => tx.timestamp >= last24h).length,
    total_tokens: recentTokens.length,
    tokens_24h: recentTokens.filter(token => token.timestamp >= last24h).length,
    monitoring_status: solanaMonitor.getActiveSubscriptions().length > 0 ? 'active' : 'stopped',
    cex_wallet: await ConfigProvider.get('cex_wallet'),
    pump_fun_monitored: pumpFunMonitor.getActiveMonitors().length
  };

  res.json(stats);
});

// Debug: Check actual database contents
app.get('/api/debug/db', async (_req, res) => {
  try {
    const wallets = await MonitoredWalletProvider.findAll();
    const transactions = await TransactionProvider.findAll();
    const tokens = await TokenMintProvider.findAll();
    
    res.json({
      wallets: { count: wallets.length, sample: wallets.slice(0, 3) },
      transactions: { count: transactions.length, sample: transactions.slice(0, 3) },
      tokens: { count: tokens.length, sample: tokens.slice(0, 3) }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    monitors: {
      solana: solanaMonitor.getActiveSubscriptions(),
      pumpfun: pumpFunMonitor.getActiveMonitors()
    }
  });
});

// Monitoring control endpoints
app.post('/api/monitoring/start', async (_req, res) => {
  try {
    const cexWallet = await ConfigProvider.get('cex_wallet');
    if (!cexWallet) {
      return res.status(400).json({ error: 'CEX wallet not configured' });
    }
    
    // Resume queue to allow processing
    globalAnalysisQueue.resume();
    console.log('▶️  Analysis queue resumed');
    
    await solanaMonitor.startMonitoring(cexWallet);
    
    // Start monitoring ONLY fresh wallets and dev wallets
    const freshWallets = await MonitoredWalletProvider.findFreshWallets();
    const devWallets = await MonitoredWalletProvider.findDevWallets();
    
    const walletsToMonitor = [...freshWallets, ...devWallets];
    console.log(`🎯 Starting selective monitoring: ${walletsToMonitor.length} wallets (${freshWallets.length} fresh + ${devWallets.length} dev)`);
    
    walletsToMonitor.forEach((wallet, index) => {
      setTimeout(() => {
        pumpFunMonitor.startMonitoringWallet(wallet.address);
      }, index * 1000); // Stagger starts
    });
    
    res.json({ 
      success: true, 
      message: 'Monitoring started',
      walletsMonitored: walletsToMonitor.length,
      breakdown: {
        fresh: freshWallets.length,
        dev: devWallets.length
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/monitoring/stop', async (_req, res) => {
  try {
    // Stop queue FIRST to prevent new analyses
    globalAnalysisQueue.stop();
    console.log('🛑 Analysis queue stopped');
    
    // Then stop monitors
    solanaMonitor.stopAll();
    pumpFunMonitor.stopAll();
    console.log('🛑 All monitoring stopped');
    
    res.json({ 
      success: true, 
      message: 'Monitoring and analysis queue stopped' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/monitoring/status', (_req, res) => {
  res.json({
    cexMonitor: {
      active: solanaMonitor.getActiveSubscriptions().length > 0,
      subscriptions: solanaMonitor.getActiveSubscriptions()
    },
    pumpFunMonitor: {
      active: pumpFunMonitor.getActiveMonitors().length > 0,
      monitored: pumpFunMonitor.getActiveMonitors().length
    }
  });
});

// Proxy control endpoints
app.get('/api/proxy/status', (_req, res) => {
  const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
  const devAnalyzer = solanaMonitor.getDevWalletAnalyzer();
  const pumpFunConn = pumpFunMonitor.getProxiedConnection();

  res.json({
    enabled: pumpFunConn.isProxyEnabled(),
    services: {
      walletAnalyzer: walletAnalyzer.getProxiedConnection().isProxyEnabled(),
      devAnalyzer: devAnalyzer.getProxiedConnection().isProxyEnabled(),
      pumpFunMonitor: pumpFunConn.isProxyEnabled()
    },
    stats: pumpFunConn.getProxyStats()
  });
});

app.post('/api/proxy/toggle', (_req, res) => {
  try {
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const devAnalyzer = solanaMonitor.getDevWalletAnalyzer();
    const pumpFunConn = pumpFunMonitor.getProxiedConnection();

    // Toggle all proxy connections (automatically manages server rotation)
    const walletEnabled = walletAnalyzer.getProxiedConnection().toggleProxies();
    devAnalyzer.getProxiedConnection().toggleProxies();
    pumpFunConn.toggleProxies();

    res.json({
      success: true,
      enabled: walletEnabled,
      message: walletEnabled 
        ? 'Proxies ENABLED - Server rotation disabled' 
        : 'Proxies DISABLED - Server rotation enabled (20 servers)'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxy/enable', (_req, res) => {
  try {
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const devAnalyzer = solanaMonitor.getDevWalletAnalyzer();
    const pumpFunConn = pumpFunMonitor.getProxiedConnection();

    // Enable proxies (automatically disables server rotation)
    walletAnalyzer.getProxiedConnection().enableProxies();
    devAnalyzer.getProxiedConnection().enableProxies();
    pumpFunConn.enableProxies();

    res.json({
      success: true,
      enabled: true,
      message: 'Proxies ENABLED - Server rotation disabled'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxy/disable', (_req, res) => {
  try {
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const devAnalyzer = solanaMonitor.getDevWalletAnalyzer();
    const pumpFunConn = pumpFunMonitor.getProxiedConnection();

    // Disable proxies (automatically enables server rotation)
    walletAnalyzer.getProxiedConnection().disableProxies();
    devAnalyzer.getProxiedConnection().disableProxies();
    pumpFunConn.disableProxies();

    res.json({
      success: true,
      enabled: false,
      message: 'Proxies DISABLED - Server rotation enabled (20 servers)'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Request statistics endpoints
app.get('/api/stats/requests', (_req, res) => {
  const statsTracker = RequestStatsTracker.getInstance();
  res.json(statsTracker.getStats());
});

app.get('/api/stats/requests/timeseries', (req, res) => {
  const statsTracker = RequestStatsTracker.getInstance();
  const minutes = parseInt(req.query.minutes as string) || 10;
  res.json(statsTracker.getTimeSeriesData(minutes));
});

app.post('/api/stats/requests/reset', (_req, res) => {
  const statsTracker = RequestStatsTracker.getInstance();
  statsTracker.reset();
  res.json({ success: true, message: 'Request statistics reset' });
});

// Rate limiter stats
app.get('/api/ratelimiter/stats', (_req, res) => {
  res.json(globalRateLimiter.getStats());
});

// Reset dev wallet flags (cleanup false positives from old buggy logic)
app.post('/api/dev/reset', async (_req, res) => {
  try {
    const db = await import('./database/connection.js').then(m => m.getDb());
    db.exec('UPDATE monitored_wallets SET is_dev = 0, dev_tokens_count = 0');
    
    res.json({
      success: true,
      message: 'All dev flags reset. Wallets will be re-analyzed on next check.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get rate limiter configuration
app.get('/api/ratelimiter/config', (_req, res) => {
  res.json(globalRateLimiter.getConfig());
});

// Update rate limiter configuration
app.post('/api/ratelimiter/config', async (req, res) => {
  try {
    const { maxRequestsPer10s, maxConcurrentConnections, minDelayMs } = req.body;
    
    // Update in memory
    globalRateLimiter.updateConfig({
      maxRequestsPer10s,
      maxConcurrentConnections,
      minDelayMs
    });
    
    // Save to database
    if (maxRequestsPer10s !== undefined) {
      await ConfigProvider.set('ratelimit_max_requests_10s', maxRequestsPer10s.toString());
    }
    if (maxConcurrentConnections !== undefined) {
      await ConfigProvider.set('ratelimit_max_concurrent', maxConcurrentConnections.toString());
    }
    if (minDelayMs !== undefined) {
      await ConfigProvider.set('ratelimit_min_delay_ms', minDelayMs.toString());
    }
    
    res.json({ 
      success: true, 
      config: globalRateLimiter.getConfig(),
      message: 'Rate limiter configuration updated'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Analysis Queue status endpoint
app.get('/api/analysis-queue/status', (_req, res) => {
  res.json(globalAnalysisQueue.getStatus());
});

// Global Concurrency Limiter endpoints
app.get('/api/concurrency/config', (_req, res) => {
  res.json(globalConcurrencyLimiter.getConfig());
});

app.post('/api/concurrency/config', async (req, res) => {
  try {
    const { maxConcurrent } = req.body;
    
    // Update in memory
    globalConcurrencyLimiter.setMaxConcurrent(maxConcurrent);
    
    // Save to database
    await ConfigProvider.set('global_max_concurrent', maxConcurrent.toString());
    
    res.json({ 
      success: true, 
      config: globalConcurrencyLimiter.getConfig(),
      message: 'Global concurrency limit updated'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/concurrency/stats', (_req, res) => {
  res.json(globalConcurrencyLimiter.getStats());
});

// Request Pacing configuration endpoints
app.get('/api/request-pacing/config', async (_req, res) => {
  try {
    const requestDelay = await ConfigProvider.get('request_pacing_delay_ms');
    res.json({
      requestDelayMs: requestDelay ? parseInt(requestDelay) : 15
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/request-pacing/config', async (req, res) => {
  try {
    const { requestDelayMs } = req.body;
    
    if (requestDelayMs !== undefined) {
      // Update in database
      await ConfigProvider.set('request_pacing_delay_ms', requestDelayMs.toString());
      
      // Update in all services
      const devAnalyzer = solanaMonitor.getDevWalletAnalyzer();
      devAnalyzer.setRequestDelay(requestDelayMs);
      pumpFunMonitor.setRequestDelay(requestDelayMs);
      
      res.json({
        success: true,
        requestDelayMs,
        message: `Request pacing updated to ${requestDelayMs}ms`
      });
    } else {
      res.status(400).json({ error: 'requestDelayMs is required' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// RPC Server Rotation endpoints
app.get('/api/rpc-rotation/stats', (_req, res) => {
  res.json(globalRPCServerRotator.getStats());
});

app.post('/api/rpc-rotation/enable', (_req, res) => {
  try {
    globalRPCServerRotator.enable();
    globalRateLimiter.disable(); // Disable rate limiting with server rotation
    res.json({
      success: true,
      enabled: true,
      message: 'RPC server rotation ENABLED - bypassing rate limits'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rpc-rotation/disable', (_req, res) => {
  try {
    globalRPCServerRotator.disable();
    
    // Check if we need to enable rate limiting
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const proxiesEnabled = walletAnalyzer.getProxiedConnection().isProxyEnabled();
    
    if (!proxiesEnabled) {
      globalRateLimiter.enable(); // Enable rate limiting if no proxies
    }
    
    res.json({
      success: true,
      enabled: false,
      message: 'RPC server rotation DISABLED'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rpc-rotation/toggle', (_req, res) => {
  try {
    const currentlyEnabled = globalRPCServerRotator.isEnabled();
    
    if (currentlyEnabled) {
      globalRPCServerRotator.disable();
      
      // Check if we need to enable rate limiting
      const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
      const proxiesEnabled = walletAnalyzer.getProxiedConnection().isProxyEnabled();
      
      if (!proxiesEnabled) {
        globalRateLimiter.enable();
      }
    } else {
      globalRPCServerRotator.enable();
      globalRateLimiter.disable();
    }
    
    res.json({
      success: true,
      enabled: !currentlyEnabled,
      message: !currentlyEnabled ? 'RPC server rotation ENABLED' : 'RPC server rotation DISABLED'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Database wipe endpoint
app.post('/api/database/wipe', async (req, res) => {
  try {
    const { confirmation } = req.body;
    
    if (confirmation !== 'WIPE_DATABASE') {
      return res.status(400).json({ error: 'Invalid confirmation code' });
    }
    
    // Stop all monitoring first
    globalAnalysisQueue.stop();
    solanaMonitor.stopAll();
    pumpFunMonitor.stopAll();
    
    // Wipe all data tables (keep config)
    await TransactionProvider.deleteAll();
    await MonitoredWalletProvider.deleteAll();
    await TokenMintProvider.deleteAll();
    
    console.log('🗑️  Database wiped successfully');
    
    res.json({ 
      success: true, 
      message: 'Database wiped successfully. All wallets, transactions, and tokens have been deleted.' 
    });
  } catch (error: any) {
    console.error('Error wiping database:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get individual dev wallet details with full history
app.get('/api/wallets/dev/:address', async (req, res) => {
  const { address } = req.params;
  
  const wallet = await MonitoredWalletProvider.findByAddress(address);
  if (!wallet || !wallet.is_dev_wallet) {
    return res.status(404).json({ error: 'Dev wallet not found' });
  }
  
  // Get all tokens deployed by this wallet
  const tokens = await TokenMintProvider.findByCreator(address);
  
  // Calculate aggregate stats
  const totalTokens = tokens.length;
  const totalCurrentMcap = tokens.reduce((sum, t) => sum + (t.current_mcap || 0), 0);
  const totalATHMcap = tokens.reduce((sum, t) => sum + (t.ath_mcap || 0), 0);
  const avgCurrentMcap = totalTokens > 0 ? totalCurrentMcap / totalTokens : 0;
  const avgATHMcap = totalTokens > 0 ? totalATHMcap / totalTokens : 0;
  
  res.json({
    wallet,
    tokens,
    stats: {
      totalTokens,
      totalCurrentMcap,
      totalATHMcap,
      avgCurrentMcap,
      avgATHMcap,
      successRate: tokens.filter(t => (t.current_mcap || 0) > (t.starting_mcap || 0)).length / totalTokens * 100
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket available at ws://localhost:${PORT}/ws`);
  
  // DISABLED auto-start - use manual controls
  console.log(`⏸️  Auto-start DISABLED - Use /api/monitoring/start to begin`);
  console.log(`   This preserves your proxy data!`);
});

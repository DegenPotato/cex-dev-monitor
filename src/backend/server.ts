import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, getDb, saveDatabase } from './database/connection.js';
import { queryAll, queryOne, execute } from './database/helpers.js';
import { PublicKey, Connection } from '@solana/web3.js';
import fetch from 'cross-fetch';
import { SolanaMonitor } from './services/SolanaMonitor.js';
import { PumpFunMonitor } from './services/PumpFunMonitor.js';
import { TradingActivityMonitor } from './services/TradingActivityMonitor.js';
import { MonitoredWalletProvider } from './providers/MonitoredWalletProvider.js';
import { SourceWalletProvider } from './providers/SourceWalletProvider.js';
import { TransactionProvider } from './providers/TransactionProvider.js';
import { TokenMintProvider } from './providers/TokenMintProvider.js';
import { TokenPoolProvider } from './providers/TokenPoolProvider.js';
import { ConfigProvider } from './providers/ConfigProvider.js';
import { RequestStatsTracker } from './services/RequestStatsTracker.js';
import { globalRateLimiter } from './services/RateLimiter.js';
import { globalRPCServerRotator } from './services/RPCServerRotator.js';
import { globalAnalysisQueue } from './services/AnalysisQueue.js';
import { globalConcurrencyLimiter } from './services/GlobalConcurrencyLimiter.js';
import { defiActivityAnalyzer } from './services/DefiActivityAnalyzer.js';
import { activityBasedOHLCVCollector } from './services/ActivityBasedOHLCVCollector.js';
import { OHLCVMetricsCalculator } from './services/OHLCVMetricsCalculator.js';
import { TechnicalIndicatorCalculator } from './services/TechnicalIndicatorCalculator.js';
import { solPriceOracle } from './services/SolPriceOracle.js';
import { apiProviderTracker } from './services/ApiProviderTracker.js';
import { ohlcvAggregator } from './services/OHLCVAggregator.js';
import { telegramEntityCache } from './services/TelegramEntityCache.js';
import { realtimeOHLCVService } from './services/RealtimeOHLCVService.js';
import { getTradingWebSocketService } from './services/TradingWebSocketService.js';
import { TokenPriceOracle } from './services/TokenPriceOracle.js';
import { geckoNetworksSyncService } from './services/GeckoNetworksSyncService.js';
import { tokenRegistrySync } from './services/TokenRegistrySync.js';

const tokenPriceOracle = TokenPriceOracle.getInstance();
import databaseRoutes from './routes/database.js';
import authRoutes from './routes/auth/index.js';
import youtubeRoutes from './routes/youtube.js';
import youtubeAudioRoutes from './routes/youtube-audio.js';
import { createTelegramRoutes } from './routes/telegram.js';
import userDataRoutes from './routes/user-data.js';
import tradingRoutes from './routes/trading.js';
import forwardingDestinationRoutes from './routes/telegram-forwarding-destinations.js';
import forwardingRulesRoutes from './routes/telegram-forwarding.js';
// import tokenMetadataRoutes from './routes/token-metadata.js'; // TODO: Create this file
// import configRoutes from './routes/config.js'; // TODO: Create this file
import ohlcvRoutes from './routes/ohlcv.js';
import SecureAuthService from '../lib/auth/SecureAuthService.js';
import AuthMaintenanceService from './services/AuthMaintenanceService.js';
import { telegramClientService } from './services/TelegramClientService.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/ws'
});

// Initialize Socket.IO for Trading WebSocket
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Same CORS rules as Express
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Initialize Trading WebSocket Service
const tradingWebSocketService = getTradingWebSocketService();
tradingWebSocketService.initialize(io);
console.log('✅ Trading WebSocket service initialized on /trading namespace');

// Start price oracles for trading features
solPriceOracle.start().then(async () => {
  console.log('💰 SOL Price Oracle started for Trading Bot');
  
  // Start token price oracle with current SOL price
  const solPrice = solPriceOracle.getPrice();
  await tokenPriceOracle.start(solPrice);
  console.log('🪙 Token Price Oracle started for Trading Bot');
  
  // Start token registry sync service
  await tokenRegistrySync.start();
  console.log('🔄 Token Registry Sync started');
}).catch(err => {
  console.error('Failed to start price oracles:', err);
});

// Start GeckoTerminal networks/DEXes sync service
geckoNetworksSyncService.start().then(() => {
  console.log('🌐 GeckoTerminal Networks & DEXes sync service started');
}).catch(err => {
  console.error('Failed to start GeckoNetworks sync service:', err);
});

// Start Telegram Redis Stream Consumer (if enabled)
if (process.env.ENABLE_TELEGRAM_STREAM === 'true') {
  import('./services/TelegramStreamConsumer.js').then(({ telegramStreamConsumer }) => {
    telegramStreamConsumer.setWebSocketServer(wss);
    telegramStreamConsumer.startConsuming();
    console.log('✅ Telegram stream consumer started');
  }).catch(err => {
    console.error('Failed to start Telegram stream consumer:', err);
  });
}

// CORS configuration - allow specific origins for cookie-based auth
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://alpha.sniff.agency',
      'https://cex-dev-monitor.vercel.app',
      'https://sniff.agency'
    ];

console.log('🔒 [CORS] Allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Check exact match in allowed origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    }
    // Allow all Vercel preview deployments (*.vercel.app)
    else if (origin.endsWith('.vercel.app')) {
      callback(null, true);
    }
    else {
      console.warn(`⚠️ [CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Enable cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Content-Length', 'Set-Cookie']
}));

app.use(express.json());
app.use(cookieParser());

// Serve static files from public directory (for HDRI, audio, etc.)
const publicAssetsPath = path.join(__dirname, '../../public/assets');

// Add logging middleware for asset requests
app.use((req, _res, next) => {
  if (req.path.includes('.hdr') || req.path.includes('/hdri/')) {
    console.log(`📁 [Assets] Request: ${req.method} ${req.url}`);
    console.log(`📁 [Assets] Full path will be: ${publicAssetsPath}${req.url}`);
  }
  next();
});

// Initialize database FIRST
await initDatabase();

// Register API routes BEFORE static files
app.use('/api/auth', authRoutes); // Auth routes are public (login, verify, etc.)
// Mount YouTube routes with OPTIONS handling
app.use('/api/youtube', (req, res, next) => {
  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }
  next();
}, youtubeRoutes); // YouTube integration (requires auth)
app.use('/api/youtube-audio', youtubeAudioRoutes); // YouTube audio proxy (bypasses CORS)
app.use('/api/database', databaseRoutes);

// Register Telegram routes
const telegramRoutes = createTelegramRoutes();
app.use('/api/telegram', telegramRoutes);

// Register Telegram forwarding routes
import telegramForwardingRoutes from './routes/telegram-forwarding.js';
app.use('/api/telegram/forwarding', telegramForwardingRoutes);

// Register Telegram forward destinations routes
import telegramForwardDestinationRoutes from './routes/telegram-forwarding-destinations.js';
app.use('/api/telegram/forward-destinations', telegramForwardDestinationRoutes);

// Register Telegram metadata routes
import telegramMetadataRoutes from './routes/telegram-metadata.js';
app.use('/api/telegram', telegramMetadataRoutes);

// Register Telegram intelligence routes
import telegramIntelligenceRoutes from './routes/telegram-intelligence.js';
app.use('/', telegramIntelligenceRoutes);

// Register trading routes (already imported above)
app.use('/', tradingRoutes);

// Register OHLCV routes
app.use('/', ohlcvRoutes);

// Register indicators routes
import indicatorsRoutes from './routes/indicators.js';
app.use('/', indicatorsRoutes);

// Register real-time OHLCV routes
import realtimeOHLCVRoutes from './routes/realtime-ohlcv.js';
app.use('/', realtimeOHLCVRoutes);

// Register forwarding routes
app.use('/', forwardingDestinationRoutes);
app.use('/', forwardingRulesRoutes);

// Register token analytics routes
import tokenAnalyticsRoutes from './routes/tokenAnalytics.js';
app.use('/', tokenAnalyticsRoutes);

// Register token routes
import tokenRoutes from './routes/tokens.js';
app.use('/api/tokens', tokenRoutes);

// Register token registry routes
import tokenRegistryRoutes from './routes/tokenRegistry.js';
app.use('/api/token-registry', tokenRegistryRoutes);

// Register user data management routes (GDPR compliance)
app.use(userDataRoutes);

// Initialize metrics service (loaded dynamically in endpoints)
import('./services/MetricsService.js').then(() => {
  console.log('📊 Metrics service initialized');
}).catch(err => console.error('Failed to load metrics service:', err));

// Comprehensive metrics endpoint
app.get('/api/metrics', (_req, res) => {
  import('./services/MetricsService.js').then(({ metricsService }) => {
    res.json(metricsService.getMetrics());
  }).catch(() => {
    res.status(500).json({ error: 'Metrics service not available' });
  });
});

// Metrics history endpoint
app.get('/api/metrics/history', (_req, res) => {
  import('./services/MetricsService.js').then(({ metricsService }) => {
    res.json(metricsService.getHistory());
  }).catch(() => {
    res.status(500).json({ error: 'Metrics service not available' });
  });
});

// Prometheus metrics endpoint
app.get('/metrics', (_req, res) => {
  import('./services/MetricsService.js').then(({ metricsService }) => {
    res.set('Content-Type', 'text/plain');
    res.send(metricsService.getPrometheusMetrics());
  }).catch(() => {
    res.status(500).send('# Metrics service not available');
  });
});

// Metrics endpoint for Telegram stream (legacy, kept for compatibility)
app.get('/api/metrics/telegram-stream', (_req, res) => {
  if (process.env.ENABLE_TELEGRAM_STREAM === 'true') {
    import('./services/TelegramStreamConsumer.js').then(({ telegramStreamConsumer }) => {
      res.json(telegramStreamConsumer.getMetrics());
    }).catch(() => {
      res.status(500).json({ error: 'Stream consumer not available' });
    });
  } else {
    res.status(404).json({ error: 'Telegram stream disabled' });
  }
});

// Health check endpoint with detailed status
app.get('/api/health', (_req, res) => {
  import('./services/MetricsService.js').then(({ metricsService }) => {
    const metrics = metricsService.getMetrics();
    const status = metrics.health.overall === 'healthy' ? 200 : 
                  metrics.health.overall === 'degraded' ? 206 : 503;
    res.status(status).json({
      status: metrics.health.overall,
      services: metrics.health.services,
      alerts: metrics.health.alerts.slice(-10),
      uptime: metrics.system.uptime,
      timestamp: metrics.timestamp
    });
  }).catch(() => {
    res.status(503).json({ status: 'unhealthy', error: 'Metrics service not available' });
  });
});

// Create auth service for protecting specific routes
const authService = new SecureAuthService();

// Serve static files AFTER API routes (so /api/* takes priority)
app.use('/assets', express.static(publicAssetsPath, {
  setHeaders: (res, filepath) => {
    console.log(`📁 [Assets] Serving file: ${filepath}`);
    if (filepath.endsWith('.hdr')) {
      res.setHeader('Content-Type', 'application/octet-stream');
      console.log(`📁 [Assets] Set Content-Type to octet-stream for HDR`);
    }
  }
}));

// Serve HDR files from /hdri path (for assets.sniff.agency/hdri/nebula.hdr)
const hdriPath = path.join(__dirname, '../../public/assets/hdri');
app.use('/hdri', express.static(hdriPath, {
  setHeaders: (res, filepath) => {
    console.log(`📁 [HDRI] Serving file: ${filepath}`);
    if (filepath.endsWith('.hdr')) {
      res.setHeader('Content-Type', 'application/octet-stream');
      console.log(`📁 [HDRI] Set Content-Type to octet-stream for HDR`);
    }
  }
}));

console.log('📁 [Server] Serving static files from /assets and root');
console.log('📁 [Server] Public assets path:', publicAssetsPath);

// Load separate concurrency configs for Proxy and RPC rotation
const proxyMaxConcurrent = await ConfigProvider.get('proxy_max_concurrent');
const rpcMaxConcurrent = await ConfigProvider.get('rpc_max_concurrent');
globalConcurrencyLimiter.setProxyMaxConcurrent(proxyMaxConcurrent ? parseInt(proxyMaxConcurrent) : 20);
globalConcurrencyLimiter.setRPCMaxConcurrent(rpcMaxConcurrent ? parseInt(rpcMaxConcurrent) : 2);

// IMPORTANT: Enable RPC server rotation BEFORE initializing monitors
// This allows the connections to detect it's enabled from the start
console.log('🔧 [Init] Checking for proxies...');
const testProxyManager = (await import('./services/ProxyManager.js')).ProxyManager;
const testProxy = new testProxyManager('./proxies.txt');
const hasProxies = testProxy.hasProxies();

if (hasProxies) {
  // Proxies available - use proxy mode
  globalRateLimiter.disable();
  globalRPCServerRotator.disable();
  globalConcurrencyLimiter.useProxyRotation();
  console.log('🚀 [Init] Proxies FOUND - PROXY ROTATION MODE');
  console.log(`   Max Concurrent: ${proxyMaxConcurrent || 20}`);
} else {
  // No proxies - use RPC rotation mode
  globalRPCServerRotator.enable();
  globalRateLimiter.disable();
  globalConcurrencyLimiter.useRPCRotation();
  console.log('🚀 [Init] No proxies - RPC ROTATION MODE');
  console.log('🔄 [Init] Rotating through 20 RPC pool servers to bypass rate limits');
  console.log(`   Max Concurrent: ${rpcMaxConcurrent || 2}`);
}

// Initialize Solana monitor (connections will now detect rotation is enabled)
const solanaMonitor = new SolanaMonitor();
const pumpFunMonitor = new PumpFunMonitor();
const tradingActivityMonitor = new TradingActivityMonitor();
const ohlcvCollector = activityBasedOHLCVCollector; // Use enhanced activity-based collector
const metricsCalculator = new OHLCVMetricsCalculator();
const technicalIndicatorCalculator = new TechnicalIndicatorCalculator();

// Load request pacing configuration from database (separate for proxy/RPC)
(async () => {
  try {
    const proxyDelay = await ConfigProvider.get('proxy_pacing_delay_ms');
    const rpcDelay = await ConfigProvider.get('rpc_pacing_delay_ms');
    
    // Apply the appropriate delay based on current mode
    const activeDelay = hasProxies 
      ? (proxyDelay ? parseInt(proxyDelay) : 2)
      : (rpcDelay ? parseInt(rpcDelay) : 2);
    
    solanaMonitor.getDevWalletAnalyzer().setRequestDelay(activeDelay);
    const mode = hasProxies ? 'PROXY' : 'RPC';
    console.log(`🎛️  [Init] Request pacing (${mode}): ${activeDelay === 0 ? 'UNRESTRICTED ⚡' : `${activeDelay}ms delay`}`);
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

// Initialize OHLCV collector - restore previous running state
ohlcvCollector.initialize().then(() => {
  console.log('📊 [Init] OHLCV collector initialization complete');
}).catch(err => {
  console.error('Failed to initialize OHLCV collector:', err);
});

// Initialize Telegram entity cache for forwarding reliability
telegramEntityCache.initialize().then(() => {
  console.log('📋 [Init] Telegram entity cache initialized');
}).catch(err => {
  console.error('Failed to initialize entity cache:', err);
});

// WebSocket clients
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket client connected');
  clients.add(ws);
  
  // Register with Token Price Oracle for real-time price updates
  tokenPriceOracle.registerClient(ws);

  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    clients.delete(ws);
    tokenPriceOracle.unregisterClient(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
    tokenPriceOracle.unregisterClient(ws);
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

// Telegram chat fetch progress events
telegramClientService.on('chat_fetch_started', (data) => {
  broadcast('telegram_chat_fetch_started', data);
});

telegramClientService.on('chat_fetch_fetched', (data) => {
  broadcast('telegram_chat_fetch_fetched', data);
});

telegramClientService.on('chat_fetch_progress', (data) => {
  broadcast('telegram_chat_fetch_progress', data);
});

telegramClientService.on('chat_fetch_complete', (data) => {
  broadcast('telegram_chat_fetch_complete', data);
});

telegramClientService.on('chat_fetch_error', (data) => {
  broadcast('telegram_chat_fetch_error', data);
});

// Real-time message caching event
telegramClientService.on('message_cached', (data) => {
  broadcast('telegram_message_cached', data);
});

// Real-time contract detection event - CRITICAL FOR INSTANT UPDATES
telegramClientService.on('contract_detected', (data) => {
  console.log('📡 Broadcasting contract detection:', data.contract);
  broadcast('telegram_detection', {
    contract: data.contract,
    type: data.type,
    chatId: data.chat_id || data.chatId,
    chatName: data.chat_name,
    username: data.username,
    forwarded: data.forwarded,
    timestamp: Date.now()
  });
});

// Real-time forwarding event
telegramClientService.on('forward_logged', (data) => {
  console.log('📤 Broadcasting forward event:', data.contractAddress, data.status);
  broadcast('telegram_forward_logged', data);
});

// API Routes

// Get config
app.get('/api/config', async (_req, res) => {
  const config = await ConfigProvider.getAll();
  res.json(config);
});

// Update config - PROTECTED
app.post('/api/config', authService.requireSuperAdmin(), async (req, res) => {
  const { key, value } = req.body;
  await ConfigProvider.set(key, value);
  
  if (key === 'threshold_sol') {
    solanaMonitor.updateThreshold(parseFloat(value));
  } else if (key === 'max_threshold_sol') {
    solanaMonitor.updateMaxThreshold(parseFloat(value));
  }
  
  res.json({ success: true });
});

// Start monitoring CEX wallet - PROTECTED
app.post('/api/monitor/start', authService.requireSuperAdmin(), async (_req, res) => {
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

// Stop monitoring - PROTECTED
app.post('/api/monitor/stop', authService.requireSuperAdmin(), async (_req, res) => {
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
  const monitoringStates = pumpFunMonitor.getAllMonitoringStates();
  
  // Map backend fields to frontend expectations
  const mappedWallets = wallets.map(w => ({
    ...w,
    is_dev: w.is_dev_wallet,
    dev_tokens_count: w.tokens_deployed,
    transaction_count: w.previous_tx_count || 0,
    monitoring_state: monitoringStates[w.address] || 'idle'
  }));
  res.json(mappedWallets);
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

  // Respond immediately - analysis runs in background
  res.json({
    success: true,
    message: 'Analysis started - results will be broadcast via WebSocket when complete',
    address
  });

  // Run analysis asynchronously
  (async () => {
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
          first_seen: firstTxTime,
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
      
      // Broadcast results to all connected WebSocket clients
      const resultPayload = {
        type: 'test-dev-complete',
        data: {
          success: true,
          wallet: finalWallet,
          analysis: {
            isDevWallet: devAnalysis.isDevWallet,
            tokensDeployed: devAnalysis.tokensDeployed,
            deployments: devAnalysis.deployments,
            activities: devAnalysis.activities
          }
        }
      };
      
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(resultPayload));
        }
      });
      
      console.log(`📡 [Test] Results broadcast to ${wss.clients.size} WebSocket clients`);
      
    } catch (error: any) {
      console.error('❌ [Test] Error analyzing test dev wallet:', error);
      console.error('   Stack:', error.stack);
      
      // Broadcast error to clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'test-dev-error',
            data: {
              success: false,
              address,
              error: error.message || 'Unknown error during analysis'
            }
          }));
        }
      });
    }
  })();
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

// Add wallet for monitoring - PROTECTED
app.post('/api/wallets', authService.requireSuperAdmin(), async (req, res) => {
  try {
    const { address, label, source, monitoring_type, rate_limit_rps, rate_limit_enabled } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const finalMonitoringType = monitoring_type || 'pumpfun';
    
    // Check if wallet already exists with THIS monitoring type
    const existingWallet = await MonitoredWalletProvider.findByAddress(address, finalMonitoringType);
    if (existingWallet) {
      return res.status(400).json({ error: `Wallet already being monitored with ${finalMonitoringType} type` });
    }

    // Fetch wallet's actual first transaction time from blockchain
    console.log(`📝 [API] Creating wallet: ${address.slice(0, 8)}... with type: ${finalMonitoringType}`);
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const proxiedConnection = walletAnalyzer.getProxiedConnection();
    
    let firstTxTime = Date.now(); // Fallback to now if no transactions
    try {
      const pubkey = new PublicKey(address);
      const signatures = await proxiedConnection.withProxy(conn => 
        conn.getSignaturesForAddress(pubkey, { limit: 10 })
      );
      if (signatures.length > 0) {
        firstTxTime = (signatures[signatures.length - 1].blockTime || 0) * 1000;
      }
    } catch (error) {
      console.warn(`⚠️ [API] Could not fetch transaction history for ${address.slice(0, 8)}..., using current time`);
    }
    
    await MonitoredWalletProvider.create({
      address,
      source: source || 'manual',
      first_seen: firstTxTime,
      is_active: 1,
      label: label || null,
      monitoring_type: finalMonitoringType,
      rate_limit_rps: rate_limit_rps || 1,
      rate_limit_enabled: rate_limit_enabled ?? 1
    });

    console.log(`✅ [API] Wallet created, verifying...`);
    const verifyWallet = await MonitoredWalletProvider.findByAddress(address, finalMonitoringType);
    console.log(`🔍 [API] Verification result:`, verifyWallet ? 'FOUND ✅' : 'NOT FOUND ❌');

    // Respond immediately to avoid timeout
    res.json({ 
      success: true, 
      message: `Wallet added with ${finalMonitoringType} monitoring`,
      wallet: { address, label, monitoring_type: finalMonitoringType, rate_limit_rps: rate_limit_rps || 1 }
    });

    // Start monitoring in the background (don't await - async)
    if (finalMonitoringType === 'pumpfun') {
      pumpFunMonitor.startMonitoringWallet(address).then(() => {
        console.log(`🔥 [API] Started Pumpfun monitoring for ${address.slice(0, 8)}... (${rate_limit_rps || 1} RPS)`);
      }).catch(err => {
        console.error(`❌ [API] Error starting Pumpfun monitoring for ${address.slice(0, 8)}...:`, err);
      });
    } else if (finalMonitoringType === 'trading') {
      tradingActivityMonitor.startMonitoringWallet(address).then(() => {
        console.log(`📊 [API] Started Trading Activity monitoring for ${address.slice(0, 8)}... (${rate_limit_rps || 1} RPS)`);
      }).catch(err => {
        console.error(`❌ [API] Error starting Trading Activity monitoring for ${address.slice(0, 8)}...:`, err);
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fix first_seen timestamp for existing wallets (fetch from blockchain)
app.post('/api/wallets/:address/fix-timestamp', async (req, res) => {
  try {
    const { address } = req.params;
    const wallet = await MonitoredWalletProvider.findByAddress(address);
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Fetch actual first transaction time from blockchain
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const proxiedConnection = walletAnalyzer.getProxiedConnection();
    
    let firstTxTime = Date.now();
    try {
      const pubkey = new PublicKey(address);
      const signatures = await proxiedConnection.withProxy(conn => 
        conn.getSignaturesForAddress(pubkey, { limit: 10 })
      );
      if (signatures.length > 0) {
        firstTxTime = (signatures[signatures.length - 1].blockTime || 0) * 1000;
      }
    } catch (error) {
      console.error(`⚠️ [API] Could not fetch transaction history for ${address.slice(0, 8)}...`);
      return res.status(500).json({ error: 'Failed to fetch blockchain data' });
    }

    // Update wallet
    await MonitoredWalletProvider.update(address, {
      first_seen: firstTxTime
    });

    res.json({ 
      success: true,
      message: 'Timestamp updated',
      old_timestamp: wallet.first_seen,
      new_timestamp: firstTxTime,
      first_seen_date: new Date(firstTxTime).toLocaleString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update wallet rate limit settings
app.post('/api/wallets/:address/rate-limit', async (req, res) => {
  try {
    const { address } = req.params;
    const { rate_limit_rps, rate_limit_enabled } = req.body;
    
    const wallet = await MonitoredWalletProvider.findByAddress(address);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Update database
    await MonitoredWalletProvider.update(address, {
      rate_limit_rps: rate_limit_rps ?? wallet.rate_limit_rps,
      rate_limit_enabled: rate_limit_enabled ?? wallet.rate_limit_enabled
    });

    // Update the active rate limiter if monitoring is active
    const rateLimiter = pumpFunMonitor['rateLimiters']?.get(address);
    if (rateLimiter) {
      if (rate_limit_rps !== undefined) {
        rateLimiter.setRateLimit(rate_limit_rps);
      }
      if (rate_limit_enabled !== undefined) {
        rate_limit_enabled ? rateLimiter.enable() : rateLimiter.disable();
      }
    }

    res.json({ 
      success: true, 
      rate_limit_rps: rate_limit_rps ?? wallet.rate_limit_rps,
      rate_limit_enabled: rate_limit_enabled ?? wallet.rate_limit_enabled
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle wallet monitoring - PROTECTED
app.post('/api/wallets/:address/toggle', authService.requireSuperAdmin(), async (req, res) => {
  const { address } = req.params;
  const wallet = await MonitoredWalletProvider.findByAddress(address);
  
  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  const newState = wallet.is_active ? 0 : 1;
  await MonitoredWalletProvider.setActive(address, newState === 1);

  // Start or stop monitoring based on type
  if (newState === 1) {
    if (wallet.monitoring_type === 'trading') {
      await tradingActivityMonitor.startMonitoringWallet(address);
    } else if (wallet.monitoring_type === 'both') {
      await pumpFunMonitor.startMonitoringWallet(address);
      await tradingActivityMonitor.startMonitoringWallet(address);
    } else {
      await pumpFunMonitor.startMonitoringWallet(address);
    }
  } else {
    if (wallet.monitoring_type === 'trading') {
      await tradingActivityMonitor.stopMonitoringWallet(address);
    } else if (wallet.monitoring_type === 'both') {
      await pumpFunMonitor.stopMonitoringWallet(address);
      await tradingActivityMonitor.stopMonitoringWallet(address);
    } else {
      await pumpFunMonitor.stopMonitoringWallet(address);
    }
  }

  res.json({ success: true, is_active: newState });
});

// Delete wallet(s) - stops monitoring and removes from database - PROTECTED
app.delete('/api/wallets/:address', authService.requireSuperAdmin(), async (req, res) => {
  try {
    const { address } = req.params;
    
    // Get all monitoring types for this address
    const wallets = await MonitoredWalletProvider.findAllByAddress(address);
    
    if (wallets.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Stop all monitors for this wallet
    for (const wallet of wallets) {
      if (wallet.monitoring_type === 'pumpfun' || wallet.monitoring_type === 'both') {
        await pumpFunMonitor.stopMonitoringWallet(address);
      }
      if (wallet.monitoring_type === 'trading' || wallet.monitoring_type === 'both') {
        await tradingActivityMonitor.stopMonitoringWallet(address);
      }
    }

    // Delete all monitoring types for this address from database
    await MonitoredWalletProvider.delete(address);

    console.log(`🗑️  [API] Deleted wallet ${address.slice(0, 8)}... (${wallets.length} monitoring type(s))`);

    res.json({ 
      success: true, 
      message: `Wallet ${address.slice(0, 8)}... deleted`,
      deleted_count: wallets.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify and clean up token mints - verify ON-CHAIN creators
app.post('/api/tokens/verify-creators', async (_req, res) => {
  try {
    const EXPECTED_CREATOR = 'FM1YCKED2KaqB8Uat8aB1nsffR1vezr7s6FAEieXJgke';
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Get all token mints
    const allTokens = await TokenMintProvider.findAll();
    console.log(`🔍 Verifying ${allTokens.length} tokens on-chain...`);
    
    const results = {
      total: allTokens.length,
      checked: 0,
      valid: 0,
      invalid: 0,
      errors: 0,
      invalid_tokens: [] as any[]
    };
    
    for (const token of allTokens) {
      try {
        if (!token.signature) {
          console.log(`⚠️  [${results.checked + 1}/${allTokens.length}] ${token.symbol} - No signature`);
          results.errors++;
          results.checked++;
          continue;
        }
        
        // Fetch the creation transaction
        const txInfo = await connection.getParsedTransaction(token.signature, {
          maxSupportedTransactionVersion: 0
        });
        
        results.checked++;
        
        if (!txInfo || !txInfo.transaction) {
          console.log(`⚠️  [${results.checked}/${allTokens.length}] ${token.symbol} - Tx not found`);
          results.errors++;
          continue;
        }
        
        // Get the transaction signer (creator/dev)
        const signer = txInfo.transaction.message.accountKeys[0].pubkey.toBase58();
        
        if (signer !== EXPECTED_CREATOR) {
          console.log(`❌ [${results.checked}/${allTokens.length}] ${token.symbol} - WRONG CREATOR: ${signer.slice(0, 8)}`);
          results.invalid++;
          results.invalid_tokens.push({
            mint_address: token.mint_address,
            db_creator: token.creator_address,
            onchain_creator: signer,
            name: token.name,
            symbol: token.symbol
          });
        } else {
          console.log(`✅ [${results.checked}/${allTokens.length}] ${token.symbol} - Valid`);
          results.valid++;
        }
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error: any) {
        console.error(`❌ Error checking ${token.mint_address.slice(0, 8)}:`, error.message);
        results.errors++;
      }
    }
    
    res.json(results);
  } catch (error: any) {
    console.error(`❌ [API] Token verification error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Delete invalid token mints (not created by monitored wallets)
app.delete('/api/tokens/cleanup-invalid', async (_req, res) => {
  try {
    // Get all monitored wallets
    const wallets = await MonitoredWalletProvider.findAll();
    const monitoredAddresses = new Set(wallets.map(w => w.address));
    
    // Get all token mints
    const allTokens = await TokenMintProvider.findAll();
    
    // Delete invalid entries
    let deleted = 0;
    for (const token of allTokens) {
      if (!monitoredAddresses.has(token.creator_address)) {
        await TokenMintProvider.delete(token.mint_address);
        deleted++;
        console.log(`🗑️  Deleted invalid token: ${token.symbol || token.mint_address.slice(0, 8)} (creator: ${token.creator_address.slice(0, 8)})`);
      }
    }
    
    res.json({
      success: true,
      deleted_count: deleted,
      remaining_count: allTokens.length - deleted
    });
  } catch (error: any) {
    console.error(`❌ [API] Cleanup error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Force re-backfill a wallet (catches missed deployments)
// Usage: POST /api/wallets/:address/rebackfill OR /api/wallets/:address/rebackfill/:minSlot
app.post('/api/wallets/:address/rebackfill/:minSlot?', async (req, res) => {
  try {
    const { address, minSlot: minSlotParam } = req.params;
    const minSlot = minSlotParam ? parseInt(minSlotParam) : undefined;
    
    // Check if wallet exists and supports pumpfun monitoring
    const wallet = await MonitoredWalletProvider.findByAddress(address);
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    if (wallet.monitoring_type !== 'pumpfun' && wallet.monitoring_type !== 'both') {
      return res.status(400).json({ error: `Wallet has monitoring_type '${wallet.monitoring_type}', not 'pumpfun' or 'both'` });
    }

    const slotMsg = minSlot ? ` from slot ${minSlot}` : ' (FULL HISTORY)';
    console.log(`🔄 [API] Re-backfill triggered for ${address.slice(0, 8)}...${slotMsg}`);
    
    // Trigger re-backfill with optional minSlot
    await pumpFunMonitor.forceRebackfill(address, minSlot);

    res.json({ 
      success: true, 
      message: `Re-backfill started for ${address.slice(0, 8)}...${slotMsg}`,
      min_slot: minSlot || null,
      note: 'NO RATE LIMITING - Global limiter handles all requests. Max speed with proxies!'
    });
  } catch (error: any) {
    console.error(`❌ [API] Re-backfill error:`, error);
    res.status(500).json({ error: error.message });
  }
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

// Create new source wallet - PROTECTED
app.post('/api/source-wallets', authService.requireSuperAdmin(), async (req, res) => {
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

// Toggle source wallet monitoring - PROTECTED
app.post('/api/source-wallets/:address/toggle', authService.requireSuperAdmin(), async (req, res) => {
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

// Delete source wallet - PROTECTED
app.delete('/api/source-wallets/:address', authService.requireSuperAdmin(), async (req, res) => {
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

// Get token mints with full market data from token_registry
app.get('/api/tokens', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 1000;
  
  try {
    // Query from token_registry - use gecko_token_data as source for market data
    const tokens = await queryAll<any>(`
      SELECT 
        tr.token_mint as mint_address,
        COALESCE(gtd.symbol, tr.token_symbol, 'UNKNOWN') as symbol,
        COALESCE(gtd.name, tr.token_name, 'Unknown Token') as name,
        tr.creator_address,
        COALESCE(tr.platform, 'unknown') as platform,
        tr.creation_signature as signature,
        tr.first_seen_at * 1000 as timestamp,
        tr.is_graduated as launchpad_completed,
        CASE 
          WHEN tr.graduated_at IS NOT NULL THEN tr.graduated_at * 1000
          ELSE NULL
        END as launchpad_completed_at,
        tr.migrated_pool_address,
        tr.telegram_mentions,
        tr.wallet_transactions,
        tr.first_source_type,
        tr.telegram_chat_name,
        
        -- Market data from latest gecko_token_data
        gtd.price_usd,
        gtd.market_cap_usd as current_mcap,
        gtd.volume_24h_usd,
        gtd.price_change_24h,
        gtd.total_reserve_in_usd as liquidity_usd,
        
        -- Calculate ATH from gecko_token_data history
        (SELECT MAX(price_usd) FROM gecko_token_data WHERE mint_address = tr.token_mint) as ath_price_usd,
        (SELECT MAX(market_cap_usd) FROM gecko_token_data WHERE mint_address = tr.token_mint) as ath_mcap,
        
        -- Primary pool data
        tp.pool_address as primary_pool,
        tp.dex as primary_dex,
        tp.volume_24h_usd as pool_volume_24h,
        tp.liquidity_usd as pool_liquidity,
        tp.activity_tier,
        
        -- Calculate price in SOL
        gtd.price_sol,
        
        -- Starting market cap (assume pump.fun starts at ~$5k)
        CASE 
          WHEN tr.platform = 'pump.fun' THEN 5000
          ELSE NULL
        END as starting_mcap
        
      FROM token_registry tr
      LEFT JOIN (
        -- Get latest gecko_token_data for each token
        SELECT * FROM gecko_token_data gtd1
        WHERE fetched_at = (
          SELECT MAX(fetched_at) FROM gecko_token_data gtd2 
          WHERE gtd2.mint_address = gtd1.mint_address
        )
      ) gtd ON tr.token_mint = gtd.mint_address
      LEFT JOIN (
        SELECT 
          mint_address,
          pool_address,
          dex,
          volume_24h_usd,
          liquidity_usd,
          activity_tier
        FROM token_pools
        WHERE is_primary = 1
      ) tp ON tr.token_mint = tp.mint_address
      
      ORDER BY tr.first_seen_at DESC
      LIMIT ?
    `, [limit]);
    
    // Map for frontend compatibility and ensure no nulls on critical fields
    const mappedTokens = tokens.map((token: any) => ({
      ...token,
      id: token.mint_address,
      platform: token.platform || 'unknown',  // Double-check platform is never null
      symbol: token.symbol || 'UNKNOWN',
      name: token.name || 'Unknown Token',
      launch_time: token.timestamp,
      graduation_percentage: (token.platform === 'pump.fun' || token.platform === 'pumpfun') && token.current_mcap ? 
        Math.min(100, (token.current_mcap / 69000) * 100) : null
    }));
    
    res.json(mappedTokens);
  } catch (error: any) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens', details: error.message });
  }
});

// Get recent token mints (alias for /api/tokens)
app.get('/api/tokens/recent', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const tokens = await TokenMintProvider.findRecent(limit);
  res.json(tokens);
});

// Get single token by mint address
app.get('/api/tokens/:mintAddress', async (req, res) => {
  const { mintAddress } = req.params;
  const token = await TokenMintProvider.findByMintAddress(mintAddress);
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  res.json(token);
});

// Get token mints by creator
app.get('/api/tokens/creator/:address', async (req, res) => {
  const { address } = req.params;
  const tokens = await TokenMintProvider.findByCreator(address);
  // Map timestamp to launch_time for frontend compatibility
  const mappedTokens = tokens.map(token => ({
    ...token,
    launch_time: token.timestamp
  }));
  res.json(mappedTokens);
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
  // Database stores timestamps in milliseconds, not seconds

  const stats = {
    total_wallets: wallets.length,
    active_wallets: activeWallets.length,
    fresh_wallets: freshWallets.length,
    dev_wallets: devWallets.length,
    total_transactions: recentTransactions.length,
    transactions_24h: recentTransactions.filter(tx => (tx.timestamp || 0) >= last24h).length,
    total_tokens: recentTokens.length,
    tokens_24h: recentTokens.filter(token => (token.timestamp || 0) >= last24h).length,
    monitoring_status: solanaMonitor.getActiveSubscriptions().length > 0 ? 'active' : 'stopped',
    cex_wallet: await ConfigProvider.get('cex_wallet'),
    pump_fun_monitored: pumpFunMonitor.getActiveMonitors().length
  };

  res.json(stats);
});

// Get API provider statistics
app.get('/api/stats/providers', (_req, res) => {
  const providerStats = apiProviderTracker.getAllStats();
  const aggregated = apiProviderTracker.getAggregatedMetrics();
  
  res.json({
    aggregated,
    providers: providerStats
  });
});

// Get recent API calls for a provider
app.get('/api/stats/providers/:provider/recent', (req, res) => {
  const { provider } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;
  
  const recentCalls = apiProviderTracker.getRecentCalls(provider, limit);
  res.json(recentCalls);
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

// Monitoring control endpoints - PROTECTED
app.post('/api/monitoring/start', authService.requireSuperAdmin(), async (_req, res) => {
  try {
    const cexWallet = await ConfigProvider.get('cex_wallet');
    if (!cexWallet) {
      return res.status(400).json({ error: 'CEX wallet not configured' });
    }
    
    // Resume queue to allow processing
    globalAnalysisQueue.resume();
    console.log('▶️  Analysis queue resumed');
    
    // Start SOL price oracle
    await solPriceOracle.start();
    
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

app.post('/api/monitoring/stop', authService.requireSuperAdmin(), async (_req, res) => {
  try {
    // Stop queue FIRST to prevent new analyses
    globalAnalysisQueue.stop();
    console.log('🛑 Analysis queue stopped');
    
    // Stop SOL price oracle
    solPriceOracle.stop();
    
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

app.get('/api/monitoring/status', async (_req, res) => {
  const ohlcvStatus = await ohlcvCollector.getStatus();
  res.json({
    cexMonitor: {
      active: solanaMonitor.getActiveSubscriptions().length > 0,
      subscriptions: solanaMonitor.getActiveSubscriptions()
    },
    pumpFunMonitor: {
      active: pumpFunMonitor.getActiveMonitors().length > 0,
      monitored: pumpFunMonitor.getActiveMonitors().length
    },
    tokenPriceOracle: tokenPriceOracle.getStatus(),
    solPriceOracle: solPriceOracle.getStatus(),
    ohlcvCollector: ohlcvStatus,
    metricsCalculator: metricsCalculator.getStatus()
  });
});

// OHLCV Collector control endpoints - PROTECTED
app.post('/api/ohlcv/start', authService.requireSuperAdmin(), async (_req, res) => {
  try {
    await ohlcvCollector.start();
    res.json({ 
      success: true, 
      message: 'OHLCV collector started (state persisted)' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ohlcv/stop', authService.requireSuperAdmin(), async (_req, res) => {
  try {
    await ohlcvCollector.stop();
    res.json({ 
      success: true, 
      message: 'OHLCV collector stopped (state persisted)' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ohlcv/status', async (_req, res) => {
  const status = await ohlcvCollector.getStatus();
  res.json(status);
});

// Toggle real-time OHLCV updates for a token
app.post('/api/ohlcv/toggle-realtime/:mintAddress', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const { enabled } = req.body;
    
    // Update token settings
    await execute(
      `UPDATE token_mints 
       SET ohlcv_realtime_enabled = ?, ohlcv_update_tier = ?
       WHERE mint_address = ?`,
      [enabled ? 1 : 0, enabled ? 'REALTIME' : 'NORMAL', mintAddress]
    );
    
    // Update schedule if pools exist
    await execute(
      `UPDATE ohlcv_update_schedule 
       SET update_tier = ?, next_update = ?
       WHERE mint_address = ?`,
      [enabled ? 'REALTIME' : 'NORMAL', Date.now() + (enabled ? 60000 : 900000), mintAddress]
    );
    
    saveDatabase();
    
    res.json({ 
      success: true, 
      mintAddress,
      realtimeEnabled: enabled,
      message: enabled ? 'Real-time updates enabled (1 min intervals)' : 'Real-time updates disabled (15 min intervals)'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all OHLCV data (for fresh start testing)
app.post('/api/ohlcv/clear-all', async (_req, res) => {
  try {
    const db = await getDb();
    
    console.log('🗑️  [OHLCV] Clearing all OHLCV data...');
    
    // Delete in order to respect foreign key constraints
    db.run('DELETE FROM ohlcv_backfill_progress');
    const progressCount = db.exec('SELECT changes() as deleted')[0].values[0][0];
    
    db.run('DELETE FROM ohlcv_data');
    const candlesCount = db.exec('SELECT changes() as deleted')[0].values[0][0];
    
    db.run('DELETE FROM token_pools');
    const poolsCount = db.exec('SELECT changes() as deleted')[0].values[0][0];
    
    saveDatabase();
    
    console.log('✅ [OHLCV] Cleanup complete:');
    console.log(`   - ${progressCount} progress entries deleted`);
    console.log(`   - ${candlesCount} candles deleted`);
    console.log(`   - ${poolsCount} pools deleted`);
    
    res.json({
      success: true,
      message: 'All OHLCV data cleared successfully',
      deleted: {
        progress: progressCount,
        candles: candlesCount,
        pools: poolsCount
      }
    });
  } catch (error: any) {
    console.error('❌ [OHLCV] Error clearing data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get OHLCV data for a token
app.get('/api/ohlcv/:address/:timeframe', async (req, res) => {
  try {
    const { address, timeframe } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 1000;
    
    let candles: any[] = [];
    
    // For 1m timeframe, fetch directly from database
    if (timeframe === '1m') {
      const rawCandles = await queryAll(
        `SELECT pool_address, timestamp, open, high, low, close, volume 
         FROM ohlcv_data 
         WHERE mint_address = ? AND timeframe = ? 
           AND open IS NOT NULL 
           AND high IS NOT NULL 
           AND low IS NOT NULL 
           AND close IS NOT NULL
           AND open > 0
           AND high > 0
           AND low > 0
           AND close > 0
         ORDER BY timestamp ASC
         LIMIT ?`,
        [address, timeframe, limit]
      );
      
      // Additional validation to ensure no null values
      candles = rawCandles.filter((c: any) => 
        c && c.timestamp && c.open && c.high && c.low && c.close &&
        !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close)
      );
    } else if (['15m', '1h', '4h', '1d'].includes(timeframe)) {
      // For higher timeframes, aggregate from 1m data
      candles = await ohlcvAggregator.aggregateCandles(
        address, 
        null, // Will aggregate across all pools
        timeframe as any,
        limit
      );
    }
    
    // Get token metadata (including migration info)
    const tokenMeta = await queryOne<{
      launchpad_completed_at: number | null;
      migrated_pool_address: string | null;
    }>(
      `SELECT launchpad_completed_at, migrated_pool_address 
       FROM token_mints 
       WHERE mint_address = ?`,
      [address]
    );
    
    // Get all pools for this token
    const pools = await queryAll<{
      pool_address: string;
      dex: string;
      volume_24h_usd: number;
      is_primary: number;
    }>(
      `SELECT pool_address, dex, volume_24h_usd, is_primary 
       FROM token_pools 
       WHERE mint_address = ?
       ORDER BY is_primary DESC`,
      [address]
    );
    
    res.json({
      candles: candles || [],
      migration: {
        completed_at: tokenMeta?.launchpad_completed_at || null,
        raydium_pool: tokenMeta?.migrated_pool_address || null
      },
      pools: pools || []
    });
  } catch (error: any) {
    console.error(`Error fetching OHLCV data:`, error);
    res.json({ candles: [], migration: null, pools: [] });
  }
});

// Technical Indicators Calculator control endpoints (renamed from metrics)
app.post('/api/metrics/start', (_req, res) => {
  try {
    // Start both calculators
    metricsCalculator.start();  // Market cap metrics
    technicalIndicatorCalculator.start();  // Technical indicators
    res.json({ 
      success: true, 
      message: 'Technical indicator & metrics calculators started' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/metrics/stop', (_req, res) => {
  try {
    // Stop both calculators
    metricsCalculator.stop();
    technicalIndicatorCalculator.stop();
    res.json({ 
      success: true, 
      message: 'Technical indicator & metrics calculators stopped' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/metrics/status', (_req, res) => {
  res.json({
    marketCapMetrics: metricsCalculator.getStatus(),
    technicalIndicators: technicalIndicatorCalculator.getStatus()
  });
});

// NOTE: Indicator endpoints are in routes/indicators.ts with proper authentication
// Removed duplicate unprotected endpoints that were causing auth bypass

// OHLCV Fetch Test - Fetch candles without saving to database
app.post('/api/ohlcv/fetch-test/:mintAddress', authService.requireSuperAdmin(), async (req, res) => {
  const { mintAddress } = req.params;
  const { timeframe, limit } = req.body;
  
  try {
    console.log(`🧪 [OHLCV Fetch Test] Fetching ${limit || 1000} candles for ${mintAddress} (${timeframe})`);
    
    // Get token info to find pools
    const pools = await queryAll<any>(
      `SELECT pool_address, dex FROM token_pools WHERE mint_address = ? ORDER BY is_primary DESC`,
      [mintAddress]
    );
    
    if (pools.length === 0) {
      return res.status(404).json({ error: 'No pools found for this token' });
    }
    
    const primaryPool = pools[0];
    console.log(`🎯 [OHLCV Fetch Test] Using pool: ${primaryPool.pool_address} (${primaryPool.dex})`);
    
    // Map our timeframe format to GeckoTerminal's format
    const timeframeMap: Record<string, string> = {
      '1m': 'minute',
      '5m': 'minute',
      '15m': 'minute',
      '1h': 'hour',
      '4h': 'hour',
      '1d': 'day'
    };
    
    const geckoTimeframe = timeframeMap[timeframe] || 'hour';
    console.log(`🔄 [OHLCV Fetch Test] Timeframe mapping: ${timeframe} → ${geckoTimeframe}`);
    
    // Calculate aggregate value based on timeframe
    // GeckoTerminal returns 1-minute candles for 'minute', we aggregate them
    let aggregate = 1;
    if (timeframe === '5m') aggregate = 5;
    else if (timeframe === '15m') aggregate = 15;
    else if (timeframe === '4h') aggregate = 4;
    
    // Fetch OHLCV data directly from GeckoTerminal without saving
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${primaryPool.pool_address}/ohlcv/${geckoTimeframe}?limit=${limit || 1000}&aggregate=${aggregate}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }
    
    const data = await response.json();
    const ohlcvArray = data?.data?.attributes?.ohlcv_list || [];
    
    // Parse OHLCV data: [timestamp, open, high, low, close, volume]
    const candles = ohlcvArray.map((candle: any[]) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5] || '0')
    }));
    
    console.log(`✅ [OHLCV Fetch Test] Fetched ${candles.length} candles`);
    
    res.json({
      success: true,
      pool: {
        address: primaryPool.pool_address,
        dex: primaryPool.dex
      },
      timeframe,
      count: candles.length,
      candles,
      rawResponse: data
    });
    
  } catch (error: any) {
    console.error('❌ [OHLCV Fetch Test] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// OHLCV Test Endpoint - Test single token collection
app.post('/api/ohlcv/test/:mintAddress', authService.requireSuperAdmin(), async (req, res) => {
  const { mintAddress } = req.params;
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 [OHLCV Test] Starting single token test`);
    console.log(`Token: ${mintAddress}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Get token info
    const tokenInfo = await queryOne<{ timestamp: number; name: string; symbol: string }>(
      `SELECT timestamp, name, symbol FROM token_mints WHERE mint_address = ?`,
      [mintAddress]
    );
    
    if (!tokenInfo) {
      return res.status(404).json({ error: 'Token not found in database' });
    }
    
    console.log(`📊 [OHLCV Test] Token Info:`, {
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      created: new Date(tokenInfo.timestamp).toISOString()
    });
    
    // Respond immediately (processing happens in background)
    res.json({ 
      success: true, 
      message: `Test started for ${mintAddress}. Check logs for progress.`,
      token: tokenInfo
    });
    
    // Process token in background
    (async () => {
      try {
        await ohlcvCollector.processToken(mintAddress, tokenInfo.timestamp, true);
        
        // Get results
        const results = await queryAll<any>(`
          SELECT 
            pool_address,
            timeframe,
            COUNT(*) as candle_count,
            MIN(timestamp) as oldest_candle,
            MAX(timestamp) as newest_candle
          FROM ohlcv_data
          WHERE mint_address = ?
          GROUP BY pool_address, timeframe
        `, [mintAddress]);
        
        const progress = await queryAll<any>(`
          SELECT 
            pool_address,
            timeframe,
            oldest_timestamp,
            newest_timestamp,
            backfill_complete,
            fetch_count,
            error_count
          FROM ohlcv_backfill_progress
          WHERE mint_address = ?
        `, [mintAddress]);
        
        const pools = await queryAll<any>(`
          SELECT pool_address, dex, volume_24h_usd, is_primary
          FROM token_pools
          WHERE mint_address = ?
        `, [mintAddress]);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ [OHLCV Test] Test Complete`);
        console.log(`Pools discovered: ${pools.length}`);
        console.log(`Candle groups: ${results.length}`);
        console.log(`Progress entries: ${progress.length}`);
        console.log(`${'='.repeat(60)}\n`);
        
        // Log results
        console.log(`\n📊 [OHLCV Test] Results:`);
        console.table(results);
        console.log(`\n📈 [OHLCV Test] Progress:`);
        console.table(progress);
        console.log(`\n🏊 [OHLCV Test] Pools:`);
        console.table(pools);
        
      } catch (error: any) {
        console.error(`❌ [OHLCV Test] Test failed:`, error);
        console.error(`Stack:`, error.stack);
      }
    })();
    
  } catch (error: any) {
    console.error(`❌ [OHLCV Test] Error starting test:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Clear OHLCV data for a specific token (for test re-runs)
app.delete('/api/ohlcv/clear/:mintAddress', authService.requireSuperAdmin(), async (req, res) => {
  const { mintAddress } = req.params;
  
  try {
    console.log(`🗑️ [OHLCV] Clearing data for token: ${mintAddress.slice(0,8)}...`);
    
    const db = await getDb();
    
    // Delete OHLCV data
    db.run(`DELETE FROM ohlcv_data WHERE mint_address = ?`, [mintAddress]);
    const candlesDeleted = db.exec('SELECT changes() as deleted')[0].values[0][0];
    
    // Delete progress tracking
    db.run(`DELETE FROM ohlcv_backfill_progress WHERE mint_address = ?`, [mintAddress]);
    const progressDeleted = db.exec('SELECT changes() as deleted')[0].values[0][0];
    
    // Delete pool data
    db.run(`DELETE FROM token_pools WHERE mint_address = ?`, [mintAddress]);
    const poolsDeleted = db.exec('SELECT changes() as deleted')[0].values[0][0];
    
    saveDatabase();
    
    console.log(`✅ [OHLCV] Cleared:`);
    console.log(`   - Candles: ${candlesDeleted}`);
    console.log(`   - Progress: ${progressDeleted}`);
    console.log(`   - Pools: ${poolsDeleted}`);
    
    res.json({ 
      success: true,
      cleared: {
        candles: candlesDeleted,
        progress: progressDeleted,
        pools: poolsDeleted
      }
    });
  } catch (error: any) {
    console.error(`❌ [OHLCV] Error clearing data:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get OHLCV test status for a token
app.get('/api/ohlcv/test-status/:mintAddress', async (req, res) => {
  const { mintAddress } = req.params;
  
  try {
    const pools = await queryAll<any>(`
      SELECT pool_address, dex, volume_24h_usd, is_primary
      FROM token_pools
      WHERE mint_address = ?
    `, [mintAddress]);
    
    const progress = await queryAll<any>(`
      SELECT 
        pool_address,
        timeframe,
        oldest_timestamp,
        newest_timestamp,
        backfill_complete,
        fetch_count,
        error_count,
        last_error
      FROM ohlcv_backfill_progress
      WHERE mint_address = ?
    `, [mintAddress]);
    
    const candleCounts = await queryAll<any>(`
      SELECT 
        pool_address,
        timeframe,
        COUNT(*) as count,
        MIN(timestamp) as first_candle,
        MAX(timestamp) as last_candle
      FROM ohlcv_data
      WHERE mint_address = ?
      GROUP BY pool_address, timeframe
    `, [mintAddress]);
    
    const summary = {
      totalPools: pools?.length || 0,
      totalCandles: candleCounts?.reduce((sum: number, c: any) => sum + (c.count || 0), 0) || 0,
      completedTimeframes: progress?.filter((p: any) => p.backfill_complete)?.length || 0,
      totalTimeframes: progress?.length || 0
    };

    console.log(`📊 [OHLCV Test Status] ${mintAddress.slice(0,8)}... - Pools: ${summary.totalPools}, Candles: ${summary.totalCandles}`);

    res.json({
      pools: pools || [],
      progress: progress || [],
      candleCounts: candleCounts || [],
      summary
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// One-time migration to create OHLCV tables (if they don't exist)
app.post('/api/ohlcv/init-tables', async (_req, res) => {
  try {
    const db = await getDb();
    
    // Create tables (IF NOT EXISTS so safe to run multiple times)
    db.run(`
      CREATE TABLE IF NOT EXISTS token_pools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mint_address TEXT NOT NULL UNIQUE,
        pool_address TEXT NOT NULL,
        pool_name TEXT,
        dex TEXT DEFAULT 'raydium',
        discovered_at INTEGER NOT NULL,
        last_verified INTEGER
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS ohlcv_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mint_address TEXT NOT NULL,
        pool_address TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(mint_address, timeframe, timestamp)
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS ohlcv_backfill_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mint_address TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        oldest_timestamp INTEGER,
        newest_timestamp INTEGER,
        backfill_complete INTEGER DEFAULT 0,
        last_fetch_at INTEGER,
        fetch_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_error TEXT,
        UNIQUE(mint_address, timeframe)
      );
    `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_token_pools_mint ON token_pools(mint_address);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_token_pools_pool ON token_pools(pool_address);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ohlcv_mint_timeframe ON ohlcv_data(mint_address, timeframe);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ohlcv_timestamp ON ohlcv_data(timestamp);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv_data(mint_address, timeframe, timestamp);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_backfill_progress_mint ON ohlcv_backfill_progress(mint_address);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_backfill_progress_incomplete ON ohlcv_backfill_progress(backfill_complete);`);

    res.json({
      success: true,
      message: 'OHLCV tables created successfully'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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

// Request statistics endpoints (ENHANCED: includes both RPC and API provider traffic)
app.get('/api/stats/requests', (_req, res) => {
  const statsTracker = RequestStatsTracker.getInstance();
  const rpcStats = statsTracker.getStats();
  
  // Get API provider stats (GeckoTerminal, Price Oracle, etc.)
  const apiProviderStats = apiProviderTracker.getAllStats();
  const apiAggregated = apiProviderTracker.getAggregatedMetrics();
  
  // Merge endpoint rates from both sources
  const mergedEndpointRates = { ...rpcStats.endpointRates };
  const mergedByEndpoint = { ...rpcStats.byEndpoint };
  
  // Add API providers as "endpoints" for unified display
  for (const [provider, providerData] of Object.entries(apiProviderStats)) {
    const displayName = `${provider} API`;
    mergedEndpointRates[displayName] = (providerData as any).callsLastMinute || 0;
    mergedByEndpoint[displayName] = (providerData as any).totalCalls || 0;
  }
  
  // Merge service rates AND totals
  const mergedServiceRates = { ...rpcStats.serviceRates };
  const mergedByService = { ...rpcStats.byService };
  for (const [provider, providerData] of Object.entries(apiProviderStats)) {
    mergedServiceRates[provider] = (providerData as any).callsLastMinute || 0;
    mergedByService[provider] = (providerData as any).totalCalls || 0; // FIX: Add total calls
  }
  
  // Calculate merged overview stats
  const apiTotalCalls = apiAggregated.totalCalls || 0;
  const apiCallsLastMinute = apiAggregated.callsLastMinute || 0;
  
  const mergedOverview = {
    ...rpcStats.overview,
    totalRequests: rpcStats.overview.totalRequests + apiTotalCalls,
    requestsPerMinute: rpcStats.overview.requestsPerMinute + apiCallsLastMinute
  };
  
  // Return merged stats
  res.json({
    ...rpcStats,
    overview: mergedOverview, // FIX: Use merged overview
    endpointRates: mergedEndpointRates,
    byEndpoint: mergedByEndpoint,
    byService: mergedByService, // FIX: Use merged service totals
    serviceRates: mergedServiceRates,
    apiProviders: {
      providers: apiProviderStats,
      aggregated: apiAggregated
    }
  });
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

// Analysis Queue status endpoint
app.get('/api/analysis-queue/status', (_req, res) => {
  res.json(globalAnalysisQueue.getStatus());
});

// Global Concurrency Limiter endpoints (separate for Proxy/RPC)
app.get('/api/concurrency/config', (_req, res) => {
  res.json(globalConcurrencyLimiter.getConfig());
});

app.post('/api/concurrency/config', async (req, res) => {
  try {
    const { proxyMaxConcurrent, rpcMaxConcurrent } = req.body;
    
    // Update in memory
    if (proxyMaxConcurrent !== undefined) {
      globalConcurrencyLimiter.setProxyMaxConcurrent(proxyMaxConcurrent);
      await ConfigProvider.set('proxy_max_concurrent', proxyMaxConcurrent.toString());
    }
    
    if (rpcMaxConcurrent !== undefined) {
      globalConcurrencyLimiter.setRPCMaxConcurrent(rpcMaxConcurrent);
      await ConfigProvider.set('rpc_max_concurrent', rpcMaxConcurrent.toString());
    }
    
    res.json({ 
      success: true, 
      config: globalConcurrencyLimiter.getConfig(),
      message: 'Concurrency limits updated'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/concurrency/stats', (_req, res) => {
  res.json(globalConcurrencyLimiter.getStats());
});

// Request Pacing configuration endpoints (separate for Proxy/RPC)
app.get('/api/request-pacing/config', async (_req, res) => {
  try {
    const proxyDelay = await ConfigProvider.get('proxy_pacing_delay_ms');
    const rpcDelay = await ConfigProvider.get('rpc_pacing_delay_ms');
    res.json({
      proxyDelayMs: proxyDelay ? parseInt(proxyDelay) : 2,
      rpcDelayMs: rpcDelay ? parseInt(rpcDelay) : 2
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/request-pacing/config', async (req, res) => {
  try {
    const { proxyDelayMs, rpcDelayMs } = req.body;
    
    if (proxyDelayMs !== undefined) {
      await ConfigProvider.set('proxy_pacing_delay_ms', proxyDelayMs.toString());
      console.log(`🎛️  [RequestPacing-Proxy] Delay updated to ${proxyDelayMs === 0 ? 'UNRESTRICTED ⚡' : `${proxyDelayMs}ms`}`);
    }
    
    if (rpcDelayMs !== undefined) {
      await ConfigProvider.set('rpc_pacing_delay_ms', rpcDelayMs.toString());
      console.log(`🎛️  [RequestPacing-RPC] Delay updated to ${rpcDelayMs === 0 ? 'UNRESTRICTED ⚡' : `${rpcDelayMs}ms`}`);
    }
    
    // Update DevWalletAnalyzer with active mode's delay
    const walletAnalyzer = solanaMonitor.getWalletAnalyzer();
    const proxiesEnabled = walletAnalyzer.getProxiedConnection().isProxyEnabled();
    const activeDelay = proxiesEnabled ? (proxyDelayMs ?? 2) : (rpcDelayMs ?? 2);
    
    const devAnalyzer = solanaMonitor.getDevWalletAnalyzer();
    devAnalyzer.setRequestDelay(activeDelay);
    
    const savedProxyDelay = await ConfigProvider.get('proxy_pacing_delay_ms');
    const savedRpcDelay = await ConfigProvider.get('rpc_pacing_delay_ms');
    
    res.json({
      success: true,
      proxyDelayMs: proxyDelayMs ?? (savedProxyDelay ? parseInt(savedProxyDelay) : 2),
      rpcDelayMs: rpcDelayMs ?? (savedRpcDelay ? parseInt(savedRpcDelay) : 2),
      message: 'Request pacing configuration updated'
    });
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

// Token Price Oracle endpoints
app.get('/api/market-data/status', (_req, res) => {
  res.json(tokenPriceOracle.getStatus());
});

// Test DexScreener API for specific tokens
app.get('/api/market-data/test/:addresses', async (req, res) => {
  try {
    const addresses = req.params.addresses;
    const url = `https://api.dexscreener.com/latest/dex/tokens/${addresses}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.json({
      url,
      status: response.status,
      tokensRequested: addresses.split(',').length,
      pairsFound: data.pairs ? data.pairs.length : 0,
      response: data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test GeckoTerminal API for a token
app.get('/api/market-data/test-gecko/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.json({
      api: 'GeckoTerminal',
      url,
      status: response.status,
      tokenAddress,
      response: data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test token metadata fetching
app.get('/api/tokens/test-metadata/:mintAddress', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    
    // Import and use TokenMetadataFetcher directly
    const { TokenMetadataFetcher } = await import('./services/TokenMetadataFetcher.js');
    const metadataFetcher = new TokenMetadataFetcher();
    
    const metadata = await metadataFetcher.fetchMetadata(mintAddress);
    
    res.json({
      mintAddress,
      metadata: metadata || 'No metadata found',
      success: !!metadata
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manual token metadata refresh
app.post('/api/tokens/:mintAddress/refresh', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    
    // Check if token exists
    const token = await TokenMintProvider.findByMintAddress(mintAddress);
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    // Fetch fresh metadata from both GeckoTerminal endpoints
    const { TokenMetadataFetcher } = await import('./services/TokenMetadataFetcher.js');
    const metadataFetcher = new TokenMetadataFetcher();
    const metadata = await metadataFetcher.fetchMetadata(mintAddress);
    
    if (!metadata) {
      return res.status(404).json({ error: 'No metadata found for token' });
    }
    
    // Update token with fresh data
    await TokenMintProvider.update(mintAddress, {
      current_mcap: metadata.fdvUsd,
      price_usd: metadata.priceUsd,
      graduation_percentage: metadata.launchpadGraduationPercentage,
      launchpad_completed: metadata.launchpadCompleted ? 1 : 0,
      launchpad_completed_at: metadata.launchpadCompletedAt ? new Date(metadata.launchpadCompletedAt).getTime() : undefined,
      total_supply: metadata.totalSupply,
      market_cap_usd: metadata.marketCapUsd,
      coingecko_coin_id: metadata.coingeckoCoinId || undefined,
      gt_score: metadata.gtScore,
      description: metadata.description,
      last_updated: Date.now(),
      metadata: JSON.stringify({
        ...JSON.parse(token.metadata || '{}'),
        decimals: metadata.decimals,
        image: metadata.image,
        totalReserveUsd: metadata.totalReserveUsd,
        volumeUsd24h: metadata.volumeUsd24h,
        gtScoreDetails: metadata.gtScoreDetails,
        holders: metadata.holders,
        twitterHandle: metadata.twitterHandle,
        telegramHandle: metadata.telegramHandle,
        discordUrl: metadata.discordUrl,
        websites: metadata.websites,
        categories: metadata.categories,
        mintAuthority: metadata.mintAuthority,
        freezeAuthority: metadata.freezeAuthority,
        isHoneypot: metadata.isHoneypot,
        geckoTerminal: metadata
      })
    });
    
    res.json({
      success: true,
      message: 'Token data refreshed successfully',
      updated: {
        price_usd: metadata.priceUsd,
        current_mcap: metadata.fdvUsd,
        gt_score: metadata.gtScore
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Wipe unreliable historical market cap data (keep current price/mcap and launchpad details)
app.post('/api/tokens/wipe-mcap-data', async (_req, res) => {
  try {
    const tokens = await TokenMintProvider.findAll();
    
    let updated = 0;
    for (const token of tokens) {
      await TokenMintProvider.update(token.mint_address, {
        starting_mcap: undefined,
        ath_mcap: undefined
      });
      updated++;
    }
    
    res.json({
      success: true,
      message: `Wiped starting_mcap and ath_mcap for ${updated} tokens (keeping current price/mcap and launchpad data)`,
      tokensUpdated: updated
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Re-fetch metadata for all existing tokens
app.post('/api/tokens/refetch-all-metadata', async (_req, res) => {
  try {
    // Get all tokens
    const tokens = await TokenMintProvider.findAll();
    
    // Respond immediately
    res.json({
      success: true,
      message: `Re-fetching metadata for ${tokens.length} tokens...`,
      tokensCount: tokens.length
    });
    
    // Process in background
    (async () => {
      const { TokenMetadataFetcher } = await import('./services/TokenMetadataFetcher.js');
      const metadataFetcher = new TokenMetadataFetcher();
      
      let updated = 0;
      let failed = 0;
      
      for (const token of tokens) {
        try {
          console.log(`🔍 [Metadata] Fetching for ${token.mint_address.slice(0, 8)}...`);
          const metadata = await metadataFetcher.fetchMetadata(token.mint_address);
          
          if (metadata) {
            await TokenMintProvider.update(token.mint_address, {
              name: metadata.name || token.name,
              symbol: metadata.symbol || token.symbol
            });
            console.log(`✅ [Metadata] Updated: ${metadata.name} (${metadata.symbol})`);
            updated++;
          } else {
            console.log(`⚠️ [Metadata] No metadata found for ${token.mint_address.slice(0, 8)}...`);
            failed++;
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
          console.error(`❌ [Metadata] Error for ${token.mint_address.slice(0, 8)}...:`, error.message);
          failed++;
        }
      }
      
      console.log(`\n📊 [Metadata] Refetch complete: ${updated} updated, ${failed} failed\n`);
    })();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze Pump.fun mint transaction to understand bonding curve structure
app.get('/api/market-data/analyze-mint/:mintAddress', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const mint = new PublicKey(mintAddress);
    
    // Get token creation signature
    const signatures = await connection.getSignaturesForAddress(mint, { limit: 100 });
    
    if (signatures.length === 0) {
      return res.status(404).json({ error: 'No transactions found for this token' });
    }
    
    // Get the oldest signature (creation tx)
    const createSig = signatures[signatures.length - 1].signature;
    const tx = await connection.getParsedTransaction(createSig, { maxSupportedTransactionVersion: 0 });
    
    if (!tx) {
      return res.status(404).json({ error: 'Could not fetch creation transaction' });
    }
    
    // Find bonding curve account in transaction
    const bondingCurveAccounts = tx.transaction.message.accountKeys.filter((key: any) => 
      key.pubkey.toBase58().includes('pump') || key.signer === false
    );
    
    res.json({
      mintAddress,
      createSignature: createSig,
      blockTime: tx.blockTime,
      accounts: bondingCurveAccounts.map((acc: any) => ({
        pubkey: acc.pubkey.toBase58(),
        signer: acc.signer,
        writable: acc.writable
      })),
      instructions: tx.transaction.message.instructions.map((ix: any) => ({
        program: ix.programId?.toBase58(),
        parsed: ix.parsed,
        data: ix.data
      })),
      fullTransaction: tx
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Token Price Oracle is now auto-started on server initialization
// No manual start/stop endpoints needed - it runs continuously

// SOL Price Oracle control
app.get('/api/sol-price', async (_req, res) => {
  try {
    const price = await solPriceOracle.getPriceAsync();
    const status = solPriceOracle.getStatus();
    res.json({
      success: true,
      price,
      status
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sol-oracle/start', async (_req, res) => {
  try {
    await solPriceOracle.start();
    res.json({
      success: true,
      message: 'SOL price oracle started',
      status: solPriceOracle.getStatus()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sol-oracle/stop', (_req, res) => {
  try {
    solPriceOracle.stop();
    res.json({
      success: true,
      message: 'SOL price oracle stopped',
      status: solPriceOracle.getStatus()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GeckoTerminal Networks & DEXes endpoints (Solana only)
app.get('/api/gecko/networks', async (_req, res) => {
  try {
    // Only return Solana network since we're only syncing Solana
    const solanaNetwork = await queryOne(`
      SELECT 
        network_id, 
        name, 
        coingecko_asset_platform_id,
        chain_type,
        native_token_symbol,
        total_dexes,
        is_active,
        is_testnet,
        last_sync_at
      FROM gecko_networks 
      WHERE network_id = 'solana'
    `);
    
    res.json({ success: true, data: solanaNetwork ? [solanaNetwork] : [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/gecko/dexes/:network?', async (req, res) => {
  try {
    // Default to Solana since we only sync Solana
    const network = req.params.network || 'solana';
    
    if (network !== 'solana') {
      return res.json({ 
        success: true, 
        data: [],
        message: 'Only Solana DEXes are synced' 
      });
    }
    
    const dexes = await queryAll(`
      SELECT 
        d.dex_id,
        d.name,
        d.dex_type,
        d.total_pools,
        d.total_volume_24h_usd,
        d.total_liquidity_usd,
        d.is_active,
        d.last_sync_at
      FROM gecko_dexes d
      WHERE d.network_id = ? AND d.is_active = 1
      ORDER BY 
        CASE 
          WHEN d.dex_type = 'launchpad' THEN 0
          WHEN d.name LIKE '%Pump%' THEN 1
          ELSE 2
        END,
        d.total_volume_24h_usd DESC
    `, [network]);
    
    res.json({ success: true, data: dexes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/gecko/sync-status', async (_req, res) => {
  try {
    const stats = await geckoNetworksSyncService.getSyncStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/gecko/force-sync', async (_req, res) => {
  try {
    // Only sync Solana DEXes - no longer syncing all networks
    await geckoNetworksSyncService.forceSync();
    
    res.json({ success: true, message: 'Solana DEXes sync initiated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Token price oracle endpoints
app.get('/api/token-oracle/price/:mintAddress', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const price = await tokenPriceOracle.getTokenPrice(mintAddress);
    
    if (price) {
      res.json({ success: true, data: price });
    } else {
      res.status(404).json({ success: false, error: 'Token price not found' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/token-oracle/prices', async (req, res) => {
  try {
    const { addresses } = req.body;
    
    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ success: false, error: 'addresses array required' });
    }
    
    const prices = await tokenPriceOracle.getTokenPrices(addresses);
    const pricesArray = Array.from(prices.entries()).map(([address, price]) => ({
      ...price,
      address // Override the address in price object to ensure consistency
    }));
    
    res.json({ 
      success: true, 
      count: pricesArray.length,
      data: pricesArray 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
    tokenPriceOracle.stop();
    
    // Wipe all data tables (keep config and user accounts)
    await TransactionProvider.deleteAll();
    await MonitoredWalletProvider.deleteAll();
    await TokenMintProvider.deleteAll();
    await TokenPoolProvider.deleteAll();
    
    // Wipe OHLCV data (no provider, use execute helper)
    await execute('DELETE FROM ohlcv_data', []);
    await execute('DELETE FROM ohlcv_backfill_progress', []);
    saveDatabase();
    
    console.log('🗑️  Database wiped successfully');
    
    res.json({ 
      success: true, 
      message: 'Database wiped successfully. All wallets, transactions, tokens, pools, and OHLCV data have been deleted.' 
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

// Root endpoint - API info
app.get('/', (_req, res) => {
  res.json({
    name: 'Sniff Agency API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      monitoring: '/api/monitoring/*',
      stats: '/api/stats/*',
      tokens: '/api/tokens',
      wallets: '/api/wallets/*',
      websocket: 'ws://alpha.sniff.agency/ws'
    },
    frontend: 'https://cex-dev-monitor.vercel.app'
  });
});

// Initialize Trading WebSocket service
import('./services/TradingWebSocketService.js').then(({ getTradingWebSocketService }) => {
  const tradingWS = getTradingWebSocketService();
  tradingWS.initialize(io);
  console.log('📈 Trading WebSocket service initialized');
}).catch(err => {
  console.error('Failed to initialize Trading WebSocket:', err);
});

// Initialize Real-time OHLCV service
realtimeOHLCVService.initialize(io);
console.log('🚀 Real-time OHLCV service initialized');

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket available at ws://localhost:${PORT}/ws`);
  console.log(`📊 Socket.IO available for trading at http://localhost:${PORT}/trading`);
  
  // Initialize auth maintenance service (cleanup expired sessions/challenges every 30 mins)
  const authMaintenance = new AuthMaintenanceService();
  authMaintenance.start(30);
  console.log(`🔧 Auth maintenance service started`);
  
  // Restore all Telegram sessions from database
  try {
    await telegramClientService.restoreAllSessions();
    console.log(`📱 Telegram sessions restored`);
  } catch (error: any) {
    console.error(`❌ Failed to restore Telegram sessions:`, error.message);
  }
  
  // DISABLED auto-start - use manual controls
  console.log(`⏸️  Auto-start DISABLED - Use /api/monitoring/start to begin`);
  console.log(`   This preserves your proxy data!`);
});

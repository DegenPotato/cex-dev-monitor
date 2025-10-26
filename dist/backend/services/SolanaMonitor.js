import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { TransactionProvider } from '../providers/TransactionProvider.js';
import { MonitoredWalletProvider } from '../providers/MonitoredWalletProvider.js';
import { SourceWalletProvider } from '../providers/SourceWalletProvider.js';
import { WalletAnalyzer } from './WalletAnalyzer.js';
import { DevWalletAnalyzer } from './DevWalletAnalyzer.js';
import { ConfigProvider } from '../providers/ConfigProvider.js';
import { MarketCapTracker } from './MarketCapTracker.js';
import { RateLimitedConnection } from './RateLimitedConnection.js';
import { TokenMintProvider } from '../providers/TokenMintProvider.js';
import { globalAnalysisQueue } from './AnalysisQueue.js';
export class SolanaMonitor extends EventEmitter {
    constructor() {
        super();
        this.subscriptions = new Map();
        this.processingLock = new Set();
        this.recentlyProcessed = new Set();
        // Helius for real-time WebSocket monitoring (critical - no rate limit)
        this.connection = new Connection('https://mainnet.helius-rpc.com/?api-key=e589d712-ed13-493b-a523-1c4aa6e33e0b', 'confirmed');
        // Public RPC for batch operations with rate limiting
        this.batchConnection = new RateLimitedConnection('https://api.mainnet-beta.solana.com', { commitment: 'confirmed' });
        // Start with rate limiting disabled (will be enabled when proxies disabled)
        this.batchConnection.disableRateLimiting();
        this.thresholdSol = 1; // Default, will be updated from config
        this.maxThresholdSol = 6.9; // Default, will be updated from config
        this.walletAnalyzer = new WalletAnalyzer();
        this.devWalletAnalyzer = new DevWalletAnalyzer();
        this.marketCapTracker = new MarketCapTracker();
        // Setup analysis queue processor
        globalAnalysisQueue.setProcessor(async (analysis) => {
            await this.analyzeWalletAsync(analysis.walletAddress, analysis.source, analysis.amount);
        });
        // Load thresholds from config asynchronously
        ConfigProvider.get('threshold_sol').then(value => {
            if (value)
                this.thresholdSol = parseFloat(value);
        }).catch(console.error);
        ConfigProvider.get('max_threshold_sol').then(value => {
            if (value)
                this.maxThresholdSol = parseFloat(value);
        }).catch(console.error);
    }
    async startMonitoring(walletAddress) {
        if (this.subscriptions.has(walletAddress)) {
            console.log(`Already monitoring ${walletAddress}`);
            return;
        }
        try {
            const publicKey = new PublicKey(walletAddress);
            // Subscribe to account changes using WebSocket
            const subscriptionId = this.connection.onAccountChange(publicKey, async () => {
                // Prevent duplicate processing from rapid account changes
                if (this.processingLock.has(walletAddress)) {
                    console.log(`⏸️  [Real-time] Already processing ${walletAddress}, skipping...`);
                    return;
                }
                console.log(`⚡ [Real-time] Account change detected for ${walletAddress}`);
                this.processingLock.add(walletAddress);
                try {
                    await this.checkRecentTransactions(walletAddress, true); // Use Helius for real-time
                }
                finally {
                    // Release lock after 2 seconds to allow next batch
                    setTimeout(() => {
                        this.processingLock.delete(walletAddress);
                    }, 2000);
                }
            }, 'confirmed');
            this.subscriptions.set(walletAddress, subscriptionId);
            console.log(`✅ Started monitoring ${walletAddress}`);
            // Initial check for recent transactions (DISABLED FOR TESTING - only real-time)
            // await this.checkRecentTransactions(walletAddress);
            console.log(`⏭️  Skipping initial history check - waiting for real-time transactions...`);
            // NOTE: We do NOT add the CEX wallet to monitored_wallets table
            // The CEX wallet is only a SOURCE for discovering new wallets
            // Only recipient wallets get added to the monitored_wallets table
        }
        catch (error) {
            console.error(`Error monitoring ${walletAddress}:`, error);
            throw error;
        }
    }
    async stopMonitoring(walletAddress) {
        const subscriptionId = this.subscriptions.get(walletAddress);
        if (subscriptionId !== undefined) {
            await this.connection.removeAccountChangeListener(subscriptionId);
            this.subscriptions.delete(walletAddress);
            console.log(`⛔ Stopped monitoring ${walletAddress}`);
        }
    }
    async checkRecentTransactions(walletAddress, isRealTime = false) {
        try {
            const publicKey = new PublicKey(walletAddress);
            // Use Helius for real-time, public RPC for batch/historical
            const connection = isRealTime ? this.connection : this.batchConnection;
            const label = isRealTime ? '[Real-time]' : '[Batch]';
            console.log(`${label} Fetching recent transactions...`);
            const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 10 });
            for (const sigInfo of signatures) {
                // Check in-memory cache first (fast)
                if (this.recentlyProcessed.has(sigInfo.signature)) {
                    continue;
                }
                // Check if we already processed this transaction in database
                const existing = await TransactionProvider.findBySignature(sigInfo.signature);
                if (existing) {
                    this.recentlyProcessed.add(sigInfo.signature);
                    continue;
                }
                console.log(`${label} Processing new transaction: ${sigInfo.signature.slice(0, 8)}...`);
                const tx = await connection.getParsedTransaction(sigInfo.signature, {
                    maxSupportedTransactionVersion: 0
                });
                if (tx) {
                    await this.processTransaction(tx, walletAddress, sigInfo.signature);
                    this.recentlyProcessed.add(sigInfo.signature);
                    // Clean up cache after 5 minutes
                    setTimeout(() => {
                        this.recentlyProcessed.delete(sigInfo.signature);
                    }, 5 * 60 * 1000);
                }
            }
        }
        catch (error) {
            console.error(`Error checking transactions for ${walletAddress}:`, error);
        }
    }
    async processTransaction(tx, monitoredAddress, signature) {
        if (!tx.meta || tx.meta.err)
            return;
        const preBalances = tx.meta.preBalances;
        const postBalances = tx.meta.postBalances;
        const accountKeys = tx.transaction.message.accountKeys;
        // Find the monitored wallet's index
        const monitoredIndex = accountKeys.findIndex((key) => key.pubkey.toBase58() === monitoredAddress);
        if (monitoredIndex === -1)
            return;
        const balanceChange = (postBalances[monitoredIndex] - preBalances[monitoredIndex]) / LAMPORTS_PER_SOL;
        const amount = Math.abs(balanceChange);
        // We're interested in outgoing transactions (negative balance change)
        if (balanceChange >= -this.thresholdSol)
            return;
        // Filter out transactions above max threshold
        if (amount > this.maxThresholdSol) {
            console.log(`⏭️  Transaction ${signature.slice(0, 8)}... skipped: ${amount.toFixed(2)} SOL exceeds max threshold of ${this.maxThresholdSol} SOL`);
            return;
        }
        // Find recipient (the account with LARGEST positive balance change)
        let maxRecipient = null;
        console.log(`\n📊 Transaction ${signature.slice(0, 8)}... analysis:`);
        for (let i = 0; i < accountKeys.length; i++) {
            if (i === monitoredIndex)
                continue;
            const recipientChange = (postBalances[i] - preBalances[i]) / LAMPORTS_PER_SOL;
            const address = accountKeys[i].pubkey.toBase58();
            const isSigner = accountKeys[i].signer || false;
            console.log(`  Account ${i}: ${address.slice(0, 8)}... Change: ${recipientChange.toFixed(4)} SOL (Signer: ${isSigner})`);
            // Track the account with the largest positive change (actual recipient)
            if (recipientChange > 0.001) { // Minimum 0.001 SOL to avoid dust/fees
                if (!maxRecipient || recipientChange > maxRecipient.change) {
                    maxRecipient = { address, change: recipientChange };
                }
            }
        }
        if (maxRecipient) {
            const recipientAddress = maxRecipient.address;
            console.log(`🔔 Outgoing TX: ${maxRecipient.change.toFixed(4)} SOL → ${recipientAddress.slice(0, 8)}...`);
            try {
                await TransactionProvider.create({
                    signature,
                    from_address: monitoredAddress,
                    to_address: recipientAddress,
                    amount: maxRecipient.change,
                    timestamp: Date.now(),
                    block_time: tx.blockTime || undefined,
                    status: 'confirmed'
                });
                // Update source wallet stats
                await SourceWalletProvider.incrementStats(monitoredAddress, maxRecipient.change);
                this.emit('transaction', {
                    signature,
                    from: monitoredAddress,
                    to: recipientAddress,
                    amount: maxRecipient.change,
                    timestamp: Date.now()
                });
                console.log(`🔎 [Flow] Checking if wallet exists: ${recipientAddress.slice(0, 8)}...`);
                const existingWallet = await MonitoredWalletProvider.findByAddress(recipientAddress);
                if (!existingWallet) {
                    console.log(`🆕 [Flow] New wallet detected! Queuing analysis (non-blocking)...`);
                    await MonitoredWalletProvider.create({
                        address: recipientAddress,
                        source: monitoredAddress,
                        first_seen: Date.now(),
                        is_active: 1,
                        is_fresh: 0,
                        wallet_age_days: 0,
                        previous_tx_count: 0
                    });
                    console.log(`✅ [Flow] Wallet saved with pending analysis`);
                    this.emit('new_wallet', {
                        address: recipientAddress,
                        source: monitoredAddress,
                        amount: maxRecipient.change,
                        isFresh: false,
                        walletAgeDays: 0,
                        previousTxCount: 0
                    });
                    console.log(`➕ [Summary] New wallet: ${recipientAddress.slice(0, 8)}... ⏳ ANALYZING (queued)`);
                    // Add to analysis queue instead of running in parallel
                    globalAnalysisQueue.enqueue(recipientAddress, monitoredAddress, maxRecipient.change);
                }
                else {
                    console.log(`✓ [Flow] Wallet already exists in database, skipping...`);
                }
            }
            catch (error) {
                if (!error.message?.includes('UNIQUE constraint failed')) {
                    console.error('Error saving transaction:', error);
                }
            }
        }
        else {
            console.log(`⚠️  No valid recipient found (no account with positive change >= 0.001 SOL)`);
        }
    }
    async analyzeWalletAsync(walletAddress, source, amount) {
        try {
            console.log(`🔬 [Background] Starting analysis for ${walletAddress.slice(0, 8)}...`);
            // Analyze wallet (rate-limited, queued)
            const analysis = await this.walletAnalyzer.analyzeWallet(walletAddress);
            // Update wallet in database
            await MonitoredWalletProvider.update(walletAddress, {
                is_fresh: analysis.isFresh ? 1 : 0,
                wallet_age_days: analysis.walletAgeDays,
                previous_tx_count: analysis.previousTxCount
            });
            // Broadcast updated wallet info
            this.emit('wallet_analyzed', {
                address: walletAddress,
                source,
                amount,
                isFresh: analysis.isFresh,
                walletAgeDays: analysis.walletAgeDays,
                previousTxCount: analysis.previousTxCount
            });
            const freshFlag = analysis.isFresh ? '🆕 FRESH' : '📦 ESTABLISHED';
            console.log(`✅ [Background] Analysis complete: ${walletAddress.slice(0, 8)}... ${freshFlag} (Age: ${analysis.walletAgeDays}d, TXs: ${analysis.previousTxCount})`);
            // After wallet analysis, check for dev history (run separately to avoid blocking)
            this.checkDevHistoryAsync(walletAddress).catch((err) => {
                console.error(`Error checking dev history for ${walletAddress}:`, err);
            });
        }
        catch (error) {
            console.error(`❌ [Background] Analysis failed for ${walletAddress}:`, error);
        }
    }
    async checkDevHistoryAsync(walletAddress) {
        try {
            console.log(`🔎 [DevCheck] Starting dev history check for ${walletAddress.slice(0, 8)}...`);
            // Analyze dev history
            const devAnalysis = await this.devWalletAnalyzer.analyzeDevHistory(walletAddress);
            // Update wallet in database
            await MonitoredWalletProvider.update(walletAddress, {
                is_dev_wallet: devAnalysis.isDevWallet ? 1 : 0,
                tokens_deployed: devAnalysis.tokensDeployed,
                dev_checked: 1
            });
            // If dev wallet, save all discovered token mints
            if (devAnalysis.isDevWallet && devAnalysis.deployments.length > 0) {
                console.log(`🔥 [DevCheck] DEV WALLET FOUND! ${devAnalysis.tokensDeployed} tokens deployed`);
                for (const deployment of devAnalysis.deployments) {
                    // Check if mint already exists
                    const existing = await TokenMintProvider.findByMintAddress(deployment.mintAddress);
                    if (!existing) {
                        // Fetch market cap data
                        const marketData = await this.marketCapTracker.getTokenMarketData(deployment.mintAddress);
                        await TokenMintProvider.create({
                            mint_address: deployment.mintAddress,
                            creator_address: walletAddress,
                            timestamp: deployment.timestamp,
                            platform: 'pumpfun',
                            signature: deployment.signature, // Store transaction signature
                            starting_mcap: marketData?.currentMcap,
                            current_mcap: marketData?.currentMcap,
                            ath_mcap: marketData?.athMcap,
                            last_updated: Date.now()
                        });
                        console.log(`   💎 Saved token: ${deployment.mintAddress.slice(0, 16)}... (MCap: $${marketData?.currentMcap ? (marketData.currentMcap / 1000).toFixed(1) + 'K' : 'N/A'})`);
                    }
                }
                // Broadcast dev wallet discovery
                this.emit('dev_wallet_found', {
                    address: walletAddress,
                    tokensDeployed: devAnalysis.tokensDeployed,
                    deployments: devAnalysis.deployments
                });
            }
            console.log(`✅ [DevCheck] Complete: ${walletAddress.slice(0, 8)}... (Dev: ${devAnalysis.isDevWallet ? 'YES' : 'NO'})`);
        }
        catch (error) {
            console.error(`❌ [DevCheck] Failed for ${walletAddress}:`, error);
        }
    }
    stopAll() {
        console.log(`⏹️  Stopping all monitoring subscriptions...`);
        this.subscriptions.forEach((subscriptionId, walletAddress) => {
            try {
                this.connection.removeAccountChangeListener(subscriptionId);
                console.log(`  ❌ Stopped monitoring ${walletAddress}`);
            }
            catch (error) {
                console.error(`  ⚠️  Error stopping ${walletAddress}:`, error);
            }
        });
        this.subscriptions.clear();
        console.log(`✅ All monitoring stopped`);
    }
    updateThreshold(newThreshold) {
        this.thresholdSol = newThreshold;
        ConfigProvider.set('threshold_sol', newThreshold.toString()).catch(console.error);
        console.log(`📊 Min threshold updated to ${newThreshold} SOL`);
    }
    updateMaxThreshold(newMaxThreshold) {
        this.maxThresholdSol = newMaxThreshold;
        ConfigProvider.set('max_threshold_sol', newMaxThreshold.toString()).catch(console.error);
        console.log(`📊 Max threshold updated to ${newMaxThreshold} SOL`);
    }
    getActiveSubscriptions() {
        return Array.from(this.subscriptions.keys());
    }
    getWalletAnalyzer() {
        return this.walletAnalyzer;
    }
    getDevWalletAnalyzer() {
        return this.devWalletAnalyzer;
    }
    /**
     * Enable rate limiting on batch connection
     */
    enableRateLimiting() {
        this.batchConnection.enableRateLimiting();
        console.log('🚦 [SolanaMonitor] Rate limiting ENABLED for batch connection');
    }
    /**
     * Disable rate limiting on batch connection
     */
    disableRateLimiting() {
        this.batchConnection.disableRateLimiting();
        console.log('🚦 [SolanaMonitor] Rate limiting DISABLED for batch connection');
    }
}

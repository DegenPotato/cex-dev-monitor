/**
 * Trading WebSocket Service
 * Real-time portfolio updates, price feeds, and trade notifications
 */

import { Server } from 'socket.io';
import { queryAll, queryOne } from '../database/helpers.js';
import { getWalletManager } from '../core/wallet.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { solPriceOracle } from './SolPriceOracle.js';
import { tokenPriceOracle } from './TokenPriceOracle.js';

interface PortfolioUpdate {
  type: 'portfolio_update';
  userId: number;
  data: {
    totalValueUSD: number;
    totalSOL: number;
    solPrice?: number;
    wallets: any[];
    topTokens: any[];
    profitLoss: number;
    profitLossPercent: number;
  };
}

interface WalletUpdate {
  type: 'wallet_update';
  userId: number;
  walletId: number;
  data: {
    balance: number;
    tokens: any[];
    totalValue: number;
  };
}

interface TradeUpdate {
  type: 'trade_update';
  userId: number;
  data: {
    status: 'pending' | 'success' | 'failed';
    signature?: string;
    message: string;
    trade: any;
  };
}

interface PriceUpdate {
  type: 'price_update';
  data: {
    sol: number;
    tokens: Record<string, number>;
  };
}

class TradingWebSocketService {
  private io: Server | null = null;
  private userConnections: Map<number, Set<string>> = new Map();
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private portfolioUpdateInterval: NodeJS.Timeout | null = null;
  private connection: Connection;
  private tokenPrices: Map<string, number> = new Map();

  constructor() {
    // Initialize Solana connection
    const rpcUrl = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  initialize(io: Server) {
    this.io = io;
    
    // Set up namespace for trading
    const tradingNamespace = io.of('/trading');
    
    tradingNamespace.on('connection', (socket) => {
      console.log('📈 Trading WebSocket client connected:', socket.id);
      
      // Handle authentication
      socket.on('auth', async (data) => {
        const { userId } = data;
        if (!userId) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }
        
        // Track user connection
        if (!this.userConnections.has(userId)) {
          this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId)!.add(socket.id);
        
        // Join user room for targeted updates
        socket.join(`user_${userId}`);
        
        // Send initial portfolio data
        await this.sendPortfolioUpdate(userId);
        
        // Subscribe to real-time updates for user's wallets
        await this.subscribeToWalletUpdates(userId, socket);
      });
      
      // Handle wallet balance refresh request
      socket.on('refresh_wallet', async (data) => {
        const { userId, walletId } = data;
        if (userId && walletId) {
          await this.refreshWalletBalance(userId, walletId);
        }
      });
      
      // Handle portfolio refresh request
      socket.on('refresh_portfolio', async (data) => {
        const { userId } = data;
        if (userId) {
          await this.sendPortfolioUpdate(userId);
        }
      });
      
      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('📉 Trading WebSocket client disconnected:', socket.id);
        
        // Clean up user connections
        for (const [userId, connections] of this.userConnections.entries()) {
          if (connections.has(socket.id)) {
            connections.delete(socket.id);
            if (connections.size === 0) {
              this.userConnections.delete(userId);
            }
            break;
          }
        }
      });
    });
    
    // Start price update service
    this.startPriceUpdates();
    
    // Start portfolio update service
    this.startPortfolioUpdates();
  }
  
  /**
   * Start real-time price updates
   */
  private async startPriceUpdates() {
    // Broadcast price updates to clients every 10 seconds
    const updatePrices = async () => {
      try {
        // SOL price is managed by solPriceOracle
        // Broadcast price update to all connected clients
        const update: PriceUpdate = {
          type: 'price_update',
          data: {
            sol: solPriceOracle.getPrice(),
            tokens: Object.fromEntries(this.tokenPrices)
          }
        };
        
        this.io?.of('/trading').emit('price_update', update);
      } catch (error) {
        console.error('Error broadcasting price update:', error);
      }
    };
    
    // Initial update
    await updatePrices();
    
    // Schedule updates
    this.priceUpdateInterval = setInterval(updatePrices, 10000);
  }
  
  /**
   * Start portfolio updates for all connected users
   */
  private startPortfolioUpdates() {
    // Update portfolios every 30 seconds
    this.portfolioUpdateInterval = setInterval(async () => {
      for (const userId of this.userConnections.keys()) {
        await this.sendPortfolioUpdate(userId);
      }
    }, 30000);
  }
  
  /**
   * Send portfolio update to specific user
   */
  async sendPortfolioUpdate(userId: number) {
    try {
      const walletManager = getWalletManager();
      const wallets = await walletManager.getUserWallets(userId);
      
      // Calculate total SOL balance
      const totalSOL = wallets.reduce((sum: number, w: any) => sum + (w.solBalance || 0), 0);
      
      // Get token holdings
      let holdings: any[] = [];
      if (wallets.length > 0) {
        const walletIds = wallets.map((w: any) => w.id);
        const placeholders = walletIds.map(() => '?').join(',');
        
        try {
          holdings = await queryAll(`
            SELECT 
              token_mint,
              token_symbol,
              token_name,
              SUM(token_amount) as total_amount,
              AVG(price_usd) as avg_price,
              SUM(total_value_usd) as total_value
            FROM wallet_token_holdings
            WHERE wallet_id IN (${placeholders})
            GROUP BY token_mint, token_symbol, token_name
            ORDER BY total_value DESC
            LIMIT 10
          `, walletIds);
          
          // Fetch real-time token prices
          if (holdings.length > 0) {
            const mintAddresses = holdings.map(h => h.token_mint);
            const tokenPrices = await tokenPriceOracle.getTokenPrices(mintAddresses);
            
            // Update holdings with real prices
            holdings = holdings.map(h => {
              const price = tokenPrices.get(h.token_mint);
              if (price) {
                return {
                  ...h,
                  avg_price: price.priceUsd,
                  total_value: h.total_amount * price.priceUsd,
                  price_change_24h: price.priceChange24h
                };
              }
              return h;
            });
          }
        } catch (e) {
          holdings = [];
        }
      }
      
      // Calculate total value
      const totalTokenValue = holdings.reduce((sum: number, h: any) => sum + (h.total_value || 0), 0);
      const totalValueUSD = (totalSOL * solPriceOracle.getPrice()) + totalTokenValue;
      
      // Calculate P&L
      let profitLoss = 0;
      let profitLossPercent = 0;
      
      try {
        const trades = await queryAll(`
          SELECT 
            tx_type,
            amount_in,
            amount_out
          FROM trading_transactions
          WHERE user_id = ? AND status = 'completed'
          ORDER BY created_at DESC
          LIMIT 100
        `, [userId]);
        
        const buyTotal = trades
          .filter((t: any) => t.tx_type === 'buy')
          .reduce((sum: number, t: any) => sum + (t.amount_in || 0), 0);
        
        const sellTotal = trades
          .filter((t: any) => t.tx_type === 'sell')
          .reduce((sum: number, t: any) => sum + (t.amount_out || 0), 0);
        
        if (buyTotal > 0) {
          profitLoss = sellTotal - buyTotal;
          profitLossPercent = (profitLoss / buyTotal) * 100;
        }
      } catch (e) {
        // No trades yet
      }
      
      const update: PortfolioUpdate = {
        type: 'portfolio_update',
        userId,
        data: {
          totalValueUSD,
          totalSOL,
          solPrice: solPriceOracle.getPrice(),
          wallets: wallets.map((w: any) => ({
            id: w.id,
            name: w.walletName,
            address: w.walletAddress,
            balance: w.solBalance,
            isDefault: w.isDefault
          })),
          topTokens: holdings.map((h: any) => ({
            symbol: h.token_symbol,
            name: h.token_name,
            amount: h.total_amount,
            value: h.total_value,
            price: h.avg_price
          })),
          profitLoss,
          profitLossPercent
        }
      };
      
      // Send to user's room
      this.io?.of('/trading').to(`user_${userId}`).emit('portfolio_update', update);
      
    } catch (error) {
      console.error('Error sending portfolio update:', error);
    }
  }
  
  /**
   * Subscribe to wallet balance updates
   */
  private async subscribeToWalletUpdates(userId: number, socket: any) {
    try {
      const walletManager = getWalletManager();
      const wallets = await walletManager.getUserWallets(userId);
      
      // Set up account change listeners for each wallet
      for (const wallet of wallets) {
        try {
          const pubkey = new PublicKey(wallet.walletAddress);
          
          // Subscribe to account changes
          const subscriptionId = this.connection.onAccountChange(
            pubkey,
            async (accountInfo) => {
              // Calculate new balance
              const newBalance = accountInfo.lamports / 1e9;
              
              // Update database
              await walletManager.updateBalance(wallet.id);
              
              // Send update to user
              const update: WalletUpdate = {
                type: 'wallet_update',
                userId,
                walletId: wallet.id,
                data: {
                  balance: newBalance,
                  tokens: [], // TODO: Fetch token balances
                  totalValue: newBalance * solPriceOracle.getPrice()
                }
              };
              
              socket.emit('wallet_update', update);
            }
          );
          
          // Store subscription for cleanup
          socket.on('disconnect', () => {
            this.connection.removeAccountChangeListener(subscriptionId);
          });
          
        } catch (error) {
          console.error(`Error subscribing to wallet ${wallet.walletAddress}:`, error);
        }
      }
    } catch (error) {
      console.error('Error subscribing to wallet updates:', error);
    }
  }
  
  /**
   * Refresh wallet balance manually
   */
  private async refreshWalletBalance(userId: number, walletId: number) {
    try {
      const walletManager = getWalletManager();
      
      // Verify ownership
      const wallet = await queryOne(
        'SELECT * FROM trading_wallets WHERE id = ? AND user_id = ? AND is_deleted = 0',
        [walletId, userId]
      );
      
      if (!wallet) return;
      
      // Update balance
      const newBalance = await walletManager.updateBalance(walletId);
      
      // Fetch tokens (TODO: Implement token fetching)
      const tokens: any[] = [];
      
      // Send update
      const update: WalletUpdate = {
        type: 'wallet_update',
        userId,
        walletId,
        data: {
          balance: newBalance,
          tokens,
          totalValue: newBalance * solPriceOracle.getPrice()
        }
      };
      
      this.io?.of('/trading').to(`user_${userId}`).emit('wallet_update', update);
      
    } catch (error) {
      console.error('Error refreshing wallet balance:', error);
    }
  }
  
  /**
   * Send trade notification
   */
  async sendTradeUpdate(userId: number, trade: any, status: 'pending' | 'success' | 'failed', message: string) {
    const update: TradeUpdate = {
      type: 'trade_update',
      userId,
      data: {
        status,
        signature: trade.signature,
        message,
        trade: {
          id: trade.id,
          type: trade.txType,
          token: trade.tokenSymbol,
          amount: trade.amountIn || trade.amountOut,
          price: trade.pricePerToken,
          timestamp: trade.createdAt
        }
      }
    };
    
    this.io?.of('/trading').to(`user_${userId}`).emit('trade_update', update);
  }
  
  /**
   * Get current SOL price
   */
  getSolPrice(): number {
    return solPriceOracle.getPrice();
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    if (this.portfolioUpdateInterval) {
      clearInterval(this.portfolioUpdateInterval);
    }
  }
}

// Singleton instance
let instance: TradingWebSocketService | null = null;

export function getTradingWebSocketService(): TradingWebSocketService {
  if (!instance) {
    instance = new TradingWebSocketService();
  }
  return instance;
}

export default TradingWebSocketService;

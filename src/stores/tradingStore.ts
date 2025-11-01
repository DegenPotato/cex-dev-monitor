import { create } from 'zustand';
import { config } from '../config';
import io, { Socket } from 'socket.io-client';

const API_BASE_URL = config.apiUrl;

interface Wallet {
  id: string;
  name: string;
  publicKey: string;
  privateKey?: string;
  encrypted: boolean;
  balance?: number;
  tokens?: TokenBalance[];
  totalValueUSD?: number;
  isDefault?: boolean;
  createdAt: string;
}

interface TokenBalance {
  mint: string;
  symbol?: string;
  name?: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  priceUSD?: number;
  valueUSD?: number;
  change24h?: number;
  logoUri?: string;
}

interface TradeParams {
  walletId: string;
  type: 'buy' | 'sell';
  tokenAddress: string;
  amount: number;
  slippage?: number;
  skipTax?: boolean;
  priorityFee?: number;
}

interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  taxAmount?: number;
  netAmount?: number;
}

interface TradeHistory {
  id: string;
  walletName: string;
  walletAddress: string;
  type: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol?: string;
  amount: number;
  taxAmount?: number;
  netAmount?: number;
  signature?: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: Date;
  pricePerToken?: number;
  totalCost?: number;
  profitLoss?: number;
}

interface PortfolioStats {
  totalValueUSD: number;
  totalSOL: number;
  totalTokens: number;
  walletCount: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  solPrice?: number;
  topGainer?: TokenBalance;
  topLoser?: TokenBalance;
}

interface TradingStore {
  // State
  wallets: Wallet[];
  selectedWallet: string | null;
  portfolioStats: PortfolioStats | null;
  tradeHistory: TradeHistory[];
  loading: boolean;
  error: string | null;
  socket: Socket | null;
  connected: boolean;
  
  // Actions
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  fetchWallets: () => Promise<void>;
  fetchWalletTokens: (walletId: string) => Promise<void>;
  fetchPortfolioStats: () => Promise<void>;
  fetchTradeHistory: () => Promise<void>;
  createWallet: (name?: string) => Promise<void>;
  importWallet: (privateKey: string, name?: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  selectWallet: (walletId: string) => void;
  executeTrade: (params: TradeParams) => Promise<TradeResult>;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  // Initial state
  wallets: [],
  selectedWallet: null,
  tradeHistory: [],
  portfolioStats: null,
  loading: false,
  error: null,
  socket: null,
  connected: false,

  // WebSocket connection management
  connectWebSocket: () => {
    // Connect to the /trading namespace
    // Socket.IO expects: io(baseURL, { path: '/socket.io' }) + namespace
    const socket = io(`${API_BASE_URL}/trading`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      path: '/socket.io',  // Explicitly set the Socket.IO path
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    // Get user ID from auth context (you'll need to pass this)
    const userId = (window as any).currentUserId || localStorage.getItem('userId');
    
    socket.on('connect', () => {
      console.log('📈 Trading WebSocket connected');
      set({ connected: true });
      
      // Authenticate with user ID
      socket.emit('auth', { userId });
    });
    
    socket.on('disconnect', () => {
      console.log('📉 Trading WebSocket disconnected');
      set({ connected: false });
    });
    
    // Handle portfolio updates
    socket.on('portfolio_update', (data: any) => {
      set((state) => ({
        portfolioStats: {
          totalValueUSD: data.data.totalValueUSD,
          totalSOL: data.data.totalSOL,
          totalTokens: data.data.topTokens.length,
          walletCount: data.data.wallets.length,
          totalPnL: data.data.profitLoss,
          totalPnLPercent: data.data.profitLossPercent,
          dayChange: 0,
          dayChangePercent: 0,
          solPrice: data.data.solPrice
        },
        wallets: state.wallets.map(w => {
          const updatedWallet = data.data.wallets.find((uw: any) => uw.id === w.id);
          return updatedWallet ? { ...w, balance: updatedWallet.balance } : w;
        })
      }));
    });
    
    // Handle wallet updates
    socket.on('wallet_update', (data: any) => {
      set((state) => ({
        wallets: state.wallets.map(w => 
          w.id === String(data.walletId) 
            ? { ...w, balance: data.data.balance, tokens: data.data.tokens }
            : w
        )
      }));
    });
    
    // Handle trade updates
    socket.on('trade_update', (data: any) => {
      if (data.data.status === 'success') {
        // Refresh wallets and portfolio after successful trade
        get().fetchWallets();
        get().fetchPortfolioStats();
      }
    });
    
    // Handle price updates
    socket.on('price_update', (data: any) => {
      // Update SOL price in portfolio stats
      set((state) => ({
        portfolioStats: state.portfolioStats ? {
          ...state.portfolioStats,
          solPrice: data.data.sol,
          // Recalculate total value with new SOL price
          totalValueUSD: (state.portfolioStats.totalSOL * data.data.sol) + 
            state.wallets.reduce((sum, w) => 
              sum + (w.tokens?.reduce((tSum, t) => tSum + (t.valueUSD || 0), 0) || 0), 0
            )
        } : null
      }));
    });
    
    set({ socket });
  },

  disconnectWebSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  // Fetch all wallets
  fetchWallets: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/wallets`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch wallets');
      
      const data = await response.json();
      const wallets = data.wallets || [];
      
      // Fetch token balances for each wallet
      for (const wallet of wallets) {
        await get().fetchWalletTokens(wallet.id);
      }
      
      set({ wallets, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  // Fetch token balances for a wallet
  fetchWalletTokens: async (walletId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/wallets/${walletId}/tokens`, {
        credentials: 'include'
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      set(state => ({
        wallets: state.wallets.map(w => 
          w.id === walletId 
            ? { 
                ...w, 
                tokens: data.tokens || [],
                balance: data.solBalance || 0,
                totalValueUSD: data.totalValueUSD || 0
              }
            : w
        )
      }));
    } catch (error) {
      console.error('Failed to fetch wallet tokens:', error);
    }
  },

  // Create new wallet
  createWallet: async (name?: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/wallets/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ walletName: name })
      });
      
      if (!response.ok) throw new Error('Failed to create wallet');
      
      await get().fetchWallets();
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  // Import existing wallet
  importWallet: async (privateKey: string, name?: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/wallets/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ privateKey, walletName: name })
      });
      
      if (!response.ok) throw new Error('Failed to import wallet');
      
      await get().fetchWallets();
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  // Delete wallet
  deleteWallet: async (walletId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/wallets/${walletId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to delete wallet');
      
      set(state => ({
        wallets: state.wallets.filter(w => w.id !== walletId),
        selectedWallet: state.selectedWallet === walletId ? null : state.selectedWallet,
        loading: false
      }));
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  // Select wallet
  selectWallet: (walletId: string) => {
    set(state => ({
      selectedWallet: state.wallets.find(w => w.id === walletId) ? walletId : null
    }));
  },

  // Execute trade
  executeTrade: async (params: TradeParams) => {
    set({ loading: true, error: null });
    try {
      const endpoint = params.type === 'buy' ? 'buy' : 'sell';
      const response = await fetch(`${API_BASE_URL}/api/trading/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || `Failed to ${params.type} token`);
      }
      
      // Refresh wallet data after trade
      await get().fetchWallets();
      await get().fetchTradeHistory();
      
      set({ loading: false });
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Fetch trade history
  fetchTradeHistory: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/history`, {
        credentials: 'include'
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      set({ tradeHistory: data.trades || [] });
    } catch (error) {
      console.error('Failed to fetch trade history:', error);
    }
  },

  // Fetch portfolio statistics
  fetchPortfolioStats: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/portfolio/stats`, {
        credentials: 'include'
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      set({ portfolioStats: data });
    } catch (error) {
      console.error('Failed to fetch portfolio stats:', error);
    }
  },

  // Refresh all data
  refreshAllData: async () => {
    await Promise.all([
      get().fetchWallets(),
      get().fetchTradeHistory(),
      get().fetchPortfolioStats()
    ]);
  }
}));

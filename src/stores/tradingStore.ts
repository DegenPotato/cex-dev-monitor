import { create } from 'zustand';
import { config } from '../config';
import { useTradingSettingsStore } from './tradingSettingsStore';

const API_BASE_URL = config.apiUrl;
const WS_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '');

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
  tokenName?: string;
  amount: number;
  amountOut?: number;  // SOL received for sells, tokens received for buys
  taxAmount?: number;
  netAmount?: number;
  fee?: number;  // Network/priority fees
  totalFee?: number;  // All fees combined
  tokenPriceUsd?: number;
  solPriceUsd?: number;
  totalValueUsd?: number;
  priceImpact?: number;
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
  socket: WebSocket | null;
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
    // Connect to native WebSocket with trading type parameter
    const socket = new WebSocket(`${WS_URL}/ws?type=trading`);
    
    // Get user ID from auth context
    const userId = (window as any).currentUserId || localStorage.getItem('userId');
    
    socket.onopen = () => {
      console.log('📈 Trading WebSocket connected');
      set({ connected: true, socket });
      
      // Authenticate with user ID
      socket.send(JSON.stringify({ type: 'auth', userId }));
    };
    
    socket.onclose = () => {
      console.log('📉 Trading WebSocket disconnected');
      set({ connected: false, socket: null });
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      set({ error: 'WebSocket connection failed', connected: false });
    };
    
    // Handle incoming messages
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'portfolio_update') {
          set((state) => ({
            portfolioStats: {
              totalValueUSD: message.data.totalValueUSD,
              totalSOL: message.data.totalSOL,
              totalTokens: message.data.topTokens.length,
              walletCount: message.data.wallets.length,
              totalPnL: message.data.profitLoss,
              totalPnLPercent: message.data.profitLossPercent,
              dayChange: 0,
              dayChangePercent: 0,
              solPrice: message.data.solPrice
            },
            wallets: state.wallets.map(w => {
              const updatedWallet = message.data.wallets.find((uw: any) => uw.id === w.id);
              return updatedWallet ? { ...w, balance: updatedWallet.balance } : w;
            })
          }));
        }
        
        if (message.type === 'wallet_update') {
          set((state) => ({
            wallets: state.wallets.map(w => 
              w.id === message.walletId 
                ? { ...w, balance: message.data.balance, tokens: message.data.tokens }
                : w
            )
          }));
        }
        
        if (message.type === 'trade_update') {
          console.log('Trade update:', message.data);
        }
        
        if (message.type === 'price_update') {
          set((state) => ({
            portfolioStats: state.portfolioStats 
              ? { ...state.portfolioStats, solPrice: message.data.sol }
              : null
          }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  },

  disconnectWebSocket: () => {
    const { socket } = get();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
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
      
      // Fetch token balances and SOL balance for each wallet
      for (const wallet of wallets) {
        // Fetch SOL balance from chain
        try {
          const balanceResponse = await fetch(`${API_BASE_URL}/api/trading/wallets/${wallet.id}/balance`, {
            credentials: 'include'
          });
          if (balanceResponse.ok) {
            const { balance } = await balanceResponse.json();
            wallet.balance = balance;
          }
        } catch (e) {
          console.error(`Failed to fetch balance for wallet ${wallet.id}:`, e);
        }
        
        // Fetch token balances
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
      // Get commitment level from settings
      const commitmentLevel = useTradingSettingsStore.getState().commitmentLevel;
      
      const endpoint = params.type === 'buy' ? 'buy' : 'sell';
      const response = await fetch(`${API_BASE_URL}/api/trading/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...params, commitmentLevel })
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
      console.log('[TradingStore] Fetching trade history...');
      const response = await fetch(`${API_BASE_URL}/api/trading/history`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.error('[TradingStore] Failed to fetch trade history:', response.status);
        return;
      }
      
      const data = await response.json();
      console.log('[TradingStore] Trade history response:', data.trades?.length || 0, 'trades');
      
      if (data.success && data.trades) {
        set({ tradeHistory: data.trades });
      }
    } catch (error) {
      console.error('[TradingStore] Error fetching trade history:', error);
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
      set({ portfolioStats: data.stats || data });
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

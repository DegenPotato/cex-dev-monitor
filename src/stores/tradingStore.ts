import { create } from 'zustand';
import { config } from '../config';

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
  totalPnL: number;
  totalPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  topGainer?: TokenBalance;
  topLoser?: TokenBalance;
}

interface TradingStore {
  // State
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  tradeHistory: TradeHistory[];
  portfolioStats: PortfolioStats | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchWallets: () => Promise<void>;
  fetchWalletTokens: (walletId: string) => Promise<void>;
  createWallet: (name: string) => Promise<void>;
  importWallet: (name: string, privateKey: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  selectWallet: (walletId: string) => void;
  
  // Trading
  executeTrade: (params: TradeParams) => Promise<TradeResult>;
  fetchTradeHistory: () => Promise<void>;
  
  // Portfolio
  fetchPortfolioStats: () => Promise<void>;
  refreshAllData: () => Promise<void>;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  // Initial state
  wallets: [],
  selectedWallet: null,
  tradeHistory: [],
  portfolioStats: null,
  loading: false,
  error: null,

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
  createWallet: async (name: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/wallets/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      });
      
      if (!response.ok) throw new Error('Failed to create wallet');
      
      await get().fetchWallets();
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  // Import existing wallet
  importWallet: async (name: string, privateKey: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading/wallets/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, privateKey })
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
        selectedWallet: state.selectedWallet?.id === walletId ? null : state.selectedWallet,
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
      selectedWallet: state.wallets.find(w => w.id === walletId) || null
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

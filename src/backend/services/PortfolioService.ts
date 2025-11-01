import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';
import { tokenPriceOracle } from './TokenPriceOracle.js';
import { solPriceOracle } from './SolPriceOracle.js';
import { queryOne, queryAll } from '../database/helpers.js';

export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  logoUri?: string;
  amount: number;
  uiAmount: number;
  decimals: number;
  priceUSD: number;
  valueUSD: number;
  change24h?: number;
}

export interface WalletPortfolio {
  walletId: number;
  walletName: string;
  publicKey: string;
  solBalance: number;
  solValueUSD: number;
  tokens: TokenHolding[];
  totalValueUSD: number;
  totalTokenValueUSD: number;
}

export interface PortfolioStats {
  totalValueUSD: number;
  totalSOL: number;
  solPrice: number;
  totalTokenValueUSD: number;
  totalTokens: number;
  walletCount: number;
  dayChangePercent?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
  topGainer?: { symbol: string; change24h: number };
  topLoser?: { symbol: string; change24h: number };
}

class PortfolioService {
  private connection: Connection;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Fetch all token holdings for a wallet from Solana RPC
   */
  async getWalletTokenHoldings(publicKeyStr: string): Promise<TokenHolding[]> {
    const cacheKey = `holdings:${publicKeyStr}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const publicKey = new PublicKey(publicKeyStr);
      
      // Get all token accounts
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      });

      // Extract all token data first
      const tokenData: Array<{
        mint: string;
        amount: number;
        decimals: number;
        uiAmount: number;
      }> = [];

      for (const { account } of tokenAccounts.value) {
        const parsedData = account.data as ParsedAccountData;
        const info = parsedData.parsed.info;
        
        const uiAmount = parseFloat(info.tokenAmount.uiAmountString);
        
        // Skip if amount is zero
        if (uiAmount === 0) continue;

        tokenData.push({
          mint: info.mint,
          amount: parseFloat(info.tokenAmount.amount),
          decimals: info.tokenAmount.decimals,
          uiAmount
        });
      }

      // Batch fetch all token prices at once (efficient!)
      const mintAddresses = tokenData.map(t => t.mint);
      const prices = await tokenPriceOracle.getTokenPrices(mintAddresses);

      // Combine token data with prices
      const holdings: TokenHolding[] = tokenData.map(token => {
        const tokenPrice = prices.get(token.mint);
        const priceUSD = tokenPrice?.priceUsd || 0;
        const valueUSD = token.uiAmount * priceUSD;

        return {
          mint: token.mint,
          symbol: tokenPrice?.symbol || token.mint.substring(0, 8),
          name: tokenPrice?.name || 'Unknown Token',
          logoUri: tokenPrice?.imageUrl,
          amount: token.amount,
          uiAmount: token.uiAmount,
          decimals: token.decimals,
          priceUSD,
          valueUSD,
          change24h: tokenPrice?.priceChange24h
        };
      });

      // Sort by value descending
      holdings.sort((a, b) => b.valueUSD - a.valueUSD);

      this.cache.set(cacheKey, { data: holdings, timestamp: Date.now() });
      return holdings;
    } catch (error) {
      console.error(`Error fetching token holdings for ${publicKeyStr}:`, error);
      return [];
    }
  }

  /**
   * Get comprehensive portfolio for a single wallet
   */
  async getWalletPortfolio(walletId: number, userId: number): Promise<WalletPortfolio | null> {
    try {
      // Get wallet from database
      const wallet = await queryOne(
        'SELECT id, wallet_name, public_key, sol_balance FROM trading_wallets WHERE id = ? AND user_id = ? AND is_deleted = 0',
        [walletId, userId]
      ) as any;

      if (!wallet) {
        return null;
      }

      // Get SOL balance
      const publicKey = new PublicKey(wallet.public_key);
      const solBalance = await this.connection.getBalance(publicKey) / 1e9;
      const solPrice = solPriceOracle.getPrice();
      const solValueUSD = solBalance * solPrice;

      // Get token holdings
      const tokens = await this.getWalletTokenHoldings(wallet.public_key);
      const totalTokenValueUSD = tokens.reduce((sum, t) => sum + t.valueUSD, 0);
      const totalValueUSD = solValueUSD + totalTokenValueUSD;

      return {
        walletId: wallet.id,
        walletName: wallet.wallet_name || `Wallet ${wallet.id}`,
        publicKey: wallet.public_key,
        solBalance,
        solValueUSD,
        tokens,
        totalValueUSD,
        totalTokenValueUSD
      };
    } catch (error) {
      console.error(`Error fetching wallet portfolio for wallet ${walletId}:`, error);
      return null;
    }
  }

  /**
   * Get comprehensive portfolio stats across all user wallets
   */
  async getUserPortfolioStats(userId: number): Promise<PortfolioStats> {
    try {
      // Get all user wallets
      const wallets = await queryAll(
        'SELECT id, wallet_name, public_key FROM trading_wallets WHERE user_id = ? AND is_deleted = 0',
        [userId]
      ) as any[];

      if (!wallets || wallets.length === 0) {
        return {
          totalValueUSD: 0,
          totalSOL: 0,
          solPrice: solPriceOracle.getPrice(),
          totalTokenValueUSD: 0,
          totalTokens: 0,
          walletCount: 0
        };
      }

      // Fetch portfolio for each wallet in parallel
      const portfolios = await Promise.all(
        wallets.map(w => this.getWalletPortfolio(w.id, userId))
      );

      const validPortfolios = portfolios.filter(p => p !== null) as WalletPortfolio[];

      // Aggregate stats
      const totalSOL = validPortfolios.reduce((sum, p) => sum + p.solBalance, 0);
      const totalTokenValueUSD = validPortfolios.reduce((sum, p) => sum + p.totalTokenValueUSD, 0);
      const solPrice = solPriceOracle.getPrice();
      const totalValueUSD = (totalSOL * solPrice) + totalTokenValueUSD;

      // Collect all tokens across wallets
      const allTokens: TokenHolding[] = [];
      for (const portfolio of validPortfolios) {
        allTokens.push(...portfolio.tokens);
      }

      // Find top gainer and loser
      const tokensWithChange = allTokens.filter(t => t.change24h !== undefined);
      const topGainer = tokensWithChange.length > 0
        ? tokensWithChange.reduce((max, t) => (t.change24h || 0) > (max.change24h || 0) ? t : max)
        : undefined;
      const topLoser = tokensWithChange.length > 0
        ? tokensWithChange.reduce((min, t) => (t.change24h || 0) < (min.change24h || 0) ? t : min)
        : undefined;

      // Calculate P&L from trades
      let totalPnL = 0;
      let totalPnLPercent = 0;
      
      try {
        const trades = await queryAll(`
          SELECT 
            tx_type,
            amount_in,
            amount_out
          FROM trading_transactions
          WHERE user_id = ? AND status IN ('confirmed', 'completed')
          ORDER BY created_at DESC
          LIMIT 100
        `, [userId]) as any[];

        const buyTotal = trades
          .filter(t => t.tx_type === 'buy')
          .reduce((sum, t) => sum + (t.amount_in || 0), 0);

        const sellTotal = trades
          .filter(t => t.tx_type === 'sell')
          .reduce((sum, t) => sum + (t.amount_out || 0), 0);

        if (buyTotal > 0) {
          totalPnL = (sellTotal - buyTotal) * solPrice;
          totalPnLPercent = ((sellTotal - buyTotal) / buyTotal) * 100;
        }
      } catch (e) {
        // Trades table may not exist
      }

      return {
        totalValueUSD,
        totalSOL,
        solPrice,
        totalTokenValueUSD,
        totalTokens: allTokens.length,
        walletCount: validPortfolios.length,
        totalPnL,
        totalPnLPercent,
        topGainer: topGainer ? { symbol: topGainer.symbol, change24h: topGainer.change24h || 0 } : undefined,
        topLoser: topLoser ? { symbol: topLoser.symbol, change24h: topLoser.change24h || 0 } : undefined
      };
    } catch (error) {
      console.error(`Error fetching user portfolio stats:`, error);
      return {
        totalValueUSD: 0,
        totalSOL: 0,
        solPrice: solPriceOracle.getPrice(),
        totalTokenValueUSD: 0,
        totalTokens: 0,
        walletCount: 0
      };
    }
  }

  /**
   * Clear cache for a specific wallet or all wallets
   */
  clearCache(publicKey?: string) {
    if (publicKey) {
      this.cache.delete(`holdings:${publicKey}`);
    } else {
      this.cache.clear();
    }
  }
}

// Singleton instance
export const portfolioService = new PortfolioService(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
);

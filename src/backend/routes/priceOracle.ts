import { Router, Request, Response } from 'express';
import { tokenPriceOracle } from '../services/TokenPriceOracle.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const router = Router();
const authService = new SecureAuthService();

// Extend Express Request type
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    wallet_address: string;
    username: string;
    role: string;
  };
}

/**
 * Get price oracle status
 * GET /api/price-oracle/status
 */
router.get('/status', authService.requireSecureAuth(), async (_req: Request, res: Response) => {
  try {
    const status = await tokenPriceOracle.getStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    console.error('Error getting oracle status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Start/stop global price oracle
 * POST /api/price-oracle/toggle
 * Body: { isRunning: boolean }
 */
router.post('/toggle', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { isRunning } = req.body;
    const userId = (req as AuthenticatedRequest).user?.id;
    
    if (typeof isRunning !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        error: 'isRunning must be a boolean' 
      });
    }
    
    // Update config
    await tokenPriceOracle.updateConfig({ 
      isRunning, 
      userId 
    });
    
    // Actually start/stop the service
    if (isRunning) {
      await tokenPriceOracle.start();
    } else {
      tokenPriceOracle.stop();
    }
    
    const status = await tokenPriceOracle.getStatus();
    
    res.json({ 
      success: true, 
      message: `Oracle ${isRunning ? 'started' : 'stopped'}`,
      data: status 
    });
  } catch (error: any) {
    console.error('Error toggling oracle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update oracle config (backlog filter, inactive filter)
 * PATCH /api/price-oracle/config
 * Body: { filterBacklogTokens?: boolean, filterInactiveTokens?: boolean }
 */
router.patch('/config', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { filterBacklogTokens, filterInactiveTokens } = req.body;
    const userId = (req as AuthenticatedRequest).user?.id;
    
    const updates: any = { userId };
    
    if (filterBacklogTokens !== undefined) {
      updates.filterBacklogTokens = filterBacklogTokens;
    }
    
    if (filterInactiveTokens !== undefined) {
      updates.filterInactiveTokens = filterInactiveTokens;
    }
    
    await tokenPriceOracle.updateConfig(updates);
    
    const status = await tokenPriceOracle.getStatus();
    
    res.json({ 
      success: true, 
      message: 'Config updated',
      data: status 
    });
  } catch (error: any) {
    console.error('Error updating oracle config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get list of filtered/paused tokens
 * GET /api/price-oracle/filtered
 * Query: ?limit=100
 */
router.get('/filtered', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const tokens = await tokenPriceOracle.getFilteredTokens(limit);
    
    res.json({ 
      success: true, 
      data: tokens,
      count: tokens.length
    });
  } catch (error: any) {
    console.error('Error getting filtered tokens:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Pause specific token
 * POST /api/price-oracle/pause
 * Body: { tokenMint: string, reason?: string, notes?: string }
 */
router.post('/pause', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint, reason = 'manual_pause', notes } = req.body;
    const userId = (req as AuthenticatedRequest).user?.id;
    
    if (!tokenMint) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenMint is required' 
      });
    }
    
    await tokenPriceOracle.pauseToken(tokenMint, reason, userId, notes);
    
    res.json({ 
      success: true, 
      message: `Token ${tokenMint.slice(0, 8)}... paused` 
    });
  } catch (error: any) {
    console.error('Error pausing token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Resume specific token
 * POST /api/price-oracle/resume
 * Body: { tokenMint: string }
 */
router.post('/resume', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenMint is required' 
      });
    }
    
    await tokenPriceOracle.resumeToken(tokenMint);
    
    res.json({ 
      success: true, 
      message: `Token ${tokenMint.slice(0, 8)}... resumed` 
    });
  } catch (error: any) {
    console.error('Error resuming token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Bulk pause tokens
 * POST /api/price-oracle/pause/bulk
 * Body: { tokenMints: string[], reason?: string }
 */
router.post('/pause/bulk', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMints, reason = 'manual_pause' } = req.body;
    const userId = (req as AuthenticatedRequest).user?.id;
    
    if (!Array.isArray(tokenMints) || tokenMints.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenMints must be a non-empty array' 
      });
    }
    
    await tokenPriceOracle.pauseTokensBulk(tokenMints, reason, userId);
    
    res.json({ 
      success: true, 
      message: `${tokenMints.length} tokens paused` 
    });
  } catch (error: any) {
    console.error('Error bulk pausing tokens:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Bulk resume tokens
 * POST /api/price-oracle/resume/bulk
 * Body: { tokenMints: string[] }
 */
router.post('/resume/bulk', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMints } = req.body;
    
    if (!Array.isArray(tokenMints) || tokenMints.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenMints must be a non-empty array' 
      });
    }
    
    await tokenPriceOracle.resumeTokensBulk(tokenMints);
    
    res.json({ 
      success: true, 
      message: `${tokenMints.length} tokens resumed` 
    });
  } catch (error: any) {
    console.error('Error bulk resuming tokens:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get unified token services status (all tokens with their services)
 * GET /api/price-oracle/tokens
 * Query: ?limit=100&search=symbol
 */
router.get('/tokens', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const search = (req.query.search as string) || '';
    const { queryAll } = await import('../database/helpers.js');
    
    // Get all tokens with comprehensive service status
    const tokens = await queryAll<any>(`
      SELECT 
        tr.token_mint,
        tr.token_symbol as symbol,
        tr.token_name as name,
        tr.first_source_type,
        json_extract(tr.first_source_details, '$.detectionType') as detection_type,
        tr.first_seen_at,
        tr.total_mentions,
        tr.total_trades,
        
        -- Price Oracle status (if filtered = paused)
        CASE 
          WHEN tpof.token_mint IS NOT NULL THEN 0
          ELSE 1
        END as price_oracle_active,
        tpof.filter_reason as price_oracle_pause_reason,
        
        -- OHLCV Update Tier
        ous.update_tier,
        ous.pool_address as main_pool_address,
        ous.last_update as ohlcv_last_update,
        ous.next_update as ohlcv_next_update,
        
        -- Pool data from gecko_token_data
        gtd.top_pool_address,
        gtd.market_cap_usd,
        gtd.volume_24h_usd,
        gtd.price_usd,
        gtd.price_change_24h,
        gtd.total_reserve_in_usd as liquidity_usd,
        gtd.total_supply,
        gtd.fdv_usd,
        
        -- Pool info
        pi.dex_id,
        
        -- Latest market data
        md.price_usd as latest_price_usd,
        md.price_sol as latest_price_sol,
        md.market_cap_usd as latest_market_cap,
        md.fdv_usd as latest_fdv,
        md.volume_24h as latest_volume_24h,
        md.price_change_24h as latest_price_change_24h,
        md.price_change_7d as latest_price_change_7d,
        md.updated_at as market_data_updated
        
      FROM token_registry tr
      
      -- Check if filtered/paused
      LEFT JOIN token_price_oracle_filters tpof ON tr.token_mint = tpof.token_mint
      
      -- OHLCV schedule
      LEFT JOIN ohlcv_update_schedule ous ON tr.token_mint = ous.mint_address
      
      -- Gecko token data
      LEFT JOIN gecko_token_data gtd ON tr.token_mint = gtd.mint_address
        AND gtd.fetched_at = (SELECT MAX(fetched_at) FROM gecko_token_data WHERE mint_address = tr.token_mint)
      
      -- Pool info
      LEFT JOIN pool_info pi ON gtd.top_pool_address = pi.pool_address
      
      -- Latest market data
      LEFT JOIN token_market_data md ON tr.token_mint = md.mint_address
      
      WHERE tr.token_mint IS NOT NULL
        AND tr.token_mint != ''
        AND tr.token_mint != 'So11111111111111111111111111111111111111112'
        ${search ? `AND (tr.token_symbol LIKE '%${search}%' OR tr.token_name LIKE '%${search}%' OR tr.token_mint LIKE '%${search}%')` : ''}
      
      ORDER BY tr.first_seen_at DESC
      LIMIT ?
    `, [limit]);
    
    res.json({ 
      success: true, 
      data: tokens,
      count: tokens.length
    });
  } catch (error: any) {
    console.error('Error getting token services:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update OHLCV update tier for a token
 * POST /api/price-oracle/ohlcv/update-tier
 * Body: { tokenMint: string, poolAddress: string, updateTier: 'REALTIME' | 'NORMAL' | 'DORMANT' }
 */
router.post('/ohlcv/update-tier', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint, poolAddress, updateTier } = req.body;
    
    if (!tokenMint || !poolAddress || !updateTier) {
      return res.status(400).json({ 
        success: false, 
        error: 'tokenMint, poolAddress, and updateTier are required' 
      });
    }
    
    if (!['REALTIME', 'NORMAL', 'DORMANT'].includes(updateTier)) {
      return res.status(400).json({ 
        success: false, 
        error: 'updateTier must be REALTIME, NORMAL, or DORMANT' 
      });
    }
    
    const { execute } = await import('../database/helpers.js');
    
    await execute(`
      INSERT OR REPLACE INTO ohlcv_update_schedule 
        (pool_address, mint_address, update_tier, last_update, next_update)
      VALUES (?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `, [poolAddress, tokenMint, updateTier]);
    
    res.json({ 
      success: true, 
      message: `OHLCV update tier set to ${updateTier}` 
    });
  } catch (error: any) {
    console.error('Error updating OHLCV tier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Pause all backlog tokens
 * POST /api/price-oracle/pause/backlog
 */
router.post('/pause/backlog', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    
    // Get all backlog tokens from token_registry
    const { queryAll } = await import('../database/helpers.js');
    const backlogTokens = await queryAll<any>(`
      SELECT DISTINCT token_mint
      FROM token_registry
      WHERE json_extract(first_source_details, '$.detectionType') = 'telegram_backlog'
      AND token_mint IS NOT NULL
      AND token_mint != ''
    `);
    
    if (backlogTokens.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No backlog tokens found',
        count: 0
      });
    }
    
    const tokenMints = backlogTokens.map(t => t.token_mint);
    await tokenPriceOracle.pauseTokensBulk(tokenMints, 'telegram_backlog', userId);
    
    res.json({ 
      success: true, 
      message: `${tokenMints.length} backlog tokens paused`,
      count: tokenMints.length
    });
  } catch (error: any) {
    console.error('Error pausing backlog tokens:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

/**
 * Token Analytics API Routes
 * Query token sources and performance metrics
 */

import { Router } from 'express';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { tokenSourceTracker } from '../services/TokenSourceTracker.js';
import { queryAll, queryOne } from '../database/helpers.js';

const authService = new SecureAuthService();
const router = Router();

/**
 * Get top performing token sources
 */
router.get('/api/analytics/token-sources/top', authService.requireSecureAuth(), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const sources = await tokenSourceTracker.getTopSources(limit);
    
    res.json({
      success: true,
      sources
    });
  } catch (error: any) {
    console.error('Error fetching top sources:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get performance metrics for a specific source
 */
router.get('/api/analytics/token-sources/performance', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { sourceType, sourceChatId } = req.query;
    const performance = await tokenSourceTracker.getSourcePerformance(
      sourceType as string,
      sourceChatId as string
    );
    
    res.json({
      success: true,
      performance
    });
  } catch (error: any) {
    console.error('Error fetching source performance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get timeline for a specific token
 */
router.get('/api/analytics/tokens/:tokenMint/timeline', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { tokenMint } = req.params;
    const timeline = await tokenSourceTracker.getTokenTimeline(tokenMint);
    
    res.json({
      success: true,
      timeline
    });
  } catch (error: any) {
    console.error('Error fetching token timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all tokens by source type
 */
router.get('/api/analytics/tokens/by-source', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { sourceType, limit = 100 } = req.query;
    
    let query = `
      SELECT 
        token_mint,
        token_symbol,
        token_name,
        first_source_type,
        telegram_chat_name,
        first_seen_at,
        total_mentions,
        total_trades
      FROM token_registry
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (sourceType) {
      query += ' AND first_source_type = ?';
      params.push(sourceType);
    }
    
    query += ' ORDER BY first_seen_at DESC LIMIT ?';
    params.push(parseInt(limit as string));
    
    const tokens = await queryAll(query, params);
    
    res.json({
      success: true,
      tokens
    });
  } catch (error: any) {
    console.error('Error fetching tokens by source:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get source performance summary
 */
router.get('/api/analytics/token-sources/summary', authService.requireSecureAuth(), async (_req, res) => {
  try {
    // Get overall statistics
    const stats = await queryOne(`
      SELECT 
        COUNT(DISTINCT token_mint) as total_tokens,
        COUNT(DISTINCT CASE WHEN first_source_type = 'telegram' THEN token_mint END) as telegram_tokens,
        COUNT(DISTINCT CASE WHEN first_source_type = 'manual' THEN token_mint END) as manual_tokens,
        COUNT(DISTINCT CASE WHEN first_source_type = 'trade' THEN token_mint END) as trade_tokens,
        COUNT(DISTINCT telegram_chat_id) as unique_telegram_sources,
        SUM(total_trades) as total_trades_tracked,
        AVG(total_mentions) as avg_mentions_per_token
      FROM token_registry
    `) as any;
    
    // Get best performing Telegram channels
    const topChannels = await queryAll(`
      SELECT 
        source_chat_name,
        source_chat_id,
        COUNT(DISTINCT token_mint) as unique_tokens,
        COUNT(*) as total_trades,
        SUM(CASE WHEN trade_outcome = 'profit' THEN 1 ELSE 0 END) as profitable_trades,
        CAST(SUM(CASE WHEN trade_outcome = 'profit' THEN 1 ELSE 0 END) AS REAL) / 
          NULLIF(COUNT(*), 0) * 100 as win_rate,
        AVG(profit_loss_pct) as avg_profit_loss_pct
      FROM trade_source_attribution
      WHERE source_chat_id IS NOT NULL
        AND trade_outcome IS NOT NULL
      GROUP BY source_chat_id, source_chat_name
      ORDER BY win_rate DESC, total_trades DESC
      LIMIT 5
    `);
    
    // Get recent token discoveries
    const recentTokens = await queryAll(`
      SELECT 
        token_mint,
        token_symbol,
        token_name,
        first_source_type,
        telegram_chat_name,
        first_seen_at,
        total_mentions,
        total_trades
      FROM token_registry
      ORDER BY first_seen_at DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      summary: {
        stats,
        topChannels,
        recentTokens
      }
    });
  } catch (error: any) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get detailed Telegram source performance
 */
router.get('/api/analytics/telegram-sources', authService.requireSecureAuth(), async (_req, res) => {
  try {
    const sources = await queryAll(`
      SELECT 
        tr.telegram_chat_id as chat_id,
        tr.telegram_chat_name as chat_name,
        COUNT(DISTINCT tr.token_mint) as tokens_discovered,
        SUM(tr.total_trades) as total_trades,
        SUM(tr.total_mentions) as total_mentions,
        MIN(tr.first_seen_at) as first_activity,
        MAX(tr.updated_at) as last_activity,
        tsa.win_rate,
        tsa.avg_profit_loss_pct,
        tsa.avg_hours_to_trade
      FROM token_registry tr
      LEFT JOIN (
        SELECT 
          source_chat_id,
          CAST(SUM(CASE WHEN trade_outcome = 'profit' THEN 1 ELSE 0 END) AS REAL) / 
            NULLIF(COUNT(*), 0) * 100 as win_rate,
          AVG(profit_loss_pct) as avg_profit_loss_pct,
          AVG(discovery_to_trade_seconds) / 3600.0 as avg_hours_to_trade
        FROM trade_source_attribution
        WHERE trade_outcome IS NOT NULL
        GROUP BY source_chat_id
      ) tsa ON tr.telegram_chat_id = tsa.source_chat_id
      WHERE tr.first_source_type = 'telegram'
        AND tr.telegram_chat_id IS NOT NULL
      GROUP BY tr.telegram_chat_id, tr.telegram_chat_name
      ORDER BY tokens_discovered DESC
    `);
    
    res.json({
      success: true,
      sources
    });
  } catch (error: any) {
    console.error('Error fetching Telegram sources:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

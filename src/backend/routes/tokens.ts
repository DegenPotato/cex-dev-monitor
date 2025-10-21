/**
 * Token routes for fetching and managing detected tokens
 */
import { Router } from 'express';
import { queryAll, queryOne, execute } from '../database/helpers.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const router = Router();
const authService = new SecureAuthService();

/**
 * Get all detected tokens with comprehensive metrics
 */
router.get('/detected-tokens', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { limit = 50, offset = 0, source } = req.query;
    
    let query = `
      SELECT 
        tm.mint_address,
        tm.creator_address,
        tm.name,
        tm.symbol,
        tm.platform,
        tm.timestamp,
        tm.starting_mcap,
        tm.current_mcap,
        tm.ath_mcap,
        tm.first_seen_source,
        tm.first_seen_at,
        tm.telegram_mentions,
        tm.wallet_transactions,
        tm.last_updated,
        COUNT(DISTINCT td.chat_id) as unique_chat_mentions,
        COUNT(DISTINCT td.sender_id) as unique_senders,
        SUM(CASE WHEN td.forwarded = 1 THEN 1 ELSE 0 END) as times_forwarded,
        AVG(CASE WHEN td.forward_latency IS NOT NULL THEN td.forward_latency ELSE NULL END) as avg_forward_latency
      FROM token_mints tm
      LEFT JOIN telegram_detections td ON tm.mint_address = td.contract_address
    `;
    
    if (source) {
      query += ` WHERE tm.first_seen_source = ?`;
    }
    
    query += `
      GROUP BY tm.mint_address
      ORDER BY tm.first_seen_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const params = source ? [source, limit, offset] : [limit, offset];
    const tokens = await queryAll(query, params);
    
    res.json({ tokens });
  } catch (error: any) {
    console.error('[Tokens] Error fetching detected tokens:', error);
    res.status(500).json({ error: 'Failed to fetch detected tokens' });
  }
});

/**
 * Get detailed information for a specific token
 */
router.get('/token/:address', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { address } = req.params;
    
    // Get token basic info
    const token = await queryOne(`
      SELECT * FROM token_mints WHERE mint_address = ?
    `, [address]);
    
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    // Get telegram detection details
    const telegramDetections = await queryAll(`
      SELECT 
        td.*,
        tmc.chat_name as current_chat_name
      FROM telegram_detections td
      LEFT JOIN telegram_monitored_chats tmc ON td.chat_id = tmc.chat_id
      WHERE td.contract_address = ?
      ORDER BY td.detected_at DESC
      LIMIT 100
    `, [address]);
    
    // Get chat distribution
    const chatDistribution = await queryAll(`
      SELECT 
        chat_id,
        chat_name,
        COUNT(*) as mention_count,
        MIN(detected_at) as first_seen,
        MAX(detected_at) as last_seen
      FROM telegram_detections
      WHERE contract_address = ?
      GROUP BY chat_id, chat_name
      ORDER BY mention_count DESC
    `, [address]);
    
    // Get hourly distribution
    const hourlyDistribution = await queryAll(`
      SELECT 
        strftime('%H', datetime(detected_at, 'unixepoch')) as hour,
        COUNT(*) as count
      FROM telegram_detections
      WHERE contract_address = ?
      GROUP BY hour
      ORDER BY hour
    `, [address]);
    
    res.json({
      token,
      telegramDetections,
      chatDistribution,
      hourlyDistribution
    });
  } catch (error: any) {
    console.error('[Tokens] Error fetching token details:', error);
    res.status(500).json({ error: 'Failed to fetch token details' });
  }
});

/**
 * Get token statistics
 */
router.get('/token-stats', authService.requireSecureAuth(), async (_req, res) => {
  try {
    const stats = await queryOne(`
      SELECT 
        COUNT(DISTINCT mint_address) as total_tokens,
        COUNT(DISTINCT CASE WHEN first_seen_source = 'telegram' THEN mint_address END) as telegram_tokens,
        COUNT(DISTINCT CASE WHEN first_seen_source = 'wallet_monitor' THEN mint_address END) as wallet_tokens,
        SUM(telegram_mentions) as total_telegram_mentions
      FROM token_mints
    `);
    
    const topMentioned = await queryAll(`
      SELECT 
        mint_address,
        name,
        symbol,
        telegram_mentions,
        first_seen_at
      FROM token_mints
      ORDER BY telegram_mentions DESC
      LIMIT 10
    `);
    
    const recentTokens = await queryAll(`
      SELECT 
        mint_address,
        name,
        symbol,
        first_seen_source,
        first_seen_at
      FROM token_mints
      ORDER BY first_seen_at DESC
      LIMIT 20
    `);
    
    res.json({
      stats,
      topMentioned,
      recentTokens
    });
  } catch (error: any) {
    console.error('[Tokens] Error fetching token stats:', error);
    res.status(500).json({ error: 'Failed to fetch token stats' });
  }
});

/**
 * Update token market data (to be called by background job)
 */
router.post('/token/:address/update-market-data', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { address } = req.params;
    const { currentMcap, athMcap, name, symbol } = req.body;
    
    await execute(`
      UPDATE token_mints 
      SET 
        current_mcap = COALESCE(?, current_mcap),
        ath_mcap = COALESCE(?, ath_mcap),
        name = COALESCE(?, name),
        symbol = COALESCE(?, symbol),
        last_updated = ?
      WHERE mint_address = ?
    `, [currentMcap, athMcap, name, symbol, Math.floor(Date.now() / 1000), address]);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Tokens] Error updating token market data:', error);
    res.status(500).json({ error: 'Failed to update token market data' });
  }
});

export default router;

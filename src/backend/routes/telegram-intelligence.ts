import { Router, Request } from 'express';
import { queryAll, queryOne, execute } from '../database/helpers.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();

// Extend Express Request type to include user property from auth middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    wallet_address: string;
    username: string;
    role: string;
  };
}

const router = Router();

/**
 * Track a new caller/KOL
 */
router.post('/api/telegram/track-caller', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { telegramUserId, username, firstName, lastName, isBot, isPremium, isVerified } = req.body;
    const userId = (req as AuthenticatedRequest).user!.id;

    // Check if caller already exists
    const existing = await queryOne(
      'SELECT id FROM telegram_callers WHERE user_id = ? AND telegram_user_id = ?',
      [userId, telegramUserId]
    );

    if (existing) {
      // Update existing caller
      await execute(`
        UPDATE telegram_callers 
        SET username = ?, first_name = ?, last_name = ?, 
            is_bot = ?, is_premium = ?, is_verified = ?,
            last_seen = ?, updated_at = ?
        WHERE id = ?
      `, [username, firstName, lastName, isBot ? 1 : 0, isPremium ? 1 : 0, 
          isVerified ? 1 : 0, Date.now(), Date.now(), (existing as any).id]);
      
      res.json({ success: true, callerId: (existing as any).id });
    } else {
      // Insert new caller
      const result = await execute(`
        INSERT INTO telegram_callers (
          user_id, telegram_user_id, username, first_name, last_name,
          is_bot, is_premium, is_verified, first_seen, last_seen, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, telegramUserId, username, firstName, lastName,
          isBot ? 1 : 0, isPremium ? 1 : 0, isVerified ? 1 : 0,
          Date.now(), Date.now(), Date.now()]);
      
      res.json({ success: true, callerId: (result as any).lastID });
    }
  } catch (error: any) {
    console.error('Error tracking caller:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Record a token call/shill
 */
router.post('/api/telegram/record-call', authService.requireSecureAuth(), async (req, res) => {
  try {
    const {
      callerId, chatId, messageId, contractAddress, tokenSymbol, tokenName,
      callTimestamp, callType, callMessage, priceAtCall, mcapAtCall, confidenceScore
    } = req.body;
    const userId = (req as AuthenticatedRequest).user!.id;

    const result = await execute(`
      INSERT INTO telegram_token_calls (
        user_id, caller_id, chat_id, message_id, contract_address,
        token_symbol, token_name, call_timestamp, call_type, call_message,
        price_at_call, mcap_at_call, confidence_score, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, callerId, chatId, messageId, contractAddress,
        tokenSymbol, tokenName, callTimestamp, callType, callMessage,
        priceAtCall, mcapAtCall, confidenceScore, Date.now()]);

    // Update caller's total calls
    await execute(
      'UPDATE telegram_callers SET total_calls = total_calls + 1, last_call_date = ? WHERE id = ?',
      [callTimestamp, callerId]
    );

    // Update channel stats
    await execute(`
      INSERT INTO telegram_channel_stats (user_id, chat_id, total_calls, calls_today, last_updated)
      VALUES (?, ?, 1, 1, ?)
      ON CONFLICT(user_id, chat_id) DO UPDATE SET
        total_calls = total_calls + 1,
        calls_today = CASE 
          WHEN date(last_updated, 'unixepoch') = date('now') THEN calls_today + 1
          ELSE 1
        END,
        last_updated = ?
    `, [userId, chatId, Date.now(), Date.now()]);

    // WebSocket notification will be handled by the main server
    
    res.json({ success: true, callId: (result as any).lastID });
  } catch (error: any) {
    console.error('Error recording call:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update call performance metrics
 */
router.post('/api/telegram/update-call-performance', authService.requireSecureAuth(), async (req, res) => {
  try {
    const {
      callId, athPrice, athTimestamp, currentPrice, currentMcap,
      volume24h, holderCount, isRugpull, isHoneypot
    } = req.body;

    const call = await queryOne(
      'SELECT price_at_call, mcap_at_call, call_timestamp FROM telegram_token_calls WHERE id = ?',
      [callId]
    );

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const athMultiplier = athPrice / (call as any).price_at_call;
    const currentMultiplier = currentPrice / (call as any).price_at_call;
    const timeToAth = Math.floor((athTimestamp - (call as any).call_timestamp) / 60); // in minutes
    const isSuccessful = athMultiplier >= 2; // 2x is considered successful

    await execute(`
      UPDATE telegram_token_calls SET
        ath_price = ?, ath_mcap = ?, ath_timestamp = ?, ath_multiplier = ?,
        current_price = ?, current_mcap = ?, current_multiplier = ?,
        time_to_ath = ?, volume_24h = ?, holder_count = ?,
        is_rugpull = ?, is_honeypot = ?, is_successful = ?,
        last_price_update = ?, updated_at = ?
      WHERE id = ?
    `, [athPrice, (call as any).mcap_at_call * athMultiplier, athTimestamp, athMultiplier,
        currentPrice, currentMcap, currentMultiplier, timeToAth, volume24h, holderCount,
        isRugpull ? 1 : 0, isHoneypot ? 1 : 0, isSuccessful ? 1 : 0,
        Date.now(), Date.now(), callId]);

    // Update caller's performance metrics
    const callerCalls = await queryAll(
      'SELECT ath_multiplier, time_to_ath, is_successful, volume_24h FROM telegram_token_calls WHERE caller_id = (SELECT caller_id FROM telegram_token_calls WHERE id = ?)',
      [callId]
    );

    const successfulCalls = callerCalls.filter((c: any) => c.is_successful).length;
    const avgPeakMultiplier = callerCalls.reduce((sum: number, c: any) => sum + (c.ath_multiplier || 0), 0) / callerCalls.length;
    const avgTimeToPeak = callerCalls.reduce((sum: number, c: any) => sum + (c.time_to_ath || 0), 0) / callerCalls.length;
    const totalVolume = callerCalls.reduce((sum: number, c: any) => sum + (c.volume_24h || 0), 0);
    const winRate = (successfulCalls / callerCalls.length) * 100;

    await execute(`
      UPDATE telegram_callers SET
        successful_calls = ?, avg_peak_multiplier = ?, avg_time_to_peak = ?,
        total_volume_generated = ?, win_rate = ?, updated_at = ?
      WHERE id = (SELECT caller_id FROM telegram_token_calls WHERE id = ?)
    `, [successfulCalls, avgPeakMultiplier, avgTimeToPeak, totalVolume, winRate, Date.now(), callId]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating call performance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get caller profiles with performance metrics
 */
router.get('/api/telegram/callers', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { timeframe = '7d', sortBy = 'win_rate', limit = 50 } = req.query;
    const userId = (req as AuthenticatedRequest).user!.id;

    let timeFilter = '';
    const now = Date.now();
    switch(timeframe) {
      case '24h':
        timeFilter = `AND last_call_date > ${now - 86400000}`;
        break;
      case '7d':
        timeFilter = `AND last_call_date > ${now - 604800000}`;
        break;
      case '30d':
        timeFilter = `AND last_call_date > ${now - 2592000000}`;
        break;
    }

    const callers = await queryAll(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM telegram_token_calls WHERE caller_id = c.id) as total_calls_actual,
        (SELECT GROUP_CONCAT(DISTINCT chat_id) FROM telegram_token_calls WHERE caller_id = c.id) as associated_channels
      FROM telegram_callers c
      WHERE c.user_id = ? ${timeFilter}
      ORDER BY ${sortBy === 'reputation' ? 'reputation_score' : sortBy === 'volume' ? 'total_volume_generated' : 'win_rate'} DESC
      LIMIT ?
    `, [userId, limit]);

    // Get recent calls for each caller
    for (const caller of callers as any[]) {
      caller.recentCalls = await queryAll(`
        SELECT * FROM telegram_token_calls 
        WHERE caller_id = ? 
        ORDER BY call_timestamp DESC 
        LIMIT 10
      `, [caller.id]);
      
      caller.associatedChannels = caller.associated_channels ? caller.associated_channels.split(',') : [];
    }

    res.json({ success: true, callers });
  } catch (error: any) {
    console.error('Error fetching callers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get channel statistics
 */
router.get('/api/telegram/channel-stats', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;

    const channels = await queryAll(`
      SELECT 
        cs.*,
        mc.chat_name
      FROM telegram_channel_stats cs
      LEFT JOIN telegram_monitored_chats mc ON cs.chat_id = mc.chat_id AND cs.user_id = mc.user_id
      WHERE cs.user_id = ?
      ORDER BY cs.channel_reputation DESC
    `, [userId]);

    // Get top callers for each channel
    for (const channel of channels as any[]) {
      const topCallers = await queryAll(`
        SELECT 
          c.*, 
          COUNT(tc.id) as calls_in_channel
        FROM telegram_callers c
        JOIN telegram_token_calls tc ON tc.caller_id = c.id
        WHERE tc.chat_id = ? AND tc.user_id = ?
        GROUP BY c.id
        ORDER BY c.win_rate DESC
        LIMIT 5
      `, [channel.chat_id, userId]);
      
      channel.topCallers = topCallers;
    }

    res.json({ success: true, channels });
  } catch (error: any) {
    console.error('Error fetching channel stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Calculate and update reputation scores
 */
router.post('/api/telegram/calculate-reputation', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { callerId } = req.body;

    const caller = await queryOne(
      'SELECT * FROM telegram_callers WHERE id = ?',
      [callerId]
    );

    if (!caller) {
      return res.status(404).json({ error: 'Caller not found' });
    }

    // Calculate reputation based on multiple factors
    let reputationScore = 50; // Base score

    // Win rate factor (0-30 points)
    reputationScore += ((caller as any).win_rate / 100) * 30;

    // Volume factor (0-20 points)
    const volumePoints = Math.min(20, (caller as any).total_volume_generated / 1000000); // 1 point per million, max 20
    reputationScore += volumePoints;

    // Consistency factor (0-20 points)
    const consistencyPoints = Math.min(20, (caller as any).successful_calls / 5); // 4 points per successful call, max 20
    reputationScore += consistencyPoints;

    // Premium/Verified bonus
    if ((caller as any).is_premium) reputationScore += 5;
    if ((caller as any).is_verified) reputationScore += 5;

    // Check for rug pulls
    const rugpulls = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_token_calls WHERE caller_id = ? AND is_rugpull = 1',
      [callerId]
    );
    reputationScore -= (rugpulls as any).count * 10; // -10 points per rugpull

    // Determine trust level
    let trustLevel = 'neutral';
    if (reputationScore >= 80) trustLevel = 'trusted';
    else if (reputationScore >= 60) trustLevel = 'neutral';
    else if (reputationScore >= 40) trustLevel = 'suspicious';
    else trustLevel = 'scammer';

    await execute(
      'UPDATE telegram_callers SET reputation_score = ?, trust_level = ?, updated_at = ? WHERE id = ?',
      [Math.max(0, Math.min(100, reputationScore)), trustLevel, Date.now(), callerId]
    );

    res.json({ success: true, reputationScore, trustLevel });
  } catch (error: any) {
    console.error('Error calculating reputation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Store OHLCV data for performance tracking
 */
router.post('/api/telegram/ohlcv', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { contractAddress, timestamp, timeframe, open, high, low, close, volume, tradesCount, buyerCount, sellerCount } = req.body;

    await execute(`
      INSERT OR REPLACE INTO token_ohlcv_data (
        contract_address, timestamp, timeframe, open, high, low, close, volume,
        trades_count, buyer_count, seller_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [contractAddress, timestamp, timeframe, open, high, low, close, volume,
        tradesCount, buyerCount, sellerCount]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error storing OHLCV data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get token performance chart data
 */
router.get('/api/telegram/token-performance/:contractAddress', authService.requireSecureAuth(), async (req, res) => {
  try {
    const { contractAddress } = req.params;
    const { timeframe = '5m', limit = 100 } = req.query;

    const ohlcv = await queryAll(`
      SELECT * FROM token_ohlcv_data 
      WHERE contract_address = ? AND timeframe = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, [contractAddress, timeframe, limit]);

    const calls = await queryAll(`
      SELECT 
        tc.*,
        c.username as caller_username,
        c.trust_level
      FROM telegram_token_calls tc
      JOIN telegram_callers c ON tc.caller_id = c.id
      WHERE tc.contract_address = ?
      ORDER BY tc.call_timestamp ASC
    `, [contractAddress]);

    res.json({ success: true, ohlcv: ohlcv.reverse(), calls });
  } catch (error: any) {
    console.error('Error fetching token performance:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

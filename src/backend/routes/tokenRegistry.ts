import { Router } from 'express';
import { queryAll, queryOne } from '../database/helpers.js';
// TEMPORARILY COMMENTED OUT - RESTORE WHEN RE-ENABLING AUTH
// import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const router = Router();
// TEMPORARILY COMMENTED OUT - RESTORE WHEN RE-ENABLING AUTH
// const authService = new SecureAuthService();

// Health check endpoint (no auth required for testing)
router.get('/health', async (_req, res) => {
  res.json({ status: 'ok', message: 'Token registry routes are loaded' });
});

// Get tokens from registry with comprehensive filters
// TEMPORARILY REMOVED AUTH FOR TESTING - RESTORE LATER
router.get('/', async (req, res) => {
  try {
    const { 
      source = 'all', 
      sort = 'newest',
      timeframe = '24h',
      verified = 'false',
      traded = 'false',
      limit = 100
    } = req.query;

    // Build timeframe condition
    let timeCondition = '';
    const now = Math.floor(Date.now() / 1000);
    switch(timeframe) {
      case '24h':
        timeCondition = `AND tr.first_seen_at >= ${now - 86400}`;
        break;
      case '7d':
        timeCondition = `AND tr.first_seen_at >= ${now - 604800}`;
        break;
      case '30d':
        timeCondition = `AND tr.first_seen_at >= ${now - 2592000}`;
        break;
      default:
        timeCondition = '';
    }

    // Build source condition
    let sourceCondition = '';
    if (source !== 'all') {
      if (source === 'telegram') {
        // Include all telegram sources
        sourceCondition = `AND tr.first_source_type = 'telegram'`;
      } else if (source === 'telegram_realtime') {
        sourceCondition = `AND tr.first_source_type = 'telegram' 
                          AND json_extract(tr.first_source_details, '$.detectionType') = 'telegram_realtime'`;
      } else if (source === 'telegram_backlog') {
        sourceCondition = `AND tr.first_source_type = 'telegram' 
                          AND json_extract(tr.first_source_details, '$.detectionType') = 'telegram_backlog'`;
      } else {
        sourceCondition = `AND tr.first_source_type = ?`;
      }
    }

    // Build additional filters
    const verifiedCondition = verified === 'true' ? 'AND tr.is_verified = 1' : '';
    const tradedCondition = traded === 'true' ? 'AND tr.total_trades > 0' : '';

    // Build ORDER BY clause
    let orderBy = '';
    switch(sort) {
      case 'newest':
        orderBy = 'ORDER BY tr.first_seen_at DESC';
        break;
      case 'mentions':
        orderBy = 'ORDER BY tr.total_mentions DESC';
        break;
      case 'trades':
        orderBy = 'ORDER BY tr.total_trades DESC';
        break;
      case 'roi':
        orderBy = 'ORDER BY roi_from_first_mention DESC NULLS LAST';
        break;
      case 'mcap':
        orderBy = 'ORDER BY market_cap_usd DESC NULLS LAST';
        break;
      case 'volume':
        orderBy = 'ORDER BY volume_24h_usd DESC NULLS LAST';
        break;
      default:
        orderBy = 'ORDER BY tr.first_seen_at DESC';
    }

    // Query with market data joins
    const query = `
      SELECT 
        tr.*,
        -- Calculate ROI if we have price data
        CASE 
          WHEN md.price_usd IS NOT NULL AND json_extract(tr.first_source_details, '$.firstPriceUsd') IS NOT NULL
          THEN ((md.price_usd - json_extract(tr.first_source_details, '$.firstPriceUsd')) / json_extract(tr.first_source_details, '$.firstPriceUsd')) * 100
          ELSE NULL
        END as roi_from_first_mention,
        
        -- Hours to first trade
        CASE 
          WHEN tr.first_trade_at IS NOT NULL 
          THEN (tr.first_trade_at - tr.first_seen_at) / 3600.0
          ELSE NULL
        END as hours_to_first_trade,
        
        -- Market data
        md.price_usd as current_price_usd,
        md.market_cap_usd,
        md.volume_24h_usd,
        md.price_change_24h,
        
        -- Performance metrics from trades
        ts.win_rate,
        ts.avg_profit_loss_pct
        
      FROM token_registry tr
      LEFT JOIN token_market_data md ON tr.token_mint = md.mint_address
      
      LEFT JOIN (
        SELECT 
          token_mint,
          COUNT(CASE WHEN trade_outcome = 'profit' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as win_rate,
          AVG(profit_loss_pct) as avg_profit_loss_pct
        FROM trade_source_attribution
        GROUP BY token_mint
      ) ts ON tr.token_mint = ts.token_mint
      
      WHERE 1=1
      ${timeCondition}
      ${sourceCondition}
      ${verifiedCondition}
      ${tradedCondition}
      ${orderBy}
      LIMIT ?
    `;

    const params: any[] = [];
    const sourceStr = typeof source === 'string' ? source : 'all';
    if (sourceStr !== 'all' && !sourceStr.startsWith('telegram')) {
      params.push(sourceStr);
    }
    params.push(parseInt(limit as string));

    const tokens = await queryAll(query, params) as any[];

    // Parse JSON fields
    const parsedTokens = tokens.map((token: any) => ({
      ...token,
      first_source_details: token.first_source_details ? 
        (typeof token.first_source_details === 'string' ? 
          JSON.parse(token.first_source_details) : token.first_source_details) : null,
      tags: token.tags ? 
        (typeof token.tags === 'string' ? 
          JSON.parse(token.tags) : token.tags) : []
    }));

    res.json(parsedTokens);
  } catch (error: any) {
    console.error('Error fetching token registry:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get analytics overview
// TEMPORARILY REMOVED AUTH FOR TESTING - RESTORE LATER
router.get('/analytics/overview', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const now = Math.floor(Date.now() / 1000);
    let timeCondition = '';
    
    switch(timeframe) {
      case '24h':
        timeCondition = `AND first_seen_at >= ${now - 86400}`;
        break;
      case '7d':
        timeCondition = `AND first_seen_at >= ${now - 604800}`;
        break;
      case '30d':
        timeCondition = `AND first_seen_at >= ${now - 2592000}`;
        break;
      default:
        timeCondition = '';
    }

    // Get total counts
    const totals = await queryOne(`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(CASE WHEN first_seen_at >= ${now - 86400} THEN 1 END) as tokens_24h,
        COUNT(CASE WHEN first_seen_at >= ${now - 604800} THEN 1 END) as tokens_7d
      FROM token_registry
    `) as any;

    // Get counts by source
    const bySource = await queryAll(`
      SELECT 
        first_source_type,
        json_extract(first_source_details, '$.detectionType') as detection_type,
        COUNT(*) as count
      FROM token_registry
      WHERE 1=1 ${timeCondition}
      GROUP BY first_source_type, detection_type
    `) as any[];

    // Process source counts
    const sourceCounts = {
      telegram: 0,
      telegram_realtime: 0,
      telegram_backlog: 0,
      manual: 0,
      import: 0,
      dex_scan: 0,
      wallet_scan: 0
    };

    bySource.forEach(row => {
      if (row.first_source_type === 'telegram') {
        if (row.detection_type === 'telegram_realtime') {
          sourceCounts.telegram_realtime += row.count;
        } else if (row.detection_type === 'telegram_backlog') {
          sourceCounts.telegram_backlog += row.count;
        } else {
          sourceCounts.telegram += row.count;
        }
      } else {
        sourceCounts[row.first_source_type as keyof typeof sourceCounts] = row.count;
      }
    });

    // Get top telegram sources
    const topSources = await queryAll(`
      SELECT 
        telegram_chat_id as chat_id,
        telegram_chat_name as chat_name,
        COUNT(*) as token_count,
        AVG(CASE 
          WHEN ts.profit_loss_pct IS NOT NULL THEN ts.profit_loss_pct
          ELSE 0
        END) as avg_roi,
        COUNT(CASE WHEN ts.trade_outcome = 'profit' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(CASE WHEN ts.trade_outcome IS NOT NULL THEN 1 END), 0) as win_rate
      FROM token_registry tr
      LEFT JOIN trade_source_attribution ts ON tr.token_mint = ts.token_mint
      WHERE tr.telegram_chat_id IS NOT NULL
      ${timeCondition}
      GROUP BY telegram_chat_id, telegram_chat_name
      HAVING token_count > 0
      ORDER BY token_count DESC
      LIMIT 10
    `) as any[];

    // Get performance metrics
    const performance = await queryOne(`
      SELECT 
        AVG(profit_loss_pct) as avg_roi,
        AVG((first_trade_at - first_seen_at) / 3600.0) as avg_hours_to_trade,
        SUM(total_trades) as total_trades,
        COUNT(CASE WHEN profit_loss_pct > 0 THEN 1 END) * 100.0 / 
          NULLIF(COUNT(CASE WHEN profit_loss_pct IS NOT NULL THEN 1 END), 0) as profitable_rate
      FROM token_registry tr
      LEFT JOIN (
        SELECT 
          token_mint,
          AVG(profit_loss_pct) as profit_loss_pct
        FROM trade_source_attribution
        GROUP BY token_mint
      ) ts ON tr.token_mint = ts.token_mint
      WHERE 1=1 ${timeCondition}
    `) as any;

    res.json({
      total_tokens: totals.total_tokens,
      tokens_24h: totals.tokens_24h,
      tokens_7d: totals.tokens_7d,
      by_source: sourceCounts,
      top_telegram_sources: topSources.map(s => ({
        ...s,
        win_rate: s.win_rate || 0
      })),
      performance_metrics: {
        avg_roi: performance.avg_roi || 0,
        avg_hours_to_trade: performance.avg_hours_to_trade || 0,
        total_trades: performance.total_trades || 0,
        profitable_rate: performance.profitable_rate || 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching token analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific token details with full history
// TEMPORARILY REMOVED AUTH FOR TESTING - RESTORE LATER
router.get('/:tokenMint', async (req, res) => {
  try {
    const { tokenMint } = req.params;

    // Get token from registry
    const token = await queryOne(`
      SELECT 
        tr.*,
        md.price_usd as current_price_usd,
        md.market_cap_usd,
        md.volume_24h_usd,
        md.price_change_24h
      FROM token_registry tr
      LEFT JOIN token_market_data md ON tr.token_mint = md.mint_address
      WHERE tr.token_mint = ?
    `, [tokenMint]) as any;

    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Get all sightings
    const sightings = await queryAll(`
      SELECT * FROM token_sightings 
      WHERE token_mint = ?
      ORDER BY sighted_at DESC
      LIMIT 100
    `, [tokenMint]);

    // Get trade history
    const trades = await queryAll(`
      SELECT * FROM trade_source_attribution
      WHERE token_mint = ?
      ORDER BY created_at DESC
    `, [tokenMint]);

    // Get telegram detections
    const detections = await queryAll(`
      SELECT * FROM telegram_detections
      WHERE contract_address = ?
      ORDER BY detected_at DESC
      LIMIT 100
    `, [tokenMint]);

    res.json({
      token: {
        ...token,
        first_source_details: token.first_source_details ? 
          (typeof token.first_source_details === 'string' ? 
            JSON.parse(token.first_source_details) : token.first_source_details) : null,
        tags: token.tags ? 
          (typeof token.tags === 'string' ? 
            JSON.parse(token.tags) : token.tags) : []
      },
      sightings,
      trades,
      detections
    });
  } catch (error: any) {
    console.error('Error fetching token details:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

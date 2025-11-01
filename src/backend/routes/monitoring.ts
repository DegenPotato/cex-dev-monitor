/**
 * Endpoint Monitoring & Analytics Routes
 * Real-time tracking of API endpoint usage and performance
 */

import { Router, Request, Response } from 'express';
import { endpointMonitor } from '../middleware/endpointMonitor.js';
import { queryAll } from '../database/helpers.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const router = Router();
const authService = new SecureAuthService();

/**
 * Get real-time endpoint statistics (in-memory)
 */
router.get('/api/monitoring/endpoints/stats', authService.requireSecureAuth(), async (_req: Request, res: Response) => {
  try {
    const stats = endpointMonitor.getStats();
    
    res.json({
      success: true,
      stats,
      summary: {
        totalEndpoints: stats.length,
        totalCalls: stats.reduce((sum, s) => sum + s.count, 0),
        avgResponseTime: stats.reduce((sum, s) => sum + s.avgResponseTime, 0) / stats.length || 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching endpoint stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get historical endpoint performance from database
 */
router.get('/api/monitoring/endpoints/performance', authService.requireSecureAuth(), async (_req: Request, res: Response) => {
  try {
    const performance = await queryAll(`
      SELECT * FROM endpoint_performance
      ORDER BY total_calls DESC
      LIMIT 100
    `).catch(() => []);
    
    res.json({ success: true, performance });
  } catch (error: any) {
    console.error('Error fetching endpoint performance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get traffic by hour
 */
router.get('/api/monitoring/traffic/hourly', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    
    const traffic = await queryAll(`
      SELECT * FROM endpoint_traffic_hourly
      LIMIT ?
    `, [hours]).catch(() => []);
    
    res.json({ success: true, traffic });
  } catch (error: any) {
    console.error('Error fetching traffic data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get recent endpoint logs
 */
router.get('/api/monitoring/logs/recent', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const endpoint = req.query.endpoint as string;
    
    let query = `
      SELECT 
        endpoint,
        method,
        status_code,
        response_time_ms,
        timestamp,
        user_id,
        ip_address
      FROM endpoint_logs
    `;
    
    const params: any[] = [];
    if (endpoint) {
      query += ' WHERE endpoint = ?';
      params.push(endpoint);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const logs = await queryAll(query, params).catch(() => []);
    
    res.json({ success: true, logs });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear in-memory stats (admin only)
 */
router.post('/api/monitoring/stats/clear', authService.requireSecureAuth(), async (_req: Request, res: Response) => {
  try {
    endpointMonitor.clearStats();
    res.json({ success: true, message: 'Stats cleared' });
  } catch (error: any) {
    console.error('Error clearing stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

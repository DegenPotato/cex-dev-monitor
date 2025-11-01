/**
 * Test Lab Routes - On-chain WebSocket campaigns
 */

import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { getOnChainPriceMonitor } from '../services/OnChainPriceMonitor.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();
const monitor = getOnChainPriceMonitor();

// Store io instance
let io: SocketIOServer | null = null;

export function initializePriceTestRoutes(ioInstance: SocketIOServer) {
  io = ioInstance;
  console.log('✅ Price Test routes initialized with Socket.IO');
}

const router = Router();

// Map user campaigns
const userCampaigns = new Map<number, Set<string>>();

/**
 * Start a new monitoring campaign
 */
router.post('/api/test-lab/campaign/start', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tokenMint, poolAddress } = req.body;
    
    if (!tokenMint || !poolAddress) {
      return res.status(400).json({ error: 'tokenMint and poolAddress required' });
    }

    const campaign = await monitor.startCampaign(tokenMint, poolAddress);
    
    // Track user campaigns
    if (!userCampaigns.has(userId)) {
      userCampaigns.set(userId, new Set());
    }
    userCampaigns.get(userId)!.add(campaign.id);
    
    res.json({ 
      success: true, 
      campaign
    });
  } catch (error: any) {
    console.error('❌ Error starting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop a campaign
 */
router.post('/api/test-lab/campaign/stop', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    await monitor.stopCampaign(campaignId);
    
    res.json({ 
      success: true, 
      message: 'Campaign stopped' 
    });
  } catch (error: any) {
    console.error('❌ Error stopping campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get campaign details
 */
router.get('/api/test-lab/campaign/:id', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const campaign = monitor.getCampaign(id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    res.json({ success: true, campaign });
  } catch (error: any) {
    console.error('❌ Error getting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset campaign baseline
 */
router.post('/api/test-lab/campaign/reset', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    monitor.resetCampaign(campaignId);
    const campaign = monitor.getCampaign(campaignId);
    
    res.json({ 
      success: true, 
      campaign
    });
  } catch (error: any) {
    console.error('❌ Error resetting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Add alert to campaign
 */
router.post('/api/test-lab/alerts', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId, targetPercent, direction } = req.body;
    
    if (!campaignId || targetPercent === undefined || !direction) {
      return res.status(400).json({ error: 'campaignId, targetPercent and direction required' });
    }

    const alert = monitor.addAlert(campaignId, targetPercent, direction);
    
    if (!alert) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    res.json({ 
      success: true, 
      alert
    });
  } catch (error: any) {
    console.error('❌ Error adding alert:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get alerts for campaign
 */
router.get('/api/test-lab/alerts/:campaignId', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    
    const alerts = monitor.getAlerts(campaignId);
    
    res.json({ success: true, alerts });
  } catch (error: any) {
    console.error('❌ Error getting alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all campaigns
 */
router.get('/api/test-lab/campaigns', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const userCampaignIds = userCampaigns.get(userId) || new Set();
    
    const campaigns = monitor.getActiveCampaigns()
      .filter(c => userCampaignIds.has(c.id));
    
    res.json({ success: true, campaigns });
  } catch (error: any) {
    console.error('❌ Error getting campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});


// Forward events to Socket.IO
monitor.on('price_update', (data) => {
  if (io) {
    io.emit('campaign_price_update', data);
  }
});

monitor.on('alert_triggered', (data) => {
  if (io) {
    // Find user who owns this campaign
    for (const [userId, campaigns] of userCampaigns.entries()) {
      if (campaigns.has(data.campaignId)) {
        io.to(`user_${userId}`).emit('alert_triggered', data);
        break;
      }
    }
  }
});

export default router;

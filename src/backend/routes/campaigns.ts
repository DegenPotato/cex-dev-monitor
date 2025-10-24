import express from 'express';
import { getCampaignManager } from '../services/CampaignManager.js';
import { getCampaignExecutor } from '../services/CampaignExecutor.js';
import { getSolanaEventDetector } from '../services/SolanaEventDetector.js';
import SecureAuthService from '../lib/auth/SecureAuthService.js';
import { Campaign, CampaignNode } from '../models/Campaign.js';

const router = express.Router();
const authService = new SecureAuthService();
const campaignManager = getCampaignManager();

// ==================== Campaign CRUD ====================

// Create new campaign
router.post('/campaigns', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const campaignData: Partial<Campaign> = req.body;

        const campaign = await campaignManager.createCampaign(userId, campaignData);
        
        res.json({
            success: true,
            campaign
        });
    } catch (error: any) {
        console.error('Failed to create campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all user campaigns
router.get('/campaigns', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const campaigns = await campaignManager.getUserCampaigns(userId);
        
        res.json({
            success: true,
            campaigns
        });
    } catch (error: any) {
        console.error('Failed to get campaigns:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get campaign templates
router.get('/campaigns/templates', authService.requireSecureAuth(), async (req, res) => {
    try {
        const templates = campaignManager.getPresetTemplates();
        
        res.json({
            success: true,
            templates
        });
    } catch (error: any) {
        console.error('Failed to get templates:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get campaign stats
router.get('/campaigns/stats', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const stats = await campaignManager.getCampaignStats(userId);
        
        res.json({
            success: true,
            stats
        });
    } catch (error: any) {
        console.error('Failed to get campaign stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single campaign with details
router.get('/campaigns/:id', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const campaignId = parseInt(req.params.id);
        
        const campaign = await campaignManager.getCampaign(campaignId, userId);
        
        if (!campaign) {
            return res.status(404).json({
                success: false,
                error: 'Campaign not found'
            });
        }
        
        res.json({
            success: true,
            campaign
        });
    } catch (error: any) {
        console.error('Failed to get campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update campaign
router.put('/campaigns/:id', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const campaignId = parseInt(req.params.id);
        const updates: Partial<Campaign> = req.body;
        
        await campaignManager.updateCampaign(campaignId, userId, updates);
        
        res.json({
            success: true,
            message: 'Campaign updated successfully'
        });
    } catch (error: any) {
        console.error('Failed to update campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete campaign
router.delete('/campaigns/:id', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const campaignId = parseInt(req.params.id);
        
        const deleted = await campaignManager.deleteCampaign(campaignId, userId);
        
        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Campaign not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Campaign deleted successfully'
        });
    } catch (error: any) {
        console.error('Failed to delete campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Activate campaign
router.post('/campaigns/:id/activate', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const campaignId = parseInt(req.params.id);
        
        await campaignManager.activateCampaign(campaignId, userId);
        
        res.json({
            success: true,
            message: 'Campaign activated successfully'
        });
    } catch (error: any) {
        console.error('Failed to activate campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Deactivate campaign
router.post('/campaigns/:id/deactivate', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const campaignId = parseInt(req.params.id);
        
        await campaignManager.deactivateCampaign(campaignId, userId);
        
        res.json({
            success: true,
            message: 'Campaign deactivated successfully'
        });
    } catch (error: any) {
        console.error('Failed to deactivate campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== Node Management ====================

// Add node to campaign
router.post('/campaigns/:id/nodes', authService.requireSecureAuth(), async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const node: CampaignNode = req.body;
        
        const newNode = await campaignManager.addNode(campaignId, node);
        
        res.json({
            success: true,
            node: newNode
        });
    } catch (error: any) {
        console.error('Failed to add node:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update node
router.put('/campaigns/:id/nodes/:nodeId', authService.requireSecureAuth(), async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const nodeId = req.params.nodeId;
        const updates: Partial<CampaignNode> = req.body;
        
        await campaignManager.updateNode(campaignId, nodeId, updates);
        
        res.json({
            success: true,
            message: 'Node updated successfully'
        });
    } catch (error: any) {
        console.error('Failed to update node:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete node
router.delete('/campaigns/:id/nodes/:nodeId', authService.requireSecureAuth(), async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const nodeId = req.params.nodeId;
        
        await campaignManager.deleteNode(campaignId, nodeId);
        
        res.json({
            success: true,
            message: 'Node deleted successfully'
        });
    } catch (error: any) {
        console.error('Failed to delete node:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== Runtime & Monitoring ====================

// Get campaign instances/logs
router.get('/campaigns/:id/logs', authService.requireSecureAuth(), async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit as string) || 50;
        
        const instances = await campaignManager.getInstanceHistory(campaignId, limit);
        
        res.json({
            success: true,
            instances
        });
    } catch (error: any) {
        console.error('Failed to get campaign logs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get instance events
router.get('/campaigns/instances/:instanceId/events', authService.requireSecureAuth(), async (req, res) => {
    try {
        const instanceId = parseInt(req.params.instanceId);
        const events = await campaignManager.getCampaignEvents(instanceId);
        
        res.json({
            success: true,
            events
        });
    } catch (error: any) {
        console.error('Failed to get instance events:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get running instances
router.get('/campaigns/instances/running', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const instances = await campaignManager.getRunningInstances(userId);
        
        res.json({
            success: true,
            instances
        });
    } catch (error: any) {
        console.error('Failed to get running instances:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get campaign metrics
router.get('/campaigns/:id/metrics', authService.requireSecureAuth(), async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const days = parseInt(req.query.days as string) || 7;
        
        const metrics = await campaignManager.getCampaignMetrics(campaignId, days);
        
        res.json({
            success: true,
            metrics
        });
    } catch (error: any) {
        console.error('Failed to get campaign metrics:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== Alerts ====================

// Get alerts
router.get('/campaigns/alerts', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const acknowledged = req.query.acknowledged === 'true';
        
        const alerts = await campaignManager.getCampaignAlerts(userId, acknowledged);
        
        res.json({
            success: true,
            alerts
        });
    } catch (error: any) {
        console.error('Failed to get alerts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Acknowledge alert
router.post('/campaigns/alerts/:id/acknowledge', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const alertId = parseInt(req.params.id);
        
        await campaignManager.acknowledgeAlert(alertId, userId);
        
        res.json({
            success: true,
            message: 'Alert acknowledged'
        });
    } catch (error: any) {
        console.error('Failed to acknowledge alert:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== Templates ====================

// Import campaign from template
router.post('/campaigns/import', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const template = req.body;
        
        const campaign = await campaignManager.importCampaignFromTemplate(userId, template);
        
        res.json({
            success: true,
            campaign
        });
    } catch (error: any) {
        console.error('Failed to import campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export campaign as template
router.get('/campaigns/:id/export', authService.requireSecureAuth(), async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const template = await campaignManager.exportCampaignAsTemplate(campaignId);
        
        res.json({
            success: true,
            template
        });
    } catch (error: any) {
        console.error('Failed to export campaign:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== Manual Testing ====================

// Manually trigger campaign for testing (dev only)
router.post('/campaigns/:id/test-trigger', authService.requireSecureAuth(), async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                error: 'Test trigger not available in production'
            });
        }

        const campaignId = parseInt(req.params.id);
        const { wallet, signature } = req.body;
        
        // Get campaign
        const campaign = await campaignManager.getCampaign(campaignId);
        if (!campaign) {
            return res.status(404).json({
                success: false,
                error: 'Campaign not found'
            });
        }

        // Manually check wallet for triggers
        const detector = getSolanaEventDetector();
        if (wallet) {
            await detector.checkWalletForTriggers(wallet);
        }

        res.json({
            success: true,
            message: 'Test trigger initiated'
        });
    } catch (error: any) {
        console.error('Failed to test trigger:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;

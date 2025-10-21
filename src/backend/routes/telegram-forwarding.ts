/**
 * Telegram Auto-Forwarding API Routes
 */

import express, { Request } from 'express';
import { telegramForwardingService } from '../services/TelegramForwardingService.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();
const router = express.Router();

interface AuthenticatedRequest extends Request {
  user?: { id: number; username: string };
}

/**
 * Get all forwarding rules for the authenticated user
 */
router.get('/rules', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const rules = await telegramForwardingService.getUserRules(userId);
    
    res.json({ success: true, rules });
  } catch (error: any) {
    console.error('❌ [API] Error fetching forwarding rules:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a new forwarding rule
 */
router.post('/rules', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const ruleData = req.body;
    
    // Validate required fields
    if (!ruleData.sourceChatId || !ruleData.sourceAccountId || !ruleData.targetAccountId || !ruleData.targetChatIds) {
      return res.status(400).json({ 
        error: 'Missing required fields: sourceChatId, sourceAccountId, targetAccountId, targetChatIds' 
      });
    }
    
    const result = await telegramForwardingService.createRule(userId, {
      ...ruleData,
      userId
    });
    
    if (result.success) {
      res.json({ success: true, ruleId: result.ruleId });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('❌ [API] Error creating forwarding rule:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a forwarding rule
 */
router.delete('/rules/:ruleId', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const ruleId = parseInt(req.params.ruleId);
    
    const result = await telegramForwardingService.deleteRule(userId, ruleId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('❌ [API] Error deleting forwarding rule:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Toggle a forwarding rule
 */
router.patch('/rules/:ruleId/toggle', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const ruleId = parseInt(req.params.ruleId);
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }
    
    const result = await telegramForwardingService.toggleRule(userId, ruleId, isActive);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('❌ [API] Error toggling forwarding rule:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get forwarding statistics for a user
 */
router.get('/stats', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    
    // TODO: Implement comprehensive stats from forwarding_history table
    // For now, return basic rule stats
    const rules = await telegramForwardingService.getUserRules(userId);
    
    const stats = {
      totalRules: rules.length,
      activeRules: rules.filter(r => r.isActive).length,
      totalForwards: rules.reduce((sum, r) => sum + r.totalForwards, 0),
      failedForwards: rules.reduce((sum, r) => sum + r.failedForwards, 0),
      successRate: 0
    };
    
    if (stats.totalForwards > 0) {
      stats.successRate = ((stats.totalForwards - stats.failedForwards) / stats.totalForwards) * 100;
    }
    
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('❌ [API] Error fetching forwarding stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

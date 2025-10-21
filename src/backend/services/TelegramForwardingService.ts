/**
 * Telegram Auto-Forwarding Service
 * Handles rate-limited message forwarding with comprehensive tracking
 */

import { EventEmitter } from 'events';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { apiProviderTracker } from './ApiProviderTracker.js';

interface ForwardingRule {
  id: number;
  userId: number;
  ruleName: string;
  sourceChatId: string;
  sourceAccountId: number;
  targetChatIds: string[]; // JSON parsed
  targetAccountId: number;
  filterUserIds: number[] | null;
  filterKeywords: string[] | null;
  filterMediaTypes: string[] | null;
  includeSenderInfo: boolean;
  forwardMode: 'copy' | 'forward';
  delaySeconds: number;
  maxForwardsPerMinute: number;
  maxForwardsPerHour: number;
  isActive: boolean;
  lastForwardAt: number | null;
  totalForwards: number;
  failedForwards: number;
}

interface ForwardAttempt {
  ruleId: number;
  timestamp: number;
}

export class TelegramForwardingService extends EventEmitter {
  private static instance: TelegramForwardingService;
  private ruleCache: Map<number, ForwardingRule> = new Map();
  private recentForwards: Map<number, ForwardAttempt[]> = new Map(); // Rule ID -> recent attempts
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
  private readonly HISTORY_RETENTION_DAYS = 7;

  private constructor() {
    super();
    this.loadActiveRules();
    
    // Cleanup old history every hour
    setInterval(() => this.cleanupOldHistory(), 60 * 60 * 1000);
  }

  static getInstance(): TelegramForwardingService {
    if (!TelegramForwardingService.instance) {
      TelegramForwardingService.instance = new TelegramForwardingService();
    }
    return TelegramForwardingService.instance;
  }

  /**
   * Load all active forwarding rules
   */
  private async loadActiveRules() {
    try {
      const rules = await queryAll(
        'SELECT * FROM telegram_forwarding_rules WHERE is_active = 1'
      ) as any[];

      this.ruleCache.clear();
      for (const rule of rules) {
        this.ruleCache.set(rule.id, this.parseRule(rule));
      }

      console.log(`✅ [Forwarding] Loaded ${rules.length} active forwarding rule(s)`);
    } catch (error) {
      console.error('❌ [Forwarding] Failed to load rules:', error);
    }
  }

  /**
   * Parse database rule to ForwardingRule object
   */
  private parseRule(dbRule: any): ForwardingRule {
    return {
      id: dbRule.id,
      userId: dbRule.user_id,
      ruleName: dbRule.rule_name,
      sourceChatId: dbRule.source_chat_id,
      sourceAccountId: dbRule.source_account_id,
      targetChatIds: JSON.parse(dbRule.target_chat_ids),
      targetAccountId: dbRule.target_account_id,
      filterUserIds: dbRule.filter_user_ids ? JSON.parse(dbRule.filter_user_ids) : null,
      filterKeywords: dbRule.filter_keywords ? JSON.parse(dbRule.filter_keywords) : null,
      filterMediaTypes: dbRule.filter_media_types ? JSON.parse(dbRule.filter_media_types) : null,
      includeSenderInfo: dbRule.include_sender_info === 1,
      forwardMode: dbRule.forward_mode || 'copy',
      delaySeconds: dbRule.delay_seconds || 0,
      maxForwardsPerMinute: dbRule.max_forwards_per_minute || 20,
      maxForwardsPerHour: dbRule.max_forwards_per_hour || 200,
      isActive: dbRule.is_active === 1,
      lastForwardAt: dbRule.last_forward_at,
      totalForwards: dbRule.total_forwards || 0,
      failedForwards: dbRule.failed_forwards || 0
    };
  }

  /**
   * Check if forwarding is allowed by rate limits
   */
  private canForward(rule: ForwardingRule): { allowed: boolean; reason?: string } {
    const ruleId = rule.id;
    const now = Date.now();
    
    // Get recent forwards for this rule
    let recentAttempts = this.recentForwards.get(ruleId) || [];
    
    // Clean up old attempts (older than 1 hour)
    recentAttempts = recentAttempts.filter(
      attempt => now - attempt.timestamp < 60 * 60 * 1000
    );
    this.recentForwards.set(ruleId, recentAttempts);
    
    // Check per-minute limit
    const attemptsLastMinute = recentAttempts.filter(
      attempt => now - attempt.timestamp < this.RATE_LIMIT_WINDOW_MS
    ).length;
    
    if (attemptsLastMinute >= rule.maxForwardsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit: ${rule.maxForwardsPerMinute}/min exceeded`
      };
    }
    
    // Check per-hour limit
    const attemptsLastHour = recentAttempts.length;
    if (attemptsLastHour >= rule.maxForwardsPerHour) {
      return {
        allowed: false,
        reason: `Rate limit: ${rule.maxForwardsPerHour}/hour exceeded`
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check if message passes filters
   */
  private messagePassesFilters(
    rule: ForwardingRule,
    message: {
      senderId?: string;
      text?: string;
      mediaType?: string;
    }
  ): boolean {
    // Filter by user ID
    if (rule.filterUserIds && rule.filterUserIds.length > 0) {
      if (!message.senderId || !rule.filterUserIds.includes(parseInt(message.senderId))) {
        return false;
      }
    }
    
    // Filter by keywords
    if (rule.filterKeywords && rule.filterKeywords.length > 0 && message.text) {
      const hasKeyword = rule.filterKeywords.some(keyword =>
        message.text!.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!hasKeyword) return false;
    }
    
    // Filter by media type
    if (rule.filterMediaTypes && rule.filterMediaTypes.length > 0 && message.mediaType) {
      if (!rule.filterMediaTypes.includes(message.mediaType)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Forward a message according to rules
   */
  async forwardMessage(
    sourceChatId: string,
    sourceAccountId: number,
    message: {
      id: number;
      senderId?: string;
      senderUsername?: string;
      text?: string;
      mediaType?: string;
      [key: string]: any;
    },
    clientProvider: (accountId: number) => Promise<any> // Function to get Telegram client
  ): Promise<void> {
    const startTime = Date.now();
    
    // Find applicable rules
    const applicableRules = Array.from(this.ruleCache.values()).filter(
      rule =>
        rule.isActive &&
        rule.sourceChatId === sourceChatId &&
        rule.sourceAccountId === sourceAccountId &&
        this.messagePassesFilters(rule, message)
    );
    
    if (applicableRules.length === 0) {
      return; // No rules apply to this message
    }
    
    console.log(`📨 [Forwarding] Processing ${applicableRules.length} rule(s) for message ${message.id}`);
    
    for (const rule of applicableRules) {
      // Check rate limits
      const rateLimitCheck = this.canForward(rule);
      if (!rateLimitCheck.allowed) {
        console.warn(`⚠️  [Forwarding] Rate limited for rule "${rule.ruleName}": ${rateLimitCheck.reason}`);
        await this.logForwardingHistory(rule.id, rule.userId, sourceChatId, message, null, 'rate_limited', rateLimitCheck.reason, 0);
        continue;
      }
      
      // Apply delay if configured
      if (rule.delaySeconds > 0) {
        await new Promise(resolve => setTimeout(resolve, rule.delaySeconds * 1000));
      }
      
      // Get client for forwarding
      let client;
      try {
        client = await clientProvider(rule.targetAccountId);
      } catch (error: any) {
        console.error(`❌ [Forwarding] Failed to get client for account ${rule.targetAccountId}:`, error.message);
        await this.logForwardingHistory(rule.id, rule.userId, sourceChatId, message, null, 'failed', `Client error: ${error.message}`, Date.now() - startTime);
        continue;
      }
      
      // Forward to each target chat
      for (const targetChatId of rule.targetChatIds) {
        const forwardStartTime = Date.now();
        
        try {
          console.log(`  ➡️  Forwarding to ${targetChatId} using account ${rule.targetAccountId}...`);
          
          // Perform the forward
          let forwardedMessage;
          if (rule.forwardMode === 'forward') {
            // Use Telegram's native forward (shows "Forwarded from")
            forwardedMessage = await client.forwardMessages(targetChatId, {
              messages: [message.id],
              fromPeer: sourceChatId
            });
          } else {
            // Copy message (doesn't show forward attribution)
            let messageText = message.text || '';
            if (rule.includeSenderInfo && message.senderUsername) {
              messageText = `From @${message.senderUsername}:\n\n${messageText}`;
            }
            
            forwardedMessage = await client.sendMessage(targetChatId, {
              message: messageText,
              // TODO: Copy media if present
            });
          }
          
          const responseTime = Date.now() - forwardStartTime;
          
          // Track with API provider tracker
          apiProviderTracker.trackCall(
            'telegram',
            rule.forwardMode === 'forward' ? 'forwardMessages' : 'sendMessage',
            true,
            responseTime,
            200
          );
          
          // Log success
          await this.logForwardingHistory(
            rule.id,
            rule.userId,
            sourceChatId,
            message,
            targetChatId,
            'success',
            null,
            responseTime
          );
          
          // Track forward attempt for rate limiting
          this.trackForwardAttempt(rule.id);
          
          // Update rule stats
          await this.updateRuleStats(rule.id, true);
          
          console.log(`  ✅ Forwarded successfully to ${targetChatId} (${responseTime}ms)`);
          
        } catch (error: any) {
          const responseTime = Date.now() - forwardStartTime;
          
          console.error(`  ❌ Failed to forward to ${targetChatId}:`, error.message);
          
          // Track failed API call
          apiProviderTracker.trackCall(
            'telegram',
            rule.forwardMode === 'forward' ? 'forwardMessages' : 'sendMessage',
            false,
            responseTime,
            error.errorMessage === 'FLOOD' ? 429 : 500,
            error.message
          );
          
          // Log failure
          await this.logForwardingHistory(
            rule.id,
            rule.userId,
            sourceChatId,
            message,
            targetChatId,
            'failed',
            error.message,
            responseTime
          );
          
          // Update rule stats
          await this.updateRuleStats(rule.id, false);
          
          // If FloodWait error, temporarily disable the rule
          if (error.errorMessage === 'FLOOD') {
            console.warn(`⚠️  [Forwarding] FloodWait detected for rule "${rule.ruleName}", temporarily disabling...`);
            // Could implement auto-disable logic here
          }
        }
      }
    }
  }

  /**
   * Track forward attempt for rate limiting
   */
  private trackForwardAttempt(ruleId: number) {
    const attempts = this.recentForwards.get(ruleId) || [];
    attempts.push({ ruleId, timestamp: Date.now() });
    this.recentForwards.set(ruleId, attempts);
  }

  /**
   * Update rule statistics
   */
  private async updateRuleStats(ruleId: number, success: boolean) {
    const now = Math.floor(Date.now() / 1000);
    
    if (success) {
      await execute(`
        UPDATE telegram_forwarding_rules
        SET total_forwards = total_forwards + 1,
            last_forward_at = ?,
            updated_at = ?
        WHERE id = ?
      `, [now, now, ruleId]);
    } else {
      await execute(`
        UPDATE telegram_forwarding_rules
        SET failed_forwards = failed_forwards + 1,
            updated_at = ?
        WHERE id = ?
      `, [now, ruleId]);
    }
  }

  /**
   * Log forwarding history
   */
  private async logForwardingHistory(
    ruleId: number,
    userId: number,
    sourceChatId: string,
    message: any,
    targetChatId: string | null,
    status: 'success' | 'failed' | 'rate_limited',
    errorMessage: string | null,
    responseTimeMs: number
  ) {
    const now = Math.floor(Date.now() / 1000);
    
    await execute(`
      INSERT INTO telegram_forwarding_history
      (rule_id, user_id, source_chat_id, source_message_id, source_sender_id, source_sender_username,
       target_chat_id, target_message_id, status, error_message, response_time_ms, forwarded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ruleId,
      userId,
      sourceChatId,
      message.id,
      message.senderId || null,
      message.senderUsername || null,
      targetChatId,
      null, // target_message_id - could be extracted from response
      status,
      errorMessage,
      responseTimeMs,
      now
    ]);
  }

  /**
   * Cleanup old forwarding history
   */
  private async cleanupOldHistory() {
    const cutoffTime = Math.floor(Date.now() / 1000) - (this.HISTORY_RETENTION_DAYS * 24 * 60 * 60);
    
    try {
      const result = await execute(
        'DELETE FROM telegram_forwarding_history WHERE forwarded_at < ?',
        [cutoffTime]
      );
      
      console.log(`🗑️  [Forwarding] Cleaned up old history (${result.changes} records removed)`);
    } catch (error) {
      console.error('❌ [Forwarding] Failed to cleanup history:', error);
    }
  }

  /**
   * Create a new forwarding rule
   */
  async createRule(userId: number, rule: Partial<ForwardingRule>): Promise<{ success: boolean; ruleId?: number; error?: string }> {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      const result = await execute(`
        INSERT INTO telegram_forwarding_rules
        (user_id, rule_name, source_chat_id, source_account_id, target_chat_ids, target_account_id,
         filter_user_ids, filter_keywords, filter_media_types, include_sender_info, forward_mode,
         delay_seconds, max_forwards_per_minute, max_forwards_per_hour, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        rule.ruleName || 'Untitled Rule',
        rule.sourceChatId,
        rule.sourceAccountId,
        JSON.stringify(rule.targetChatIds || []),
        rule.targetAccountId,
        rule.filterUserIds ? JSON.stringify(rule.filterUserIds) : null,
        rule.filterKeywords ? JSON.stringify(rule.filterKeywords) : null,
        rule.filterMediaTypes ? JSON.stringify(rule.filterMediaTypes) : null,
        rule.includeSenderInfo ? 1 : 0,
        rule.forwardMode || 'copy',
        rule.delaySeconds || 0,
        rule.maxForwardsPerMinute || 20,
        rule.maxForwardsPerHour || 200,
        rule.isActive !== false ? 1 : 0,
        now,
        now
      ]);
      
      await this.loadActiveRules(); // Refresh cache
      
      return { success: true, ruleId: result.lastInsertRowid as number };
    } catch (error: any) {
      console.error('❌ [Forwarding] Failed to create rule:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all rules for a user
   */
  async getUserRules(userId: number): Promise<ForwardingRule[]> {
    const rules = await queryAll(
      'SELECT * FROM telegram_forwarding_rules WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    ) as any[];
    
    return rules.map(rule => this.parseRule(rule));
  }

  /**
   * Delete a forwarding rule
   */
  async deleteRule(userId: number, ruleId: number): Promise<{ success: boolean; error?: string }> {
    try {
      await execute(
        'DELETE FROM telegram_forwarding_rules WHERE id = ? AND user_id = ?',
        [ruleId, userId]
      );
      
      this.ruleCache.delete(ruleId);
      this.recentForwards.delete(ruleId);
      
      return { success: true };
    } catch (error: any) {
      console.error('❌ [Forwarding] Failed to delete rule:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle rule active status
   */
  async toggleRule(userId: number, ruleId: number, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      await execute(
        'UPDATE telegram_forwarding_rules SET is_active = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        [isActive ? 1 : 0, now, ruleId, userId]
      );
      
      await this.loadActiveRules(); // Refresh cache
      
      return { success: true };
    } catch (error: any) {
      console.error('❌ [Forwarding] Failed to toggle rule:', error);
      return { success: false, error: error.message };
    }
  }
}

export const telegramForwardingService = TelegramForwardingService.getInstance();

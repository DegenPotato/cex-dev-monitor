/**
 * Telegram Auto-Forwarding Service
 * Handles rate-limited message forwarding with comprehensive tracking
 */

import { EventEmitter } from 'events';
import { queryAll, queryOne, execute } from '../database/helpers.js';
import { apiProviderTracker } from './ApiProviderTracker.js';
import { telegramEntityCache } from './TelegramEntityCache.js';

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
  private entityCache: Map<string, any> = new Map(); // Cache resolved entities
  private lastUserForwardTime: number = 0; // Track last user forward time

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
        await this.logForwardingHistory(rule.id, rule.userId, sourceChatId, message, null, 'rate_limited', rateLimitCheck.reason || null, 0);
        continue;
      }
      
      // Apply delay if configured
      if (rule.delaySeconds > 0) {
        await new Promise(resolve => setTimeout(resolve, rule.delaySeconds * 1000));
      }
      
      // Pre-load entities to avoid cache misses
      try {
        await telegramEntityCache.preloadEntities(
          await clientProvider(rule.targetAccountId),
          rule.targetChatIds
        );
      } catch (e) {
        console.log(`  ⚠️ Entity pre-load failed, will try direct resolution`);
      }
      
      // Get client for target account (to forward messages) - use the selected account
      const client = await clientProvider(rule.targetAccountId);
      
      // Check if the account is a bot (bots can't forward to users)
      let isBot = false;
      try {
        const me = await client.getMe();
        isBot = me.bot || false;
      } catch (e) {
        console.log(`  ⚠️ Could not check if account is bot`);
      }
      
      // Forward to each target chat
      for (const targetChatId of rule.targetChatIds) {
        const forwardStartTime = Date.now();
        let targetEntity: any; // Declare here so it's accessible in catch block
        
        try {
          console.log(`  ➡️  Forwarding to ${targetChatId} using account ${rule.targetAccountId}...`);
          
          // Check if it's a numeric user ID
          const isUserId = /^\d+$/.test(targetChatId);
          
          // If it's a user ID and we're using a bot account, skip with clear error
          if (isUserId && isBot) {
            throw new Error(`Cannot forward to user ${targetChatId}: Bot accounts cannot initiate conversations with users. Please use a user account for forwarding.`);
          }
          
          // Add delay for user forwards to avoid rate limits
          if (isUserId) {
            const timeSinceLastForward = Date.now() - this.lastUserForwardTime;
            if (timeSinceLastForward < 3000) {
              const waitTime = 3000 - timeSinceLastForward;
              console.log(`  ⏱️ Waiting ${waitTime}ms to avoid user forward rate limit...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            this.lastUserForwardTime = Date.now();
          }
          
          // Resolve target entity
          if (isUserId) {
            // This is a user ID - need special handling
            console.log(`  🔍 Resolving user ID: ${targetChatId}`);
            
            // Check entity cache first
            const cacheKey = `entity_${targetChatId}_${rule.targetAccountId}`;
            if (this.entityCache.has(cacheKey)) {
              targetEntity = this.entityCache.get(cacheKey);
              console.log(`  📦 Using cached entity for user ${targetChatId}`);
            } else {
              // Pre-load entities to warm up the cache
              try {
                await telegramEntityCache.preloadEntities(client, [targetChatId]);
                console.log(`  ✅ Pre-loaded entity cache`);
              } catch (e) {
                console.log(`  ⚠️ Cache pre-load failed: ${e}`);
              }
              
              try {
                // Method 1: Try with different client methods
                const dialogs = await client.getDialogs({ limit: 100 });
                const userDialog = dialogs.find((d: any) => 
                  d.entity?.id?.toString() === targetChatId
                );
                
                if (userDialog) {
                  targetEntity = userDialog.entity;
                  console.log(`  ✅ Found user in dialogs`);
                } else {
                  // Method 2: Try to get input entity with int conversion
                  targetEntity = await client.getInputEntity(parseInt(targetChatId));
                  console.log(`  ✅ Got input entity for user`);
                }
                
                // Cache the entity for future use
                this.entityCache.set(cacheKey, targetEntity);
                console.log(`  💾 Cached entity for user ${targetChatId}`);
              } catch (error: any) {
                console.log(`  ⚠️ Resolution failed: ${error.message}`);
                
                // Check if error indicates we haven't interacted with this user
                if (error.message?.includes('Could not find the input entity') || 
                    error.message?.includes('PEER_ID_INVALID')) {
                  throw new Error(
                    `Cannot forward to user ${targetChatId}: No existing conversation found. ` +
                    `The user must have previously messaged this account, or you must initiate ` +
                    `a conversation with them first. Try sending a message manually to establish contact.`
                  );
                } else {
                  throw error;
                }
              }
            }
          } else {
            // For groups/channels (start with -), resolve normally
            try {
              targetEntity = await client.getEntity(targetChatId);
              console.log(`  ✅ Resolved group/channel entity`);
            } catch (e) {
              console.log(`  ⚠️ Using ${targetChatId} as-is`);
              targetEntity = targetChatId;
            }
          }
          
          // Perform the forward
          if (rule.forwardMode === 'forward') {
            // Use Telegram's native forward (shows "Forwarded from")
            await client.forwardMessages(targetEntity, {
              messages: [message.id],
              fromPeer: sourceChatId
            });
          } else {
            // Copy message (doesn't show forward attribution)
            let messageText = message.text || '';
            if (rule.includeSenderInfo && message.senderUsername) {
              messageText = `From @${message.senderUsername}:\n\n${messageText}`;
            }
            
            await client.sendMessage(targetEntity, {
              message: messageText || '',
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
          
          // REFRESH ENTITIES AFTER SUCCESSFUL FORWARD
          // This helps resolve entity issues for future forwards
          if (isUserId) {
            console.log(`  🔄 Refreshing dialogs after forward to maintain entity cache...`);
            try {
              // Refresh dialogs in background (don't await to avoid delays)
              client.getDialogs({ limit: 10 }).catch((e: any) => {
                console.log(`  ⚠️ Background dialog refresh failed: ${e.message}`);
              });
            } catch (e) {
              // Silent fail - this is just cache maintenance
            }
          }
          
        } catch (error: any) {
          const responseTime = Date.now() - forwardStartTime;
          
          // Check for flood wait error
          if (error.message?.includes('A wait of') && error.message?.includes('seconds is required')) {
            const waitMatch = error.message.match(/A wait of (\d+) seconds/);
            if (waitMatch) {
              const waitSeconds = parseInt(waitMatch[1]);
              console.log(`  ⏱️ Telegram rate limit: waiting ${waitSeconds}s before retry...`);
              
              // Wait the required time
              await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
              
              // Retry the forward after waiting
              try {
                console.log(`  🔄 Retrying forward to ${targetChatId} after rate limit wait...`);
                
                if (rule.forwardMode === 'forward') {
                  await client.forwardMessages(targetEntity, {
                    messages: [message.id],
                    fromPeer: sourceChatId
                  });
                } else {
                  let messageText = message.text || '';
                  if (rule.includeSenderInfo && message.senderUsername) {
                    messageText = `From @${message.senderUsername}:\n\n${messageText}`;
                  }
                  
                  await client.sendMessage(targetEntity, {
                    message: messageText || ''
                  });
                }
                
                const retryResponseTime = Date.now() - forwardStartTime;
                console.log(`  ✅ Retry successful for ${targetChatId} after ${waitSeconds}s wait (total ${retryResponseTime}ms)`);
                
                // Log success
                await this.logForwardingHistory(
                  rule.id,
                  rule.userId,
                  sourceChatId,
                  message,
                  targetChatId,
                  'success',
                  `Succeeded after ${waitSeconds}s rate limit wait`,
                  retryResponseTime
                );
                
                // Track forward attempt for rate limiting
                this.trackForwardAttempt(rule.id);
                
                // Update rule stats
                await this.updateRuleStats(rule.id, true);
                
                continue; // Skip the error handling below
              } catch (retryError: any) {
                console.error(`  ❌ Retry also failed for ${targetChatId}:`, retryError.message);
                error.message = `Retry failed after ${waitSeconds}s wait: ${retryError.message}`;
              }
            }
          }
          
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
      await execute(
        'DELETE FROM telegram_forwarding_history WHERE forwarded_at < ?',
        [cutoffTime]
      );
      
      console.log(`🗑️  [Forwarding] Cleaned up old history`);
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
      
      await execute(`
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
      
      // Get the last inserted rule ID
      const result = await queryOne<{ id: number }>(
        `SELECT id FROM telegram_forwarding_rules 
         WHERE user_id = ? AND rule_name = ? 
         ORDER BY id DESC LIMIT 1`,
        [userId, rule.ruleName || 'Untitled Rule']
      );
      const ruleId = result?.id;
      await this.loadActiveRules(); // Refresh cache
      
      return { success: true, ruleId };
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

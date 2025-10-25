/**
 * Telegram Intelligence Service
 * Connects Telegram sniffer data to the intelligence tracking system
 * Tracks callers/KOLs, token calls, and performance metrics
 */

import { queryOne, execute } from '../database/helpers.js';
import { tokenPriceOracle } from './TokenPriceOracle.js';

interface CallerInfo {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isBot?: boolean;
  isPremium?: boolean;
  isVerified?: boolean;
}

interface TokenCall {
  contractAddress: string;
  chatId: string;
  messageId: string;
  callTimestamp: number;
  callMessage?: string;
  tokenSymbol?: string;
  tokenName?: string;
  priceAtCall?: number;
  mcapAtCall?: number;
  confidenceScore?: number;
}

class TelegramIntelligenceService {
  private static instance: TelegramIntelligenceService;
  
  private constructor() {}
  
  static getInstance(): TelegramIntelligenceService {
    if (!TelegramIntelligenceService.instance) {
      TelegramIntelligenceService.instance = new TelegramIntelligenceService();
    }
    return TelegramIntelligenceService.instance;
  }

  /**
   * Track or update a caller/KOL
   */
  async trackCaller(userId: number, caller: CallerInfo): Promise<number> {
    try {
      // Check if caller already exists
      const existing = await queryOne(
        'SELECT id FROM telegram_callers WHERE user_id = ? AND telegram_user_id = ?',
        [userId, caller.telegramUserId]
      );

      if (existing) {
        // Update existing caller
        await execute(`
          UPDATE telegram_callers 
          SET username = ?, first_name = ?, last_name = ?, 
              is_bot = ?, is_premium = ?, is_verified = ?,
              last_seen = ?, updated_at = ?
          WHERE id = ?
        `, [
          caller.username || null, 
          caller.firstName || null, 
          caller.lastName || null, 
          caller.isBot ? 1 : 0, 
          caller.isPremium ? 1 : 0, 
          caller.isVerified ? 1 : 0, 
          Date.now(), 
          Date.now(), 
          (existing as any).id
        ]);
        
        return (existing as any).id;
      } else {
        // Insert new caller
        await execute(`
          INSERT INTO telegram_callers (
            user_id, telegram_user_id, username, first_name, last_name,
            is_bot, is_premium, is_verified, first_seen, last_seen, 
            total_calls, successful_calls, avg_peak_multiplier, avg_time_to_peak,
            total_volume_generated, win_rate, reputation_score, trust_level,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 50, 'neutral', ?, ?)
        `, [
          userId, 
          caller.telegramUserId, 
          caller.username || null, 
          caller.firstName || null, 
          caller.lastName || null,
          caller.isBot ? 1 : 0, 
          caller.isPremium ? 1 : 0, 
          caller.isVerified ? 1 : 0,
          Date.now(), 
          Date.now(), 
          Date.now(),
          Date.now()
        ]);
        
        const newCaller = await queryOne(
          'SELECT id FROM telegram_callers WHERE user_id = ? AND telegram_user_id = ?',
          [userId, caller.telegramUserId]
        );
        
        console.log(`📊 [Intelligence] New caller tracked: ${caller.username || caller.telegramUserId}`);
        return (newCaller as any).id;
      }
    } catch (error: any) {
      console.error('❌ [Intelligence] Error tracking caller:', error.message);
      throw error;
    }
  }

  /**
   * Record a token call/shill
   */
  async recordTokenCall(
    userId: number, 
    callerId: number, 
    call: TokenCall
  ): Promise<number> {
    try {
      // Get current token price if available
      let priceData = null;
      try {
        const prices = await tokenPriceOracle.getTokenPrices([call.contractAddress]);
        if (prices.size > 0) {
          priceData = prices.get(call.contractAddress);
        }
      } catch (err) {
        console.log(`⚠️ [Intelligence] Could not fetch price for ${call.contractAddress.slice(0, 8)}...`);
      }

      await execute(`
        INSERT INTO telegram_token_calls (
          user_id, caller_id, chat_id, message_id, contract_address,
          token_symbol, token_name, call_timestamp, call_type, call_message,
          price_at_call, mcap_at_call, confidence_score, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId, 
        callerId, 
        call.chatId, 
        call.messageId, 
        call.contractAddress,
        call.tokenSymbol || priceData?.symbol || null, 
        call.tokenName || priceData?.name || null, 
        call.callTimestamp, 
        'shill', // Default type
        call.callMessage?.substring(0, 500) || null,
        call.priceAtCall || priceData?.priceUsd || null, 
        call.mcapAtCall || priceData?.marketCap || null, 
        call.confidenceScore || 0.5, // Default confidence
        Date.now(),
        Date.now()
      ]);

      // Update caller's total calls
      await execute(
        'UPDATE telegram_callers SET total_calls = total_calls + 1, last_call_date = ? WHERE id = ?',
        [call.callTimestamp, callerId]
      );

      // Update channel stats
      await execute(`
        INSERT INTO telegram_channel_stats (user_id, chat_id, total_calls, calls_today, last_updated)
        VALUES (?, ?, 1, 1, ?)
        ON CONFLICT(user_id, chat_id) DO UPDATE SET
          total_calls = total_calls + 1,
          calls_today = CASE 
            WHEN date(last_updated/1000, 'unixepoch') = date('now') THEN calls_today + 1
            ELSE 1
          END,
          last_updated = ?
      `, [userId, call.chatId, Date.now(), Date.now()]);

      const result = await queryOne(
        'SELECT last_insert_rowid() as id'
      );
      
      console.log(`📊 [Intelligence] Token call recorded: ${call.contractAddress.slice(0, 8)}... by caller ${callerId}`);
      
      // Schedule performance update in 5 minutes
      setTimeout(() => {
        this.updateCallPerformance((result as any).id, call.contractAddress);
      }, 5 * 60 * 1000);
      
      return (result as any).id;
    } catch (error: any) {
      console.error('❌ [Intelligence] Error recording token call:', error.message);
      throw error;
    }
  }

  /**
   * Update call performance metrics
   */
  async updateCallPerformance(callId: number, contractAddress: string): Promise<void> {
    try {
      // Get original call data
      const call = await queryOne(
        'SELECT price_at_call, mcap_at_call, call_timestamp, caller_id FROM telegram_token_calls WHERE id = ?',
        [callId]
      );
      
      if (!call) return;

      // Get current price data
      const prices = await tokenPriceOracle.getTokenPrices([contractAddress]);
      if (prices.size === 0) return;
      
      const currentData = prices.get(contractAddress)!;
      
      // Calculate multipliers
      const priceAtCall = (call as any).price_at_call || 0.000001;
      const currentMultiplier = currentData.priceUsd / priceAtCall;
      const isSuccessful = currentMultiplier >= 2; // 2x is considered successful
      
      // Update the call record
      await execute(`
        UPDATE telegram_token_calls SET
          current_price = ?, current_mcap = ?, current_multiplier = ?,
          volume_24h = ?, holder_count = ?, is_successful = ?,
          last_price_update = ?, updated_at = ?
        WHERE id = ?
      `, [
        currentData.priceUsd,
        currentData.marketCap,
        currentMultiplier,
        currentData.volume24h,
        null, // We don't have holder count from price oracle
        isSuccessful ? 1 : 0,
        Date.now(),
        Date.now(),
        callId
      ]);
      
      // Update caller metrics
      await this.updateCallerMetrics((call as any).caller_id);
      
      console.log(`📊 [Intelligence] Updated performance for call ${callId}: ${currentMultiplier.toFixed(2)}x`);
    } catch (error: any) {
      console.error('❌ [Intelligence] Error updating call performance:', error.message);
    }
  }
  
  /**
   * Update caller's aggregate metrics
   */
  async updateCallerMetrics(callerId: number): Promise<void> {
    try {
      // Get all calls for this caller
      const calls = await queryOne(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_successful = 1 THEN 1 ELSE 0 END) as successful,
          AVG(CASE WHEN ath_multiplier > 0 THEN ath_multiplier ELSE current_multiplier END) as avg_multiplier,
          AVG(time_to_ath) as avg_time_to_peak,
          SUM(volume_24h) as total_volume
        FROM telegram_token_calls 
        WHERE caller_id = ?
      `, [callerId]);
      
      if (!calls) return;
      
      const winRate = ((calls as any).successful / (calls as any).total) * 100;
      
      // Calculate reputation score
      let reputationScore = 50; // Base score
      reputationScore += (winRate / 100) * 30; // Win rate factor
      reputationScore += Math.min(20, (calls as any).total_volume / 1000000); // Volume factor
      reputationScore = Math.max(0, Math.min(100, reputationScore));
      
      // Determine trust level
      let trustLevel = 'neutral';
      if (reputationScore >= 80) trustLevel = 'trusted';
      else if (reputationScore >= 60) trustLevel = 'neutral';
      else if (reputationScore >= 40) trustLevel = 'suspicious';
      else trustLevel = 'scammer';
      
      // Update caller
      await execute(`
        UPDATE telegram_callers SET
          successful_calls = ?, 
          avg_peak_multiplier = ?, 
          avg_time_to_peak = ?,
          total_volume_generated = ?, 
          win_rate = ?, 
          reputation_score = ?,
          trust_level = ?, 
          updated_at = ?
        WHERE id = ?
      `, [
        (calls as any).successful || 0,
        (calls as any).avg_multiplier || 0,
        (calls as any).avg_time_to_peak || 0,
        (calls as any).total_volume || 0,
        winRate || 0,
        reputationScore,
        trustLevel,
        Date.now(),
        callerId
      ]);
    } catch (error: any) {
      console.error('❌ [Intelligence] Error updating caller metrics:', error.message);
    }
  }
  
  /**
   * Process a Telegram detection for intelligence
   */
  async processDetection(data: {
    userId: number;
    chatId: string;
    messageId: string;
    senderId?: string;
    senderUsername?: string;
    senderFirstName?: string;
    senderLastName?: string;
    senderIsPremium?: boolean;
    senderIsVerified?: boolean;
    senderIsBot?: boolean;
    contractAddress: string;
    messageText?: string;
    detectedAt: number;
  }): Promise<void> {
    try {
      if (!data.senderId) {
        console.log(`⚠️ [Intelligence] No sender ID for detection, skipping intelligence tracking`);
        return;
      }
      
      // Track the caller
      const callerId = await this.trackCaller(data.userId, {
        telegramUserId: data.senderId,
        username: data.senderUsername,
        firstName: data.senderFirstName,
        lastName: data.senderLastName,
        isBot: data.senderIsBot,
        isPremium: data.senderIsPremium,
        isVerified: data.senderIsVerified
      });
      
      // Record the token call
      await this.recordTokenCall(data.userId, callerId, {
        contractAddress: data.contractAddress,
        chatId: data.chatId,
        messageId: data.messageId,
        callTimestamp: data.detectedAt,
        callMessage: data.messageText
      });
      
    } catch (error: any) {
      console.error('❌ [Intelligence] Error processing detection:', error.message);
    }
  }
}

// Export singleton
export const telegramIntelligence = TelegramIntelligenceService.getInstance();

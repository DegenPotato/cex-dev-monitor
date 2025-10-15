import { queryOne, queryAll, execute, getLastInsertId } from '../../backend/database/helpers.js';

interface User {
  id: number;
  wallet_address: string;
  username: string;
  referral_code: string;
  referred_by: number | null;
  total_referrals: number;
  role: string;
}

interface ReferralChainLevel {
  level: number;
  userId: number;
  username: string;
  walletAddress: string;
  referralCode: string;
}

interface ReferralConfig {
  id: number;
  tier_level: number;
  commission_rate: number;
  min_referrals: number;
  max_commission: number | null;
  bonus_multiplier: number;
  is_active: number;
}

/**
 * Multi-Level Referral Tracking Provider (up to 10 levels deep)
 */
class ReferralTrackingProvider {
  private maxLevels = 10; // Maximum referral chain depth

  /**
   * Process referral attribution for new user registration
   */
  async processReferralAttribution(
    newUserId: number,
    referralCode: string | null
  ): Promise<{ success: boolean; attributed: boolean; referrer?: any; error?: string }> {
    try {
      console.log('[Referral Tracking] 🔗 Processing attribution for user ID:', newUserId, 'with code:', referralCode);

      if (!referralCode) {
        console.log('[Referral Tracking] No referral code provided, skipping attribution');
        return {
          success: true,
          attributed: false,
        };
      }

      // Find referrer by code
      const referrer = await queryOne<User>(
        'SELECT * FROM users WHERE referral_code = ?',
        [referralCode]
      );

      if (!referrer) {
        console.log('[Referral Tracking] ❌ Invalid referral code:', referralCode);
        return {
          success: false,
          attributed: false,
          error: 'Invalid referral code',
        };
      }

      // Get the new user to check for self-referral
      const newUser = await queryOne<User>('SELECT * FROM users WHERE id = ?', [newUserId]);

      if (!newUser) {
        return {
          success: false,
          attributed: false,
          error: 'New user not found',
        };
      }

      // Prevent self-referral
      if (referrer.wallet_address.toLowerCase() === newUser.wallet_address.toLowerCase()) {
        console.log('[Referral Tracking] ❌ Self-referral attempt blocked');
        return {
          success: false,
          attributed: false,
          error: 'Self-referral not allowed',
        };
      }

      // Update new user with referral attribution (store referrer's ID)
      await execute(
        'UPDATE users SET referred_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [referrer.id, newUserId]
      );

      // Update referrer's total referral count
      await execute(
        'UPDATE users SET total_referrals = total_referrals + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [referrer.id]
      );

      console.log('[Referral Tracking] ✅ Successfully attributed user to referrer:', referrer.username);

      return {
        success: true,
        attributed: true,
        referrer: {
          id: referrer.id,
          username: referrer.username,
          walletAddress: referrer.wallet_address,
          referralCode: referrer.referral_code,
        },
      };
    } catch (error: any) {
      console.error('[Referral Tracking] ❌ Error in referral attribution:', error);
      return {
        success: false,
        attributed: false,
        error: error.message,
      };
    }
  }

  /**
   * Get referral chain up to maxLevels deep
   */
  async getReferralChain(userId: number, maxLevels: number = this.maxLevels): Promise<ReferralChainLevel[]> {
    try {
      const chain: ReferralChainLevel[] = [];
      let currentUserId: number | null = userId;
      let level = 1;

      while (currentUserId && level <= maxLevels) {
        // Get user and their referrer
        const user = await queryOne<User>(
          'SELECT * FROM users WHERE id = ?',
          [currentUserId]
        );

        if (!user || !user.referred_by) {
          break; // End of chain
        }

        // Get the referrer
        const referrer = await queryOne<User>(
          'SELECT * FROM users WHERE id = ?',
          [user.referred_by]
        );

        if (!referrer) {
          break;
        }

        chain.push({
          level,
          userId: referrer.id,
          username: referrer.username,
          walletAddress: referrer.wallet_address,
          referralCode: referrer.referral_code,
        });

        currentUserId = referrer.referred_by;
        level++;
      }

      console.log(`[Referral Tracking] Found ${chain.length} levels in referral chain for user ${userId}`);
      return chain;
    } catch (error: any) {
      console.error('[Referral Tracking] ❌ Error getting referral chain:', error);
      return [];
    }
  }

  /**
   * Distribute referral commissions across multiple levels
   */
  async distributeReferralCommissions(
    userId: number,
    amount: number,
    activityType: string = 'transaction',
    metadata: Record<string, any> = {}
  ): Promise<{ success: boolean; distributed: number; commissions: any[] }> {
    try {
      console.log('[Referral Tracking] 💰 Distributing commissions for user:', userId, 'amount:', amount);

      // Get referral chain
      const referralChain = await this.getReferralChain(userId);

      if (referralChain.length === 0) {
        console.log('[Referral Tracking] No referral chain found for user:', userId);
        return {
          success: true,
          distributed: 0,
          commissions: [],
        };
      }

      const commissions: any[] = [];
      let totalCommissionDistributed = 0;

      // Process each level in the chain
      for (const chainLevel of referralChain) {
        try {
          // Calculate commission for this level
          const commission = await this.calculateCommission(chainLevel.level, amount);

          if (commission <= 0) {
            console.log(`[Referral Tracking] No commission for level ${chainLevel.level}`);
            continue;
          }

          // Create reward transaction record
          await execute(
            `INSERT INTO reward_transactions 
             (user_id, wallet_address, transaction_type, amount, points_awarded, description, metadata, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              chainLevel.userId,
              chainLevel.walletAddress,
              'referral_commission',
              commission,
              0,
              `Level ${chainLevel.level} referral commission from ${activityType}`,
              JSON.stringify({
                referral_level: chainLevel.level,
                referred_user_id: userId,
                activity_type: activityType,
                original_amount: amount,
                commission_rate: (commission / amount).toFixed(4),
                ...metadata,
              }),
              'completed',
            ]
          );

          // Update user's total commission earned
          await execute(
            'UPDATE users SET total_commission_earned = total_commission_earned + ? WHERE id = ?',
            [commission, chainLevel.userId]
          );

          totalCommissionDistributed += commission;
          commissions.push({
            level: chainLevel.level,
            userId: chainLevel.userId,
            username: chainLevel.username,
            amount: commission,
          });

          console.log(`[Referral Tracking] ✅ Distributed ${commission} to ${chainLevel.username} (Level ${chainLevel.level})`);
        } catch (error: any) {
          console.error(`[Referral Tracking] ❌ Error distributing to level ${chainLevel.level}:`, error);
          continue;
        }
      }

      console.log(`[Referral Tracking] ✅ Total distributed: ${totalCommissionDistributed} across ${commissions.length} levels`);

      return {
        success: true,
        distributed: totalCommissionDistributed,
        commissions,
      };
    } catch (error: any) {
      console.error('[Referral Tracking] ❌ Error in distribution:', error);
      return {
        success: false,
        distributed: 0,
        commissions: [],
      };
    }
  }

  /**
   * Calculate commission based on tier level
   */
  async calculateCommission(level: number, amount: number): Promise<number> {
    try {
      const config = await queryOne<ReferralConfig>(
        'SELECT * FROM referral_config WHERE tier_level = ? AND is_active = 1',
        [level]
      );

      if (!config) {
        console.log(`[Referral Tracking] No active config for level ${level}`);
        return 0;
      }

      let commission = amount * config.commission_rate;

      // Apply bonus multiplier if configured
      if (config.bonus_multiplier && config.bonus_multiplier !== 1.0) {
        commission *= config.bonus_multiplier;
      }

      // Apply max commission cap if configured
      if (config.max_commission && commission > config.max_commission) {
        commission = config.max_commission;
      }

      return commission;
    } catch (error: any) {
      console.error('[Referral Tracking] ❌ Error calculating commission:', error);
      return 0;
    }
  }

  /**
   * Get referral statistics for a user
   */
  async getReferralStats(userId: number): Promise<any> {
    try {
      const user = await queryOne<User>('SELECT * FROM users WHERE id = ?', [userId]);

      if (!user) {
        return null;
      }

      // Get direct referrals
      const directReferrals = await queryAll<User>(
        'SELECT id, username, wallet_address, created_at FROM users WHERE referred_by = ?',
        [userId]
      );

      // Get total commission earned
      const commissionSum = await queryOne<{ total: number }>(
        `SELECT SUM(amount) as total FROM reward_transactions 
         WHERE user_id = ? AND transaction_type = 'referral_commission' AND status = 'completed'`,
        [userId]
      );

      // Get referral chain depth
      const chain = await this.getReferralChain(userId);

      return {
        userId: user.id,
        username: user.username,
        referralCode: user.referral_code,
        totalReferrals: user.total_referrals,
        directReferrals: directReferrals.length,
        totalCommissionEarned: commissionSum?.total || 0,
        chainDepth: chain.length,
        directReferralsList: directReferrals,
      };
    } catch (error: any) {
      console.error('[Referral Tracking] ❌ Error getting referral stats:', error);
      return null;
    }
  }

  /**
   * Validate referral code
   */
  async validateReferralCode(code: string): Promise<{ valid: boolean; referrer?: any }> {
    try {
      const referrer = await queryOne<User>(
        'SELECT id, username, wallet_address, referral_code FROM users WHERE referral_code = ?',
        [code]
      );

      if (!referrer) {
        return { valid: false };
      }

      return {
        valid: true,
        referrer: {
          id: referrer.id,
          username: referrer.username,
          walletAddress: referrer.wallet_address,
          referralCode: referrer.referral_code,
        },
      };
    } catch (error: any) {
      console.error('[Referral Tracking] ❌ Error validating referral code:', error);
      return { valid: false };
    }
  }
}

export default ReferralTrackingProvider;

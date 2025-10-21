/**
 * Telegram Client Service using GramJS
 * Handles authentication with 2FA support and real-time message monitoring
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { apiProviderTracker } from './ApiProviderTracker.js';
import { execute, queryOne, queryAll } from '../database/helpers.js';

// Dynamic imports for telegram package
let TelegramClient: any;
let Api: any;
let StringSession: any;
let NewMessage: any;

// Load telegram modules dynamically
(async () => {
  const telegram = await import('telegram');
  TelegramClient = telegram.TelegramClient;
  Api = telegram.Api;
  const sessions = await import('telegram/sessions');
  StringSession = sessions.StringSession;
  const events = await import('telegram/events');
  NewMessage = events.NewMessage;
})();

interface AuthSession {
  userId: number;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  phoneCodeHash?: string;
  client?: any; // TelegramClient instance
  status: 'idle' | 'code_sent' | 'awaiting_code' | 'awaiting_2fa' | 'connected' | 'error';
  error?: string;
}

// Contract detection patterns (from your Python script)
const SOL_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const SOL_PATTERN_WITH_SPECIALS = /[1-9A-HJ-NP-Za-km-z]{8,}[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,}(?:[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,})*/g;

export class TelegramClientService extends EventEmitter {
  private sessions: Map<number, AuthSession> = new Map();
  private activeClients: Map<number, any> = new Map(); // TelegramClient instances
  private encryptionKey: string;

  constructor() {
    super();
    this.encryptionKey = process.env.TELEGRAM_ENCRYPTION_KEY || 'default-key-change-in-production';
    
    console.log('✅ [Telegram] TelegramClientService initialized');
    
    // Restore all saved sessions on startup
    this.restoreAllSessions().catch(err => {
      console.error('❌ [Telegram] Failed to restore sessions:', err);
    });
  }

  /**
   * Restore all saved sessions from database on server startup
   */
  async restoreAllSessions() {
    console.log('🔄 [Telegram] Restoring saved sessions...');
    
    try {
      const { queryAll } = await import('../database/helpers.js');
      
      // Get all verified accounts with session strings
      const accounts = await queryAll(
        'SELECT user_id, api_id, api_hash, phone_number, session_string FROM telegram_user_accounts WHERE is_verified = 1 AND session_string IS NOT NULL'
      ) as any[];
      
      if (!accounts || accounts.length === 0) {
        console.log('  ℹ️ No saved sessions to restore');
        return;
      }
      
      console.log(`  📦 Found ${accounts.length} saved session(s)`);
      
      for (const account of accounts) {
        try {
          const userId = account.user_id;
          const sessionString = this.decrypt(account.session_string);
          
          console.log(`  🔄 Restoring session for user ${userId}...`);
          
          // Create client with saved session
          const stringSession = new StringSession(sessionString);
          const client = new TelegramClient(stringSession, parseInt(account.api_id), account.api_hash, {
            connectionRetries: 5,
          });
          
          // Connect the client
          await client.connect();
          
          // Verify the session is still valid by getting user info
          const me = await client.getMe();
          
          // Store active client
          this.activeClients.set(userId, client);
          
          // Refresh user profile data
          await this.saveUserProfile(userId, client);
          
          // Start monitoring
          await this.startMonitoring(userId, client);
          
          console.log(`  ✅ Session restored for user ${userId} (@${me.username || me.firstName})`);
          
        } catch (error: any) {
          console.error(`  ❌ Failed to restore session for user ${account.user_id}:`, error.message);
          // Don't throw - continue with other sessions
        }
      }
      
      console.log(`✅ [Telegram] Session restoration complete. ${this.activeClients.size} client(s) connected`);
      
    } catch (error: any) {
      console.error('❌ [Telegram] Error in restoreAllSessions:', error);
      throw error;
    }
  }

  /**
   * Start authentication flow - sends code to phone
   */
  async startAuth(userId: number, apiId: string, apiHash: string, phoneNumber: string): Promise<any> {
    try {
      // Check if there's an existing session string in DB
      const existingSession = await queryOne(
        'SELECT session_string FROM telegram_user_accounts WHERE user_id = ?',
        [userId]
      ) as { session_string?: string } | null;

      // Decrypt the session string if it exists (it's stored encrypted)
      const sessionString = existingSession?.session_string ? this.decrypt(existingSession.session_string) : '';
      const session = new StringSession(sessionString);
      const client = new TelegramClient(session, parseInt(apiId), apiHash, {
        connectionRetries: 5,
      });

      // Store session info
      const authSession: AuthSession = {
        userId,
        apiId: parseInt(apiId),
        apiHash,
        phoneNumber,
        client,
        status: 'idle'
      };
      this.sessions.set(userId, authSession);

      // Connect to Telegram
      await client.connect();

      // If we have a valid session, we're already connected
      if (existingSession?.session_string) {
        try {
          const me = await client.getMe();
          if (me) {
            authSession.status = 'connected';
            this.activeClients.set(userId, client);
            await this.startMonitoring(userId, client);
            
            return {
              success: true,
              status: 'connected',
              message: 'Already authenticated!',
              user: {
                id: me.id,
                firstName: me.firstName,
                lastName: me.lastName,
                username: me.username,
                phone: me.phone
              }
            };
          }
        } catch (e) {
          // Session expired, continue with auth flow
        }
      }

      // Start the auth flow
      const { phoneCodeHash } = await client.sendCode(
        {
          apiId: parseInt(apiId),
          apiHash: apiHash,
        },
        phoneNumber
      );

      authSession.phoneCodeHash = phoneCodeHash;
      authSession.status = 'code_sent';

      return {
        success: true,
        status: 'code_sent',
        message: `Verification code sent to ${phoneNumber}`
      };
    } catch (error: any) {
      console.error('Auth start error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify the code sent to phone
   */
  async verifyCode(userId: number, code: string): Promise<any> {
    const session = this.sessions.get(userId);
    if (!session || !session.client) {
      return {
        success: false,
        error: 'No active auth session. Please start authentication first.'
      };
    }

    try {
      const client = session.client;
      
      // Try to sign in with the code
      const signInResult = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: session.phoneNumber,
          phoneCodeHash: session.phoneCodeHash!,
          phoneCode: code
        })
      );

      // Success! Save session
      const sessionString = (client.session.save() as unknown) as string;
      await this.saveSession(userId, sessionString);
      
      session.status = 'connected';
      this.activeClients.set(userId, client);
      
      // Save comprehensive user profile
      await this.saveUserProfile(userId, client);
      
      // Start monitoring
      await this.startMonitoring(userId, client);

      const result = signInResult as any;
      const user = result.user as any; // Api.User
      return {
        success: true,
        status: 'connected',
        message: 'Successfully authenticated!',
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          phone: user.phone
        }
      };
    } catch (error: any) {
      // Check if 2FA is required
      if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        session.status = 'awaiting_2fa';
        return {
          success: true,
          status: 'awaiting_2fa',
          message: '2FA is enabled. Please enter your password.'
        };
      }
      
      return {
        success: false,
        error: error.errorMessage || error.message
      };
    }
  }

  /**
   * Verify 2FA password
   */
  async verify2FA(userId: number, password: string): Promise<any> {
    const session = this.sessions.get(userId);
    if (!session || !session.client) {
      return {
        success: false,
        error: 'No active auth session'
      };
    }

    try {
      const client = session.client;
      
      // Get password info
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      
      // Compute password hash
      const passwordHash = await this.computePasswordHash(
        passwordInfo,
        password
      );

      // Sign in with password
      await client.invoke(
        new Api.auth.CheckPassword({
          password: passwordHash
        })
      );

      // Success! Save session
      const sessionString = (client.session.save() as unknown) as string;
      await this.saveSession(userId, sessionString);
      
      session.status = 'connected';
      this.activeClients.set(userId, client);
      
      // Save comprehensive user profile
      await this.saveUserProfile(userId, client);
      
      // Start monitoring
      await this.startMonitoring(userId, client);

      const me = await client.getMe();
      return {
        success: true,
        status: 'connected',
        message: 'Successfully authenticated with 2FA!',
        user: {
          id: me.id,
          firstName: me.firstName,
          lastName: me.lastName,
          username: me.username,
          phone: me.phone
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.errorMessage || error.message
      };
    }
  }

  /**
   * Compute SRP password hash for 2FA using telegram's built-in helper
   */
  private async computePasswordHash(
    passwordInfo: any, // Api.account.Password
    password: string
  ): Promise<any> { // Api.InputCheckPasswordSRP
    // Use telegram's built-in SRP computation
    const { computeCheck } = await import('telegram/Password.js');
    
    try {
      // computeCheck handles all the SRP protocol complexity
      const passwordHash = await computeCheck(passwordInfo, password);
      return passwordHash;
    } catch (error) {
      console.error('❌ [Telegram] SRP computation failed:', error);
      throw new Error('Failed to compute password hash');
    }
  }

  /**
   * Start monitoring for messages
   */
  private async startMonitoring(userId: number, client: any) { // TelegramClient 
    // Get user info for logging
    const me = await client.getMe();
    const userIdentifier = `User ${userId} (@${me.username || me.firstName})`;
    
    // Get monitored chats from database
    const chats = await this.getMonitoredChats(userId);
    const userFilters = await this.getUserFilters(userId);
    
    // Add message handler
    client.addEventHandler(async (event: any) => {
      try {
        const message = event.message;
        if (!message || !message.message) return;

        // Check if message is from monitored chat
        // For forum groups/topics, use peerId.channelId (for supergroups/channels)
        let chatId = message.chatId?.toString();
        if (message.peerId?.channelId) {
          chatId = `-100${message.peerId.channelId.toString()}`;
        } else if (message.peerId?.chatId) {
          chatId = message.peerId.chatId.toString();
        }
        
        const monitoredChat = chats.find(c => c.chatId === chatId);
        if (!monitoredChat) {
          console.log(`⏭️  [Telegram:${userIdentifier}] Message from unmonitored chat: ${chatId}`);
          return;
        }
        
        console.log(`📨 [Telegram:${userIdentifier}] Message in "${monitoredChat.chatName || chatId}" (${chatId})`);

        // Check if message is from filtered user (if filters exist)
        if (userFilters.length > 0) {
          const senderId = message.senderId?.toString();
          const isFilteredUser = userFilters.some(id => id.toString() === senderId);
          if (!isFilteredUser) return;
        }

        // Extract contract addresses
        const contracts = this.extractContracts(message.message);
        
        if (contracts.length > 0) {
          // Save to database and emit event
          for (const contract of contracts) {
            await this.saveDetectedContract(userId, {
              chatId: chatId!,
              messageId: message.id,
              senderId: message.senderId?.toString(),
              senderUsername: await this.getSenderUsername(client, message.senderId),
              contractAddress: contract.address,
              detectionType: contract.type,
              originalFormat: contract.original,
              messageText: message.message
            });

            // Emit event for real-time updates
            this.emit('contract_detected', {
              userId,
              chatId,
              contract: contract.address,
              type: contract.type,
              sender: message.senderId?.toString(),
              message: message.message
            });
          }
        }
      } catch (error) {
        console.error('Message processing error:', error);
      }
    }, new NewMessage({}));

    console.log(`✅ Started monitoring for user ${userId}`);
  }

  /**
   * Extract contract addresses from text
   */
  private extractContracts(text: string): Array<{address: string, type: string, original: string}> {
    const contracts = [];
    
    // Check standard format
    const standardMatches = text.match(SOL_PATTERN) || [];
    for (const match of standardMatches) {
      if (this.isValidSolanaAddress(match)) {
        contracts.push({
          address: match,
          type: 'standard',
          original: match
        });
      }
    }

    // Check obfuscated format
    const obfuscatedMatches = text.match(SOL_PATTERN_WITH_SPECIALS) || [];
    for (const match of obfuscatedMatches) {
      const cleaned = match.replace(/[-_.\s]/g, '');
      if (this.isValidSolanaAddress(cleaned) && !contracts.find(c => c.address === cleaned)) {
        contracts.push({
          address: cleaned,
          type: 'obfuscated',
          original: match
        });
      }
    }

    // Check for split contracts (address broken into 2-3 parts)
    const lines = text.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const combined = lines[i].trim() + lines[i + 1].trim();
      const cleanedCombined = combined.replace(/[-_.\s]/g, '');
      if (this.isValidSolanaAddress(cleanedCombined) && !contracts.find(c => c.address === cleanedCombined)) {
        contracts.push({
          address: cleanedCombined,
          type: 'split',
          original: combined
        });
      }
    }

    return contracts;
  }

  /**
   * Validate Solana address format
   */
  private isValidSolanaAddress(address: string): boolean {
    // Solana addresses are base58 encoded and typically 32-44 characters
    if (address.length < 32 || address.length > 44) return false;
    
    // Check for valid base58 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
  }

  /**
   * Get sender username
   */
  private async getSenderUsername(client: any, senderId: any): Promise<string | undefined> { // TelegramClient
    try {
      if (!senderId) return undefined;
      const entity = await client.getEntity(senderId);
      return (entity as any).username;
    } catch {
      return undefined;
    }
  }

  /**
   * Save session to database
   */
  private async saveSession(userId: number, sessionString: string) {
    const encrypted = this.encrypt(sessionString);
    await execute(
      'UPDATE telegram_user_accounts SET session_string = ?, is_verified = 1, last_connected_at = ?, updated_at = ? WHERE user_id = ?',
      [encrypted, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), userId]
    );
  }

  /**
   * Save comprehensive user profile data to database
   */
  private async saveUserProfile(userId: number, client: any) {
    try {
      // Get complete user info
      const me = await client.getMe();
      
      // Get full user details
      const fullUser = await client.invoke(
        new Api.users.GetFullUser({
          id: me
        })
      );
      
      const now = Math.floor(Date.now() / 1000);
      
      // Extract photo info
      let photoId = null;
      let photoDcId = null;
      let photoHasVideo = false;
      if (me.photo && me.photo.photoId) {
        photoId = me.photo.photoId.toString();
        photoDcId = me.photo.dcId;
        photoHasVideo = me.photo.hasVideo || false;
      }
      
      // Extract status info
      let statusType = 'offline';
      let statusWasOnline = null;
      let statusExpires = null;
      if (me.status) {
        if (me.status.className === 'UserStatusOnline') {
          statusType = 'online';
          statusExpires = me.status.expires;
        } else if (me.status.className === 'UserStatusOffline') {
          statusType = 'offline';
          statusWasOnline = me.status.wasOnline;
        } else if (me.status.className === 'UserStatusRecently') {
          statusType = 'recently';
        } else if (me.status.className === 'UserStatusLastWeek') {
          statusType = 'within_week';
        } else if (me.status.className === 'UserStatusLastMonth') {
          statusType = 'within_month';
        } else if (me.status.className === 'UserStatusEmpty') {
          statusType = 'long_ago';
        }
      }
      
      // Extract restrictions
      let restrictionReason = null;
      let restrictionPlatform = null;
      let restrictionText = null;
      if (me.restrictionReason && me.restrictionReason.length > 0) {
        restrictionReason = JSON.stringify(me.restrictionReason);
        restrictionPlatform = me.restrictionReason[0]?.platform;
        restrictionText = me.restrictionReason[0]?.text;
      }
      
      // Extract emoji status
      let emojiStatusDocumentId = null;
      let emojiStatusUntil = null;
      if (me.emojiStatus) {
        emojiStatusDocumentId = me.emojiStatus.documentId?.toString();
        emojiStatusUntil = me.emojiStatus.until;
      }
      
      // Get about/bio from fullUser
      let about = null;
      let commonChatsCount = null;
      if (fullUser && fullUser.fullUser) {
        about = fullUser.fullUser.about;
        commonChatsCount = fullUser.fullUser.commonChatsCount;
      }
      
      // Store raw profile data as JSON backup
      const profileDataRaw = JSON.stringify({
        me: {
          id: me.id?.toString(),
          firstName: me.firstName,
          lastName: me.lastName,
          username: me.username,
          phone: me.phone,
          bot: me.bot,
          verified: me.verified,
          restricted: me.restricted,
          scam: me.scam,
          fake: me.fake,
          premium: me.premium,
          support: me.support,
          self: me.self,
          langCode: me.langCode,
          photo: me.photo,
          status: me.status,
          emojiStatus: me.emojiStatus,
          storiesHidden: me.storiesHidden,
          storiesUnavailable: me.storiesUnavailable,
          contact: me.contact,
          mutualContact: me.mutualContact,
        },
        fullUser: fullUser?.fullUser ? {
          about: fullUser.fullUser.about,
          commonChatsCount: fullUser.fullUser.commonChatsCount,
          botInfo: fullUser.fullUser.botInfo,
        } : null,
        fetchedAt: now
      });
      
      // Update database with comprehensive profile data
      await execute(`
        UPDATE telegram_user_accounts SET
          telegram_user_id = ?,
          first_name = ?,
          last_name = ?,
          username = ?,
          phone = ?,
          language_code = ?,
          photo_id = ?,
          photo_dc_id = ?,
          photo_has_video = ?,
          access_hash = ?,
          is_bot = ?,
          is_verified_telegram = ?,
          is_restricted = ?,
          is_scam = ?,
          is_fake = ?,
          is_premium = ?,
          is_support = ?,
          is_self = ?,
          restriction_reason = ?,
          restriction_platform = ?,
          restriction_text = ?,
          status_type = ?,
          status_was_online = ?,
          status_expires = ?,
          stories_hidden = ?,
          stories_unavailable = ?,
          has_contact = ?,
          mutual_contact = ?,
          emoji_status_document_id = ?,
          emoji_status_until = ?,
          about = ?,
          common_chats_count = ?,
          dc_id = ?,
          profile_fetched_at = ?,
          profile_data_raw = ?,
          updated_at = ?
        WHERE user_id = ?
      `, [
        me.id?.toString(),
        me.firstName || null,
        me.lastName || null,
        me.username || null,
        me.phone || null,
        me.langCode || null,
        photoId,
        photoDcId,
        photoHasVideo ? 1 : 0,
        me.accessHash?.toString() || null,
        me.bot ? 1 : 0,
        me.verified ? 1 : 0,
        me.restricted ? 1 : 0,
        me.scam ? 1 : 0,
        me.fake ? 1 : 0,
        me.premium ? 1 : 0,
        me.support ? 1 : 0,
        me.self ? 1 : 0,
        restrictionReason,
        restrictionPlatform,
        restrictionText,
        statusType,
        statusWasOnline,
        statusExpires,
        me.storiesHidden ? 1 : 0,
        me.storiesUnavailable ? 1 : 0,
        me.contact ? 1 : 0,
        me.mutualContact ? 1 : 0,
        emojiStatusDocumentId,
        emojiStatusUntil,
        about,
        commonChatsCount,
        fullUser?.fullUser?.dcId || null,
        now,
        profileDataRaw,
        now,
        userId
      ]);
      
      console.log(`✅ [Telegram] Saved comprehensive profile for user ${userId} (@${me.username || me.firstName})`);
      
    } catch (error: any) {
      console.error(`❌ [Telegram] Failed to save user profile for ${userId}:`, error.message);
      // Don't throw - profile save failure shouldn't break authentication
    }
  }

  /**
   * Get monitored chats from database
   */
  private async getMonitoredChats(userId: number): Promise<any[]> {
    const chats = await queryAll(
      'SELECT chat_id, chat_name, is_active, monitored_keywords, monitored_user_ids FROM telegram_monitored_chats WHERE user_id = ? AND is_active = 1',
      [userId]
    ) as any[];
    
    console.log(`📋 [Telegram] Loaded ${chats.length} active monitored chats for user ${userId}`);
    chats.forEach(chat => {
      console.log(`   ✓ ${chat.chat_name || chat.chat_id} (${chat.chat_id})`);
    });
    
    return chats.map(chat => ({
      chatId: chat.chat_id,
      chatName: chat.chat_name,
      monitoredKeywords: chat.monitored_keywords ? JSON.parse(chat.monitored_keywords) : [],
      monitoredUserIds: chat.monitored_user_ids ? JSON.parse(chat.monitored_user_ids) : []
    }));
  }

  /**
   * Get user filters from database
   */
  private async getUserFilters(_userId: number): Promise<number[]> {
    // For now, return your hardcoded filters
    // Later this can come from database
    return [448480473]; // From your Python script
  }

  /**
   * Save detected contract to database
   */
  private async saveDetectedContract(userId: number, data: any) {
    await execute(`
      INSERT INTO telegram_detected_contracts 
      (user_id, chat_id, message_id, sender_id, sender_username, contract_address, 
       detection_type, original_format, message_text, forwarded, detected_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      data.chatId,
      data.messageId,
      data.senderId || null,
      data.senderUsername || null,
      data.contractAddress,
      data.detectionType,
      data.originalFormat,
      data.messageText,
      0, // forwarded
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000)
    ]);
  }

  /**
   * Fetch user chats
   */
  async fetchUserChats(userId: number) {
    let client = this.activeClients.get(userId);
    
    // If no active client, try to restore from database
    if (!client) {
      console.log(`⚠️  [Telegram] No active client for user ${userId}, attempting to restore session...`);
      
      try {
        const { queryOne } = await import('../database/helpers.js');
        const account = await queryOne(
          'SELECT user_id, api_id, api_hash, phone_number, session_string FROM telegram_user_accounts WHERE user_id = ? AND is_verified = 1 AND session_string IS NOT NULL',
          [userId]
        ) as any;
        
        if (!account) {
          throw new Error('No authenticated Telegram account found. Please authenticate first.');
        }
        
        // Restore the session
        const decrypted = this.decrypt(account.session_string);
        const session = new StringSession(decrypted);
        client = new TelegramClient(session, parseInt(account.api_id), account.api_hash, {
          connectionRetries: 5,
        });
        
        await client.connect();
        const me = await client.getMe();
        
        // Store the restored client
        this.activeClients.set(userId, client);
        
        console.log(`✅ [Telegram] Session restored for user ${userId} (@${me.username || me.firstName})`);
        
      } catch (error: any) {
        throw new Error(`Failed to restore Telegram session: ${error.message}`);
      }
    }

    try {
      console.log(`🔄 [Telegram] Fetching comprehensive chat data for user ${userId}...`);
      
      // Verify client is authorized
      const isAuthorized = await client.checkAuthorization();
      console.log(`🔐 [Telegram] Client authorization status: ${isAuthorized}`);
      
      if (!isAuthorized) {
        throw new Error('Client is not authorized. Please re-authenticate.');
      }
      
      // Verify we can get user info
      const me = await client.getMe();
      console.log(`👤 [Telegram] Fetching dialogs for @${me.username || me.firstName} (ID: ${me.id})`);
      
      // Get ALL dialogs (chats) with FloodWait handling
      console.log('📥 [Telegram] Fetching all dialogs (this may take a moment)...');
      
      let dialogs;
      let retryCount = 0;
      const maxRetries = 3;
      
      // Fetch dialogs with FloodWait handling
      while (retryCount < maxRetries) {
        const startTime = Date.now();
        try {
          // Fetch all dialogs at once (GramJS handles pagination internally)
          dialogs = await client.getDialogs({ limit: undefined });
          
          // Track successful API call
          const responseTime = Date.now() - startTime;
          apiProviderTracker.trackCall('telegram', 'getDialogs', true, responseTime, 200);
          
          break; // Success, exit retry loop
        } catch (error: any) {
          const responseTime = Date.now() - startTime;
          
          // Handle FloodWait errors
          if (error.errorMessage === 'FLOOD') {
            const waitSeconds = error.seconds || 60;
            console.warn(`⚠️  [Telegram] FloodWait error! Waiting ${waitSeconds} seconds before retry...`);
            
            // Track as rate limit hit
            apiProviderTracker.trackCall('telegram', 'getDialogs', false, responseTime, 429, `FloodWait: ${waitSeconds}s`);
            
            await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
            retryCount++;
          } else {
            // Track other errors
            apiProviderTracker.trackCall('telegram', 'getDialogs', false, responseTime, 500, error.message);
            throw error; // Re-throw non-FloodWait errors
          }
        }
      }
      
      if (!dialogs || dialogs.length === 0) {
        console.log('⚠️  [Telegram] No dialogs found');
        return [];
      }
      
      console.log(`📊 [Telegram] Received ${dialogs.length} dialogs total`);
      
      const chatsList = [];
      
      for (const dialog of dialogs) {
        const entity = dialog.entity;
        
        // Get comprehensive chat type and metadata
        let chatType = 'unknown';
        let chatSubtype = null;
        let inviteLink = null;
        let adminRights = null;
        let restrictions = null;
        
        if (entity.className === 'User') {
          if (entity.bot) {
            chatType = 'bot';
            chatSubtype = 'bot_account';
          } else {
            chatType = 'private';
            chatSubtype = 'user';
          }
        } else if (entity.className === 'Chat') {
          chatType = 'group';
          chatSubtype = 'legacy_group';
        } else if (entity.className === 'Channel') {
          chatType = entity.broadcast ? 'channel' : 'supergroup';
          chatSubtype = entity.megagroup ? 'megagroup' : entity.broadcast ? 'broadcast' : 'supergroup';
          
          // Get admin rights if available
          if (entity.adminRights) {
            adminRights = {
              changeInfo: entity.adminRights.changeInfo,
              postMessages: entity.adminRights.postMessages,
              editMessages: entity.adminRights.editMessages,
              deleteMessages: entity.adminRights.deleteMessages,
              banUsers: entity.adminRights.banUsers,
              inviteUsers: entity.adminRights.inviteUsers,
              pinMessages: entity.adminRights.pinMessages,
              addAdmins: entity.adminRights.addAdmins,
              anonymous: entity.adminRights.anonymous,
              manageCall: entity.adminRights.manageCall,
            };
          }
          
          // Get restrictions if any
          if (entity.restriction) {
            restrictions = entity.restriction;
          }
          
          // Get invite link (skip expensive API call to avoid flood wait)
          if (entity.username) {
            inviteLink = `https://t.me/${entity.username}`;
          }
          // Skip ExportChatInvite to avoid flood wait - can be fetched later if needed
        }

        // Get last message info
        let lastMessage = null;
        if (dialog.message) {
          lastMessage = {
            id: dialog.message.id,
            date: dialog.message.date,
            text: dialog.message.message?.substring(0, 100), // First 100 chars
            fromId: dialog.message.fromId?.userId?.toString(),
            hasMedia: !!dialog.message.media,
            mediaType: dialog.message.media?.className
          };
        }

        // Skip full chat statistics during bulk fetch to avoid FloodWait
        // Statistics can be fetched later per-channel if needed
        let statistics = null;

        // Build comprehensive chat object
        const chatData = {
          // Core identifiers
          chatId: entity.id.toString(),
          accessHash: entity.accessHash?.toString(),
          
          // Basic info
          chatName: entity.title || `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown',
          chatType: chatType,
          chatSubtype: chatSubtype,
          username: entity.username || null,
          inviteLink: inviteLink,
          
          // Status flags
          isBot: entity.bot || false,
          isVerified: entity.verified || false,
          isScam: entity.scam || false,
          isFake: entity.fake || false,
          isRestricted: entity.restricted || false,
          isCreator: entity.creator || false,
          hasLeft: entity.left || false,
          isDeactivated: entity.deactivated || false,
          isCallActive: entity.callActive || false,
          isCallNotEmpty: entity.callNotEmpty || false,
          
          // Participants & Activity
          participantsCount: entity.participantsCount || null,
          onlineCount: entity.onlineCount || null,
          unreadCount: dialog.unreadCount || 0,
          unreadMentionsCount: dialog.unreadMentionsCount || 0,
          unreadReactionsCount: dialog.unreadReactionsCount || 0,
          
          // Permissions & Rights
          adminRights: adminRights,
          bannedRights: entity.bannedRights || null,
          defaultBannedRights: entity.defaultBannedRights || null,
          restrictions: restrictions,
          
          // Media & Files
          photo: entity.photo ? {
            photoId: entity.photo.photoId?.toString(),
            dcId: entity.photo.dcId,
            hasVideo: entity.photo.hasVideo
          } : null,
          
          // Dates
          dateCreated: entity.date || null,
          lastMessageDate: lastMessage?.date || null,
          
          // Message data
          lastMessage: lastMessage,
          pinnedMsgId: dialog.pinnedMsgId || null,
          folderId: dialog.folderId || null,
          
          // Statistics
          statistics: statistics,
          
          // Settings
          notifySettings: dialog.notifySettings || null,
          ttlPeriod: dialog.ttlPeriod || null,
          
          // Bot specific
          botInfo: entity.botInfo ? {
            botId: entity.botInfo.userId?.toString(),
            description: entity.botInfo.description,
            commands: entity.botInfo.commands
          } : null,
          
          // Raw data for future use
          rawClassName: entity.className,
          rawFlags: entity.flags
        };

        chatsList.push(chatData);
      }

      console.log(`✅ [Telegram] Fetched ${chatsList.length} chats with comprehensive data for user ${userId}`);
      
      return chatsList;
    } catch (error: any) {
      console.error(`❌ [Telegram] Error fetching chats:`, error);
      throw error;
    }
  }

  /**
   * Get active client for a user
   */
  async getClient(userId: number): Promise<any | null> {
    return this.activeClients.get(userId) || null;
  }

  /**
   * Get connection status for a user
   */
  getConnectionStatus(userId: number): { connected: boolean; client: any | null } {
    const client = this.activeClients.get(userId);
    return {
      connected: !!client,
      client
    };
  }

  /**
   * Disconnect client
   */
  async disconnect(userId: number) {
    const client = this.activeClients.get(userId);
    if (client) {
      await client.disconnect();
      this.activeClients.delete(userId);
      this.sessions.delete(userId);
    }
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }
}

// Export singleton instance
export const telegramClientService = new TelegramClientService();

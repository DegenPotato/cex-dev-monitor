/**
 * Telegram Client Service using GramJS
 * Handles authentication with 2FA support and real-time message monitoring
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { execute, queryOne, queryAll } from '../database/helpers.js';
import { PublicKey } from '@solana/web3.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';

// Dynamic imports for telegram package
let TelegramClient: any;
let Api: any;
let StringSession: any;
let NewMessage: any; // Used in message handler

// Track module loading status
let modulesLoaded = false;
const modulesLoadedPromise = (async () => {
  const telegram = await import('telegram');
  TelegramClient = telegram.TelegramClient;
  Api = telegram.Api;
  // StringSession is in telegram/sessions/index.js
  const sessions = await import('telegram/sessions/index.js');
  StringSession = sessions.StringSession;
  const events = await import('telegram/events/index.js');
  NewMessage = events.NewMessage;
  modulesLoaded = true;
})();

// Helper to ensure modules are loaded
async function ensureModulesLoaded() {
  if (!modulesLoaded) {
    await modulesLoadedPromise;
  }
}

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
  private authSessions: Map<number, AuthSession> = new Map();
  private activeClients: Map<string | number, any> = new Map(); // TelegramClient instances (key: userId for users, 'bot_userId' for bots)
  private encryptionKey: string;
  private solanaConnection: ProxiedSolanaConnection;

  constructor() {
    super();
    this.encryptionKey = process.env.TELEGRAM_ENCRYPTION_KEY || 'default-key-change-in-production';
    this.solanaConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt',
      'TelegramCA-Validator'
    );
    
    console.log('✅ [Telegram] TelegramClientService initialized');
    
    // Restore all saved sessions on startup
    this.restoreAllSessions().catch(err => {
      console.error('❌ [Telegram] Failed to restore sessions:', err);
    });
  }

  /**
   * Initialize the service on startup
   */
  async initialize() {
    console.log('📱 Initializing Telegram Client Service...');
    
    // Ensure telegram modules are loaded
    await ensureModulesLoaded();
    
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
          
          // Store active client with appropriate key (bot_ prefix for bots)
          const clientKey = me.bot ? `bot_${userId}` : userId;
          this.activeClients.set(clientKey, client);
          
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
   * Restore all saved sessions from database on server startup
   */
  async restoreAllSessions() {
    console.log('🔄 [Telegram] Restoring saved sessions...');
    
    // Ensure telegram modules are loaded
    await ensureModulesLoaded();
    
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
          
          // Store active client with appropriate key (bot_ prefix for bots)
          const clientKey = me.bot ? `bot_${userId}` : userId;
          this.activeClients.set(clientKey, client);
          
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
      // Ensure telegram modules are loaded
      await ensureModulesLoaded();
      
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
      this.authSessions.set(userId, authSession);

      // Connect to Telegram
      await client.connect();

      // If we have a valid session, we're already connected
      if (existingSession?.session_string) {
        try {
          const me = await client.getMe();
          if (me) {
            authSession.status = 'connected';
            const clientKey = me.bot ? `bot_${userId}` : userId;
            this.activeClients.set(clientKey, client);
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
    const session = this.authSessions.get(userId);
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
      const me = await client.getMe();
      const clientKey = me.bot ? `bot_${userId}` : userId;
      this.activeClients.set(clientKey, client);
      
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
    const session = this.authSessions.get(userId);
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
      const me = await client.getMe();
      const clientKey = me.bot ? `bot_${userId}` : userId;
      this.activeClients.set(clientKey, client);
      
      // Save comprehensive user profile
      await this.saveUserProfile(userId, client);
      
      // Start monitoring
      await this.startMonitoring(userId, client);

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
  private async startMonitoring(userId: number, client: any) {
    const userIdentifier = `User${userId}`;
    console.log(`👂 [Telegram:${userIdentifier}] Starting message monitoring...`);
    
    // Cache monitored chats for performance
    let cachedChats = await this.getMonitoredChats(userId);
    let lastRefresh = Date.now();
    
    // Refresh cache periodically
    const refreshCache = async () => {
      const now = Date.now();
      if (now - lastRefresh > 30000) {
        cachedChats = await this.getMonitoredChats(userId);
        lastRefresh = now;
        console.log(`🔄 [Telegram:${userIdentifier}] Refreshed monitored chats (${cachedChats.length} chats)`);
      }
    };
    
    // Add message handler
    client.addEventHandler(async (event: any) => {
      try {
        const message = event.message;
        if (!message || !message.message) return;

        // Refresh cache if needed
        await refreshCache();

        // Check if message is from monitored chat
        // For forum groups/topics, use peerId.channelId (for supergroups/channels)
        let chatId = message.chatId?.toString();
        if (message.peerId?.channelId) {
          chatId = `-100${message.peerId.channelId.toString()}`;
        } else if (message.peerId?.chatId) {
          chatId = message.peerId.chatId.toString();
        }
        
        const monitoredChat = cachedChats.find(c => c.chatId === chatId);
        if (!monitoredChat) {
          console.log(`⏭️  [Telegram:${userIdentifier}] Message from unmonitored chat: ${chatId}`);
          console.log(`   Monitored chats: ${cachedChats.map(c => c.chatId).join(', ')}`);
          return;
        }
        
        console.log(`📨 [Telegram:${userIdentifier}] Message in "${monitoredChat.chatName || chatId}" (${chatId})`);
        console.log(`   Text preview: ${message.message.substring(0, 100)}...`);

        // Auto-cache ALL messages from monitored chats (before filters)
        await this.cacheMessageToHistory(userId, chatId!, message, client);
        
        // Emit real-time update for frontend
        this.emit('message_cached', {
          userId,
          chatId,
          messageId: message.id,
          text: message.message,
          senderId: message.senderId?.toString(),
          date: message.date
        });

        // Check if sender is a bot and if we should process bot messages
        if (message.senderId) {
          try {
            const sender = await client.getEntity(message.senderId);
            if (sender && (sender as any).bot) {
              // This is a bot message
              const processBotMessages = monitoredChat.processBotMessages || false;
              if (!processBotMessages) {
                console.log(`   ⏭️  Skipped detection: sender is a bot and bot message processing is disabled for this chat`);
                return;
              }
              console.log(`   🤖 Processing bot message (bot processing enabled)`);
            }
          } catch (error) {
            console.log(`   ⚠️  Could not determine if sender is bot: ${error}`);
          }
        }

        // Apply user ID filter (if configured for this chat)
        if (monitoredChat.monitoredUserIds && monitoredChat.monitoredUserIds.length > 0) {
          const senderId = message.senderId?.toString();
          const isFilteredUser = monitoredChat.monitoredUserIds.some((id: string) => id.toString() === senderId);
          if (!isFilteredUser) {
            console.log(`   ⏭️  Skipped detection: sender ${senderId} not in chat's user filter list`);
            return; // Skip all detection if user filter fails
          }
        }

        // Now detect either contracts OR keywords OR both
        let detectionTriggered = false;
        
        // 1. Check for contract addresses with on-chain validation
        const potentialContracts = this.extractContracts(message.message);
        const contracts = [];
        
        if (potentialContracts.length > 0) {
          console.log(`   🔍 Found ${potentialContracts.length} potential addresses, validating on-chain...`);
          
          // Validate each address and extract tokens from LPs
          for (const contract of potentialContracts) {
            const validation = await this.validateAndExtractToken(contract.address);
            if (validation.isValid) {
              // For each extracted token (could be 1 for direct mint, or multiple from LP)
              for (const tokenAddress of validation.actualTokens) {
                contracts.push({
                  address: tokenAddress,
                  type: contract.type,
                  original: contract.original
                });
              }
            }
          }
          
          if (contracts.length > 0) {
            console.log(`   ✅ Validated ${contracts.length} token mints: ${contracts.map(c => c.address.substring(0, 8) + '...').join(', ')}`);
            detectionTriggered = true;
          } else {
            console.log(`   ⏭️  No valid token mints found (all were wallets/invalid)`);
          }
        }
        
        // 2. Check for keywords (if configured)
        let matchedKeywords: string[] = [];
        if (monitoredChat.monitoredKeywords && monitoredChat.monitoredKeywords.length > 0) {
          matchedKeywords = monitoredChat.monitoredKeywords.filter((keyword: string) => 
            message.message.toLowerCase().includes(keyword.toLowerCase())
          );
          if (matchedKeywords.length > 0) {
            console.log(`   🔑 Matched keywords: ${matchedKeywords.join(', ')}`);
            detectionTriggered = true;
          }
        }

        // If nothing detected, skip
        if (!detectionTriggered) {
          console.log(`   ⏭️  No contracts or keywords detected`);
          return;
        }
        
        // Log detected tokens to database
        if (contracts.length > 0) {
          // Get chat configuration for duplicate handling
          const chatConfig = await this.getChatConfig(userId, chatId!);
          
          for (const contract of contracts) {
            // Check duplicate strategy
            const shouldProcess = await this.shouldProcessContract(
              contract.address, 
              chatId!, 
              message,
              chatConfig.duplicate_strategy
            );
            
            if (!shouldProcess.process) {
              console.log(`   ⏭️  Skipping ${contract.address.substring(0, 8)}... - Reason: ${shouldProcess.reason}`);
              
              // Still log the detection but mark as skipped
              await this.logTelegramDetection({
                contractAddress: contract.address,
                chatId: chatId!,
                chatName: monitoredChat.chatName,
                chatUsername: monitoredChat.username,
                messageId: message.id.toString(),
                messageText: message.message.substring(0, 500),
                messageTimestamp: message.date,
                senderId: message.senderId?.toJSNumber(),
                senderUsername: await this.getSenderUsername(client, message.senderId),
                detectionType: contract.type,
                detectedByUserId: userId,
                detectedAt: Math.floor(Date.now() / 1000),
                isFirstMention: false,
                isBacklog: false,
                processedAction: shouldProcess.reason
              });
              continue; // Skip to next contract
            }
            
            // Log to token_mints table (upsert)
            await this.logTokenMint(contract.address, {
              platform: 'pumpfun',
              firstSeenSource: 'telegram',
              chatName: monitoredChat.chatName,
              chatId: chatId
            });
            
            // Mark as first mention if applicable
            if (shouldProcess.isFirst) {
              await this.markFirstMention(contract.address, chatId!, message);
            }
            
            let wasForwarded = false;
            let forwardLatency: number | undefined;
            let forwardError: string | undefined;
            let processedAction = shouldProcess.reason || 'detected';
            
            // Get all forward destinations for this chat
            const forwardDestinations = await this.getForwardDestinations(userId, chatId!);
            
            // Try to forward to all configured destinations
            if (forwardDestinations.length > 0 && shouldProcess.forward) {
              const forwardResults = [];
              
              for (const destination of forwardDestinations) {
                const forwardStartTime = Date.now();
                let forwardAccountId = destination.forward_account_id || monitoredChat.forwardAccountId || userId;
                let forwardAccountPhone = '';
              
              try {
                // Determine which client to use for forwarding
                let forwardClient = client; // Default to detection client
                
                // If a specific forward account is configured for this destination
                if (forwardAccountId && forwardAccountId !== userId) {
                  // Always try to get the user account (non-bot) first for forwarding
                  let forwardAccount = this.activeClients.get(forwardAccountId);
                  if (!forwardAccount) {
                    // Try with bot_ prefix
                    forwardAccount = this.activeClients.get(`bot_${forwardAccountId}`);
                  }
                  
                  if (forwardAccount) {
                    // Check if this is a bot account (bots can't message arbitrary users)
                    try {
                      const forwardMe = await forwardAccount.getMe();
                      if (forwardMe.bot) {
                        console.log(`   ⚠️  Forward account ${forwardAccountId} is a bot, cannot forward to users. Trying detection account.`);
                        // If detection client is also not a bot, use it
                        const detectionMe = await client.getMe();
                        if (!detectionMe.bot) {
                          forwardClient = client;
                          forwardAccountId = userId;
                        } else {
                          console.log(`   ⚠️  Detection account is also a bot! Cannot forward to user.`);
                          throw new Error('No valid user account available for forwarding to users');
                        }
                      } else {
                        forwardClient = forwardAccount;
                        // forwardAccountId already set
                        console.log(`   📤 Using account for forwarding: User ${forwardAccountId} (@${forwardMe.username}`);
                      }
                    } catch (error: any) {
                      if (error.message?.includes('No valid user account')) {
                        throw error;
                      }
                      console.log(`   ⚠️  Could not verify forward account type: ${error.message}`);
                    }
                  } else {
                    console.log(`   ⚠️  Forward account ${forwardAccountId} not active, using detection account`);
                    forwardAccountId = userId;
                  }
                }
                
                // Just send the raw contract address like the Python script does
                const forwardMessage = contract.address;
                
                // Parse the forward target - handle different ID formats
                let forwardTarget: any = destination.target_chat_id;
                
                // Convert string to appropriate type for telegram library
                if (typeof forwardTarget === 'string') {
                  // If it starts with @ it's a username, leave as string
                  if (!forwardTarget.startsWith('@')) {
                    // It's a numeric ID - need to resolve entity first
                    if (forwardTarget.startsWith('-')) {
                      // Group/channel ID (negative number)
                      forwardTarget = parseInt(forwardTarget);
                    } else {
                      // User/bot ID - resolve entity to cache it
                      const userId = parseInt(forwardTarget);
                      console.log(`   🔍 Resolving entity for user ID: ${userId}`);
                      try {
                        // This will cache the entity for subsequent use
                        await forwardClient.getEntity(userId);
                        forwardTarget = userId;
                      } catch (entityError: any) {
                        console.log(`   ⚠️  Failed to resolve entity ${userId}: ${entityError.message}`);
                        throw new Error(`Cannot forward to user ${userId}: ${entityError.message}`);
                      }
                    }
                  }
                }
                
                // Send using the selected forward account (user or bot)
                await forwardClient.sendMessage(forwardTarget, { 
                  message: forwardMessage
                });
                
                wasForwarded = true;
                forwardLatency = Date.now() - forwardStartTime;
                console.log(`   ✅ Auto-forwarded to ${destination.target_chat_name || destination.target_chat_id} in ${forwardLatency}ms`);
                forwardResults.push({ target: destination.target_chat_id, success: true, latency: forwardLatency });
                
                // Log successful forward
                await this.logForwardingHistory(userId, {
                  sourceChatId: chatId!,
                  sourceChatName: monitoredChat.chatName,
                  messageId: message.id.toString(),
                  contractAddress: contract.address,
                  detectionType: contract.type,
                  targetChatId: destination.target_chat_id,
                  detectionAccountId: userId,
                  forwardAccountId,
                  forwardAccountPhone,
                  status: 'success',
                  latencyMs: forwardLatency,
                  detectedAt: Math.floor(Date.now() / 1000)
                });
              } catch (error: any) {
                forwardError = error.message || 'Unknown error';
                console.error(`   ❌ Failed to forward to ${destination.target_chat_name || destination.target_chat_id}:`, forwardError);
                forwardResults.push({ target: destination.target_chat_id, success: false, error: forwardError });
                
                // Log failed forward
                await this.logForwardingHistory(userId, {
                  sourceChatId: chatId!,
                  sourceChatName: monitoredChat.chatName,
                  messageId: message.id.toString(),
                  contractAddress: contract.address,
                  detectionType: contract.type,
                  targetChatId: destination.target_chat_id,
                  detectionAccountId: userId,
                  forwardAccountId,
                  forwardAccountPhone,
                  status: 'failed',
                  errorMessage: forwardError,
                  latencyMs: Date.now() - forwardStartTime,
                  detectedAt: Math.floor(Date.now() / 1000)
                });
              }
              } // End of for loop for destinations
              
              // Set overall forward status based on any successful forwards
              wasForwarded = forwardResults.some(r => r.success);
              // Set first successful forward latency if any
              const successfulForward = forwardResults.find(r => r.success);
              if (successfulForward) {
                forwardLatency = successfulForward.latency;
              }
            }
            
            // Save detection with forwarding status
            const senderUsername = await this.getSenderUsername(client, message.senderId);
            await this.saveDetectedContract(userId, {
              chatId: chatId!,
              messageId: message.id,
              senderId: message.senderId?.toString(),
              senderUsername,
              contractAddress: contract.address,
              detectionType: contract.type,
              originalFormat: contract.original,
              messageText: message.message,
              forwarded: wasForwarded
            });
            
            // Log comprehensive detection data
            await this.logTelegramDetection({
              contractAddress: contract.address,
              chatId: chatId!,
              chatName: monitoredChat.chatName,
              chatUsername: monitoredChat.username,
              messageId: message.id.toString(),
              messageText: message.message.substring(0, 500),
              messageTimestamp: message.date,
              senderId: message.senderId?.toJSNumber(),
              senderUsername,
              detectionType: contract.type,
              detectedByUserId: userId,
              detectedAt: Math.floor(Date.now() / 1000),
              isFirstMention: shouldProcess.isFirst,
              forwarded: wasForwarded,
              forwardedTo: wasForwarded ? monitoredChat.forwardToChatId : undefined,
              forwardLatency,
              forwardError,
              processedAction: wasForwarded ? 'forwarded' : processedAction
            });

            // Emit complete detection data for real-time updates
            this.emit('contract_detected', {
              userId,
              chatId,
              chat_name: monitoredChat.chatName,
              contract: contract.address,
              type: contract.type,
              sender: message.senderId?.toString(),
              username: senderUsername,
              message: message.message,
              forwarded: wasForwarded
            });
          }
        }

        // Emit keyword detection events
        if (matchedKeywords.length > 0) {
          this.emit('keyword_detected', {
            userId,
            chatId,
            keywords: matchedKeywords,
            sender: message.senderId?.toString(),
            message: message.message
          });
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
    const contracts: Array<{address: string, type: string, original: string}> = [];
    
    // FIRST: Extract ANY Solana address from ANY URL before removing them!
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlPattern) || [];
    for (const url of urls) {
      // Extract ANY valid Solana address from the URL (32-44 chars, base58)
      const addressMatches = url.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [];
      for (const addr of addressMatches) {
        if (this.isValidSolanaAddress(addr) && !contracts.find(c => c.address === addr)) {
          contracts.push({
            address: addr,
            type: 'url',
            original: url
          });
          console.log(`   🔗 Extracted from URL: ${addr.substring(0, 8)}...`);
        }
      }
    }
    
    // NOW remove URLs to avoid matching addresses within other links
    const textClean = text.replace(/https?:\/\/\S+/g, '');
    
    // Check standard format
    const standardMatches = textClean.match(SOL_PATTERN) || [];
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
    const obfuscatedMatches = textClean.match(SOL_PATTERN_WITH_SPECIALS) || [];
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

    // Check for split contracts (comprehensive detection from Python version)
    if (contracts.length === 0) {
      const splitContracts = this.findSplitContracts(textClean);
      for (const split of splitContracts) {
        if (!contracts.find(c => c.address === split.address)) {
          contracts.push(split);
        }
      }
    }

    return contracts;
  }

  /**
   * Find contract addresses split into 2-3 parts (ported from Python)
   */
  private findSplitContracts(text: string): Array<{address: string, type: string, original: string}> {
    const results: Array<{address: string, type: string, original: string}> = [];
    const CA_FRAGMENT_PATTERN = /[1-9A-HJ-NP-Za-km-z]{8,}/g;
    
    // Find all potential CA fragments with their positions
    const fragmentMatches: Array<{frag: string, pos: number}> = [];
    let match;
    while ((match = CA_FRAGMENT_PATTERN.exec(text)) !== null) {
      fragmentMatches.push({ frag: match[0], pos: match.index });
    }
    
    // Remove duplicates while preserving order
    const uniqueFragments: Array<{frag: string, pos: number}> = [];
    const seenFrags = new Set<string>();
    for (const fm of fragmentMatches) {
      if (!seenFrags.has(fm.frag)) {
        seenFrags.add(fm.frag);
        uniqueFragments.push(fm);
      }
    }
    
    if (uniqueFragments.length < 2) {
      return results;
    }
    
    // Identify fragments with "pump" markers
    const endingFragments = new Set<string>();
    for (const fm of uniqueFragments) {
      if (fm.frag.toLowerCase().endsWith('pump')) {
        endingFragments.add(fm.frag);
      }
      const textAfter = text.substring(fm.pos + fm.frag.length, fm.pos + fm.frag.length + 20).toLowerCase();
      if (textAfter.includes('pumpfun') || textAfter.includes('pump.fun') || textAfter.includes('pump')) {
        endingFragments.add(fm.frag);
      }
    }
    
    // Try 2-part combinations
    for (let i = 0; i < uniqueFragments.length; i++) {
      for (let j = 0; j < uniqueFragments.length; j++) {
        if (i === j) continue;
        
        const fragI = uniqueFragments[i];
        const fragJ = uniqueFragments[j];
        let combined: string;
        let fragmentsInfo: string;
        
        if (endingFragments.has(fragI.frag) && !endingFragments.has(fragJ.frag)) {
          combined = fragJ.frag + fragI.frag;
          fragmentsInfo = `${fragJ.frag} + ${fragI.frag}`;
        } else if (endingFragments.has(fragJ.frag) && !endingFragments.has(fragI.frag)) {
          combined = fragI.frag + fragJ.frag;
          fragmentsInfo = `${fragI.frag} + ${fragJ.frag}`;
        } else {
          if (fragI.pos < fragJ.pos) {
            combined = fragI.frag + fragJ.frag;
            fragmentsInfo = `${fragI.frag} + ${fragJ.frag}`;
          } else {
            continue;
          }
        }
        
        if (this.isValidSolanaAddress(combined) && !results.find(r => r.address === combined)) {
          results.push({ address: combined, type: 'split', original: fragmentsInfo });
        }
      }
    }
    
    // Try 3-part combinations
    for (let i = 0; i < uniqueFragments.length; i++) {
      for (let j = 0; j < uniqueFragments.length; j++) {
        for (let k = 0; k < uniqueFragments.length; k++) {
          if (i === j || i === k || j === k) continue;
          
          const frags = [uniqueFragments[i], uniqueFragments[j], uniqueFragments[k]];
          const endingInSet = frags.filter(f => endingFragments.has(f.frag));
          
          let ordered: Array<{frag: string, pos: number}>;
          if (endingInSet.length > 0) {
            const nonEnding = frags.filter(f => !endingFragments.has(f.frag)).sort((a, b) => a.pos - b.pos);
            const ending = frags.filter(f => endingFragments.has(f.frag));
            ordered = [...nonEnding, ...ending];
          } else {
            ordered = frags.sort((a, b) => a.pos - b.pos);
          }
          
          const combined = ordered[0].frag + ordered[1].frag + ordered[2].frag;
          
          if (this.isValidSolanaAddress(combined) && !results.find(r => r.address === combined)) {
            const fragmentsInfo = `${ordered[0].frag} + ${ordered[1].frag} + ${ordered[2].frag}`;
            results.push({ address: combined, type: 'split', original: fragmentsInfo });
          }
        }
      }
    }
    
    return results;
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
   * Validate if address is a token mint, and extract token from LP if needed
   * Returns: { isValid: boolean, actualTokens: string[] }
   */
  private async validateAndExtractToken(address: string): Promise<{ isValid: boolean, actualTokens: string[] }> {
    const startTime = Date.now();
    try {
      // Try to create PublicKey - this will throw if address is invalid
      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(address);
      } catch (error) {
        // Not a valid Solana address at all
        console.log(`   ❌ Invalid address format: ${address.substring(0, 8)}...`);
        return { isValid: false, actualTokens: [] };
      }
      
      // Get account info (single RPC call)
      const accountInfo = await this.solanaConnection.withProxy(conn => 
        conn.getAccountInfo(publicKey)
      );
      
      if (!accountInfo) {
        console.log(`   ⚠️  Address ${address.substring(0, 8)}... has no account data (likely invalid/wallet)`);
        return { isValid: false, actualTokens: [] };
      }
      
      const ownerStr = accountInfo.owner.toString();
      const dataLength = accountInfo.data.length;
      
      // FAST PATH: Check if it's a token mint FIRST (lowest latency)
      const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      if (ownerStr === TOKEN_PROGRAM_ID && dataLength === 82) {
        const elapsed = Date.now() - startTime;
        console.log(`   ✅ Token mint verified in ${elapsed}ms: ${address.substring(0, 8)}...`);
        return { isValid: true, actualTokens: [address] };
      }
      
      // SLOW PATH: Check if it might be a liquidity pool via GeckoTerminal
      // If not a token mint, try GeckoTerminal API to see if it's an LP
      try {
        const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${address}?include=base_token&include_volume_breakdown=false&include_composition=false`;
        const response = await fetch(geckoUrl);
        
        if (response.ok) {
          const data = await response.json();
          const elapsed = Date.now() - startTime;
          
          // Extract base token address from the response
          const baseTokenId = data.data?.relationships?.base_token?.data?.id;
          if (baseTokenId) {
            // Extract token address from ID (format: "solana_ADDRESS")
            const tokenAddress = baseTokenId.replace('solana_', '');
            console.log(`   🏊 LP detected via GeckoTerminal: ${address.substring(0, 8)}... → Token: ${tokenAddress.substring(0, 8)}...`);
            console.log(`   📤 Extracted token from LP in ${elapsed}ms`);
            return { isValid: true, actualTokens: [tokenAddress] };
          }
        }
      } catch (error) {
        // GeckoTerminal API failed, not an LP
        console.log(`   ⏭️  Not found on GeckoTerminal (likely wallet/invalid)`);
      }
      
      // Log FULL owner address for unknown types to help identify new LP programs
      console.log(`   ⏭️  ${address.substring(0, 8)}... is wallet/other (owner: ${ownerStr}, len: ${dataLength})`);
      return { isValid: false, actualTokens: [] };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`   ❌ Validation failed after ${elapsed}ms for ${address.substring(0, 8)}...:`, error);
      return { isValid: false, actualTokens: [] };
    }
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
   * Fetch and store comprehensive metadata for a chat
   * Including user's role (admin/creator/member status)
   */
  async fetchAndStoreChatMetadata(userId: number, chatId: string) {
    try {
      const client = this.activeClients.get(userId);
      if (!client) {
        console.log(`⚠️  No active client for user ${userId}`);
        return;
      }

      console.log(`📊 [Telegram] Fetching metadata for chat ${chatId}...`);

      // Get the chat entity
      const chat = await client.getEntity(chatId);
      const now = Math.floor(Date.now() / 1000);

      // Determine chat type
      let chatType = 'unknown';
      if (chat.className === 'User') chatType = 'private';
      else if (chat.className === 'Chat') chatType = 'group';
      else if (chat.className === 'Channel') {
        chatType = chat.broadcast ? 'channel' : 'supergroup';
      }

      // Initialize metadata object
      const metadata: any = {
        userId,
        chatId,
        title: chat.title || `${chat.firstName || ''} ${chat.lastName || ''}`.trim(),
        username: chat.username,
        chatType,
        description: null,
        photoUrl: null,
        inviteLink: null,
        memberCount: 0,
        onlineCount: 0,
        adminCount: 0,
        restrictedCount: 0,
        kickedCount: 0,
        isMember: false,
        isAdmin: false,
        isCreator: false,
        hasLeft: false,
        joinDate: null,
        fetchedAt: now,
        updatedAt: now
      };

      // Get full chat information (for groups/channels)
      if (chatType === 'supergroup' || chatType === 'channel' || chatType === 'group') {
        try {
          const fullChat = await client.invoke(
            new Api.channels.GetFullChannel({
              channel: chat
            })
          );

          const fullChatInfo = fullChat.fullChat;

          // Extract detailed information
          metadata.description = fullChatInfo.about;
          metadata.memberCount = fullChatInfo.participantsCount || 0;
          metadata.adminCount = fullChatInfo.adminsCount || 0;
          metadata.kickedCount = fullChatInfo.kickedCount || 0;
          metadata.onlineCount = fullChatInfo.onlineCount || 0;

          // Get export invite link if available
          try {
            const exportedInvite = await client.invoke(
              new Api.messages.ExportChatInvite({
                peer: chat
              })
            );
            if (exportedInvite && (exportedInvite as any).link) {
              metadata.inviteLink = (exportedInvite as any).link;
            }
          } catch (e) {
            // User might not have permission to export invite
          }

          // Get current user's participant status
          try {
            const me = await client.getMe();
            const participant = await client.invoke(
              new Api.channels.GetParticipant({
                channel: chat,
                participant: me.id
              })
            );

            if (participant && participant.participant) {
              const p = participant.participant;
              
              // Check role
              metadata.isCreator = p.className === 'ChannelParticipantCreator';
              metadata.isAdmin = p.className === 'ChannelParticipantAdmin' || metadata.isCreator;
              metadata.isMember = true;
              
              // Get join date if available
              if (p.date) {
                metadata.joinDate = p.date;
              }

              console.log(`   👤 User role in ${chatType}: ${metadata.isCreator ? 'CREATOR' : metadata.isAdmin ? 'ADMIN' : 'MEMBER'}`);
            }
          } catch (e) {
            // Not a member or can't fetch participant info
            console.log(`   ⚠️  Could not fetch participant status: ${e}`);
          }

        } catch (error: any) {
          console.log(`   ⚠️  Could not fetch full chat info: ${error.message}`);
        }
      } else if (chatType === 'group') {
        // For regular groups (not supergroups)
        try {
          const fullChat = await client.invoke(
            new Api.messages.GetFullChat({
              chatId: chat.id
            })
          );

          const fullChatInfo = fullChat.fullChat;
          metadata.memberCount = fullChatInfo.participants?.participants?.length || 0;
          
          // Check if current user is admin
          const me = await client.getMe();
          const participants = fullChatInfo.participants?.participants || [];
          const myParticipant = participants.find((p: any) => p.userId?.toString() === me.id.toString());
          
          if (myParticipant) {
            metadata.isMember = true;
            metadata.isCreator = myParticipant.className === 'ChatParticipantCreator';
            metadata.isAdmin = myParticipant.className === 'ChatParticipantAdmin' || metadata.isCreator;
            if (myParticipant.date) {
              metadata.joinDate = myParticipant.date;
            }

            console.log(`   👤 User role in group: ${metadata.isCreator ? 'CREATOR' : metadata.isAdmin ? 'ADMIN' : 'MEMBER'}`);
          }

        } catch (error: any) {
          console.log(`   ⚠️  Could not fetch full group info: ${error.message}`);
        }
      }

      // Store in database
      await execute(`
        INSERT OR REPLACE INTO telegram_chat_metadata (
          user_id, chat_id, title, username, chat_type, description, invite_link,
          member_count, online_count, admin_count, restricted_count, kicked_count,
          is_member, is_admin, is_creator, has_left, join_date,
          fetched_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        metadata.userId, metadata.chatId, metadata.title, metadata.username, metadata.chatType,
        metadata.description, metadata.inviteLink, metadata.memberCount, metadata.onlineCount,
        metadata.adminCount, metadata.restrictedCount, metadata.kickedCount,
        metadata.isMember ? 1 : 0, metadata.isAdmin ? 1 : 0, metadata.isCreator ? 1 : 0,
        metadata.hasLeft ? 1 : 0, metadata.joinDate, metadata.fetchedAt, metadata.updatedAt
      ]);

      console.log(`   ✅ Metadata stored: ${metadata.memberCount} members, Admin: ${metadata.isAdmin}, Creator: ${metadata.isCreator}`);

      return metadata;
    } catch (error: any) {
      console.error(`❌ [Telegram] Error fetching metadata for chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch participants from a chat for user targeting
   * Returns list of users with their IDs, names, and metadata
   */
  async fetchChatParticipants(userId: number, chatId: string, limit: number = 100) {
    try {
      const client = this.activeClients.get(userId);
      if (!client) {
        throw new Error(`No active client for user ${userId}`);
      }

      console.log(`👥 [Telegram] Fetching participants for chat ${chatId}...`);

      const chat = await client.getEntity(chatId);
      const participants: any[] = [];

      // For supergroups/channels
      if (chat.className === 'Channel') {
        try {
          const result = await client.invoke(
            new Api.channels.GetParticipants({
              channel: chat,
              filter: new Api.ChannelParticipantsRecent(),
              offset: 0,
              limit: Math.min(limit, 200),
              hash: BigInt(0)
            })
          );

          if (result.users) {
            for (const user of result.users) {
              participants.push({
                userId: user.id.toString(),
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                isBot: user.bot || false,
                isVerified: user.verified || false,
                isPremium: user.premium || false,
                phone: user.phone,
                displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || `User ${user.id}`
              });
            }
          }
        } catch (error: any) {
          console.log(`   ⚠️  Could not fetch participants (may need admin rights): ${error.message}`);
        }
      } else if (chat.className === 'Chat') {
        // For regular groups
        try {
          const fullChat = await client.invoke(
            new Api.messages.GetFullChat({
              chatId: chat.id
            })
          );

          if (fullChat.users) {
            for (const user of fullChat.users) {
              participants.push({
                userId: user.id.toString(),
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                isBot: user.bot || false,
                isVerified: user.verified || false,
                isPremium: user.premium || false,
                phone: user.phone,
                displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || `User ${user.id}`
              });
            }
          }
        } catch (error: any) {
          console.log(`   ⚠️  Could not fetch group participants: ${error.message}`);
        }
      }

      console.log(`   ✅ Fetched ${participants.length} participants`);
      return participants;
    } catch (error: any) {
      console.error(`❌ [Telegram] Error fetching participants for chat ${chatId}:`, error);
      throw error;
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
      'SELECT chat_id, chat_name, is_active, monitored_keywords, monitored_user_ids, forward_to_chat_id, forward_account_id FROM telegram_monitored_chats WHERE user_id = ? AND is_active = 1',
      [userId]
    ) as any[];

    return chats.map(chat => ({
      chatId: chat.chat_id,
      chatName: chat.chat_name,
      isActive: chat.is_active === 1,
      monitoredKeywords: chat.monitored_keywords ? JSON.parse(chat.monitored_keywords) : [],
      monitoredUserIds: chat.monitored_user_ids ? JSON.parse(chat.monitored_user_ids) : [],
      forwardToChatId: chat.forward_to_chat_id,
      forwardAccountId: chat.forward_account_id
    }));
  }

  /**
   * Cache message to history table (real-time)
   */
  private async cacheMessageToHistory(userId: number, chatId: string, message: any, client: any) {
    try {
      // Extract contract addresses from message
      const contracts = this.extractContracts(message.message);
      const hasContract = contracts.length > 0;
      const detectedContracts = hasContract ? JSON.stringify(contracts.map(c => c.address)) : null;

      // Get sender info
      const senderUsername = await this.getSenderUsername(client, message.senderId);
      const sender = message.senderId ? await client.getEntity(message.senderId).catch(() => null) : null;

      await execute(`
        INSERT OR REPLACE INTO telegram_message_history 
        (user_id, chat_id, message_id, message_text, message_date, 
         sender_id, sender_username, sender_name, is_bot,
         has_media, media_type, has_contract, detected_contracts,
         fetched_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        chatId,
        message.id,
        message.message || null,
        Math.floor(message.date),
        message.senderId?.toString() || null,
        senderUsername,
        sender ? (sender.firstName || sender.title || null) : null,
        sender?.bot ? 1 : 0,
        message.media ? 1 : 0,
        message.media?.className || null,
        hasContract ? 1 : 0,
        detectedContracts,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000)
      ]);
    } catch (error) {
      console.error(`   ❌ Failed to cache message to history:`, error);
    }
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
      data.forwarded ? 1 : 0,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000)
    ]);
  }

  /**
   * Log forwarding attempt to history
   */
  private async logForwardingHistory(userId: number, data: {
    sourceChatId: string;
    sourceChatName?: string;
    messageId: string;
    contractAddress: string;
    detectionType: string;
    targetChatId: string;
    targetChatName?: string;
    detectionAccountId: number;
    forwardAccountId: number;
    forwardAccountPhone?: string;
    status: 'success' | 'failed' | 'pending';
    errorMessage?: string;
    latencyMs?: number;
    detectedAt: number;
  }) {
    try {
      const now = Math.floor(Date.now() / 1000);
      await execute(`
        INSERT INTO telegram_forwarding_history
        (user_id, rule_id, source_chat_id, source_chat_name, source_message_id, 
         contract_address, detection_type, target_chat_id, target_chat_name, 
         detection_account_id, forward_account_id, forward_account_phone, 
         status, error_message, response_time_ms, detected_at, forwarded_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        0, // rule_id - use 0 for contract auto-forwards (NOT NULL constraint)
        data.sourceChatId,
        data.sourceChatName || null,
        data.messageId ? parseInt(data.messageId) : null, // source_message_id
        data.contractAddress,
        data.detectionType,
        data.targetChatId,
        data.targetChatName || null,
        data.detectionAccountId,
        data.forwardAccountId,
        data.forwardAccountPhone || null,
        data.status, // maps to 'status' column
        data.errorMessage || null,
        data.latencyMs || null, // maps to 'response_time_ms' column
        data.detectedAt,
        now, // Always set forwarded_at (NOT NULL constraint)
        now
      ]);

      // Emit forwarding event for real-time updates
      this.emit('forward_logged', {
        userId,
        contractAddress: data.contractAddress,
        status: data.status,
        sourceChatName: data.sourceChatName,
        targetChatId: data.targetChatId,
        latencyMs: data.latencyMs
      });
    } catch (error) {
      console.error('Failed to log forwarding history:', error);
    }
  }

  /**
   * Fetch user chats
   */
  async getUserChatsComprehensive(userId: number): Promise<any[]> {
    // Get or restore the client for this user
    let client = this.activeClients.get(userId);
    if (!client) {
      // If no active client, try to restore from saved session
      try {
        // Ensure telegram modules are loaded
        await ensureModulesLoaded();
        
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
        
        // Store the restored client with appropriate key
        const clientKey = me.bot ? `bot_${userId}` : userId;
        this.activeClients.set(clientKey, client);
        
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
        try {
          // Fetch all dialogs at once (GramJS handles pagination internally)
          dialogs = await client.getDialogs({ limit: undefined });
          
          break; // Success, exit retry loop
        } catch (error: any) {
          // Handle FloodWait errors
          if (error.errorMessage === 'FLOOD') {
            const waitSeconds = error.seconds || 60;
            console.warn(`⚠️  [Telegram] FloodWait error! Waiting ${waitSeconds} seconds before retry...`);
            
            await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
            retryCount++;
          } else {
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
        // For channels/supergroups, add -100 prefix (required for API calls)
        let formattedChatId = entity.id.toString();
        if (entity.className === 'Channel') {
          formattedChatId = `-100${entity.id.toString()}`;
        }
        
        const chatData = {
          // Core identifiers
          chatId: formattedChatId,
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
      client: client || null
    };
  }

  /**
   * Get all connected accounts (for forwarding account selection)
   */
  getConnectedAccounts(userId: number): Array<{ id: number; name: string; phone?: string }> {
    const accounts: Array<{ id: number; name: string; phone?: string }> = [];
    
    // Add all active clients for this user
    this.activeClients.forEach((_client, activeUserId) => {
      if (activeUserId === userId) {
        // Get stored account info
        accounts.push({
          id: userId,
          name: `Account ${userId}`,
          phone: undefined
        });
      }
    });
    
    return accounts;
  }

  /**
   * Get forward destinations for a monitored chat
   */
  private async getForwardDestinations(userId: number, sourceChatId: string): Promise<any[]> {
    const destinations = await queryAll(`
      SELECT 
        target_chat_id,
        target_chat_name,
        forward_account_id
      FROM telegram_forward_destinations
      WHERE user_id = ? 
        AND source_chat_id = ?
        AND is_active = 1
    `, [userId, sourceChatId]);
    
    // If no new multi-destination config, fall back to legacy single destination
    if (!destinations || destinations.length === 0) {
      const chat = await queryOne(`
        SELECT forward_to_chat_id, forward_account_id 
        FROM telegram_monitored_chats
        WHERE user_id = ? AND chat_id = ?
      `, [userId, sourceChatId]);
      
      if (chat && (chat as any).forward_to_chat_id) {
        return [{
          target_chat_id: (chat as any).forward_to_chat_id,
          target_chat_name: (chat as any).forward_to_chat_id,
          forward_account_id: (chat as any).forward_account_id
        }];
      }
    }
    
    return destinations || [];
  }

  /**
   * Get chat configuration for duplicate handling
   */
  private async getChatConfig(userId: number, chatId: string): Promise<any> {
    const config = await queryOne(`
      SELECT * FROM telegram_chat_configs 
      WHERE user_id = ? AND chat_id = ?
    `, [userId, chatId]);
    
    if (!config) {
      // Create default config
      const now = Math.floor(Date.now() / 1000);
      await execute(`
        INSERT INTO telegram_chat_configs (
          chat_id, user_id, duplicate_strategy, 
          backlog_scan_depth, backlog_time_limit, 
          min_time_between_duplicates, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [chatId, userId, 'first_only_no_backlog', 1000, 86400, 0, now, now]);
      
      return {
        duplicate_strategy: 'first_only_no_backlog',
        backlog_scan_depth: 1000,
        backlog_time_limit: 86400,
        min_time_between_duplicates: 0
      };
    }
    
    return config;
  }

  /**
   * Check if we should process this contract based on duplicate strategy
   */
  private async shouldProcessContract(
    contractAddress: string, 
    chatId: string, 
    message: any,
    strategy: string
  ): Promise<{ process: boolean; forward: boolean; isFirst: boolean; reason?: string }> {
    // Check if this contract has been seen before in this chat
    const firstMention = await queryOne(`
      SELECT * FROM contract_first_mentions 
      WHERE contract_address = ? AND chat_id = ?
    `, [contractAddress, chatId]);
    
    switch (strategy) {
      case 'buy_any_call':
        // Process every mention
        return { 
          process: true, 
          forward: true, 
          isFirst: !firstMention,
          reason: undefined
        };
        
      case 'first_only_no_backlog':
        // Only process if this is the first time we've seen it (default behavior)
        if (firstMention) {
          return { 
            process: false, 
            forward: false, 
            isFirst: false,
            reason: 'skipped_duplicate_no_backlog'
          };
        }
        return { 
          process: true, 
          forward: true, 
          isFirst: true
        };
        
      case 'first_only_with_backlog':
        // Process only first mention, but scan history to find the actual first
        if (firstMention) {
          // Check if this is older than the recorded first mention
          if (message.date < (firstMention as any).message_timestamp) {
            // This is an older mention, update the first mention record
            return { 
              process: true, 
              forward: true, 
              isFirst: true,
              reason: 'older_first_mention_found'
            };
          }
          return { 
            process: false, 
            forward: false, 
            isFirst: false,
            reason: 'skipped_duplicate_with_backlog'
          };
        }
        // First time seeing this, but we should scan history
        // This will be handled by the backlog scanner
        return { 
          process: true, 
          forward: true, 
          isFirst: true
        };
        
      default:
        // Default to safe behavior
        return { 
          process: true, 
          forward: true, 
          isFirst: !firstMention
        };
    }
  }

  /**
   * Mark a contract as first mentioned in a chat
   */
  private async markFirstMention(contractAddress: string, chatId: string, message: any) {
    const now = Math.floor(Date.now() / 1000);
    try {
      await execute(`
        INSERT OR REPLACE INTO contract_first_mentions (
          contract_address, chat_id, message_id, 
          message_timestamp, detected_at, is_backlog_scan
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        contractAddress, 
        chatId, 
        message.id.toString(),
        message.date,
        now,
        0
      ]);
    } catch (error: any) {
      console.error(`Failed to mark first mention:`, error.message);
    }
  }

  /**
   * Detect and validate contracts in a message
   */
  private async detectContractsInMessage(messageText: string): Promise<any[]> {
    const potentialContracts = this.extractContracts(messageText);
    const validContracts = [];
    
    for (const contract of potentialContracts) {
      const validation = await this.validateAndExtractToken(contract.address);
      if (validation.isValid) {
        for (const tokenAddress of validation.actualTokens) {
          validContracts.push({
            address: tokenAddress,
            type: contract.type,
            original: contract.original
          });
        }
      }
    }
    
    return validContracts;
  }

  /**
   * Scan chat history for historical mentions of contracts
   */
  async scanChatHistory(userId: number, chatId: string, depth: number = 1000) {
    const client = this.activeClients.get(userId);
    if (!client) {
      throw new Error('No active Telegram client');
    }
    
    console.log(`📜 [Telegram] Scanning history for chat ${chatId} (depth: ${depth})`);
    
    try {
      const messages = await client.getMessages(chatId, { limit: depth });
      const contracts: Map<string, any> = new Map();
      
      for (const message of messages) {
        if (!message.message) continue;
        
        // Detect contracts in historical message
        const detectedContracts = await this.detectContractsInMessage(message.message);
        
        for (const contract of detectedContracts) {
          // Store the oldest mention of each contract
          if (!contracts.has(contract.address) || 
              message.date < contracts.get(contract.address).date) {
            contracts.set(contract.address, {
              ...contract,
              message,
              date: message.date
            });
          }
        }
      }
      
      console.log(`   📊 Found ${contracts.size} unique contracts in ${messages.length} messages`);
      
      // Mark all historical first mentions
      for (const [address, data] of contracts) {
        await this.markFirstMention(address, chatId, data.message);
        
        // Log as backlog detection
        await this.logTelegramDetection({
          contractAddress: address,
          chatId,
          messageId: data.message.id.toString(),
          messageText: data.message.message.substring(0, 500),
          messageTimestamp: data.date,
          senderId: data.message.senderId?.toJSNumber(),
          detectionType: data.type,
          detectedByUserId: userId,
          detectedAt: Math.floor(Date.now() / 1000),
          isFirstMention: true,
          isBacklog: true,
          processedAction: 'backlog_scan'
        });
      }
      
      // Mark scan as completed
      await execute(`
        UPDATE contract_first_mentions 
        SET scan_completed_at = ? 
        WHERE chat_id = ?
      `, [Math.floor(Date.now() / 1000), chatId]);
      
      return contracts;
    } catch (error: any) {
      console.error(`   ❌ Failed to scan chat history:`, error.message);
      throw error;
    }
  }

  /**
   * Log token mint to database
   */
  private async logTokenMint(contractAddress: string, data: {
    platform?: string;
    firstSeenSource?: string;
    chatName?: string;
    chatId?: string;
  }) {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      // Check if token already exists
      const existing = await queryOne(`
        SELECT id, telegram_mentions FROM token_mints WHERE mint_address = ?
      `, [contractAddress]);
      
      if (!existing) {
        // Insert new token
        await execute(`
          INSERT INTO token_mints (
            mint_address, 
            creator_address, 
            platform, 
            timestamp,
            first_seen_source, 
            first_seen_at, 
            telegram_mentions
          ) VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [
          contractAddress,
          'unknown', // We'll fetch this from chain later
          data.platform || 'pumpfun',
          now,
          data.firstSeenSource || 'telegram',
          now
        ]);
        console.log(`   📝 New token logged: ${contractAddress.substring(0, 8)}...`);
      } else {
        // Update mention count
        await execute(`
          UPDATE token_mints 
          SET telegram_mentions = telegram_mentions + 1,
              last_updated = ?
          WHERE mint_address = ?
        `, [now, contractAddress]);
      }
    } catch (error: any) {
      console.error(`   ❌ Failed to log token mint:`, error.message);
    }
  }

  /**
   * Log Telegram detection to database
   */
  private async logTelegramDetection(data: {
    contractAddress: string;
    chatId: string;
    chatName?: string;
    chatUsername?: string;
    messageId: string;
    messageText: string;
    messageTimestamp?: number;
    senderId?: number;
    senderUsername?: string;
    detectionType: string;
    detectedByUserId: number;
    detectedAt: number;
    isFirstMention?: boolean;
    isBacklog?: boolean;
    forwarded?: boolean;
    forwardedTo?: string;
    forwardLatency?: number;
    forwardError?: string;
    processedAction?: string;
  }) {
    try {
      await execute(`
        INSERT INTO telegram_detections (
          contract_address,
          chat_id,
          chat_name,
          chat_username,
          message_id,
          message_text,
          message_timestamp,
          sender_id,
          sender_username,
          detection_type,
          detected_by_user_id,
          detected_at,
          is_first_mention,
          is_backlog,
          forwarded,
          forwarded_to,
          forward_latency,
          forward_error,
          processed_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.contractAddress,
        data.chatId,
        data.chatName || null,
        data.chatUsername || null,
        data.messageId,
        data.messageText,
        data.messageTimestamp || Math.floor(Date.now() / 1000),
        data.senderId || null,
        data.senderUsername || null,
        data.detectionType,
        data.detectedByUserId,
        data.detectedAt,
        data.isFirstMention ? 1 : 0,
        data.isBacklog ? 1 : 0,
        data.forwarded ? 1 : 0,
        data.forwardedTo || null,
        data.forwardLatency || null,
        data.forwardError || null,
        data.processedAction || null
      ]);
    } catch (error: any) {
      console.error(`   ❌ Failed to log Telegram detection:`, error.message);
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

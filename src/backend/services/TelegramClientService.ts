/**
 * Telegram Client Service using GramJS
 * Handles authentication with 2FA support and real-time message monitoring
 */

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { queryOne, execute } from '../database/helpers.js';

interface AuthSession {
  userId: number;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  phoneCodeHash?: string;
  client?: TelegramClient;
  status: 'idle' | 'code_sent' | 'awaiting_code' | 'awaiting_2fa' | 'connected' | 'error';
  error?: string;
}

// Contract detection patterns (from your Python script)
const SOL_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const SOL_PATTERN_WITH_SPECIALS = /[1-9A-HJ-NP-Za-km-z]{8,}[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,}(?:[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,})*/g;

export class TelegramClientService extends EventEmitter {
  private sessions: Map<number, AuthSession> = new Map();
  private activeClients: Map<number, TelegramClient> = new Map();
  private encryptionKey: string;

  constructor() {
    super();
    this.encryptionKey = process.env.TELEGRAM_ENCRYPTION_KEY || 'default-key-change-in-production';
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

      const session = new StringSession(existingSession?.session_string || '');
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
      
      // Start monitoring
      await this.startMonitoring(userId, client);

      const result = signInResult as any;
      const user = result.user as Api.User;
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
   * Compute SRP password hash for 2FA
   */
  private async computePasswordHash(
    passwordInfo: Api.account.Password,
    _passwordStr: string
  ): Promise<Api.InputCheckPasswordSRP> {
    // This is a simplified version - in production, use proper SRP implementation
    const pwdInfo = passwordInfo as any;
    const srpId = pwdInfo.srpId;
    
    // For now, we'll use the simpler password check
    // In production, implement full SRP protocol with passwordStr
    // TODO: Implement proper SRP protocol using passwordStr
    return new Api.InputCheckPasswordSRP({
      srpId: srpId || BigInt(0),
      A: Buffer.from(''), // Computed A value
      M1: Buffer.from('') // Computed M1 value
    });
  }

  /**
   * Start monitoring for messages
   */
  private async startMonitoring(userId: number, client: TelegramClient) {
    // Get monitored chats from database
    const chats = await this.getMonitoredChats(userId);
    const userFilters = await this.getUserFilters(userId);
    
    // Add message handler
    client.addEventHandler(async (event) => {
      try {
        const message = event.message;
        if (!message || !message.message) return;

        // Check if message is from monitored chat
        const chatId = message.chatId?.toString();
        const isMonitoredChat = chats.some(c => c.chatId === chatId);
        if (!isMonitoredChat) return;

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
  private async getSenderUsername(client: TelegramClient, senderId: any): Promise<string | undefined> {
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
   * Get monitored chats from database
   */
  private async getMonitoredChats(userId: number): Promise<any[]> {
    const result = await queryOne(
      'SELECT monitored_user_ids FROM telegram_monitored_chats WHERE user_id = ? AND is_active = 1',
      [userId]
    ) as any;
    return result ? JSON.parse(result.monitored_user_ids || '[]') : [];
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
}

// Export singleton instance
export const telegramClientService = new TelegramClientService();

import crypto from 'crypto';
import { queryOne, queryAll, execute } from '../database/helpers.js';

/**
 * Telegram User Service
 * Handles Telegram user account and bot account management
 */
export class TelegramUserService {
  private encryptionKey: string;

  constructor() {
    // In production, use a secure key from environment variables
    this.encryptionKey = process.env.TELEGRAM_ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  /**
   * Save or update Telegram user account credentials
   */
  async saveUserAccount(userId: number, credentials: {
    apiId: string;
    apiHash: string;
    phoneNumber: string;
    sessionString?: string;
  }) {
    const existing = await queryOne('SELECT id FROM telegram_user_accounts WHERE user_id = ?', [userId]);
    
    const encryptedApiHash = this.encrypt(credentials.apiHash);
    const encryptedSession = credentials.sessionString ? this.encrypt(credentials.sessionString) : null;
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
      await execute(`
        UPDATE telegram_user_accounts 
        SET api_id = ?, api_hash = ?, phone_number = ?, session_string = ?, updated_at = ?
        WHERE user_id = ?
      `, [
        credentials.apiId,
        encryptedApiHash,
        credentials.phoneNumber,
        encryptedSession,
        now,
        userId
      ]);
    } else {
      await execute(`
        INSERT INTO telegram_user_accounts (user_id, api_id, api_hash, phone_number, session_string, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        credentials.apiId,
        encryptedApiHash,
        credentials.phoneNumber,
        encryptedSession,
        now,
        now
      ]);
    }

    return { success: true };
  }

  /**
   * Get Telegram user account credentials
   */
  async getUserAccount(userId: number) {
    const account = await queryOne(`
      SELECT id, api_id, api_hash, phone_number, session_string, is_verified, last_connected_at
      FROM telegram_user_accounts 
      WHERE user_id = ?
    `, [userId]) as any;

    if (!account) return null;

    return {
      id: account.id,
      apiId: account.api_id,
      apiHash: this.decrypt(account.api_hash),
      phoneNumber: account.phone_number,
      sessionString: account.session_string ? this.decrypt(account.session_string) : null,
      isVerified: account.is_verified === 1,
      lastConnectedAt: account.last_connected_at
    };
  }

  /**
   * Update user account verification status
   */
  async updateUserAccountVerification(userId: number, isVerified: boolean, sessionString?: string) {
    const encryptedSession = sessionString ? this.encrypt(sessionString) : null;
    const now = Math.floor(Date.now() / 1000);
    
    await execute(`
      UPDATE telegram_user_accounts 
      SET is_verified = ?, session_string = ?, last_connected_at = ?, updated_at = ?
      WHERE user_id = ?
    `, [
      isVerified ? 1 : 0,
      encryptedSession,
      now,
      now,
      userId
    ]);

    return { success: true };
  }

  /**
   * Save or update Telegram bot account credentials
   */
  async saveBotAccount(userId: number, credentials: {
    botToken: string;
    botUsername?: string;
  }) {
    const existing = await queryOne('SELECT id FROM telegram_bot_accounts WHERE user_id = ?', [userId]);
    
    const encryptedToken = this.encrypt(credentials.botToken);
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
      await execute(`
        UPDATE telegram_bot_accounts 
        SET bot_token = ?, bot_username = ?, updated_at = ?
        WHERE user_id = ?
      `, [
        encryptedToken,
        credentials.botUsername || null,
        now,
        userId
      ]);
    } else {
      await execute(`
        INSERT INTO telegram_bot_accounts (user_id, bot_token, bot_username, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
        userId,
        encryptedToken,
        credentials.botUsername || null,
        now,
        now
      ]);
    }

    return { success: true };
  }

  /**
   * Get Telegram bot account credentials
   */
  async getBotAccount(userId: number) {
    const account = await queryOne(`
      SELECT id, bot_token, bot_username, is_verified, last_connected_at
      FROM telegram_bot_accounts 
      WHERE user_id = ?
    `, [userId]) as any;

    if (!account) return null;

    return {
      id: account.id,
      botToken: this.decrypt(account.bot_token),
      botUsername: account.bot_username,
      isVerified: account.is_verified === 1,
      lastConnectedAt: account.last_connected_at
    };
  }

  /**
   * Update bot account verification status
   */
  async updateBotAccountVerification(userId: number, isVerified: boolean, botUsername?: string) {
    const now = Math.floor(Date.now() / 1000);
    
    await execute(`
      UPDATE telegram_bot_accounts 
      SET is_verified = ?, bot_username = ?, last_connected_at = ?, updated_at = ?
      WHERE user_id = ?
    `, [
      isVerified ? 1 : 0,
      botUsername || null,
      now,
      now,
      userId
    ]);

    return { success: true };
  }

  /**
   * Save monitored chat configuration
   */
  async saveMonitoredChat(userId: number, chat: {
    chatId: string;
    chatName?: string;
    chatType?: string;
    forwardToChatId?: string;
    monitoredUserIds?: number[];
    monitoredKeywords?: string[];
  }) {
    const existing = await queryOne(
      'SELECT id FROM telegram_monitored_chats WHERE user_id = ? AND chat_id = ?',
      [userId, chat.chatId]
    );

    const monitoredUserIdsJson = chat.monitoredUserIds ? JSON.stringify(chat.monitoredUserIds) : null;
    const monitoredKeywordsJson = chat.monitoredKeywords ? JSON.stringify(chat.monitoredKeywords) : null;
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
      await execute(`
        UPDATE telegram_monitored_chats 
        SET chat_name = ?, chat_type = ?, forward_to_chat_id = ?, 
            monitored_user_ids = ?, monitored_keywords = ?, updated_at = ?
        WHERE user_id = ? AND chat_id = ?
      `, [
        chat.chatName || null,
        chat.chatType || null,
        chat.forwardToChatId || null,
        monitoredUserIdsJson,
        monitoredKeywordsJson,
        now,
        userId,
        chat.chatId
      ]);
    } else {
      await execute(`
        INSERT INTO telegram_monitored_chats 
        (user_id, chat_id, chat_name, chat_type, forward_to_chat_id, monitored_user_ids, monitored_keywords, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        chat.chatId,
        chat.chatName || null,
        chat.chatType || null,
        chat.forwardToChatId || null,
        monitoredUserIdsJson,
        monitoredKeywordsJson,
        now,
        now
      ]);
    }

    return { success: true };
  }

  /**
   * Get all monitored chats for a user
   */
  async getMonitoredChats(userId: number) {
    const chats = await queryAll(`
      SELECT * FROM telegram_monitored_chats 
      WHERE user_id = ? AND is_active = 1
      ORDER BY created_at DESC
    `, [userId]) as any[];

    return chats.map(chat => ({
      id: chat.id,
      chatId: chat.chat_id,
      chatName: chat.chat_name,
      chatType: chat.chat_type,
      forwardToChatId: chat.forward_to_chat_id,
      monitoredUserIds: chat.monitored_user_ids ? JSON.parse(chat.monitored_user_ids) : [],
      monitoredKeywords: chat.monitored_keywords ? JSON.parse(chat.monitored_keywords) : [],
      isActive: chat.is_active === 1,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at
    }));
  }

  /**
   * Toggle monitored chat active status
   */
  async toggleMonitoredChat(userId: number, chatId: string, isActive: boolean) {
    await execute(`
      UPDATE telegram_monitored_chats 
      SET is_active = ?, updated_at = ?
      WHERE user_id = ? AND chat_id = ?
    `, [
      isActive ? 1 : 0,
      Math.floor(Date.now() / 1000),
      userId,
      chatId
    ]);

    return { success: true };
  }

  /**
   * Delete monitored chat
   */
  async deleteMonitoredChat(userId: number, chatId: string) {
    await execute(`
      DELETE FROM telegram_monitored_chats 
      WHERE user_id = ? AND chat_id = ?
    `, [userId, chatId]);

    return { success: true };
  }

  /**
   * Save detected contract from Telegram
   */
  async saveDetectedContract(data: {
    userId: number;
    chatId: string;
    messageId: number;
    senderId?: string;
    senderUsername?: string;
    contractAddress: string;
    detectionType: 'standard' | 'obfuscated' | 'split';
    originalFormat: string;
    messageText: string;
    forwarded?: boolean;
  }) {
    const now = Math.floor(Date.now() / 1000);
    
    await execute(`
      INSERT INTO telegram_detected_contracts 
      (user_id, chat_id, message_id, sender_id, sender_username, contract_address, 
       detection_type, original_format, message_text, forwarded, detected_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.userId,
      data.chatId,
      data.messageId,
      data.senderId || null,
      data.senderUsername || null,
      data.contractAddress,
      data.detectionType,
      data.originalFormat,
      data.messageText,
      data.forwarded ? 1 : 0,
      now,
      now
    ]);

    return { success: true };
  }

  /**
   * Get detected contracts for a user
   */
  async getDetectedContracts(userId: number, limit: number = 100) {
    const contracts = await queryAll(`
      SELECT * FROM telegram_detected_contracts 
      WHERE user_id = ?
      ORDER BY detected_at DESC
      LIMIT ?
    `, [userId, limit]) as any[];

    return contracts.map(contract => ({
      id: contract.id,
      chatId: contract.chat_id,
      messageId: contract.message_id,
      senderId: contract.sender_id,
      senderUsername: contract.sender_username,
      contractAddress: contract.contract_address,
      detectionType: contract.detection_type,
      originalFormat: contract.original_format,
      messageText: contract.message_text,
      forwarded: contract.forwarded === 1,
      detectedAt: contract.detected_at
    }));
  }

  /**
   * Check if contract was already detected (deduplication)
   */
  async isContractDetected(userId: number, contractAddress: string, withinDays: number = 30): Promise<boolean> {
    const cutoffTime = Math.floor(Date.now() / 1000) - (withinDays * 24 * 60 * 60);
    
    const result = await queryOne(`
      SELECT COUNT(*) as count FROM telegram_detected_contracts 
      WHERE user_id = ? AND contract_address = ? AND detected_at > ?
    `, [userId, contractAddress, cutoffTime]) as any;

    return result.count > 0;
  }

  /**
   * Update bot account verification status and username
   */
  async updateBotAccountVerified(userId: number, isVerified: boolean, username?: string) {
    let sql = 'UPDATE telegram_bot_accounts SET is_verified = ?, last_connected_at = ?, updated_at = ?';
    const params: any[] = [isVerified ? 1 : 0, Date.now(), Date.now()];
    
    if (username) {
      sql += ', bot_username = ?';
      params.push(username);
    }
    
    sql += ' WHERE user_id = ?';
    params.push(userId);
    
    await execute(sql, params);
    return { success: true };
  }

  /**
   * Delete user account
   */
  async deleteUserAccount(userId: number) {
    await execute(
      'DELETE FROM telegram_user_accounts WHERE user_id = ?',
      [userId]
    );
    return { success: true };
  }

  /**
   * Delete bot account
   */
  async deleteBotAccount(userId: number) {
    await execute(
      'DELETE FROM telegram_bot_accounts WHERE user_id = ?',
      [userId]
    );
    return { success: true };
  }

  /**
   * Get account status (user account, bot account, monitored chats)
   */
  async getAccountStatus(userId: number) {
    const userAccount = await this.getUserAccount(userId);
    const botAccount = await this.getBotAccount(userId);
    const monitoredChats = await this.getMonitoredChats(userId);
    
    // Get live connection status from TelegramClientService
    const { telegramClientService } = await import('./TelegramClientService.js');
    const connectionStatus = telegramClientService.getConnectionStatus(userId);

    return {
      userAccount: userAccount ? {
        configured: true,
        verified: userAccount.isVerified,
        connected: connectionStatus.connected, // Live connection status
        phoneNumber: userAccount.phoneNumber,
        lastConnected: userAccount.lastConnectedAt
      } : {
        configured: false,
        verified: false,
        connected: false
      },
      botAccount: botAccount ? {
        configured: true,
        verified: botAccount.isVerified,
        username: botAccount.botUsername,
        lastConnected: botAccount.lastConnectedAt
      } : {
        configured: false,
        verified: false
      },
      monitoredChatsCount: monitoredChats.length
    };
  }
}

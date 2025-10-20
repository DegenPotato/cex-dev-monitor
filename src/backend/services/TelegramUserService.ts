import crypto from 'crypto';
import { queryOne, queryAll, execute, saveDatabase } from '../database/helpers.js';

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

    saveDatabase();
    return { success: true };
  }

  /**
   * Get Telegram user account credentials
   */
  getUserAccount(userId: number) {
    const account = this.db.prepare(`
      SELECT id, api_id, api_hash, phone_number, session_string, is_verified, last_connected_at
      FROM telegram_user_accounts 
      WHERE user_id = ?
    `).get(userId) as any;

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
  updateUserAccountVerification(userId: number, isVerified: boolean, sessionString?: string) {
    const encryptedSession = sessionString ? this.encrypt(sessionString) : null;
    
    this.db.prepare(`
      UPDATE telegram_user_accounts 
      SET is_verified = ?, session_string = ?, last_connected_at = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      isVerified ? 1 : 0,
      encryptedSession,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000),
      userId
    );

    return { success: true };
  }

  /**
   * Save or update Telegram bot account credentials
   */
  saveBotAccount(userId: number, credentials: {
    botToken: string;
    botUsername?: string;
  }) {
    const existing = this.db.prepare('SELECT id FROM telegram_bot_accounts WHERE user_id = ?').get(userId);
    
    const encryptedToken = this.encrypt(credentials.botToken);

    if (existing) {
      this.db.prepare(`
        UPDATE telegram_bot_accounts 
        SET bot_token = ?, bot_username = ?, updated_at = ?
        WHERE user_id = ?
      `).run(
        encryptedToken,
        credentials.botUsername || null,
        Math.floor(Date.now() / 1000),
        userId
      );
    } else {
      this.db.prepare(`
        INSERT INTO telegram_bot_accounts (user_id, bot_token, bot_username, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        encryptedToken,
        credentials.botUsername || null,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000)
      );
    }

    return { success: true };
  }

  /**
   * Get Telegram bot account credentials
   */
  getBotAccount(userId: number) {
    const account = this.db.prepare(`
      SELECT id, bot_token, bot_username, is_verified, last_connected_at
      FROM telegram_bot_accounts 
      WHERE user_id = ?
    `).get(userId) as any;

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
  updateBotAccountVerification(userId: number, isVerified: boolean, botUsername?: string) {
    this.db.prepare(`
      UPDATE telegram_bot_accounts 
      SET is_verified = ?, bot_username = ?, last_connected_at = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      isVerified ? 1 : 0,
      botUsername || null,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000),
      userId
    );

    return { success: true };
  }

  /**
   * Save monitored chat configuration
   */
  saveMonitoredChat(userId: number, chat: {
    chatId: string;
    chatName?: string;
    chatType?: string;
    forwardToChatId?: string;
    monitoredUserIds?: number[];
    monitoredKeywords?: string[];
  }) {
    const existing = this.db.prepare(
      'SELECT id FROM telegram_monitored_chats WHERE user_id = ? AND chat_id = ?'
    ).get(userId, chat.chatId);

    const monitoredUserIdsJson = chat.monitoredUserIds ? JSON.stringify(chat.monitoredUserIds) : null;
    const monitoredKeywordsJson = chat.monitoredKeywords ? JSON.stringify(chat.monitoredKeywords) : null;

    if (existing) {
      this.db.prepare(`
        UPDATE telegram_monitored_chats 
        SET chat_name = ?, chat_type = ?, forward_to_chat_id = ?, 
            monitored_user_ids = ?, monitored_keywords = ?, updated_at = ?
        WHERE user_id = ? AND chat_id = ?
      `).run(
        chat.chatName || null,
        chat.chatType || null,
        chat.forwardToChatId || null,
        monitoredUserIdsJson,
        monitoredKeywordsJson,
        Math.floor(Date.now() / 1000),
        userId,
        chat.chatId
      );
    } else {
      this.db.prepare(`
        INSERT INTO telegram_monitored_chats 
        (user_id, chat_id, chat_name, chat_type, forward_to_chat_id, monitored_user_ids, monitored_keywords, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        chat.chatId,
        chat.chatName || null,
        chat.chatType || null,
        chat.forwardToChatId || null,
        monitoredUserIdsJson,
        monitoredKeywordsJson,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000)
      );
    }

    return { success: true };
  }

  /**
   * Get all monitored chats for a user
   */
  getMonitoredChats(userId: number) {
    const chats = this.db.prepare(`
      SELECT * FROM telegram_monitored_chats 
      WHERE user_id = ? AND is_active = 1
      ORDER BY created_at DESC
    `).all(userId) as any[];

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
  toggleMonitoredChat(userId: number, chatId: string, isActive: boolean) {
    this.db.prepare(`
      UPDATE telegram_monitored_chats 
      SET is_active = ?, updated_at = ?
      WHERE user_id = ? AND chat_id = ?
    `).run(
      isActive ? 1 : 0,
      Math.floor(Date.now() / 1000),
      userId,
      chatId
    );

    return { success: true };
  }

  /**
   * Delete monitored chat
   */
  deleteMonitoredChat(userId: number, chatId: string) {
    this.db.prepare(`
      DELETE FROM telegram_monitored_chats 
      WHERE user_id = ? AND chat_id = ?
    `).run(userId, chatId);

    return { success: true };
  }

  /**
   * Save detected contract from Telegram
   */
  saveDetectedContract(data: {
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
    this.db.prepare(`
      INSERT INTO telegram_detected_contracts 
      (user_id, chat_id, message_id, sender_id, sender_username, contract_address, 
       detection_type, original_format, message_text, forwarded, detected_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000)
    );

    return { success: true };
  }

  /**
   * Get detected contracts for a user
   */
  getDetectedContracts(userId: number, limit: number = 100) {
    const contracts = this.db.prepare(`
      SELECT * FROM telegram_detected_contracts 
      WHERE user_id = ?
      ORDER BY detected_at DESC
      LIMIT ?
    `).all(userId, limit) as any[];

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
  isContractDetected(userId: number, contractAddress: string, withinDays: number = 30): boolean {
    const cutoffTime = Math.floor(Date.now() / 1000) - (withinDays * 24 * 60 * 60);
    
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM telegram_detected_contracts 
      WHERE user_id = ? AND contract_address = ? AND detected_at > ?
    `).get(userId, contractAddress, cutoffTime) as any;

    return result.count > 0;
  }

  /**
   * Get account status summary
   */
  getAccountStatus(userId: number) {
    const userAccount = this.getUserAccount(userId);
    const botAccount = this.getBotAccount(userId);
    const monitoredChats = this.getMonitoredChats(userId);

    return {
      userAccount: userAccount ? {
        configured: true,
        verified: userAccount.isVerified,
        phoneNumber: userAccount.phoneNumber,
        lastConnected: userAccount.lastConnectedAt
      } : {
        configured: false,
        verified: false
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

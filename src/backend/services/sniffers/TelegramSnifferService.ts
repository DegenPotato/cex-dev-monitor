import { BaseSnifferService, SnifferPlatform, UnifiedChatData, MonitoringConfig, SniffedContent } from './BaseSnifferService.js';
import { telegramClientService } from '../TelegramClientService.js';

/**
 * Enhanced Telegram Sniffer Service
 * Extends base sniffer with Telegram-specific functionality
 */
export class TelegramSnifferService extends BaseSnifferService {
  private userId: number;
  
  constructor(userId: number) {
    super(SnifferPlatform.TELEGRAM);
    this.userId = userId;
  }
  
  /**
   * Connect to Telegram (already handled by TelegramClientService)
   */
  async connect(_credentials: any): Promise<boolean> {
    const status = telegramClientService.getConnectionStatus(this.userId);
    this.isConnected = status.connected;
    return this.isConnected;
  }
  
  /**
   * Disconnect from Telegram
   */
  async disconnect(): Promise<void> {
    // Try to disconnect if method exists
    try {
      if (typeof (telegramClientService as any).disconnect === 'function') {
        await (telegramClientService as any).disconnect(this.userId);
      }
    } catch (error) {
      console.log('Could not disconnect Telegram client');
    }
    this.isConnected = false;
  }
  
  /**
   * Fetch available Telegram chats with comprehensive data
   */
  async fetchAvailableChats(_options?: any): Promise<UnifiedChatData[]> {
    const telegramChats = await telegramClientService.fetchUserChats(this.userId);
    
    // Transform Telegram data to unified format
    return telegramChats.map(chat => this.transformToUnifiedFormat(chat));
  }
  
  /**
   * Transform Telegram chat data to unified format
   */
  private transformToUnifiedFormat(telegramChat: any): UnifiedChatData {
    // Determine access level based on admin rights
    let accessLevel: 'read' | 'write' | 'admin' | 'owner' = 'read';
    if (telegramChat.isCreator) {
      accessLevel = 'owner';
    } else if (telegramChat.adminRights) {
      accessLevel = 'admin';
    } else if (!telegramChat.bannedRights?.sendMessages) {
      accessLevel = 'write';
    }
    
    // Calculate message rate from last activity
    let messageRate = 0;
    if (telegramChat.lastMessageDate) {
      const hoursSinceLastMessage = (Date.now() - telegramChat.lastMessageDate * 1000) / (1000 * 60 * 60);
      if (hoursSinceLastMessage < 24) {
        messageRate = Math.round(telegramChat.unreadCount / Math.max(hoursSinceLastMessage, 1));
      }
    }
    
    return {
      // Core identifiers
      platformId: telegramChat.chatId,
      platform: SnifferPlatform.TELEGRAM,
      
      // Basic info
      name: telegramChat.chatName,
      displayName: telegramChat.chatName,
      handle: telegramChat.username ? `@${telegramChat.username}` : undefined,
      description: telegramChat.botInfo?.description,
      url: telegramChat.inviteLink || (telegramChat.username ? `https://t.me/${telegramChat.username}` : undefined),
      
      // Type classification
      type: this.mapTelegramType(telegramChat.chatType),
      subtype: telegramChat.chatSubtype,
      
      // Access & Status
      isPublic: !!telegramChat.username,
      isVerified: telegramChat.isVerified,
      isRestricted: telegramChat.isRestricted,
      hasAccess: !telegramChat.hasLeft && !telegramChat.isDeactivated,
      accessLevel: accessLevel,
      
      // Participants & Activity
      memberCount: telegramChat.participantsCount,
      activeMembers: telegramChat.onlineCount,
      messageRate: messageRate,
      lastActivity: telegramChat.lastMessageDate ? new Date(telegramChat.lastMessageDate * 1000) : undefined,
      
      // Platform-specific metadata
      metadata: {
        // Status flags
        isScam: telegramChat.isScam,
        isFake: telegramChat.isFake,
        isCreator: telegramChat.isCreator,
        hasLeft: telegramChat.hasLeft,
        isDeactivated: telegramChat.isDeactivated,
        isCallActive: telegramChat.isCallActive,
        
        // Counts
        unreadCount: telegramChat.unreadCount,
        unreadMentionsCount: telegramChat.unreadMentionsCount,
        unreadReactionsCount: telegramChat.unreadReactionsCount,
        
        // Permissions
        adminRights: telegramChat.adminRights,
        bannedRights: telegramChat.bannedRights,
        defaultBannedRights: telegramChat.defaultBannedRights,
        restrictions: telegramChat.restrictions,
        
        // Media
        photo: telegramChat.photo,
        
        // Messages
        lastMessage: telegramChat.lastMessage,
        pinnedMsgId: telegramChat.pinnedMsgId,
        
        // Statistics
        statistics: telegramChat.statistics,
        
        // Settings
        notifySettings: telegramChat.notifySettings,
        ttlPeriod: telegramChat.ttlPeriod,
        
        // Bot info
        botInfo: telegramChat.botInfo,
        
        // Raw data
        rawClassName: telegramChat.rawClassName,
        rawFlags: telegramChat.rawFlags,
        accessHash: telegramChat.accessHash
      }
    };
  }
  
  /**
   * Map Telegram chat type to unified type
   */
  private mapTelegramType(telegramType: string): 'private' | 'group' | 'channel' | 'space' | 'community' | 'feed' {
    switch (telegramType) {
      case 'private':
        return 'private';
      case 'group':
      case 'supergroup':
        return 'group';
      case 'channel':
        return 'channel';
      default:
        return 'group';
    }
  }
  
  /**
   * Start monitoring a Telegram chat
   */
  async startMonitoring(chatId: string, config: MonitoringConfig): Promise<void> {
    // Store monitoring config
    const chat = this.monitoredChats.get(chatId);
    if (chat) {
      chat.monitoringConfig = config;
    }
    
    // Set up message handler if not already active
    if (!this.activeMonitors.has(chatId)) {
      // This would integrate with TelegramClientService's monitoring
      this.activeMonitors.set(chatId, config);
      console.log(`📡 [Telegram] Started monitoring chat ${chatId}`);
    }
  }
  
  /**
   * Stop monitoring a Telegram chat
   */
  async stopMonitoring(chatId: string): Promise<void> {
    this.activeMonitors.delete(chatId);
    const chat = this.monitoredChats.get(chatId);
    if (chat && chat.monitoringConfig) {
      chat.monitoringConfig.isActive = false;
    }
    console.log(`🛑 [Telegram] Stopped monitoring chat ${chatId}`);
  }
  
  /**
   * Forward content to another Telegram chat
   */
  protected async forwardContent(_content: SniffedContent, config: any): Promise<void> {
    // Implement Telegram message forwarding
    console.log(`📤 [Telegram] Forwarding content to ${config.targetChatId}`);
  }
  
  /**
   * Analyze Telegram content for insights
   */
  protected async analyzeContent(content: SniffedContent, _config: any): Promise<void> {
    // Implement content analysis
    const analysis = {
      sentiment: this.analyzeSentiment(content.content),
      entities: this.extractEntities(content.content),
      contracts: this.extractContracts(content.content),
      keywords: this.extractKeywords(content.content)
    };
    
    content.metadata.analysis = analysis;
    console.log(`🔍 [Telegram] Content analyzed:`, analysis);
  }
  
  /**
   * Basic sentiment analysis
   */
  private analyzeSentiment(text: string): string {
    const positive = /bullish|moon|pump|gem|100x|rocket|fire|amazing/gi;
    const negative = /bearish|dump|scam|rug|sell|crash|dead/gi;
    
    const positiveCount = (text.match(positive) || []).length;
    const negativeCount = (text.match(negative) || []).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }
  
  /**
   * Extract entities from text
   */
  private extractEntities(text: string): Array<{ type: string; value: string }> {
    const entities: Array<{ type: string; value: string }> = [];
    
    // Extract mentions
    const mentions = text.match(/@\w+/g) || [];
    mentions.forEach(m => entities.push({ type: 'mention', value: m }));
    
    // Extract hashtags
    const hashtags = text.match(/#\w+/g) || [];
    hashtags.forEach(h => entities.push({ type: 'hashtag', value: h }));
    
    // Extract URLs
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    urls.forEach(u => entities.push({ type: 'url', value: u }));
    
    return entities;
  }
  
  /**
   * Extract Solana contracts
   */
  private extractContracts(text: string): string[] {
    const solPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
    return text.match(solPattern) || [];
  }
  
  /**
   * Extract important keywords
   */
  private extractKeywords(text: string): string[] {
    const importantWords = /\b(launch|presale|airdrop|mint|dex|listing|audit|kyc|doxx|team|roadmap|whitepaper)\b/gi;
    return (text.match(importantWords) || []).map(w => w.toLowerCase());
  }
}

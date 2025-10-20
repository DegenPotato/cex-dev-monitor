import { EventEmitter } from 'events';

/**
 * Platform types that can be monitored
 */
export enum SnifferPlatform {
  TELEGRAM = 'telegram',
  TWITTER = 'twitter',
  DISCORD = 'discord',
  TWITTER_SPACES = 'twitter_spaces',
  TWITTER_COMMUNITIES = 'twitter_communities',
  ONCHAIN_SOLANA = 'onchain_solana',
  ONCHAIN_ETH = 'onchain_eth',
  REDDIT = 'reddit',
  FARCASTER = 'farcaster'
}

/**
 * Base interface for all chat/channel data across platforms
 */
export interface UnifiedChatData {
  // Core identifiers
  platformId: string;           // Unique ID on the platform
  platform: SnifferPlatform;    // Which platform this is from
  internalId?: string;          // Our internal ID
  
  // Basic info
  name: string;
  displayName?: string;
  handle?: string;              // @username or similar
  description?: string;
  url?: string;                 // Direct link to chat/channel
  
  // Type classification
  type: 'private' | 'group' | 'channel' | 'space' | 'community' | 'feed';
  subtype?: string;             // Platform-specific subtype
  
  // Access & Status
  isPublic: boolean;
  isVerified: boolean;
  isRestricted: boolean;
  hasAccess: boolean;
  accessLevel?: 'read' | 'write' | 'admin' | 'owner';
  
  // Participants & Activity
  memberCount?: number;
  activeMembers?: number;
  messageRate?: number;         // Messages per hour
  lastActivity?: Date;
  
  // Platform-specific metadata (flexible)
  metadata: Record<string, any>;
  
  // Monitoring configuration
  monitoringConfig?: MonitoringConfig;
}

/**
 * Monitoring configuration for a chat/channel
 */
export interface MonitoringConfig {
  isActive: boolean;
  keywords?: string[];
  userIds?: string[];
  patterns?: RegExp[];
  webhooks?: string[];
  actions?: AutomationAction[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  rateLimit?: number;           // Max messages per minute to process
}

/**
 * Automation action that can be triggered
 */
export interface AutomationAction {
  id: string;
  type: 'webhook' | 'forward' | 'alert' | 'execute' | 'analyze';
  trigger: TriggerCondition;
  config: Record<string, any>;
  cooldown?: number;            // Seconds between triggers
  maxTriggers?: number;         // Max times to trigger
}

/**
 * Trigger conditions for automations
 */
export interface TriggerCondition {
  type: 'keyword' | 'pattern' | 'user' | 'volume' | 'sentiment' | 'contract';
  operator: 'contains' | 'matches' | 'equals' | 'greater' | 'less';
  value: any;
  combineWith?: 'AND' | 'OR';
  additionalConditions?: TriggerCondition[];
}

/**
 * Detected content from monitoring
 */
export interface SniffedContent {
  id: string;
  platform: SnifferPlatform;
  chatId: string;
  timestamp: Date;
  
  // Content
  type: 'message' | 'media' | 'link' | 'contract' | 'transaction';
  content: string;
  rawContent?: any;
  
  // Sender info
  senderId?: string;
  senderName?: string;
  senderHandle?: string;
  
  // Detection info
  detectedBy: string[];         // Which triggers detected this
  confidence: number;            // 0-1 confidence score
  metadata: Record<string, any>;
  
  // Actions taken
  actionsTriggered?: string[];
  forwarded?: boolean;
  analyzed?: boolean;
}

/**
 * Base class for all platform sniffers
 */
export abstract class BaseSnifferService extends EventEmitter {
  protected platform: SnifferPlatform;
  protected isConnected: boolean = false;
  protected monitoredChats: Map<string, UnifiedChatData> = new Map();
  protected activeMonitors: Map<string, any> = new Map();
  
  constructor(platform: SnifferPlatform) {
    super();
    this.platform = platform;
  }
  
  /**
   * Connect to the platform
   */
  abstract connect(credentials: any): Promise<boolean>;
  
  /**
   * Disconnect from the platform
   */
  abstract disconnect(): Promise<void>;
  
  /**
   * Fetch available chats/channels from the platform
   */
  abstract fetchAvailableChats(options?: any): Promise<UnifiedChatData[]>;
  
  /**
   * Start monitoring a specific chat/channel
   */
  abstract startMonitoring(chatId: string, config: MonitoringConfig): Promise<void>;
  
  /**
   * Stop monitoring a specific chat/channel
   */
  abstract stopMonitoring(chatId: string): Promise<void>;
  
  /**
   * Search chats by query
   */
  async searchChats(query: string, chats?: UnifiedChatData[]): Promise<UnifiedChatData[]> {
    const searchableChats = chats || Array.from(this.monitoredChats.values());
    const lowerQuery = query.toLowerCase();
    
    return searchableChats.filter(chat => {
      return (
        chat.name?.toLowerCase().includes(lowerQuery) ||
        chat.displayName?.toLowerCase().includes(lowerQuery) ||
        chat.handle?.toLowerCase().includes(lowerQuery) ||
        chat.description?.toLowerCase().includes(lowerQuery) ||
        chat.platformId.includes(query)
      );
    });
  }
  
  /**
   * Filter chats by criteria
   */
  async filterChats(
    criteria: {
      type?: string;
      isPublic?: boolean;
      isVerified?: boolean;
      minMembers?: number;
      hasAccess?: boolean;
      platform?: SnifferPlatform;
    },
    chats?: UnifiedChatData[]
  ): Promise<UnifiedChatData[]> {
    const filterableChats = chats || Array.from(this.monitoredChats.values());
    
    return filterableChats.filter(chat => {
      if (criteria.type && chat.type !== criteria.type) return false;
      if (criteria.isPublic !== undefined && chat.isPublic !== criteria.isPublic) return false;
      if (criteria.isVerified !== undefined && chat.isVerified !== criteria.isVerified) return false;
      if (criteria.minMembers && (!chat.memberCount || chat.memberCount < criteria.minMembers)) return false;
      if (criteria.hasAccess !== undefined && chat.hasAccess !== criteria.hasAccess) return false;
      if (criteria.platform && chat.platform !== criteria.platform) return false;
      return true;
    });
  }
  
  /**
   * Process detected content through automation pipeline
   */
  protected async processDetection(content: SniffedContent, config: MonitoringConfig): Promise<void> {
    // Check rate limits
    if (config.rateLimit) {
      // Implement rate limiting logic
    }
    
    // Process through each action
    if (config.actions) {
      for (const action of config.actions) {
        if (this.shouldTriggerAction(content, action)) {
          await this.executeAction(content, action);
          content.actionsTriggered = content.actionsTriggered || [];
          content.actionsTriggered.push(action.id);
        }
      }
    }
    
    // Emit event for external handlers
    this.emit('content:detected', content);
  }
  
  /**
   * Check if an action should be triggered
   */
  protected shouldTriggerAction(content: SniffedContent, action: AutomationAction): boolean {
    return this.evaluateTriggerCondition(content, action.trigger);
  }
  
  /**
   * Evaluate a trigger condition
   */
  protected evaluateTriggerCondition(content: SniffedContent, condition: TriggerCondition): boolean {
    let result = false;
    
    switch (condition.type) {
      case 'keyword':
        result = condition.operator === 'contains' 
          ? content.content.toLowerCase().includes(condition.value.toLowerCase())
          : content.content.toLowerCase() === condition.value.toLowerCase();
        break;
        
      case 'pattern':
        const pattern = new RegExp(condition.value, 'gi');
        result = pattern.test(content.content);
        break;
        
      case 'user':
        result = content.senderId === condition.value || content.senderHandle === condition.value;
        break;
        
      case 'contract':
        // Solana address pattern
        const solPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
        result = solPattern.test(content.content);
        break;
        
      default:
        result = false;
    }
    
    // Handle additional conditions
    if (condition.additionalConditions && condition.additionalConditions.length > 0) {
      const additionalResults = condition.additionalConditions.map(c => 
        this.evaluateTriggerCondition(content, c)
      );
      
      if (condition.combineWith === 'AND') {
        result = result && additionalResults.every(r => r === true);
      } else if (condition.combineWith === 'OR') {
        result = result || additionalResults.some(r => r === true);
      }
    }
    
    return result;
  }
  
  /**
   * Execute an automation action
   */
  protected async executeAction(content: SniffedContent, action: AutomationAction): Promise<void> {
    console.log(`🎯 [${this.platform}] Executing action ${action.type} for ${action.id}`);
    
    switch (action.type) {
      case 'webhook':
        await this.sendWebhook(action.config.url, content);
        break;
        
      case 'forward':
        await this.forwardContent(content, action.config);
        break;
        
      case 'alert':
        this.emit('alert', { content, action });
        break;
        
      case 'analyze':
        await this.analyzeContent(content, action.config);
        break;
        
      case 'execute':
        // Execute custom function
        if (action.config.function) {
          await action.config.function(content);
        }
        break;
    }
  }
  
  /**
   * Send content to webhook
   */
  protected async sendWebhook(url: string, content: SniffedContent): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: this.platform,
          timestamp: new Date().toISOString(),
          content: content
        })
      });
      
      if (!response.ok) {
        console.error(`❌ [${this.platform}] Webhook failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ [${this.platform}] Webhook error:`, error);
    }
  }
  
  /**
   * Forward content to another destination
   */
  protected abstract forwardContent(content: SniffedContent, config: any): Promise<void>;
  
  /**
   * Analyze content for insights
   */
  protected abstract analyzeContent(content: SniffedContent, config: any): Promise<void>;
  
  /**
   * Get platform statistics
   */
  getStatistics() {
    return {
      platform: this.platform,
      isConnected: this.isConnected,
      totalChats: this.monitoredChats.size,
      activeMonitors: this.activeMonitors.size,
      chatsMonitored: Array.from(this.monitoredChats.values()).filter(c => 
        c.monitoringConfig?.isActive
      ).length
    };
  }
}

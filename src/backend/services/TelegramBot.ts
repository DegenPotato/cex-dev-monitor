import fetch from 'cross-fetch';

/**
 * Telegram Bot Service
 * Sends notifications to Telegram channels/groups
 */
export class TelegramBot {
  private botToken: string;
  private chatId: string | null = null;
  private isEnabled: boolean = false;

  constructor(botToken?: string, chatId?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = chatId || process.env.TELEGRAM_CHAT_ID || null;
    
    if (this.botToken && this.chatId) {
      this.isEnabled = true;
      console.log('✅ [Telegram] Bot initialized');
    } else {
      console.log('⚠️  [Telegram] Bot token or chat ID not configured');
    }
  }

  /**
   * Set chat ID for sending messages
   */
  setChatId(chatId: string) {
    this.chatId = chatId;
    if (this.botToken && chatId) {
      this.isEnabled = true;
      console.log('✅ [Telegram] Chat ID configured');
    }
  }

  /**
   * Enable/disable bot
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled && !!this.botToken && !!this.chatId;
    console.log(`${enabled ? '✅' : '⏸️'} [Telegram] Bot ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Send a plain text message
   */
  async sendMessage(text: string, options?: {
    disable_web_page_preview?: boolean;
    parse_mode?: 'Markdown' | 'HTML';
  }): Promise<boolean> {
    if (!this.isEnabled || !this.chatId) {
      console.log('⚠️  [Telegram] Bot not enabled or chat ID not set');
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          disable_web_page_preview: options?.disable_web_page_preview ?? true,
          parse_mode: options?.parse_mode ?? 'HTML'
        })
      });

      const data = await response.json();
      
      if (!data.ok) {
        console.error('❌ [Telegram] Error sending message:', data.description);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ [Telegram] Error sending message:', error);
      return false;
    }
  }

  /**
   * Send a formatted token mint alert
   */
  async sendTokenMintAlert(tokenData: {
    name: string;
    symbol: string;
    mintAddress: string;
    creator: string;
    signature: string;
    timestamp: number;
    startingMcap?: number;
  }): Promise<boolean> {
    const message = `
🚀 <b>NEW TOKEN DEPLOYED</b>

<b>${tokenData.name}</b> (${tokenData.symbol})

👤 <b>Creator:</b> <code>${tokenData.creator.slice(0, 8)}...${tokenData.creator.slice(-6)}</code>
💎 <b>Mint:</b> <code>${tokenData.mintAddress}</code>
${tokenData.startingMcap ? `💰 <b>Starting MCap:</b> $${tokenData.startingMcap.toLocaleString()}` : ''}
⏰ <b>Time:</b> ${new Date(tokenData.timestamp).toLocaleString()}

🔗 <a href="https://pump.fun/${tokenData.mintAddress}">Pump.fun</a> | <a href="https://solscan.io/token/${tokenData.mintAddress}">Solscan</a> | <a href="https://solscan.io/tx/${tokenData.signature}">TX</a>
    `.trim();

    return await this.sendMessage(message);
  }

  /**
   * Send a dev wallet alert
   */
  async sendDevWalletAlert(walletData: {
    address: string;
    tokensDeployed: number;
    source: string;
  }): Promise<boolean> {
    const message = `
🔥 <b>NEW DEV WALLET DETECTED</b>

👤 <b>Wallet:</b> <code>${walletData.address}</code>
🎯 <b>Tokens Deployed:</b> ${walletData.tokensDeployed}
📍 <b>Source:</b> ${walletData.source}

🔗 <a href="https://solscan.io/account/${walletData.address}">View on Solscan</a>
    `.trim();

    return await this.sendMessage(message);
  }

  /**
   * Test the bot connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.botToken) {
      return { success: false, message: 'Bot token not configured' };
    }

    if (!this.chatId) {
      return { success: false, message: 'Chat ID not configured' };
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/getMe`);
      const data = await response.json();
      
      if (!data.ok) {
        return { success: false, message: data.description || 'Unknown error' };
      }

      // Try sending a test message
      const testSent = await this.sendMessage('✅ Bot connected successfully!');
      
      if (testSent) {
        return { 
          success: true, 
          message: `Connected as @${data.result.username}` 
        };
      } else {
        return { 
          success: false, 
          message: 'Bot connected but failed to send message. Check chat ID.' 
        };
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      configured: !!this.botToken && !!this.chatId,
      botToken: this.botToken ? '***' + this.botToken.slice(-8) : null,
      chatId: this.chatId
    };
  }
}

// Global instance
export const telegramBot = new TelegramBot();

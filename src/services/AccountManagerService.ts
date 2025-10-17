// Account Manager Service - Secure backend for user account connections
import crypto from 'crypto';
import { 
  UserAccount, 
  AccountType, 
  ConnectionStatus, 
  SecuritySettings,
  AccountConnectionResponse,
  BulkAccountsResponse,
  OAUTH_CONFIGS 
} from '../types/AccountManager';

// Encryption key management (in production, use AWS KMS or similar)
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const IV_LENGTH = 16;

export class AccountManagerService {
  private static instance: AccountManagerService;
  
  // In production, these would be in a secure database
  private userAccounts: Map<string, UserAccount[]> = new Map();
  private securitySettings: Map<string, SecuritySettings> = new Map();
  
  // Master encryption key (in production, use key management service)
  private masterKey: Buffer;

  private constructor() {
    // Generate master key (in production, retrieve from secure storage)
    this.masterKey = crypto.randomBytes(32);
    
    // Initialize genesis user
    this.initializeGenesisUser();
  }

  static getInstance(): AccountManagerService {
    if (!AccountManagerService.instance) {
      AccountManagerService.instance = new AccountManagerService();
    }
    return AccountManagerService.instance;
  }

  private initializeGenesisUser(): void {
    const genesisUserId = 'GEN-001';
    
    // Set up genesis user security settings
    this.securitySettings.set(genesisUserId, {
      userId: genesisUserId,
      twoFactorEnabled: true,
      sessionTimeout: 30,
      lastLogin: new Date(),
      loginHistory: [{
        timestamp: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'Genesis Client',
        success: true,
        location: 'System'
      }],
      trustedDevices: ['genesis-device']
    });

    // Initialize empty accounts array for genesis user
    this.userAccounts.set(genesisUserId, []);
  }

  // Encrypt sensitive data using AES-256-GCM
  private async encryptData(data: string, userId: string): Promise<string> {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Derive a key specific to this user
    const key = crypto.pbkdf2Sync(
      this.masterKey, 
      Buffer.concat([salt, Buffer.from(userId)]), 
      PBKDF2_ITERATIONS, 
      32, 
      'sha256'
    );
    
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Combine salt, iv, tag, and encrypted data
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    
    return combined.toString('base64');
  }

  // Decrypt sensitive data (will be needed for retrieving OAuth tokens)
  // Commented out to avoid unused code warning during build
  // Uncomment when implementing token retrieval functionality
  /*
  private async decryptData(encryptedData: string, userId: string): Promise<string> {
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive the same key
    const key = crypto.pbkdf2Sync(
      this.masterKey, 
      Buffer.concat([salt, Buffer.from(userId)]), 
      PBKDF2_ITERATIONS, 
      32, 
      'sha256'
    );
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }
  */

  // Connect a new account
  async connectAccount(
    userId: string, 
    accountType: AccountType, 
    oauthToken: string,
    accountIdentifier: string
  ): Promise<AccountConnectionResponse> {
    try {
      // Verify user exists
      if (!this.securitySettings.has(userId)) {
        return { success: false, error: 'User not found' };
      }

      // Check if account already connected
      const userAccounts = this.userAccounts.get(userId) || [];
      const existingAccount = userAccounts.find(acc => acc.accountType === accountType);
      
      if (existingAccount && existingAccount.connectionStatus === ConnectionStatus.CONNECTED) {
        return { success: false, error: 'Account already connected' };
      }

      // Encrypt the OAuth token
      const encryptedToken = await this.encryptData(oauthToken, userId);

      // Create new account connection
      const newAccount: UserAccount = {
        id: crypto.randomUUID(),
        userId,
        accountType,
        connectionStatus: ConnectionStatus.CONNECTED,
        connectedAt: new Date(),
        lastSynced: new Date(),
        encryptedToken,
        accountIdentifier,
        permissions: OAUTH_CONFIGS[accountType].scopes || [],
        metadata: {
          username: accountIdentifier,
          verified: false
        }
      };

      // Store the account
      if (existingAccount) {
        // Update existing
        const index = userAccounts.indexOf(existingAccount);
        userAccounts[index] = newAccount;
      } else {
        // Add new
        userAccounts.push(newAccount);
      }
      
      this.userAccounts.set(userId, userAccounts);

      // Return sanitized account (without encrypted token)
      const sanitizedAccount = { ...newAccount };
      delete sanitizedAccount.encryptedToken;

      return { success: true, account: sanitizedAccount };
    } catch (error) {
      console.error('Failed to connect account:', error);
      return { success: false, error: 'Failed to connect account' };
    }
  }

  // Disconnect an account
  async disconnectAccount(userId: string, accountType: AccountType): Promise<AccountConnectionResponse> {
    try {
      const userAccounts = this.userAccounts.get(userId) || [];
      const account = userAccounts.find(acc => acc.accountType === accountType);
      
      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      // Update status
      account.connectionStatus = ConnectionStatus.DISCONNECTED;
      account.encryptedToken = undefined;
      
      this.userAccounts.set(userId, userAccounts);

      return { success: true, account };
    } catch (error) {
      console.error('Failed to disconnect account:', error);
      return { success: false, error: 'Failed to disconnect account' };
    }
  }

  // Get all user accounts and security settings
  async getUserAccounts(userId: string): Promise<BulkAccountsResponse | null> {
    const accounts = this.userAccounts.get(userId) || [];
    const security = this.securitySettings.get(userId);
    
    if (!security) {
      return null;
    }

    // Remove encrypted tokens from response
    const sanitizedAccounts = accounts.map(acc => {
      const sanitized = { ...acc };
      delete sanitized.encryptedToken;
      return sanitized;
    });

    return {
      accounts: sanitizedAccounts,
      security
    };
  }

  // Verify 2FA token
  async verify2FA(userId: string, token: string): Promise<boolean> {
    // In production, use a proper TOTP library like speakeasy
    const settings = this.securitySettings.get(userId);
    if (!settings || !settings.twoFactorEnabled) {
      return false;
    }
    
    // Verify TOTP token against user's secret
    // For now, accept any 6-digit code for demonstration
    // In production: const verified = speakeasy.totp.verify({ secret: settings.totpSecret, token });
    const isValidFormat = /^\d{6}$/.test(token);
    
    if (!isValidFormat) {
      return false;
    }
    
    // TODO: Implement actual TOTP verification with speakeasy
    // For demonstration, accept the token
    return true;
  }

  // Update security settings
  async updateSecuritySettings(
    userId: string, 
    updates: Partial<SecuritySettings>
  ): Promise<SecuritySettings | null> {
    const current = this.securitySettings.get(userId);
    if (!current) {
      return null;
    }

    const updated = { ...current, ...updates, userId };
    this.securitySettings.set(userId, updated);
    
    return updated;
  }

  // Revoke all account access
  async revokeAllAccess(userId: string): Promise<boolean> {
    try {
      const accounts = this.userAccounts.get(userId) || [];
      
      // Disconnect all accounts
      for (const account of accounts) {
        account.connectionStatus = ConnectionStatus.DISCONNECTED;
        account.encryptedToken = undefined;
      }
      
      this.userAccounts.set(userId, accounts);
      
      // Reset security settings
      const security = this.securitySettings.get(userId);
      if (security) {
        security.trustedDevices = [];
        security.apiKeyEncrypted = undefined;
        this.securitySettings.set(userId, security);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to revoke all access:', error);
      return false;
    }
  }
}

// Export singleton instance
export const accountManager = AccountManagerService.getInstance();

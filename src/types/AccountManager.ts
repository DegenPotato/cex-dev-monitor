// Account Manager Types - Secure user-specific account connections

export interface UserAccount {
  id: string;
  userId: string; // References the authenticated user
  accountType: AccountType;
  connectionStatus: ConnectionStatus;
  connectedAt?: Date;
  lastSynced?: Date;
  encryptedToken?: string; // Encrypted OAuth token
  accountIdentifier?: string; // Username/handle (non-sensitive)
  permissions: string[]; // Granted permissions/scopes
  metadata?: AccountMetadata;
}

export enum AccountType {
  TELEGRAM = 'telegram',
  X_TWITTER = 'x_twitter',
  DISCORD = 'discord',
  GITHUB = 'github',
  SOLANA_WALLET = 'solana_wallet'
}

export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  PENDING = 'pending',
  ERROR = 'error'
}

export interface AccountMetadata {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  verified?: boolean;
  additionalData?: Record<string, any>;
}

export interface SecuritySettings {
  userId: string;
  twoFactorEnabled: boolean;
  apiKeyEncrypted?: string;
  sessionTimeout: number; // in minutes
  lastLogin: Date;
  loginHistory: LoginRecord[];
  trustedDevices: string[];
}

export interface LoginRecord {
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  location?: string;
}

// OAuth Configuration for each platform
export interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl: string;
}

export const OAUTH_CONFIGS: Record<AccountType, Partial<OAuthConfig>> = {
  [AccountType.TELEGRAM]: {
    authorizationUrl: 'https://telegram.org/auth',
    scopes: ['read', 'send_messages']
  },
  [AccountType.X_TWITTER]: {
    authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
    scopes: ['tweet.read', 'users.read', 'follows.read']
  },
  [AccountType.DISCORD]: {
    authorizationUrl: 'https://discord.com/api/oauth2/authorize',
    scopes: ['identify', 'guilds']
  },
  [AccountType.GITHUB]: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    scopes: ['user', 'repo']
  },
  [AccountType.SOLANA_WALLET]: {
    // Phantom/Solflare wallet connection
    scopes: ['read_balance', 'sign_transaction']
  }
};

// Encryption utilities interface
export interface EncryptionService {
  encrypt(data: string, userId: string): Promise<string>;
  decrypt(encryptedData: string, userId: string): Promise<string>;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
}

// Account Manager API responses
export interface AccountConnectionResponse {
  success: boolean;
  account?: UserAccount;
  error?: string;
}

export interface BulkAccountsResponse {
  accounts: UserAccount[];
  security: SecuritySettings;
}

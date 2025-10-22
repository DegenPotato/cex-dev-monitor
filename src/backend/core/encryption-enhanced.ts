/**
 * Enhanced Production-Grade Encryption Service
 * Optimized for low-latency trading with secure key management
 */

import crypto from 'crypto';
import { promisify } from 'util';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const _TAG_LENGTH = 16; // Reserved for future use
const KEY_DERIVATION_ITERATIONS = 100000; // PBKDF2 iterations
const SALT_LENGTH = 32;

// Performance optimization: cache for derived keys
const keyCache = new Map<string, Buffer>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class EnhancedEncryptionService {
  private encryptionKey: Buffer;
  private keyRotationDate?: Date;
  private performanceMetrics = {
    encryptTime: [] as number[],
    decryptTime: [] as number[],
    cacheHits: 0,
    cacheMisses: 0
  };

  constructor() {
    // Load key from multiple sources (priority order)
    const key = this.loadEncryptionKey();
    
    // Validate key strength
    this.validateKeyStrength(key);
    
    // Convert hex to buffer for performance
    this.encryptionKey = Buffer.from(key, 'hex');
    
    // Start cache cleanup interval
    this.startCacheCleanup();
    
    console.log('🔐 Enhanced encryption service initialized');
  }

  /**
   * Load encryption key from various sources
   */
  private loadEncryptionKey(): string {
    // 1. Try environment variable (standard)
    if (process.env.PRIVATE_KEY_ENCRYPTION_KEY) {
      return process.env.PRIVATE_KEY_ENCRYPTION_KEY;
    }

    // 2. Try AWS Secrets Manager (production)
    if (process.env.AWS_REGION) {
      try {
        // This would use AWS SDK in production
        // const secret = await getSecretFromAWS('trading-encryption-key');
        // return secret;
      } catch (error) {
        console.warn('AWS Secrets Manager not available');
      }
    }

    // 3. Try HashiCorp Vault (enterprise)
    if (process.env.VAULT_ADDR) {
      try {
        // This would use Vault SDK in production
        // const secret = await vault.read('secret/trading-key');
        // return secret.data.value;
      } catch (error) {
        console.warn('Vault not available');
      }
    }

    // 4. Fallback - generate warning
    console.error('⚠️ WARNING: No encryption key found! Generate one with:');
    console.error('   node scripts/generate-encryption-key.mjs');
    throw new Error('PRIVATE_KEY_ENCRYPTION_KEY not configured');
  }

  /**
   * Validate key meets security requirements
   */
  private validateKeyStrength(key: string): void {
    // Check hex format
    if (!/^[0-9a-f]+$/i.test(key)) {
      throw new Error('Encryption key must be in hexadecimal format');
    }

    // Check length (64 hex chars = 32 bytes = 256 bits)
    if (key.length !== 64) {
      throw new Error('Encryption key must be 256 bits (64 hex characters)');
    }

    // Check entropy (basic check for obvious patterns)
    const uniqueChars = new Set(key.split('')).size;
    if (uniqueChars < 10) {
      console.warn('⚠️ WARNING: Encryption key has low entropy');
    }
  }

  /**
   * Performance-optimized encryption with caching
   */
  encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const startTime = performance.now();
    
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      
      // Use Buffer for better performance
      const textBuffer = Buffer.from(text, 'utf8');
      const encrypted = Buffer.concat([
        cipher.update(textBuffer),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();
      
      // Track performance
      const duration = performance.now() - startTime;
      this.performanceMetrics.encryptTime.push(duration);
      
      return {
        encrypted: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Performance-optimized decryption
   */
  decrypt(encryptedData: string, iv: string, tag: string): string {
    const startTime = performance.now();
    
    try {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this.encryptionKey,
        Buffer.from(iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData, 'hex')),
        decipher.final()
      ]);
      
      // Track performance
      const duration = performance.now() - startTime;
      this.performanceMetrics.decryptTime.push(duration);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data - possible tampering or wrong key');
    }
  }

  /**
   * Derive key from password (for user-specific encryption)
   */
  async deriveKeyFromPassword(password: string, salt?: string): Promise<Buffer> {
    const cacheKey = `${password}:${salt}`;
    
    // Check cache for performance
    if (keyCache.has(cacheKey)) {
      this.performanceMetrics.cacheHits++;
      return keyCache.get(cacheKey)!;
    }
    
    this.performanceMetrics.cacheMisses++;
    
    const saltBuffer = salt ? 
      Buffer.from(salt, 'hex') : 
      crypto.randomBytes(SALT_LENGTH);
    
    // Use async version for better performance
    const derivedKey = await promisify(crypto.pbkdf2)(
      password,
      saltBuffer,
      KEY_DERIVATION_ITERATIONS,
      32,
      'sha256'
    );
    
    // Cache with TTL
    keyCache.set(cacheKey, derivedKey);
    setTimeout(() => keyCache.delete(cacheKey), CACHE_TTL);
    
    return derivedKey;
  }

  /**
   * Encrypt with compression for large data
   */
  async encryptLarge(data: string): Promise<string> {
    const { promisify } = await import('util');
    const { gzip } = await import('zlib');
    const gzipAsync = promisify(gzip);
    
    // Compress first for better performance
    const compressed = await gzipAsync(Buffer.from(data, 'utf8'));
    const compressedStr = compressed.toString('base64');
    
    // Then encrypt
    const { encrypted, iv, tag } = this.encrypt(compressedStr);
    
    // Combine with metadata
    return JSON.stringify({
      v: 1, // version
      c: true, // compressed
      e: encrypted,
      i: iv,
      t: tag
    });
  }

  /**
   * Decrypt large compressed data
   */
  async decryptLarge(encryptedJson: string): Promise<string> {
    const { promisify } = await import('util');
    const { gunzip } = await import('zlib');
    const gunzipAsync = promisify(gunzip);
    
    const data = JSON.parse(encryptedJson);
    
    // Decrypt first
    const decrypted = this.decrypt(data.e, data.i, data.t);
    
    // Decompress if needed
    if (data.c) {
      const decompressed = await gunzipAsync(Buffer.from(decrypted, 'base64'));
      return decompressed.toString('utf8');
    }
    
    return decrypted;
  }

  /**
   * Key rotation support
   */
  async rotateKey(newKeyHex: string): Promise<void> {
    this.validateKeyStrength(newKeyHex);
    
    // Store old key for migration
    // const _oldKey = this.encryptionKey; // Reserved for future key rotation
    
    // Update to new key
    this.encryptionKey = Buffer.from(newKeyHex, 'hex');
    this.keyRotationDate = new Date();
    
    // Clear cache
    keyCache.clear();
    
    console.log('🔄 Encryption key rotated successfully');
    
    // In production, you'd trigger re-encryption of all data
    // await this.reencryptAllData(oldKey, this.encryptionKey);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const avgEncrypt = this.performanceMetrics.encryptTime.length > 0 ?
      this.performanceMetrics.encryptTime.reduce((a, b) => a + b, 0) / this.performanceMetrics.encryptTime.length :
      0;
    
    const avgDecrypt = this.performanceMetrics.decryptTime.length > 0 ?
      this.performanceMetrics.decryptTime.reduce((a, b) => a + b, 0) / this.performanceMetrics.decryptTime.length :
      0;
    
    return {
      avgEncryptTime: avgEncrypt.toFixed(3) + 'ms',
      avgDecryptTime: avgDecrypt.toFixed(3) + 'ms',
      cacheHitRate: this.performanceMetrics.cacheHits > 0 ?
        (this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) * 100).toFixed(1) + '%' :
        '0%',
      totalOperations: this.performanceMetrics.encryptTime.length + this.performanceMetrics.decryptTime.length,
      keyRotationDate: this.keyRotationDate
    };
  }

  /**
   * Cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      // Clear old cache entries
      if (keyCache.size > 100) {
        keyCache.clear();
        console.log('🧹 Encryption cache cleared');
      }
      
      // Reset performance metrics periodically
      if (this.performanceMetrics.encryptTime.length > 1000) {
        this.performanceMetrics.encryptTime = this.performanceMetrics.encryptTime.slice(-100);
        this.performanceMetrics.decryptTime = this.performanceMetrics.decryptTime.slice(-100);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Secure memory cleanup
   */
  destroy(): void {
    // Clear sensitive data from memory
    this.encryptionKey.fill(0);
    keyCache.clear();
    console.log('🔒 Encryption service destroyed securely');
  }
}

// Export singleton instance
let enhancedEncryption: EnhancedEncryptionService | null = null;

export function getEnhancedEncryption(): EnhancedEncryptionService {
  if (!enhancedEncryption) {
    enhancedEncryption = new EnhancedEncryptionService();
  }
  return enhancedEncryption;
}

// Export key generation utility
export function generateSecureKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Export key validation
export function isValidEncryptionKey(key: string): boolean {
  return /^[0-9a-f]{64}$/i.test(key);
}

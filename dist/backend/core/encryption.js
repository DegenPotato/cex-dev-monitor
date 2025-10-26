/**
 * Encryption utilities for secure wallet storage
 * Uses AES-256-GCM for encryption with unique IV per wallet
 */
import crypto from 'crypto';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
export class EncryptionService {
    constructor(masterKey) {
        // Use environment variable or provided key
        const key = masterKey || process.env.PRIVATE_KEY_ENCRYPTION_KEY;
        if (!key) {
            throw new Error('PRIVATE_KEY_ENCRYPTION_KEY not set in environment');
        }
        // Derive a proper 256-bit key from the master key
        this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
    }
    /**
     * Encrypt sensitive data with AES-256-GCM
     */
    encrypt(text) {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();
        return {
            encrypted,
            iv: iv.toString('hex'),
            tag: tag.toString('hex')
        };
    }
    /**
     * Decrypt data with AES-256-GCM
     */
    decrypt(encryptedData, iv, tag) {
        const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    /**
     * Hash a password or sensitive string
     */
    hash(text) {
        return crypto.createHash('sha256').update(text).digest('hex');
    }
    /**
     * Generate a random encryption key
     */
    static generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }
    /**
     * Encrypt with combined output (for simpler storage)
     */
    encryptCombined(text) {
        const { encrypted, iv, tag } = this.encrypt(text);
        // Combine iv:tag:encrypted for storage
        return `${iv}:${tag}:${encrypted}`;
    }
    /**
     * Decrypt from combined format
     */
    decryptCombined(combined) {
        const [iv, tag, encrypted] = combined.split(':');
        if (!iv || !tag || !encrypted) {
            throw new Error('Invalid encrypted data format');
        }
        return this.decrypt(encrypted, iv, tag);
    }
    /**
     * Verify data integrity
     */
    verifyIntegrity(data, hash) {
        return this.hash(data) === hash;
    }
}
// Singleton instance
let encryptionService = null;
export function getEncryptionService() {
    if (!encryptionService) {
        encryptionService = new EncryptionService();
    }
    return encryptionService;
}

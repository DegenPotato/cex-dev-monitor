/**
 * Wallet Storage Service with Schema Compatibility
 * Handles both old and new database schemas during migration
 */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { getEncryptionService } from '../core/encryption.js';
export class WalletStorageServiceCompat {
    constructor() {
        this.encryptionService = getEncryptionService();
    }
    /**
     * Check which schema version is in use
     */
    async getSchemaVersion() {
        try {
            // Try to query with new schema columns
            await queryOne('SELECT public_key, is_deleted FROM trading_wallets LIMIT 1');
            return 'new';
        }
        catch (error) {
            // If that fails, we're on old schema
            return 'old';
        }
    }
    /**
     * Get all wallets for user (compatible with both schemas)
     */
    async getUserWallets(userId) {
        const schema = await this.getSchemaVersion();
        console.log(`📊 Using ${schema} schema for getUserWallets`);
        if (schema === 'old') {
            // Old schema: wallet_address, encrypted_private_key
            const wallets = await queryAll(`SELECT id, 
                wallet_address,
                CASE WHEN encrypted_private_key IS NOT NULL AND LENGTH(encrypted_private_key) > 0 THEN 1 ELSE 0 END as has_private_key
         FROM trading_wallets 
         WHERE user_id = ?`, [userId]);
            return wallets.map((w) => ({
                id: w.id.toString(),
                name: `Wallet ${w.id}`,
                publicKey: w.wallet_address,
                balance: 0, // Old schema doesn't have balance
                hasPrivateKey: Boolean(w.has_private_key)
            }));
        }
        else {
            // New schema: public_key, private_key, is_deleted
            const wallets = await queryAll(`SELECT id, wallet_name, public_key, sol_balance,
                CASE WHEN private_key IS NOT NULL AND LENGTH(private_key) > 0 THEN 1 ELSE 0 END as has_private_key
         FROM trading_wallets 
         WHERE user_id = ? AND is_deleted = 0
         ORDER BY created_at DESC`, [userId]);
            return wallets.map((w) => ({
                id: w.id.toString(),
                name: w.wallet_name || `Wallet ${w.id}`,
                publicKey: w.public_key,
                balance: w.sol_balance || 0,
                hasPrivateKey: Boolean(w.has_private_key)
            }));
        }
    }
    /**
     * Get wallet keypair (compatible with both schemas)
     */
    async getWalletKeypair(walletId, userId) {
        const schema = await this.getSchemaVersion();
        console.log(`🔑 Getting keypair using ${schema} schema`);
        let wallet;
        let privateKeyField;
        if (schema === 'old') {
            wallet = await queryOne('SELECT encrypted_private_key, wallet_address FROM trading_wallets WHERE id = ? AND user_id = ?', [walletId, userId]);
            privateKeyField = wallet?.encrypted_private_key;
        }
        else {
            wallet = await queryOne('SELECT private_key, public_key FROM trading_wallets WHERE id = ? AND user_id = ? AND is_deleted = 0', [walletId, userId]);
            privateKeyField = wallet?.private_key;
        }
        if (!wallet || !privateKeyField) {
            throw new Error(`Wallet ${walletId} not found or unauthorized`);
        }
        // Decrypt the private key
        let privateKeyBase58 = privateKeyField;
        // Check if it's encrypted (contains ':' for IV:data format)
        if (privateKeyBase58.includes(':')) {
            if (!process.env.PRIVATE_KEY_ENCRYPTION_KEY) {
                throw new Error('Cannot decrypt wallet - encryption key not configured');
            }
            try {
                privateKeyBase58 = this.encryptionService.decryptCombined(privateKeyField);
                console.log(`  ✅ Private key decrypted`);
            }
            catch (error) {
                console.error(`  ❌ Failed to decrypt private key:`, error);
                throw new Error('Failed to decrypt wallet private key');
            }
        }
        // Convert to Keypair
        try {
            const privateKeyBytes = bs58.decode(privateKeyBase58);
            const keypair = Keypair.fromSecretKey(privateKeyBytes);
            console.log(`  ✅ Keypair loaded for ${keypair.publicKey.toString()}`);
            return keypair;
        }
        catch (error) {
            console.error('Failed to create keypair:', error);
            throw new Error('Invalid private key format');
        }
    }
    /**
     * Create new wallet (new schema only)
     */
    async createWallet(userId, walletName) {
        const schema = await this.getSchemaVersion();
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toString();
        const privateKeyBytes = keypair.secretKey;
        const privateKeyBase58 = bs58.encode(privateKeyBytes);
        // Encrypt the private key for storage
        let encryptedPrivateKey = privateKeyBase58;
        if (process.env.PRIVATE_KEY_ENCRYPTION_KEY) {
            try {
                encryptedPrivateKey = this.encryptionService.encryptCombined(privateKeyBase58);
            }
            catch (error) {
                console.log(`  ⚠️ Encryption failed, storing unencrypted`);
            }
        }
        if (schema === 'old') {
            // Insert with old schema column names
            await execute(`INSERT INTO trading_wallets (user_id, wallet_address, encrypted_private_key)
         VALUES (?, ?, ?)`, [userId, publicKey, encryptedPrivateKey]);
        }
        else {
            // Insert with new schema column names
            await execute(`INSERT INTO trading_wallets (user_id, wallet_name, public_key, private_key, sol_balance, is_deleted)
         VALUES (?, ?, ?, ?, 0, 0)`, [userId, walletName || `Wallet ${Date.now()}`, publicKey, encryptedPrivateKey]);
        }
        // Get the inserted wallet ID
        const insertedWallet = await queryOne(schema === 'old'
            ? 'SELECT id FROM trading_wallets WHERE user_id = ? AND wallet_address = ? ORDER BY id DESC LIMIT 1'
            : 'SELECT id FROM trading_wallets WHERE user_id = ? AND public_key = ? ORDER BY id DESC LIMIT 1', [userId, publicKey]);
        const walletId = insertedWallet?.id || 0;
        return {
            id: walletId,
            publicKey,
            privateKey: privateKeyBase58 // Return unencrypted for user to save
        };
    }
    /**
     * Import existing wallet (compatible with both schemas)
     */
    async importWallet(userId, privateKey, walletName) {
        // Validate and parse the private key
        let keypair;
        try {
            // Try Base58 format first (most common)
            const privateKeyBytes = bs58.decode(privateKey);
            keypair = Keypair.fromSecretKey(privateKeyBytes);
        }
        catch (e) {
            // Try as hex
            try {
                const privateKeyBytes = Buffer.from(privateKey, 'hex');
                keypair = Keypair.fromSecretKey(privateKeyBytes);
            }
            catch (e2) {
                throw new Error('Invalid private key format. Please provide a valid Base58 or hex private key.');
            }
        }
        const publicKey = keypair.publicKey.toString();
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        // Encrypt for storage
        let encryptedPrivateKey = privateKeyBase58;
        if (process.env.PRIVATE_KEY_ENCRYPTION_KEY) {
            try {
                encryptedPrivateKey = this.encryptionService.encryptCombined(privateKeyBase58);
            }
            catch (error) {
                console.log(`  ⚠️ Encryption failed, storing unencrypted`);
            }
        }
        const schema = await this.getSchemaVersion();
        if (schema === 'old') {
            await execute(`INSERT OR REPLACE INTO trading_wallets (user_id, wallet_address, encrypted_private_key)
         VALUES (?, ?, ?)`, [userId, publicKey, encryptedPrivateKey]);
        }
        else {
            await execute(`INSERT OR REPLACE INTO trading_wallets (user_id, wallet_name, public_key, private_key, sol_balance, is_deleted)
         VALUES (?, ?, ?, ?, 0, 0)`, [userId, walletName || `Imported ${Date.now()}`, publicKey, encryptedPrivateKey]);
        }
        // Get the wallet ID
        const wallet = await queryOne(schema === 'old'
            ? 'SELECT id FROM trading_wallets WHERE user_id = ? AND wallet_address = ?'
            : 'SELECT id FROM trading_wallets WHERE user_id = ? AND public_key = ?', [userId, publicKey]);
        return {
            id: wallet?.id || 0,
            publicKey
        };
    }
    /**
     * Delete wallet (soft delete for new schema, hard delete for old)
     */
    async deleteWallet(walletId, userId) {
        const schema = await this.getSchemaVersion();
        if (schema === 'old') {
            // Hard delete for old schema
            await execute('DELETE FROM trading_wallets WHERE id = ? AND user_id = ?', [walletId, userId]);
        }
        else {
            // Soft delete for new schema
            await execute('UPDATE trading_wallets SET is_deleted = 1 WHERE id = ? AND user_id = ?', [walletId, userId]);
        }
    }
    /**
     * Update wallet balance (new schema only)
     */
    async updateWalletBalance(walletId, balance) {
        const schema = await this.getSchemaVersion();
        if (schema === 'new') {
            await execute('UPDATE trading_wallets SET sol_balance = ?, updated_at = strftime("%s", "now") WHERE id = ?', [balance, walletId]);
        }
        // No-op for old schema (doesn't have balance column)
    }
    /**
     * Export wallet private key
     */
    async exportWallet(walletId, userId) {
        const schema = await this.getSchemaVersion();
        let wallet;
        if (schema === 'old') {
            wallet = await queryOne('SELECT wallet_address, encrypted_private_key FROM trading_wallets WHERE id = ? AND user_id = ?', [walletId, userId]);
        }
        else {
            wallet = await queryOne('SELECT public_key, private_key FROM trading_wallets WHERE id = ? AND user_id = ? AND is_deleted = 0', [walletId, userId]);
        }
        if (!wallet) {
            throw new Error('Wallet not found or unauthorized');
        }
        const publicKey = wallet.wallet_address || wallet.public_key;
        let privateKeyField = wallet.encrypted_private_key || wallet.private_key;
        // Decrypt if needed
        if (privateKeyField.includes(':')) {
            try {
                privateKeyField = this.encryptionService.decryptCombined(privateKeyField);
            }
            catch (error) {
                throw new Error('Failed to decrypt wallet');
            }
        }
        return {
            publicKey,
            privateKey: privateKeyField
        };
    }
}
// Export singleton instance with lazy initialization
let instance = null;
function getInstance() {
    if (!instance) {
        instance = new WalletStorageServiceCompat();
    }
    return instance;
}
export const walletStorageServiceCompat = {
    // Proxy all method calls to the lazily initialized instance
    getSchemaVersion: () => getInstance().getSchemaVersion(),
    getUserWallets: (userId) => getInstance().getUserWallets(userId),
    getWalletKeypair: (walletId, userId) => getInstance().getWalletKeypair(walletId, userId),
    createWallet: (userId, walletName) => getInstance().createWallet(userId, walletName),
    importWallet: (userId, privateKey, walletName) => getInstance().importWallet(userId, privateKey, walletName),
    deleteWallet: (walletId, userId) => getInstance().deleteWallet(walletId, userId),
    updateWalletBalance: (walletId, balance) => getInstance().updateWalletBalance(walletId, balance),
    exportWallet: (walletId, userId) => getInstance().exportWallet(walletId, userId)
};

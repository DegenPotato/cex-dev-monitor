/**
 * Wallet Storage Service
 * Handles secure storage and retrieval of wallet keys
 */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { getEncryptionService } from '../core/encryption.js';
export class WalletStorageService {
    constructor() {
        this.encryptionService = getEncryptionService();
    }
    /**
     * Create a new wallet and store it securely
     */
    async createWallet(userId, walletName) {
        console.log(`📝 Creating new wallet for user ${userId}...`);
        // Generate new keypair
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toString();
        const privateKeyBytes = keypair.secretKey;
        const privateKeyBase58 = bs58.encode(privateKeyBytes);
        console.log(`  Generated wallet: ${publicKey}`);
        // Encrypt the private key for storage
        let encryptedPrivateKey = privateKeyBase58;
        // Check if encryption is available
        if (process.env.PRIVATE_KEY_ENCRYPTION_KEY) {
            try {
                encryptedPrivateKey = this.encryptionService.encryptCombined(privateKeyBase58);
                console.log(`  ✅ Private key encrypted for storage`);
            }
            catch (error) {
                console.log(`  ⚠️ Encryption failed, storing unencrypted (development mode)`);
            }
        }
        else {
            console.log(`  ⚠️ No encryption key set, storing unencrypted (UNSAFE for production)`);
        }
        // Store in database
        await execute(`INSERT INTO trading_wallets (user_id, wallet_name, public_key, private_key, sol_balance, is_deleted)
       VALUES (?, ?, ?, ?, 0, 0)`, [userId, walletName || `Wallet ${Date.now()}`, publicKey, encryptedPrivateKey]);
        // Get the inserted wallet ID
        const insertedWallet = await queryOne('SELECT id FROM trading_wallets WHERE user_id = ? AND public_key = ? ORDER BY id DESC LIMIT 1', [userId, publicKey]);
        const walletId = insertedWallet?.id || 0;
        console.log(`  ✅ Wallet stored with ID: ${walletId}`);
        return {
            id: walletId,
            publicKey,
            privateKey: privateKeyBase58 // Return unencrypted for user to save
        };
    }
    /**
     * Import an existing wallet from private key
     */
    async importWallet(userId, privateKey, walletName) {
        console.log(`📝 Importing wallet for user ${userId}...`);
        // Validate and parse the private key
        let keypair;
        try {
            // Try Base58 format first (most common)
            const privateKeyBytes = bs58.decode(privateKey);
            keypair = Keypair.fromSecretKey(privateKeyBytes);
        }
        catch (e) {
            // Try as raw byte array or hex
            try {
                const privateKeyBytes = Buffer.from(privateKey, 'hex');
                keypair = Keypair.fromSecretKey(privateKeyBytes);
            }
            catch (e2) {
                throw new Error('Invalid private key format. Please provide Base58 or hex encoded private key.');
            }
        }
        const publicKey = keypair.publicKey.toString();
        console.log(`  Imported wallet: ${publicKey}`);
        // Check if wallet already exists for this user
        const existing = await queryOne('SELECT id FROM trading_wallets WHERE user_id = ? AND public_key = ? AND is_deleted = 0', [userId, publicKey]);
        if (existing) {
            console.log(`  ℹ️ Wallet already exists with ID: ${existing.id}`);
            return { id: existing.id, publicKey };
        }
        // Encrypt the private key for storage
        let encryptedPrivateKey = privateKey;
        if (process.env.PRIVATE_KEY_ENCRYPTION_KEY) {
            try {
                // Ensure it's in Base58 format for encryption
                const base58Key = bs58.encode(keypair.secretKey);
                encryptedPrivateKey = this.encryptionService.encryptCombined(base58Key);
                console.log(`  ✅ Private key encrypted for storage`);
            }
            catch (error) {
                console.log(`  ⚠️ Encryption failed, storing as-is`);
            }
        }
        // Store in database
        await execute(`INSERT INTO trading_wallets (user_id, wallet_name, public_key, private_key, sol_balance, is_deleted)
       VALUES (?, ?, ?, ?, 0, 0)`, [userId, walletName || `Imported ${publicKey.slice(0, 6)}`, publicKey, encryptedPrivateKey]);
        // Get the inserted wallet ID
        const insertedWallet = await queryOne('SELECT id FROM trading_wallets WHERE user_id = ? AND public_key = ? ORDER BY id DESC LIMIT 1', [userId, publicKey]);
        const walletId = insertedWallet?.id || 0;
        console.log(`  ✅ Wallet stored with ID: ${walletId}`);
        return {
            id: walletId,
            publicKey
        };
    }
    /**
     * Get wallet keypair for signing transactions
     */
    async getWalletKeypair(walletId, userId) {
        console.log(`🔑 Retrieving wallet keypair ${walletId} for user ${userId}...`);
        const wallet = await queryOne('SELECT * FROM trading_wallets WHERE id = ? AND user_id = ? AND is_deleted = 0', [walletId, userId]);
        if (!wallet) {
            throw new Error(`Wallet ${walletId} not found or unauthorized`);
        }
        // Decrypt the private key
        let privateKeyBase58 = wallet.private_key;
        // Check if it's encrypted (contains ':' for IV:data format)
        if (privateKeyBase58.includes(':')) {
            if (!process.env.PRIVATE_KEY_ENCRYPTION_KEY) {
                throw new Error('Cannot decrypt wallet - encryption key not configured');
            }
            try {
                privateKeyBase58 = this.encryptionService.decryptCombined(wallet.private_key);
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
            console.error(`  ❌ Failed to parse private key:`, error);
            throw new Error('Invalid private key format in storage');
        }
    }
    /**
     * Get all wallets for a user (without private keys)
     */
    async getUserWallets(userId) {
        const wallets = await queryAll(`SELECT id, wallet_name, public_key, sol_balance,
              CASE WHEN private_key IS NOT NULL AND LENGTH(private_key) > 0 THEN 1 ELSE 0 END as has_private_key
       FROM trading_wallets 
       WHERE user_id = ? AND is_deleted = 0
       ORDER BY created_at DESC`, [userId]);
        return wallets.map((w) => ({
            id: w.id.toString(),
            name: w.wallet_name,
            publicKey: w.public_key,
            balance: w.sol_balance || 0,
            hasPrivateKey: Boolean(w.has_private_key)
        }));
    }
    /**
     * Update wallet balance
     */
    async updateWalletBalance(walletId, balance) {
        await execute('UPDATE trading_wallets SET sol_balance = ?, updated_at = strftime("%s", "now") WHERE id = ?', [balance, walletId]);
    }
    /**
     * Soft delete a wallet
     */
    async deleteWallet(walletId, userId) {
        await execute('UPDATE trading_wallets SET is_deleted = 1, updated_at = strftime("%s", "now") WHERE id = ? AND user_id = ?', [walletId, userId]);
    }
    /**
     * Export wallet private key (for user backup)
     */
    async exportWallet(walletId, userId) {
        console.log(`🔓 Exporting wallet ${walletId} for user ${userId}...`);
        // Get the keypair (validates ownership)
        const keypair = await this.getWalletKeypair(walletId, userId);
        // Convert to Base58 for export
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        const publicKey = keypair.publicKey.toString();
        console.log(`  ✅ Wallet exported: ${publicKey}`);
        return {
            publicKey,
            privateKey: privateKeyBase58
        };
    }
    /**
     * Check if wallet exists and has valid keys
     */
    async verifyWallet(walletId, userId) {
        try {
            const keypair = await this.getWalletKeypair(walletId, userId);
            return keypair !== null;
        }
        catch (error) {
            console.error(`Wallet ${walletId} verification failed:`, error);
            return false;
        }
    }
}
export const walletStorageService = new WalletStorageService();

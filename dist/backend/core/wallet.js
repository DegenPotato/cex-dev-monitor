/**
 * Secure Wallet Management for Trading
 * Handles wallet creation, import/export, and secure storage
 */
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { queryAll, queryOne, execute } from '../database/helpers.js';
import { getEncryptionService } from './encryption.js';
export class WalletManager {
    constructor(rpcUrl) {
        this.encryption = getEncryptionService();
        this.walletCache = new Map();
        const url = rpcUrl || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
        this.connection = new Connection(url, 'confirmed');
    }
    /**
     * Create a new wallet for a user
     */
    async createWallet(userId, walletName) {
        // Generate new keypair
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toString();
        const privateKey = bs58.encode(keypair.secretKey);
        // Encrypt private key
        const { encrypted, iv, tag } = this.encryption.encrypt(privateKey);
        const encryptedKey = `${encrypted}:${tag}`; // Store with tag for authentication
        // Check if this is the first wallet
        const existingWallets = await queryAll('SELECT COUNT(*) as count FROM trading_wallets WHERE user_id = ?', [userId]);
        const isFirst = existingWallets[0].count === 0;
        // Store in database
        const result = await execute(`
      INSERT INTO trading_wallets (
        user_id, wallet_address, encrypted_private_key, encryption_iv,
        wallet_name, is_default, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `, [
            userId,
            publicKey,
            encryptedKey,
            iv,
            walletName || `Wallet ${existingWallets[0].count + 1}`,
            isFirst ? 1 : 0,
            Date.now()
        ]);
        // Cache the keypair for immediate use
        this.walletCache.set(publicKey, keypair);
        return {
            id: result?.lastID,
            userId,
            walletAddress: publicKey,
            walletName: walletName || `Wallet ${existingWallets[0].count + 1}`,
            isDefault: isFirst,
            isActive: true,
            solBalance: 0,
            createdAt: Date.now()
        };
    }
    /**
     * Import an existing wallet
     */
    async importWallet(userId, privateKeyString, walletName) {
        try {
            // Validate and create keypair
            let keypair;
            // Handle different private key formats
            if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
                // Array format
                const secretKey = Uint8Array.from(JSON.parse(privateKeyString));
                keypair = Keypair.fromSecretKey(secretKey);
            }
            else {
                // Base58 format
                const secretKey = bs58.decode(privateKeyString);
                keypair = Keypair.fromSecretKey(secretKey);
            }
            const publicKey = keypair.publicKey.toString();
            // Check if wallet already exists for this user
            const existing = await queryOne('SELECT id FROM trading_wallets WHERE user_id = ? AND wallet_address = ?', [userId, publicKey]);
            if (existing) {
                throw new Error('Wallet already imported for this user');
            }
            // Encrypt private key
            const privateKey = bs58.encode(keypair.secretKey);
            const { encrypted, iv, tag } = this.encryption.encrypt(privateKey);
            const encryptedKey = `${encrypted}:${tag}`;
            // Get wallet count for naming
            const walletCount = await queryOne('SELECT COUNT(*) as count FROM trading_wallets WHERE user_id = ? AND is_active = 1', [userId]);
            // Check user's wallet limit
            if (walletCount?.count >= 10) {
                throw new Error('User has reached wallet limit');
            }
            // Store in database
            const result = await execute(`
        INSERT INTO trading_wallets (
          user_id, wallet_address, encrypted_private_key, encryption_iv,
          wallet_name, is_default, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, 0, 1, ?)
      `, [
                userId,
                publicKey,
                encryptedKey,
                iv,
                walletName || `Imported Wallet ${walletCount?.count + 1}`,
                Date.now()
            ]);
            // Get initial balance
            const balance = await this.getBalance(publicKey);
            // Cache the keypair
            this.walletCache.set(publicKey, keypair);
            return {
                id: result.lastID,
                userId,
                walletAddress: publicKey,
                walletName: walletName || `Imported Wallet ${walletCount?.count + 1}`,
                isDefault: false,
                isActive: true,
                solBalance: balance,
                createdAt: Date.now()
            };
        }
        catch (error) {
            throw new Error(`Failed to import wallet: ${error.message || error}`);
        }
    }
    /**
     * Export a wallet (returns encrypted private key - user must decrypt)
     */
    async exportWallet(userId, walletAddress) {
        // Verify ownership
        const wallet = await queryOne('SELECT encrypted_private_key, encryption_iv FROM trading_wallets WHERE user_id = ? AND wallet_address = ?', [userId, walletAddress]);
        if (!wallet) {
            throw new Error('Wallet not found or access denied');
        }
        // Decrypt private key
        const [encrypted, tag] = wallet.encrypted_private_key.split(':');
        const privateKey = this.encryption.decrypt(encrypted, wallet.encryption_iv, tag);
        // Return base58 encoded for easy import elsewhere
        return privateKey;
    }
    /**
     * Get decrypted keypair for signing (keep in memory only)
     */
    async getKeypair(userId, walletAddress) {
        // Check cache first
        if (this.walletCache.has(walletAddress)) {
            return this.walletCache.get(walletAddress);
        }
        // Get from database
        const wallet = await queryOne('SELECT encrypted_private_key, encryption_iv FROM trading_wallets WHERE user_id = ? AND wallet_address = ? AND is_active = 1', [userId, walletAddress]);
        if (!wallet) {
            throw new Error('Wallet not found or inactive');
        }
        // Decrypt
        const [encrypted, tag] = wallet.encrypted_private_key.split(':');
        const privateKey = this.encryption.decrypt(encrypted, wallet.encryption_iv, tag);
        // Create keypair
        const secretKey = bs58.decode(privateKey);
        const keypair = Keypair.fromSecretKey(secretKey);
        // Cache for future use (with TTL)
        this.walletCache.set(walletAddress, keypair);
        // Clear from cache after 5 minutes
        setTimeout(() => {
            this.walletCache.delete(walletAddress);
        }, 5 * 60 * 1000);
        return keypair;
    }
    /**
     * Get all wallets for a user
     */
    async getUserWallets(userId) {
        const wallets = await queryAll(`
      SELECT id, user_id, wallet_address, wallet_name, is_default, is_active,
             sol_balance, last_used_at, created_at
      FROM trading_wallets
      WHERE user_id = ? AND is_active = 1
      ORDER BY is_default DESC, created_at DESC
    `, [userId]);
        return wallets.map((w) => ({
            id: w.id,
            userId: w.user_id,
            walletAddress: w.wallet_address,
            walletName: w.wallet_name,
            isDefault: w.is_default === 1,
            isActive: w.is_active === 1,
            solBalance: w.sol_balance || 0,
            lastUsedAt: w.last_used_at,
            createdAt: w.created_at
        }));
    }
    /**
     * Get default wallet for a user
     */
    async getDefaultWallet(userId) {
        const wallet = await queryOne(`
      SELECT id, user_id, wallet_address, wallet_name, is_default, is_active,
             sol_balance, last_used_at, created_at
      FROM trading_wallets
      WHERE user_id = ? AND is_default = 1 AND is_active = 1
    `, [userId]);
        if (!wallet)
            return null;
        return {
            id: wallet.id,
            userId: wallet.user_id,
            walletAddress: wallet.wallet_address,
            walletName: wallet.wallet_name,
            isDefault: true,
            isActive: true,
            solBalance: wallet.sol_balance || 0,
            lastUsedAt: wallet.last_used_at,
            createdAt: wallet.created_at
        };
    }
    /**
     * Set a wallet as default
     */
    async setDefaultWallet(userId, walletId) {
        // Remove default from other wallets
        await execute('UPDATE trading_wallets SET is_default = 0 WHERE user_id = ?', [userId]);
        // Set new default
        await execute('UPDATE trading_wallets SET is_default = 1 WHERE id = ? AND user_id = ?', [walletId, userId]);
    }
    /**
     * Get SOL balance
     */
    async getBalance(walletAddress) {
        try {
            const publicKey = new PublicKey(walletAddress);
            const balance = await this.connection.getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        }
        catch (error) {
            console.error('Error getting balance:', error);
            return 0;
        }
    }
    /**
     * Update cached balance
     */
    async updateBalance(walletId) {
        const wallet = await queryOne('SELECT wallet_address FROM trading_wallets WHERE id = ?', [walletId]);
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        const balance = await this.getBalance(wallet.wallet_address);
        await execute('UPDATE trading_wallets SET sol_balance = ?, last_balance_check = ? WHERE id = ?', [balance, Date.now(), walletId]);
        return balance;
    }
    /**
     * Delete a wallet (soft delete - just mark as inactive)
     */
    async deleteWallet(userId, walletId) {
        // Check ownership
        const wallet = await queryOne('SELECT id, is_default FROM trading_wallets WHERE id = ? AND user_id = ?', [walletId, userId]);
        if (!wallet) {
            throw new Error('Wallet not found or access denied');
        }
        if (wallet.is_default) {
            throw new Error('Cannot delete default wallet. Set another wallet as default first.');
        }
        // Soft delete
        await execute('UPDATE trading_wallets SET is_active = 0 WHERE id = ?', [walletId]);
        // Clear from cache
        const walletData = await queryOne('SELECT wallet_address FROM trading_wallets WHERE id = ?', [walletId]);
        if (walletData) {
            this.walletCache.delete(walletData.wallet_address);
        }
    }
    /**
     * Clear wallet cache (security measure)
     */
    clearCache() {
        this.walletCache.clear();
    }
}
// Singleton instance
let walletManager = null;
export function getWalletManager() {
    if (!walletManager) {
        walletManager = new WalletManager();
    }
    return walletManager;
}

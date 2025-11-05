/**
 * Extract all required Pumpfun accounts from token creation transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

export interface PumpfunAccounts {
  creatorVaultAuthority: PublicKey;
  creatorVaultPda: PublicKey; // The "ATA" that's actually a PDA
  extractedFromTx: string;
}

/**
 * Extract creator vault accounts from token creation transaction
 * 
 * The creation transaction contains both required accounts:
 * - creatorVaultAuthority: typically at index 8 (600 bytes, owned by Pumpfun)
 * - creatorVaultPda: typically at index 9 (137 bytes, owned by Pumpfun)
 */
export async function extractPumpfunAccounts(
  connection: Connection,
  tokenMint: PublicKey
): Promise<PumpfunAccounts | null> {
  try {
    // Get creation transaction (oldest tx for the mint)
    const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
    if (signatures.length === 0) {
      console.warn(`[PumpfunExtractor] No transactions found for mint: ${tokenMint.toBase58()}`);
      return null;
    }
    
    const createSig = signatures[signatures.length - 1];
    console.log(`[PumpfunExtractor] Analyzing creation tx: ${createSig.signature}`);
    
    const tx = await connection.getTransaction(createSig.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      console.warn(`[PumpfunExtractor] Could not fetch creation transaction`);
      return null;
    }
    
    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys;
    
    // Include loaded addresses from address lookup tables
    if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
      const allKeys = [...accountKeys];
      if (tx.meta.loadedAddresses.writable) {
        allKeys.push(...tx.meta.loadedAddresses.writable);
      }
      if (tx.meta.loadedAddresses.readonly) {
        allKeys.push(...tx.meta.loadedAddresses.readonly);
      }
      accountKeys = allKeys;
    }
    
    console.log(`[PumpfunExtractor] Found ${accountKeys.length} accounts in creation tx`);
    
    // Find all Pumpfun-owned accounts
    const pumpfunAccounts: Array<{index: number, pubkey: PublicKey, dataLength: number}> = [];
    
    for (let i = 0; i < accountKeys.length; i++) {
      const acc = accountKeys[i];
      const accInfo = await connection.getAccountInfo(acc, 'confirmed');
      
      if (accInfo && accInfo.owner.equals(PUMPFUN_PROGRAM_ID)) {
        pumpfunAccounts.push({
          index: i,
          pubkey: acc,
          dataLength: accInfo.data.length
        });
      }
    }
    
    console.log(`[PumpfunExtractor] Found ${pumpfunAccounts.length} Pumpfun-owned accounts`);
    
    // Identify creator vault accounts by data length:
    // - Vault Authority: 600 bytes
    // - Vault PDA: 137 bytes
    // - Bonding Curve: 150 bytes (ignore this one)
    // - Global: 512 bytes (ignore this one)
    
    const vaultAuth = pumpfunAccounts.find(a => a.dataLength === 600);
    const vaultPda = pumpfunAccounts.find(a => a.dataLength === 137);
    
    if (!vaultAuth || !vaultPda) {
      console.warn(`[PumpfunExtractor] Could not find creator vault accounts`);
      console.log(`[PumpfunExtractor] Pumpfun accounts found:`, pumpfunAccounts.map(a => ({
        index: a.index,
        pubkey: a.pubkey.toBase58(),
        dataLength: a.dataLength
      })));
      return null;
    }
    
    console.log(`✅ [PumpfunExtractor] Extracted creator vault accounts:`);
    console.log(`   Authority (600 bytes): ${vaultAuth.pubkey.toBase58()} (index ${vaultAuth.index})`);
    console.log(`   PDA (137 bytes): ${vaultPda.pubkey.toBase58()} (index ${vaultPda.index})`);
    
    return {
      creatorVaultAuthority: vaultAuth.pubkey,
      creatorVaultPda: vaultPda.pubkey,
      extractedFromTx: createSig.signature
    };
    
  } catch (error) {
    console.error('[PumpfunExtractor] Error extracting accounts:', error);
    return null;
  }
}

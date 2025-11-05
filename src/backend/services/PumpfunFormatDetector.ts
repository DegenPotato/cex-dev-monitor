/**
 * Pumpfun Format Detector - Handles both 14-account and 16-account buy formats
 * 
 * Confirmed discriminators:
 * - 0x0094d0da1f435eb0: Buy WITH 0.05% creator fee (16 accounts)
 * - 0xe6345c8dd8b14540: Buy WITHOUT creator fee (14 accounts)
 */

import { Connection, PublicKey } from '@solana/web3.js';

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Known buy discriminators
const KNOWN_BUY_DISCRIMINATORS = new Set([
  '0094d0da1f435eb0', // 16-account buy (with creator fee)
  'e6345c8dd8b14540', // 14-account buy (no creator fee)
]);

export interface PumpfunBuyFormat {
  accountCount: 14 | 16;
  discriminator: string;
  hasCreatorVault: boolean;
  vaultAuthority?: PublicKey;
  vaultPda?: PublicKey;
  extractedFromTx: string;
  extractedAt: number;
}

// In-memory cache: mint -> format
const formatCache = new Map<string, PumpfunBuyFormat>();

/**
 * Extract Pumpfun buy format from any recent buy transaction
 */
export async function detectPumpfunFormat(
  connection: Connection,
  tokenMint: PublicKey,
  skipCache = false
): Promise<PumpfunBuyFormat | null> {
  const mintStr = tokenMint.toBase58();
  
  // Check cache
  if (!skipCache && formatCache.has(mintStr)) {
    const cached = formatCache.get(mintStr)!;
    console.log(`[FormatDetector] Using cached format for ${mintStr}: ${cached.accountCount} accounts`);
    return cached;
  }
  
  console.log(`[FormatDetector] Detecting buy format for ${mintStr}...`);
  
  try {
    // Get recent transactions
    const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
    if (signatures.length === 0) {
      console.warn(`[FormatDetector] No transactions found`);
      return null;
    }
    
    console.log(`[FormatDetector] Scanning ${Math.min(signatures.length, 20)} transactions...`);
    
    // Try recent transactions first (most likely to have buys)
    for (let i = 0; i < Math.min(signatures.length, 20); i++) {
      const sig = signatures[i].signature;
      
      try {
        const tx = await connection.getTransaction(sig, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        
        if (!tx?.meta?.innerInstructions) continue;
        
        const message = tx.transaction.message;
        let accountKeys = message.staticAccountKeys;
        
        // Include loaded addresses
        if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
          const allKeys = [...accountKeys];
          if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
          if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
          accountKeys = allKeys;
        }
        
        // Find Pumpfun inner instruction
        for (const innerGroup of tx.meta.innerInstructions) {
          for (const innerIx of innerGroup.instructions) {
            const programIdIndex = innerIx.programIdIndex;
            if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
            
            const programId = accountKeys[programIdIndex];
            if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
            
            // Inner instructions use 'accounts' field (array of account indices)
            const accounts = (innerIx as any).accounts || [];
            const data = Buffer.from(innerIx.data, 'base64');
            const discriminator = data.slice(0, 8).toString('hex');
            
            // Check if this is a known buy instruction
            if (!KNOWN_BUY_DISCRIMINATORS.has(discriminator)) {
              continue; // Not a buy, or unknown format
            }
            
            // Detect format based on account count
            if (accounts.length >= 16) {
              // 16-account format: WITH creator vault (accounts 12 & 13)
              const vaultAuthIdx = accounts[12];
              const vaultPdaIdx = accounts[13];
              
              if (vaultAuthIdx >= accountKeys.length || vaultPdaIdx >= accountKeys.length) {
                console.warn(`[FormatDetector] Invalid account indices for 16-account format`);
                continue;
              }
              
              const vaultAuthority = accountKeys[vaultAuthIdx];
              const vaultPda = accountKeys[vaultPdaIdx];
              
              const format: PumpfunBuyFormat = {
                accountCount: 16,
                discriminator,
                hasCreatorVault: true,
                vaultAuthority,
                vaultPda,
                extractedFromTx: sig,
                extractedAt: Date.now()
              };
              
              console.log(`✅ [FormatDetector] Detected 16-account format (WITH creator fee)`);
              console.log(`   Vault Authority: ${vaultAuthority.toBase58()}`);
              console.log(`   Vault PDA: ${vaultPda.toBase58()}`);
              
              formatCache.set(mintStr, format);
              return format;
              
            } else if (accounts.length >= 14) {
              // 14-account format: NO creator vault
              const format: PumpfunBuyFormat = {
                accountCount: 14,
                discriminator,
                hasCreatorVault: false,
                extractedFromTx: sig,
                extractedAt: Date.now()
              };
              
              console.log(`✅ [FormatDetector] Detected 14-account format (NO creator fee)`);
              
              formatCache.set(mintStr, format);
              return format;
              
            } else {
              console.warn(`[FormatDetector] Unknown account count: ${accounts.length}`);
              console.warn(`   Discriminator: ${discriminator}`);
              console.warn(`   Tx: ${sig}`);
              // Log for investigation but continue searching
            }
          }
        }
      } catch (error: any) {
        console.warn(`[FormatDetector] Error analyzing tx ${sig.slice(0, 20)}: ${error.message}`);
        continue;
      }
    }
    
    console.warn(`[FormatDetector] Could not detect buy format from ${signatures.length} transactions`);
    return null;
    
  } catch (error) {
    console.error('[FormatDetector] Error detecting format:', error);
    return null;
  }
}

/**
 * Clear cached format for a mint (use when transaction fails with account mismatch)
 */
export function clearFormatCache(tokenMint: PublicKey): void {
  const mintStr = tokenMint.toBase58();
  if (formatCache.has(mintStr)) {
    console.log(`[FormatDetector] Cleared cached format for ${mintStr}`);
    formatCache.delete(mintStr);
  }
}

/**
 * Get cached format without fetching
 */
export function getCachedFormat(tokenMint: PublicKey): PumpfunBuyFormat | null {
  return formatCache.get(tokenMint.toBase58()) || null;
}

/**
 * Check if a discriminator is a known buy instruction
 */
export function isKnownBuyDiscriminator(discriminator: string): boolean {
  return KNOWN_BUY_DISCRIMINATORS.has(discriminator);
}

/**
 * Log unknown discriminator for investigation
 */
export function logUnknownDiscriminator(discriminator: string, accountCount: number, txSig: string): void {
  console.warn(`⚠️  [FormatDetector] UNKNOWN DISCRIMINATOR DETECTED:`);
  console.warn(`   Discriminator: ${discriminator}`);
  console.warn(`   Account count: ${accountCount}`);
  console.warn(`   Transaction: ${txSig}`);
  console.warn(`   Please investigate if this is a new Pumpfun instruction format!`);
}

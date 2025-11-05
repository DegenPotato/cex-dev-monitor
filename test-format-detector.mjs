/**
 * Test the PumpfunFormatDetector implementation
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const KNOWN_BUY_DISCRIMINATORS = new Set([
  '0094d0da1f435eb0', // 16-account buy (with creator fee)
  'e6345c8dd8b14540', // 14-account buy (no creator fee)
]);

const formatCache = new Map();

async function detectPumpfunFormat(connection, tokenMint, skipCache = false) {
  const mintStr = tokenMint.toBase58();
  
  if (!skipCache && formatCache.has(mintStr)) {
    const cached = formatCache.get(mintStr);
    console.log(`💾 [Cache] Using cached format: ${cached.accountCount} accounts`);
    return cached;
  }
  
  console.log(`🔍 [Detector] Detecting format for ${mintStr.slice(0, 20)}...`);
  
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
  if (signatures.length === 0) {
    console.log('❌ No transactions found');
    return null;
  }
  
  console.log(`📡 Scanning ${Math.min(signatures.length, 20)} transactions...`);
  
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
      
      if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
        const allKeys = [...accountKeys];
        if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
        accountKeys = allKeys;
      }
      
      for (const innerGroup of tx.meta.innerInstructions) {
        for (const innerIx of innerGroup.instructions) {
          const programIdIndex = innerIx.programIdIndex;
          if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
          
          const programId = accountKeys[programIdIndex];
          if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
          
          const accounts = innerIx.accounts || [];
          const data = Buffer.from(innerIx.data, 'base64');
          const discriminator = data.slice(0, 8).toString('hex');
          
          if (!KNOWN_BUY_DISCRIMINATORS.has(discriminator)) {
            continue;
          }
          
          if (accounts.length >= 16) {
            const vaultAuthIdx = accounts[12];
            const vaultPdaIdx = accounts[13];
            
            if (vaultAuthIdx >= accountKeys.length || vaultPdaIdx >= accountKeys.length) {
              console.warn(`   ⚠️  Invalid indices`);
              continue;
            }
            
            const vaultAuthority = accountKeys[vaultAuthIdx];
            const vaultPda = accountKeys[vaultPdaIdx];
            
            const format = {
              accountCount: 16,
              discriminator,
              hasCreatorVault: true,
              vaultAuthority,
              vaultPda,
              extractedFromTx: sig
            };
            
            console.log(`✅ Detected 16-account format (WITH creator fee)`);
            console.log(`   Vault Authority: ${vaultAuthority.toBase58()}`);
            console.log(`   Vault PDA: ${vaultPda.toBase58()}`);
            console.log(`   From tx: ${sig.slice(0, 20)}...`);
            
            formatCache.set(mintStr, format);
            return format;
            
          } else if (accounts.length >= 14) {
            const format = {
              accountCount: 14,
              discriminator,
              hasCreatorVault: false,
              extractedFromTx: sig
            };
            
            console.log(`✅ Detected 14-account format (NO creator fee)`);
            console.log(`   From tx: ${sig.slice(0, 20)}...`);
            
            formatCache.set(mintStr, format);
            return format;
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log('❌ Could not detect format');
  return null;
}

async function testMultipleTokens() {
  console.log('🧪 Testing Format Detector\n');
  console.log(`${'='.repeat(80)}\n`);
  
  const testTokens = [
    'HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump', // Has both formats
    'ApFFNQkoE3GVCWF7je6YWY21UA4aAKMeWEJG7WN1pump', // Another token
  ];
  
  for (const mint of testTokens) {
    console.log(`\nTesting ${mint.slice(0, 20)}...`);
    console.log(`${'─'.repeat(80)}`);
    
    const format = await detectPumpfunFormat(connection, new PublicKey(mint));
    
    if (format) {
      console.log(`\n📋 Result:`);
      console.log(`   Format: ${format.accountCount}-account`);
      console.log(`   Has creator vault: ${format.hasCreatorVault}`);
      console.log(`   Discriminator: ${format.discriminator}`);
    } else {
      console.log(`\n❌ Failed to detect format`);
    }
    
    console.log(`\n${'='.repeat(80)}`);
  }
  
  // Test cache
  console.log(`\n\n🔄 Testing Cache...\n`);
  const mint = new PublicKey(testTokens[0]);
  
  console.log('First call (should fetch):');
  await detectPumpfunFormat(connection, mint, true); // Skip cache
  
  console.log('\nSecond call (should use cache):');
  await detectPumpfunFormat(connection, mint, false); // Use cache
}

testMultipleTokens().catch(console.error);

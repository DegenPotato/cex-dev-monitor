/**
 * Extract coinCreator from Metaplex metadata in creation transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');
const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function main() {
  console.log('🔍 Extracting coinCreator from Metaplex metadata...\n');
  console.log(`Token Mint: ${tokenMint.toBase58()}`);
  
  // 1. Get creation transaction (oldest tx)
  console.log('\n📡 Fetching creation transaction...');
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
  const createSig = signatures[signatures.length - 1];
  console.log(`Create tx: ${createSig.signature}\n`);
  
  const tx = await connection.getTransaction(createSig.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('❌ Transaction not found');
    return;
  }
  
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || message.accountKeys;
  
  // Include loaded addresses
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
    accountKeys = allKeys;
  }
  
  console.log(`Total accounts in tx: ${accountKeys.length}\n`);
  
  // 2. Find Metaplex metadata account
  console.log('🔎 Looking for Metaplex metadata accounts...');
  const candidates = new Set();
  
  for (let i = 0; i < accountKeys.length; i++) {
    const accKey = accountKeys[i];
    
    try {
      const accInfo = await connection.getAccountInfo(accKey, 'confirmed');
      if (!accInfo) continue;
      
      // Check if owned by Metaplex
      if (accInfo.owner.equals(METAPLEX_PROGRAM_ID)) {
        console.log(`\n✅ Found Metaplex account: ${accKey.toBase58()}`);
        console.log(`   Data length: ${accInfo.data.length} bytes`);
        
        // Parse metadata manually (simplified)
        // Metaplex metadata structure:
        // - 1 byte: key (should be 4 for metadata)
        // - 32 bytes: update authority
        // - 32 bytes: mint
        // - Then variable data (name, symbol, uri)
        // - Then creators array
        
        if (accInfo.data.length < 1) continue;
        
        const key = accInfo.data[0];
        console.log(`   Key: ${key}`);
        
        if (key === 4) { // Metadata account
          let offset = 1;
          
          // Update authority (32 bytes)
          const updateAuthority = new PublicKey(accInfo.data.slice(offset, offset + 32));
          offset += 32;
          candidates.add(updateAuthority.toBase58());
          console.log(`   Update Authority: ${updateAuthority.toBase58()}`);
          
          // Mint (32 bytes)
          const mint = new PublicKey(accInfo.data.slice(offset, offset + 32));
          offset += 32;
          console.log(`   Mint: ${mint.toBase58()}`);
          
          // Skip data fields (name, symbol, uri - variable length strings)
          // Each string: 4 bytes length + string bytes
          
          // For now, let's try the update authority as coinCreator
        }
      }
      
      // Also check for mint account (Token Program)
      if (accInfo.owner.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && accInfo.data.length === 82) {
        // Mint account structure:
        // - 4 bytes: mint authority option (0 = none, 1 = some)
        // - 32 bytes: mint authority (if option = 1)
        const mintAuthorityOption = accInfo.data.readUInt32LE(0);
        if (mintAuthorityOption === 1) {
          const mintAuthority = new PublicKey(accInfo.data.slice(4, 36));
          candidates.add(mintAuthority.toBase58());
          console.log(`\n📌 Mint Authority: ${mintAuthority.toBase58()}`);
        }
      }
    } catch (e) {
      // Skip
    }
  }
  
  // 3. Add signers
  for (let i = 0; i < message.header.numRequiredSignatures; i++) {
    candidates.add(accountKeys[i].toBase58());
  }
  
  console.log(`\n\n🧪 Testing ${candidates.size} candidates...`);
  console.log(`${'='.repeat(80)}\n`);
  
  // 4. Try deriving with each candidate
  for (const candidateStr of candidates) {
    const candidate = new PublicKey(candidateStr);
    
    try {
      const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('creator_vault'), candidate.toBuffer()],
        PUMPFUN_PROGRAM_ID
      );
      
      if (vaultAuthority.equals(actualVaultAuthority)) {
        console.log(`\n🎯 MATCH FOUND!`);
        console.log(`${'='.repeat(80)}`);
        console.log(`coinCreator: ${candidateStr}`);
        console.log(`Derived Vault Authority: ${vaultAuthority.toBase58()}`);
        
        const vaultAta = getAssociatedTokenAddressSync(WSOL_MINT, vaultAuthority, true, TOKEN_PROGRAM_ID);
        console.log(`Derived Vault ATA: ${vaultAta.toBase58()}`);
        console.log(`ATA Match: ${vaultAta.equals(actualVaultAta) ? '✅ YES!' : '❌ NO'}`);
        
        console.log(`\n✨ SOLUTION:`);
        console.log(`Extract coinCreator from Metaplex metadata in creation tx`);
        return;
      }
    } catch (e) {
      // Skip
    }
  }
  
  console.log('\n❌ No match found among candidates');
  console.log('Candidates tested:', Array.from(candidates));
}

main().catch(console.error);

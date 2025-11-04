/**
 * Test Creator Fee Fix
 * Verifies the new creator vault accounts are correctly derived
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

const RPC_URL = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

async function testCreatorFeeAccounts(tokenMint) {
  console.log('\n🧪 Testing Creator Fee Account Derivation');
  console.log('==========================================');
  console.log(`Token: ${tokenMint}`);
  
  // 1. Derive bonding curve PDA
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding_curve'), new PublicKey(tokenMint).toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  
  console.log(`\n📊 Bonding Curve: ${bondingCurve.toBase58()}`);
  
  // 2. Fetch bonding curve data
  let accountInfo = await connection.getAccountInfo(bondingCurve, 'confirmed');
  
  if (!accountInfo) {
    console.log('⚠️  Account not found with confirmed, trying finalized...');
    accountInfo = await connection.getAccountInfo(bondingCurve, 'finalized');
  }
  
  if (!accountInfo) {
    console.log('❌ Bonding curve account not found (token may be graduated or closed)');
    console.log('\n💡 Try a recent token from your production logs:');
    console.log('   Look for "🎯 [PumpfunSniper] Found mint via postTokenBalances: ..."');
    return;
  }
  
  console.log(`✅ Account found (${accountInfo.data.length} bytes)`);
  
  // 3. Parse creator from account data
  const data = accountInfo.data;
  let offset = 8; // discriminator
  
  // Skip reserves
  offset += 8; // virtualTokenReserves
  offset += 8; // virtualSolReserves
  offset += 8; // realTokenReserves
  offset += 8; // realSolReserves
  offset += 8; // tokenTotalSupply
  offset += 1; // complete flag
  
  // Read creator (32 bytes)
  const creatorBytes = data.slice(offset, offset + 32);
  const creator = new PublicKey(creatorBytes);
  
  console.log(`\n👤 Creator: ${creator.toBase58()}`);
  
  // 4. Derive creator vault authority
  const creatorVaultSeed = Buffer.from('creator_vault');
  const [coinCreatorVaultAuthority] = PublicKey.findProgramAddressSync(
    [creatorVaultSeed, creator.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  
  console.log(`🔑 Creator Vault Authority: ${coinCreatorVaultAuthority.toBase58()}`);
  
  // 5. Derive creator vault ATA
  const coinCreatorVaultAta = getAssociatedTokenAddressSync(
    WSOL_MINT,
    coinCreatorVaultAuthority,
    true // allowOwnerOffCurve for PDA
  );
  
  console.log(`💰 Creator Vault ATA: ${coinCreatorVaultAta.toBase58()}`);
  
  // 6. Verify ATA exists
  const ataInfo = await connection.getAccountInfo(coinCreatorVaultAta);
  if (ataInfo) {
    console.log(`✅ Creator Vault ATA exists`);
  } else {
    console.log(`⚠️  Creator Vault ATA does not exist yet (will be created on first trade)`);
  }
  
  console.log('\n✅ Creator fee accounts derived successfully!');
  console.log('\nAccount order for transaction:');
  console.log('12: coinCreatorVaultAuthority (read-only)');
  console.log('13: coinCreatorVaultAta (writable)');
}

// Test with a recent token
const testToken = process.argv[2] || 'ApFFNQkoE3GVCWF7je6YWY21UA4aAKMeWEJG7WN1pump';

testCreatorFeeAccounts(testToken)
  .then(() => {
    console.log('\n🎉 Test complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });

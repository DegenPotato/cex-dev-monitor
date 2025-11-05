/**
 * Fetch Pumpfun IDL from on-chain Anchor account
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { inflate } from 'pako';
import { writeFileSync } from 'fs';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function fetchIDL() {
  console.log('🔍 Fetching Pumpfun IDL from chain...\n');

  // Derive the IDL account PDA (standard Anchor layout)
  const [idlAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from('anchor:idl'), PUMPFUN_PROGRAM_ID.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );

  console.log(`IDL Account PDA: ${idlAddress.toBase58()}`);

  const accountInfo = await connection.getAccountInfo(idlAddress);

  if (!accountInfo) {
    console.log('❌ IDL account not found. Program may not be Anchor-based or IDL was removed.');
    console.log('\n💡 Alternative: Check if @pump-fun/pump-sdk includes the IDL in node_modules');
    return null;
  }

  console.log(`✅ IDL account found (${accountInfo.data.length} bytes)\n`);

  // Anchor IDL format:
  // - First 8 bytes: discriminator
  // - Remaining: compressed JSON (zlib)
  const data = accountInfo.data;
  
  // Skip discriminator
  const compressedIdl = data.slice(8);
  
  console.log('Decompressing IDL...');
  
  try {
    // Decompress using pako (zlib)
    const decompressed = inflate(compressedIdl, { to: 'string' });
    const idl = JSON.parse(decompressed);
    
    console.log('✅ IDL decompressed successfully\n');
    
    // Save to file
    writeFileSync('pumpfun-idl.json', JSON.stringify(idl, null, 2));
    console.log('💾 Saved to pumpfun-idl.json');
    
    // Print buy instruction info
    const buyInstruction = idl.instructions?.find(ix => ix.name === 'buy');
    if (buyInstruction) {
      console.log('\n📝 Buy Instruction Accounts:');
      buyInstruction.accounts.forEach((acc, i) => {
        console.log(`  ${i.toString().padStart(2)}. ${acc.name.padEnd(30)} ${acc.isMut ? 'mut' : '   '} ${acc.isSigner ? 'signer' : ''}`);
      });
    }
    
    return idl;
  } catch (error) {
    console.error('❌ Failed to decompress IDL:', error.message);
    console.log('\nRaw data (first 100 bytes):');
    console.log(data.slice(0, 100).toString('hex'));
    return null;
  }
}

fetchIDL().catch(console.error);

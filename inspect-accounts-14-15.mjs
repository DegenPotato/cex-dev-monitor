/**
 * Inspect the two unknown accounts (14 & 15) from the successful transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// From the inner instruction analysis
const account14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
const account15 = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function inspectAccount(pubkey, label) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${label}: ${pubkey.toBase58()}`);
  console.log(`${'='.repeat(80)}`);
  
  const info = await connection.getAccountInfo(pubkey, 'confirmed');
  
  if (!info) {
    console.log('❌ Account not found');
    return null;
  }
  
  console.log(`Owner: ${info.owner.toBase58()}`);
  console.log(`Lamports: ${info.lamports}`);
  console.log(`Data length: ${info.data.length} bytes`);
  console.log(`Executable: ${info.executable}`);
  
  if (info.data.length > 0 && info.data.length <= 200) {
    console.log(`\nRaw data (hex):`);
    console.log(info.data.toString('hex'));
    
    // Try to parse as potential PublicKeys
    if (info.data.length >= 32) {
      console.log(`\nPotential PublicKeys in data:`);
      for (let offset = 0; offset <= info.data.length - 32; offset += 32) {
        const slice = info.data.slice(offset, offset + 32);
        try {
          const pk = new PublicKey(slice);
          console.log(`  Offset ${offset}: ${pk.toBase58()}`);
          
          // Check if this matches our vault authority
          if (pk.equals(actualVaultAuthority)) {
            console.log(`    ⚠️ THIS IS THE VAULT AUTHORITY!`);
          }
          if (pk.equals(actualVaultAta)) {
            console.log(`    ⚠️ THIS IS THE VAULT ATA!`);
          }
        } catch (e) {
          // Not a valid pubkey
        }
      }
    }
  } else if (info.data.length > 200) {
    console.log(`\nFirst 200 bytes (hex):`);
    console.log(info.data.slice(0, 200).toString('hex'));
  }
  
  // Check if this account itself could be derived from Pumpfun program
  console.log(`\n🔍 Checking if this is a PDA...`);
  const seeds = [
    'creator_vault',
    'vault',
    'fee',
    'platform_fee',
    'platform_vault',
    'fee_vault',
    'global_fee',
    'protocol_fee'
  ];
  
  for (const seed of seeds) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from(seed)],
        PUMPFUN_PROGRAM_ID
      );
      if (pda.equals(pubkey)) {
        console.log(`✅ MATCH: PDA with seed '${seed}'`);
        return seed;
      }
    } catch (e) {
      // Skip
    }
  }
  
  return null;
}

async function main() {
  console.log('🔍 Inspecting Unknown Accounts 14 & 15\n');
  
  await inspectAccount(account14, 'Account 14');
  await inspectAccount(account15, 'Account 15');
  
  console.log(`\n\n✨ Summary`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Account 14: ${account14.toBase58()}`);
  console.log(`Account 15: ${account15.toBase58()}`);
  console.log(`\nThese might be:`);
  console.log(`- Platform fee recipients`);
  console.log(`- Global state PDAs`);
  console.log(`- Additional fee vaults`);
}

main().catch(console.error);

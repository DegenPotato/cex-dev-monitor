/**
 * Analyze Inner Pumpfun Instructions from PumpPortal Wrapper
 * Extract the REAL Pumpfun account structure
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Successful snipe signatures
const signatures = [
  '4VmUUrUtaRWE57TNhhfnParCScTYgLzDExr2k45fQuK6DsHWuf6vL9BmyYRZ7U7CYDScsMdNsPeTV34FDyqagxKH'
];

async function analyzeInnerInstructions(signature) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Analyzing Inner Instructions: ${signature}`);
  console.log(`${'='.repeat(80)}\n`);

  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    console.log('❌ Transaction not found');
    return null;
  }

  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || message.accountKeys;
  
  // Include loaded addresses (address lookup tables)
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) {
      allKeys.push(...tx.meta.loadedAddresses.writable);
    }
    if (tx.meta.loadedAddresses.readonly) {
      allKeys.push(...tx.meta.loadedAddresses.readonly);
    }
    accountKeys = allKeys;
    console.log(`\n📋 Total accounts: ${accountKeys.length} (${message.staticAccountKeys.length} static + ${accountKeys.length - message.staticAccountKeys.length} loaded)`);
  } else {
    console.log(`\n📋 Total accounts: ${accountKeys.length}`)
  }

  // Check inner instructions (CPI calls)
  if (!tx.meta?.innerInstructions || tx.meta.innerInstructions.length === 0) {
    console.log('❌ No inner instructions found');
    return null;
  }

  console.log(`✅ Found ${tx.meta.innerInstructions.length} inner instruction group(s)\n`);

  // Find the Pumpfun inner instruction
  for (const innerGroup of tx.meta.innerInstructions) {
    console.log(`📦 Inner Instruction Group ${innerGroup.index}:`);
    console.log(`   Instructions in group: ${innerGroup.instructions?.length || 0}`);
    
    // Debug first instruction structure
    if (innerGroup.instructions && innerGroup.instructions.length > 0) {
      console.log(`   Sample instruction keys: ${Object.keys(innerGroup.instructions[0]).join(', ')}`);
    }
    
    for (const innerIx of innerGroup.instructions) {
      // Handle both parsed and unparsed formats
      const programIdIndex = innerIx.programIdIndex || innerIx.programIndex;
      if (programIdIndex === undefined) {
        console.log('  Skipping instruction with no program index');
        continue;
      }
      
      if (programIdIndex >= accountKeys.length) {
        console.log(`  Invalid program index ${programIdIndex}, max is ${accountKeys.length - 1}`);
        continue;
      }
      
      const programId = accountKeys[programIdIndex];
      if (!programId) {
        console.log(`  No program found at index ${programIdIndex}`);
        continue;
      }
      
      console.log(`\n  Program: ${programId.toBase58()}`);
      
      if (programId.equals(PUMPFUN_PROGRAM_ID)) {
        console.log(`  🎯 FOUND PUMPFUN INSTRUCTION!\n`);
        
        // Get all accounts (handle different field names)
        const accounts = innerIx.accounts || innerIx.accountKeyIndexes || [];
        console.log(`  Accounts (${accounts.length} total):`);
        console.log(`  ${'─'.repeat(78)}`);
        
        const accountLabels = [
          'global',
          'feeRecipient', 
          'mint',
          'bondingCurve',
          'associatedBondingCurve',
          'associatedUser',
          'user',
          'systemProgram',
          'tokenProgram',
          'rent',
          'eventAuthority',
          'program',
          'creatorVaultAuthority', // Account 12 - NEW
          'creatorVaultAta'         // Account 13 - NEW
        ];

        accounts.forEach((accountIndex, i) => {
          const pubkey = accountKeys[accountIndex];
          const label = accountLabels[i] || `unknown_${i}`;
          console.log(`  ${i.toString().padStart(2)}. ${label.padEnd(26)} ${pubkey.toBase58()}`);
        });
        
        // Decode instruction data
        const data = Buffer.from(innerIx.data, 'base64');
        console.log(`\n  Instruction Data:`);
        console.log(`  Hex: ${data.toString('hex')}`);
        console.log(`  Length: ${data.length} bytes`);
        
        const discriminator = data.slice(0, 8).toString('hex');
        console.log(`  Discriminator: ${discriminator}`);
        
        if (data.length >= 24) {
          const amount = data.readBigUInt64LE(8);
          const maxSolCost = data.readBigUInt64LE(16);
          console.log(`  Amount: ${amount.toString()} lamports (${Number(amount) / 1e9} SOL)`);
          console.log(`  Max SOL Cost: ${maxSolCost.toString()} lamports (${Number(maxSolCost) / 1e9} SOL)`);
        }
        
        // Now let's identify the NEW accounts
        console.log(`\n  🔍 Analyzing Creator Fee Accounts (12 & 13):`);
        console.log(`  ${'─'.repeat(78)}`);
        
        const mint = accountKeys[accounts[2]];
        const bondingCurve = accountKeys[accounts[3]];
        const creatorVaultAuth = accountKeys[accounts[12]];
        const creatorVaultAta = accountKeys[accounts[13]];
        
        console.log(`  Token Mint: ${mint.toBase58()}`);
        console.log(`  Bonding Curve: ${bondingCurve.toBase58()}`);
        console.log(`  Creator Vault Authority (12): ${creatorVaultAuth.toBase58()}`);
        console.log(`  Creator Vault ATA (13): ${creatorVaultAta.toBase58()}`);
        
        // Try to derive and verify
        console.log(`\n  🧮 Attempting to Derive Creator Accounts:`);
        console.log(`  ${'─'.repeat(78)}`);
        
        // First, we need to get the bonding curve data to find the creator
        const bondingCurveInfo = await connection.getAccountInfo(bondingCurve);
        if (bondingCurveInfo) {
          const creator = new PublicKey(bondingCurveInfo.data.slice(49, 49 + 32));
          console.log(`  Creator (from bonding curve): ${creator.toBase58()}`);
          
          // Derive creator vault authority
          const [derivedAuth] = PublicKey.findProgramAddressSync(
            [Buffer.from('creator_vault'), creator.toBuffer()],
            PUMPFUN_PROGRAM_ID
          );
          console.log(`  Derived Vault Authority: ${derivedAuth.toBase58()}`);
          console.log(`  Matches actual: ${derivedAuth.equals(creatorVaultAuth) ? '✅ YES' : '❌ NO'}`);
          
          // Derive creator vault ATA (WSOL ATA for vault authority)
          const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
          const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
          const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
          
          const [derivedAta] = PublicKey.findProgramAddressSync(
            [
              derivedAuth.toBuffer(),
              TOKEN_PROGRAM_ID.toBuffer(),
              WSOL_MINT.toBuffer()
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          console.log(`  Derived Vault ATA: ${derivedAta.toBase58()}`);
          console.log(`  Matches actual: ${derivedAta.equals(creatorVaultAta) ? '✅ YES' : '❌ NO'}`);
          
          // Summary
          console.log(`\n  ✨ DERIVATION FORMULA:`);
          console.log(`  ${'─'.repeat(78)}`);
          console.log(`  1. Get creator from bonding curve data (offset 49, 32 bytes)`);
          console.log(`  2. Derive vault authority: PDA(['creator_vault', creator], PUMPFUN_PROGRAM)`);
          console.log(`  3. Derive vault ATA: getAssociatedTokenAddress(WSOL, vaultAuthority, true)`);
        }
        
        return {
          accounts: accounts.map((idx, i) => ({
            index: i,
            pubkey: accountKeys[idx].toBase58(),
            label: accountLabels[i] || `unknown_${i}`
          })),
          data: data.toString('hex')
        };
      }
    }
  }

  console.log('❌ No Pumpfun inner instruction found');
  return null;
}

async function main() {
  console.log('🔍 Analyzing Inner Pumpfun Instructions from PumpPortal Wrapper\n');

  for (const sig of signatures) {
    try {
      await analyzeInnerInstructions(sig);
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`❌ Error analyzing ${sig}:`, error.message);
      console.error(error.stack);
    }
  }
}

main().catch(console.error);

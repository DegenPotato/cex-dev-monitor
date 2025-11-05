/**
 * Brute-force seed combinations to reproduce Pumpfun creator vault PDAs
 */

import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Known values from successful transaction
const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');
const bondingCurve = new PublicKey('3eqn8SxHhJrpHV3ZjztY3XJ6hA4J3VJvXmhQHnLwHE3P');
const creator = new PublicKey('4Y63XUFoFs4g2Aw88UGTG9paDYmHFbZe7qtPqEfGvrQK');
const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

const pumpGlobal = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const pumpFeeRecipient = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
const eventAuthority = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

const strings = [
  'creator_vault',
  'creator-vault',
  'creatorVault',
  'creatorFee',
  'creator_fee',
  'creator',
  'coin_creator',
  'coin_creator_vault',
  'coinCreatorVault',
  'vault',
  'vault_authority',
  'creator_authority',
  'pumpfun',
  'pumpfun_creator',
  'pumpfun_vault',
  'pumpfun_creator_vault',
  'pump',
  'fee',
  'fee_vault',
  'fees',
  'authority',
  'cfee',
  'cvault'
];

const pubkeys = [
  { label: 'creator', value: creator },
  { label: 'tokenMint', value: tokenMint },
  { label: 'bondingCurve', value: bondingCurve },
  { label: 'pumpGlobal', value: pumpGlobal },
  { label: 'pumpFeeRecipient', value: pumpFeeRecipient },
  { label: 'eventAuthority', value: eventAuthority }
];

const extraBuffers = [
  { label: 'u8:0', buffer: Buffer.from([0]) },
  { label: 'u8:1', buffer: Buffer.from([1]) },
  { label: 'u8:2', buffer: Buffer.from([2]) },
  { label: 'u8:3', buffer: Buffer.from([3]) }
];

const components = [
  ...strings.map(str => ({ label: `str:${str}`, buffer: Buffer.from(str) })),
  ...pubkeys.map(pk => ({ label: `pk:${pk.label}`, buffer: pk.value.toBuffer() })),
  ...extraBuffers
];

function* combinations(arr, length, start = 0, prefix = []) {
  if (length === 0) {
    yield prefix;
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    yield* combinations(arr, length - 1, i, [...prefix, { ...arr[i] }]);
  }
}

function describeSeeds(seeds) {
  return seeds.map(s => s.label).join(' | ');
}

function buffersFromSeeds(seeds) {
  return seeds.map(seed => seed.buffer);
}

let matches = [];

for (let len = 1; len <= 3; len++) {
  for (const seeds of combinations(components, len)) {
    try {
      const seedBuffers = buffersFromSeeds(seeds);
      const [pda] = PublicKey.findProgramAddressSync(seedBuffers, PUMPFUN_PROGRAM_ID);
      if (pda.equals(actualVaultAuthority)) {
        const ata = getAssociatedTokenAddressSync(WSOL_MINT, pda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const ataMatch = ata.equals(actualVaultAta);
        matches.push({ seeds: describeSeeds(seeds), ataMatch });
        console.log('MATCH FOUND:', describeSeeds(seeds));
        console.log('  ATA matches actual:', ataMatch ? '✅' : '❌');
      }
    } catch (err) {
      // Ignore seeds that cause errors (e.g., too long)
    }
  }
}

if (matches.length === 0) {
  console.log('❌ No matches found. Need to expand search space.');
} else {
  console.log('\nMatches:', matches);
}

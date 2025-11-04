#!/usr/bin/env node

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

function usage() {
  console.log(`\nUsage: node scripts/test-bonding-curve.mjs <tokenMintOrTxSignature>`);
  console.log('  • Pass a mint address directly or a transaction signature from a Pumpfun create tx.');
  process.exit(1);
}

async function deriveMintFromSignature(connection, signature) {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed'
  });

  if (!tx) {
    throw new Error('Transaction not found');
  }

  const postTokenBalances = tx.meta?.postTokenBalances || [];
  const mintFromBalances = postTokenBalances.map(b => b.mint).find(Boolean);
  if (mintFromBalances) {
    return mintFromBalances;
  }

  const accountKeys = (() => {
    const message = tx.transaction.message;
    if (typeof message.getAccountKeys === 'function') {
      const keys = message.getAccountKeys();
      return [...keys.staticAccountKeys, ...(keys.accountKeys || [])].map(k => (typeof k === 'string' ? k : k.toBase58()));
    }
    return message.accountKeys?.map(k => k.toBase58()) || [];
  })();

  for (const key of accountKeys) {
    if (key.endsWith('pump')) {
      return key;
    }
  }

  throw new Error('Unable to derive mint from transaction');
}

function deriveBondingCurvePDA(tokenMint) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('bonding_curve'),
    new PublicKey(tokenMint).toBuffer()
  ], PUMPFUN_PROGRAM_ID);
}

async function fetchBondingCurveData(connection, bondingCurve) {
  const commitments = ['processed', 'confirmed', 'confirmed', 'finalized'];
  const delays = [0, 150, 300, 500];

  for (let i = 0; i < commitments.length; i++) {
    if (delays[i] > 0) {
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }

    const accountInfo = await connection.getAccountInfo(bondingCurve, commitments[i]);
    if (accountInfo) {
      return accountInfo;
    }
  }

  return null;
}

const isValidMintFormat = (candidate) => {
  if (!candidate) return false;
  if (candidate.length < 32 || candidate.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(candidate);
};

async function main() {
  const input = process.argv[2];
  if (!input) usage();

  const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

  let mint = input;
  if (!isValidMintFormat(mint)) {
    console.log('🔍 Input looks like a transaction signature – deriving mint...');
    mint = await deriveMintFromSignature(connection, input);
  }

  try {
    new PublicKey(mint);
  } catch {
    throw new Error(`Derived value is not a valid mint address: ${mint}`);
  }

  console.log(`🎯 Mint: ${mint}`);
  const mintInfo = await connection.getAccountInfo(new PublicKey(mint));
  if (!mintInfo) {
    console.warn('⚠️ Mint account not yet available');
  } else {
    const isSplMint = mintInfo.owner.equals(TOKEN_PROGRAM_ID) && mintInfo.data.length === 82;
    console.log(`🧾 Mint owner: ${mintInfo.owner.toBase58()} (SPL mint: ${isSplMint})`);
  }

  const [bondingCurve] = deriveBondingCurvePDA(mint);
  console.log(`🧮 Bonding curve PDA: ${bondingCurve.toBase58()}`);

  let accountInfo = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    accountInfo = await fetchBondingCurveData(connection, bondingCurve);
    if (accountInfo) {
      console.log(`✅ Bonding curve account fetched on attempt ${attempt + 1}`);
      break;
    }
    console.log(`⏳ Bonding curve not ready (attempt ${attempt + 1})`);
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }

  if (!accountInfo) {
    console.error('❌ Bonding curve account still unavailable after retries');
    process.exit(2);
  }

  console.log(`📦 Account data length: ${accountInfo.data.length}`);
  console.log('First 64 bytes (hex):', accountInfo.data.subarray(0, 64).toString('hex'));
}

main().catch((error) => {
  console.error('❌ Error:', error.message || error);
  process.exit(1);
});

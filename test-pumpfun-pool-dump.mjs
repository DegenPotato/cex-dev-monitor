import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const RPC_URL = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const BUY_DISCRIMINATORS = [
  '0094d0da1f435eb0',
  'e6345c8dd8b14540',
  '48feac982b20e013',
  '00b08712a8402815'
];

const SELL_DISCRIMINATORS = [
  '33e685a4017f83ad',
  'db0d98c38ed07cfd'
];

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node test-pumpfun-pool-dump.mjs <TOKEN_MINT> [LOOKBACK_HOURS=24] [OUTPUT_JSON=pool-dump.json]');
  process.exit(1);
}

const TOKEN_MINT = args[0];
const LOOKBACK_HOURS = args[1] ? parseInt(args[1], 10) : 24;
const OUTPUT_JSON = args[2] || `pool-dump-${TOKEN_MINT.slice(0, 8)}.json`;

const connection = new Connection(RPC_URL, 'confirmed');

function parseSwap(tx, tokenMint, signature) {
  if (!tx || !tx.meta || !tx.meta.innerInstructions) return { type: 'unknown' };

  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || [];

  if (message.addressTableLookups && tx.meta.loadedAddresses) {
    if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
  }

  let isBuy = false;
  let isSell = false;
  let discriminatorHex = null;

  for (const inner of tx.meta.innerInstructions) {
    for (const ix of inner.instructions) {
      const programId = accountKeys[ix.programIdIndex];
      if (programId && programId.toString() === PUMPFUN_PROGRAM_ID.toString()) {
        const data = Buffer.from(ix.data, 'base64');
        if (data.length < 8) continue;
        const disc = data.slice(0, 8).toString('hex');
        discriminatorHex = disc;
        isBuy = BUY_DISCRIMINATORS.includes(disc);
        isSell = SELL_DISCRIMINATORS.includes(disc);
        if (isBuy || isSell) break;
      }
    }
    if (isBuy || isSell) break;
  }

  const base = {
    signature,
    slot: tx.slot,
    timestamp: tx.blockTime || 0,
    discriminator: discriminatorHex,
    fee: tx.meta.fee || 0,
  };

  if (!isBuy && !isSell) {
    return { ...base, type: 'unknown', reason: 'no_buy_sell_discriminator' };
  }

  let tokenAmount = 0;
  let decimals = 6;

  if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
    for (const post of tx.meta.postTokenBalances) {
      if (post.mint === tokenMint) {
        const pre = tx.meta.preTokenBalances.find((p) => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;

        if ((isBuy && change > 0n) || (isSell && change < 0n)) {
          decimals = post.uiTokenAmount.decimals;
          tokenAmount = Math.abs(Number(change)) / Math.pow(10, decimals);
          break;
        }
      }
    }
  }

  if (tokenAmount === 0) {
    return { ...base, type: 'unknown', reason: 'zero_token_delta' };
  }

  let solAmount = 0;
  if (tx.meta.preBalances && tx.meta.postBalances) {
    const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
    solAmount = Math.abs(change / 1e9);
  }

  if (solAmount === 0) {
    // try compute from logs: fallback using price from meta inner token balances
    solAmount = tokenAmount * (tx.meta.postBalances?.[0] ? 0 : 0);
  }

  const price = solAmount && tokenAmount ? solAmount / tokenAmount : 0;

  const accountKeysBase58 = message.staticAccountKeys?.map((k) => k.toBase58?.() ?? k.toString?.()) || [];

  return {
    ...base,
    type: isBuy ? 'buy' : 'sell',
    tokenAmount,
    solAmount,
    price,
    accountKeys: accountKeysBase58,
  };
}

async function main() {
  const mintKey = new PublicKey(TOKEN_MINT);
  const [bondingCurve] = PublicKey.findProgramAddressSync([
    Buffer.from('bonding_curve'),
    mintKey.toBuffer(),
  ], PUMPFUN_PROGRAM_ID);

  console.log(`🔗 Bonding curve PDA: ${bondingCurve.toBase58()}`);
  console.log(`⏱️  Lookback: ${LOOKBACK_HOURS} hour(s)`);

  const cutoffTime = Math.floor(Date.now() / 1000) - LOOKBACK_HOURS * 3600;

  let before = undefined;
  const signatures = [];

  while (true) {
    const batch = await connection.getSignaturesForAddress(bondingCurve, {
      before,
      limit: 1000,
    });

    if (batch.length === 0) break;

    signatures.push(...batch);

    const oldest = batch[batch.length - 1];
    if (!oldest.blockTime || oldest.blockTime < cutoffTime) break;

    if (batch.length < 1000) break;

    before = oldest.signature;
  }

  const filtered = signatures.filter((sig) => {
    if (!sig.blockTime) return true;
    return sig.blockTime >= cutoffTime;
  });

  console.log(`🧾 Retrieved ${filtered.length} signatures within window (total pulled: ${signatures.length})`);

  const swaps = [];
  const unknown = [];

  for (let i = 0; i < filtered.length; i += 50) {
    const chunk = filtered.slice(i, i + 50);
    const txSigs = chunk.map((c) => c.signature);

    const transactions = await connection.getTransactions(txSigs, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    for (let j = 0; j < transactions.length; j++) {
      const tx = transactions[j];
      const signature = txSigs[j];
      if (!tx) {
        unknown.push({ signature, reason: 'missing_transaction' });
        continue;
      }

      const parsed = parseSwap(tx, TOKEN_MINT, signature);
      if (parsed.type === 'unknown') {
        unknown.push(parsed);
      } else {
        swaps.push(parsed);
      }
    }
  }

  swaps.sort((a, b) => a.timestamp - b.timestamp);

  const buyCount = swaps.filter((s) => s.type === 'buy').length;
  const sellCount = swaps.filter((s) => s.type === 'sell').length;
  const totalSol = swaps.reduce((sum, s) => sum + (s.solAmount || 0), 0);

  console.log(`📊 Parsed swaps: ${swaps.length} (Buys: ${buyCount}, Sells: ${sellCount})`);
  console.log(`💰 Total SOL volume (approx): ${totalSol.toFixed(4)} SOL`);
  console.log(`❓ Unknown / unclassified: ${unknown.length}`);

  const output = {
    tokenMint: TOKEN_MINT,
    bondingCurve: bondingCurve.toBase58(),
    lookbackHours: LOOKBACK_HOURS,
    fetchedAt: new Date().toISOString(),
    counts: {
      total: swaps.length + unknown.length,
      buys: buyCount,
      sells: sellCount,
      classified: swaps.length,
      unknown: unknown.length,
    },
    swaps,
    unknown,
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));
  console.log(`💾 Dump saved to ${OUTPUT_JSON}`);

  const sampleUnknown = unknown.slice(0, 5).map((u) => u.signature);
  if (sampleUnknown.length > 0) {
    console.log('🔍 Sample unknown signatures:', sampleUnknown.join(', '));
  }
}

main().catch((err) => {
  console.error('❌ Error dumping pool transactions:', err);
  process.exit(1);
});

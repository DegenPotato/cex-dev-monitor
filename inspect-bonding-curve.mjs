/**
 * Inspect Pumpfun bonding curve account layout
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

// Sample bonding curve from successful tx
const BONDING_CURVE = new PublicKey(process.argv[2] || '3eqn8SxHhJrpHV3ZjztY3XJ6hA4J3VJvXmhQHnLwHE3P');

async function main() {
  console.log(`Inspecting bonding curve: ${BONDING_CURVE.toBase58()}`);

  const info = await connection.getAccountInfo(BONDING_CURVE, 'confirmed');
  if (!info) {
    console.log('Account not found');
    return;
  }

  console.log(`Lamports: ${info.lamports}`);
  console.log(`Owner: ${info.owner.toBase58()}`);
  console.log(`Data length: ${info.data.length}`);

  const data = Buffer.from(info.data);

  function dumpRange(start, length, label) {
    const slice = data.slice(start, start + length);
    console.log(`${label} [${start}-${start + length}): ${slice.toString('hex')}`);
  }

  // Dump first 200 bytes in 32-byte chunks
  for (let offset = 0; offset < Math.min(data.length, 256); offset += 32) {
    const chunk = data.slice(offset, offset + 32);
    console.log(offset.toString().padStart(4, '0'), chunk.toString('hex'));
  }

  // Attempt to parse known fields
  let offset = 0;
  const discriminator = data.slice(offset, offset + 8);
  offset += 8;
  console.log(`\nDiscriminator: ${discriminator.toString('hex')}`);

  const virtualTokenReserves = data.readBigUInt64LE(offset); offset += 8;
  const virtualSolReserves = data.readBigUInt64LE(offset); offset += 8;
  const realTokenReserves = data.readBigUInt64LE(offset); offset += 8;
  const realSolReserves = data.readBigUInt64LE(offset); offset += 8;
  const tokenTotalSupply = data.readBigUInt64LE(offset); offset += 8;
  const complete = data[offset] === 1; offset += 1;

  console.log(`\nvirtualTokenReserves: ${virtualTokenReserves}`);
  console.log(`virtualSolReserves: ${virtualSolReserves}`);
  console.log(`realTokenReserves: ${realTokenReserves}`);
  console.log(`realSolReserves: ${realSolReserves}`);
  console.log(`tokenTotalSupply: ${tokenTotalSupply}`);
  console.log(`complete: ${complete}`);
  console.log(`Next offset: ${offset}`);

  const remaining = data.slice(offset);
  console.log(`Remaining bytes (${remaining.length}): ${remaining.toString('hex')}`);

  if (remaining.length >= 32) {
    const creatorMaybe = new PublicKey(remaining.slice(0, 32));
    console.log(`Possible creator (first 32 bytes): ${creatorMaybe.toBase58()}`);
  }
}

main().catch(console.error);

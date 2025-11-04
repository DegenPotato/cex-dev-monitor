#!/usr/bin/env node

import https from 'https';

function usage() {
  console.error('Usage: node scripts/derive-pumpfun-mint.mjs <signature> [rpcUrl]');
  process.exit(1);
}

const [signature, rpcUrlArg] = process.argv.slice(2);
if (!signature) usage();

const RPC_URL = rpcUrlArg || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

function rpcRequest(method, params) {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: method, method, params });

  return new Promise((resolve, reject) => {
    const req = https.request(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) {
            reject(new Error(`RPC ${method} error: ${JSON.stringify(json.error)}`));
          } else {
            resolve(json.result);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function isPossibleMint(address) {
  return typeof address === 'string'
    && address.length >= 32
    && address.length <= 44
    && /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(address);
}

function extractMintFromLogs(logs = []) {
  for (const log of logs) {
    if (!log.includes('Program log:')) continue;
    const matches = log.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
    if (!matches) continue;
    for (const candidate of matches) {
      if (candidate === 'So11111111111111111111111111111111111111112') continue;
      if (candidate.endsWith('pump') && isPossibleMint(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function extractMintFromBalances(balances = []) {
  for (const balance of balances) {
    const mint = balance?.mint;
    if (mint && mint !== 'So11111111111111111111111111111111111111112' && isPossibleMint(mint)) {
      if (mint.endsWith('pump')) return mint;
    }
  }
  for (const balance of balances) {
    const mint = balance?.mint;
    if (mint && mint !== 'So11111111111111111111111111111111111111112' && isPossibleMint(mint)) {
      return mint;
    }
  }
  return null;
}

(async () => {
  try {
    const result = await rpcRequest('getTransaction', [signature, {
      encoding: 'json',
      maxSupportedTransactionVersion: 0
    }]);

    if (!result) throw new Error('Transaction not found');

    const logMint = extractMintFromLogs(result.meta?.logMessages);
    const balanceMint = extractMintFromBalances(result.meta?.postTokenBalances);

    const mint = logMint || balanceMint;
    if (!mint) {
      throw new Error('Unable to derive mint from transaction');
    }

    console.log(mint);
  } catch (error) {
    console.error('Error:', error.message || error);
    process.exit(1);
  }
})();

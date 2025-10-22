#!/usr/bin/env node
// Check wallet data after migration

import { queryAll, queryOne } from './dist/backend/database/helpers.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });

async function checkWalletData() {
  console.log('🔍 Checking wallet data after migration...\n');
  
  try {
    // 1. Check if trading_wallets table exists and has data
    const wallets = await queryAll(`
      SELECT id, user_id, wallet_name, public_key, 
             CASE WHEN private_key IS NOT NULL AND LENGTH(private_key) > 0 THEN 'YES' ELSE 'NO' END as has_private_key,
             sol_balance, is_deleted, created_at 
      FROM trading_wallets
      WHERE is_deleted = 0
    `);
    
    console.log(`📊 Found ${wallets.length} active wallet(s):\n`);
    
    if (wallets.length > 0) {
      wallets.forEach(w => {
        console.log(`Wallet #${w.id}: ${w.wallet_name || 'Unnamed'}`);
        console.log(`  User ID: ${w.user_id}`);
        console.log(`  Public Key: ${w.public_key}`);
        console.log(`  Has Private Key: ${w.has_private_key}`);
        console.log(`  SOL Balance: ${w.sol_balance || 0}`);
        console.log(`  Created: ${new Date(w.created_at * 1000).toLocaleString()}`);
        console.log('');
      });
      
      // Check first wallet in detail
      const firstWallet = await queryOne(`SELECT * FROM trading_wallets WHERE id = ?`, [wallets[0].id]);
      if (firstWallet && firstWallet.private_key) {
        console.log('🔑 First wallet private key info:');
        console.log(`  Length: ${firstWallet.private_key.length} characters`);
        console.log(`  First 20 chars: ${firstWallet.private_key.substring(0, 20)}...`);
        
        // Check if it looks encrypted
        if (firstWallet.private_key.includes(':')) {
          console.log(`  Format: Encrypted (IV:Data format)`);
        } else if (firstWallet.private_key.length === 88 || firstWallet.private_key.length === 87) {
          console.log(`  Format: Base58 private key (unencrypted)`);
        } else if (firstWallet.private_key.length === 64 && /^[0-9a-fA-F]+$/.test(firstWallet.private_key)) {
          console.log(`  Format: Hex private key (unencrypted)`);
        } else {
          console.log(`  Format: Unknown`);
        }
      }
    } else {
      console.log('⚠️  No wallets found! You may need to create a new one.');
    }
    
    // 2. Check wallet_token_holdings table
    const holdings = await queryAll(`SELECT COUNT(*) as count FROM wallet_token_holdings`);
    console.log(`\n💰 Token holdings: ${holdings[0].count} record(s)`);
    
    // 3. Check trading_transactions table
    const transactions = await queryAll(`SELECT COUNT(*) as count FROM trading_transactions`);
    console.log(`📈 Trading transactions: ${transactions[0].count} record(s)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

checkWalletData();

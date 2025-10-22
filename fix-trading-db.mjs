#!/usr/bin/env node
// Fix missing columns in trading tables

import { execute, queryAll, queryOne } from './dist/backend/database/helpers.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });

async function fixTradingTables() {
  console.log('🔧 Fixing trading tables...\n');
  
  try {
    // 1. Add is_deleted column to trading_wallets if it doesn't exist
    console.log('1️⃣ Adding is_deleted column to trading_wallets...');
    try {
      await execute(`ALTER TABLE trading_wallets ADD COLUMN is_deleted INTEGER DEFAULT 0`);
      console.log('   ✅ Added is_deleted column');
    } catch (e) {
      if (e.message.includes('duplicate column name')) {
        console.log('   ℹ️ is_deleted column already exists');
      } else {
        console.log('   ❌ Error:', e.message);
      }
    }
    
    // 2. Create wallet_token_holdings table
    console.log('\n2️⃣ Creating wallet_token_holdings table...');
    try {
      await execute(`
        CREATE TABLE IF NOT EXISTS wallet_token_holdings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wallet_id INTEGER NOT NULL,
          token_mint TEXT NOT NULL,
          token_symbol TEXT,
          token_name TEXT,
          token_amount REAL DEFAULT 0,
          token_decimals INTEGER DEFAULT 9,
          price_usd REAL DEFAULT 0,
          total_value_usd REAL DEFAULT 0,
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id) ON DELETE CASCADE
        )
      `);
      console.log('   ✅ Created wallet_token_holdings table');
    } catch (e) {
      console.log('   ❌ Error:', e.message);
    }
    
    // 3. Show existing wallets
    console.log('\n3️⃣ Checking existing wallets...');
    const wallets = await queryAll(`
      SELECT id, user_id, wallet_name, public_key, 
             CASE WHEN private_key IS NOT NULL THEN 'YES' ELSE 'NO' END as has_private_key,
             sol_balance, created_at 
      FROM trading_wallets
    `);
    
    if (wallets.length > 0) {
      console.log('\n📊 Found wallets:');
      wallets.forEach(w => {
        console.log(`   Wallet #${w.id}: ${w.wallet_name}`);
        console.log(`     - Public Key: ${w.public_key?.substring(0, 20)}...`);
        console.log(`     - Private Key: ${w.has_private_key === 'YES' ? '✅ Stored' : '❌ Missing'}`);
        console.log(`     - SOL Balance: ${w.sol_balance || 0}`);
        console.log(`     - Created: ${new Date(w.created_at * 1000).toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('   ⚠️ No wallets found in database');
    }
    
    // 4. Check if we can decrypt the private key
    const wallet1 = await queryOne(`SELECT * FROM trading_wallets WHERE id = 1`);
    if (wallet1 && wallet1.private_key) {
      console.log('4️⃣ Wallet #1 Details:');
      console.log(`   - ID: ${wallet1.id}`);
      console.log(`   - Name: ${wallet1.wallet_name}`);
      console.log(`   - Public Key: ${wallet1.public_key}`);
      console.log(`   - Private Key Length: ${wallet1.private_key.length} chars`);
      console.log(`   - Private Key starts with: ${wallet1.private_key.substring(0, 50)}...`);
      
      // Check if it's encrypted
      const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(wallet1.private_key);
      const isHex = /^[0-9a-fA-F]+$/.test(wallet1.private_key);
      
      if (isBase64 || wallet1.private_key.includes(':')) {
        console.log(`   - Format: Likely encrypted (Base64 or IV:Data format)`);
      } else if (isHex && wallet1.private_key.length === 64) {
        console.log(`   - Format: Unencrypted hex private key`);
      } else {
        console.log(`   - Format: Unknown`);
      }
    }
    
    console.log('\n✅ Database fix complete!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
  
  process.exit(0);
}

fixTradingTables();

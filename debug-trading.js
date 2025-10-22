// Debug script to check trading wallet data
import { queryAll, queryOne } from './dist/backend/database/helpers.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });

async function checkWallets() {
  try {
    console.log('=== Checking Trading Wallets ===');
    
    // Get all wallets
    const wallets = await queryAll(
      'SELECT id, user_id, wallet_name, public_key, LEFT(private_key, 20) as pk_start, sol_balance, created_at FROM trading_wallets WHERE is_deleted = 0'
    );
    
    console.log('\nFound wallets:');
    console.table(wallets);
    
    // Check if wallet_token_holdings table exists
    const tables = await queryAll("SHOW TABLES LIKE 'wallet_token_holdings'");
    console.log('\nwallet_token_holdings table exists:', tables.length > 0);
    
    // Get wallet with ID 1 specifically
    const wallet1 = await queryOne('SELECT * FROM trading_wallets WHERE id = 1');
    if (wallet1) {
      console.log('\n=== Wallet ID 1 Details ===');
      console.log('ID:', wallet1.id);
      console.log('Name:', wallet1.wallet_name);
      console.log('Public Key:', wallet1.public_key);
      console.log('Private Key exists:', !!wallet1.private_key);
      console.log('SOL Balance:', wallet1.sol_balance);
      console.log('Created:', wallet1.created_at);
    }
    
    // Check for any errors in recent activity
    try {
      const recentActivity = await queryAll(
        'SELECT * FROM trading_activity ORDER BY id DESC LIMIT 5'
      );
      console.log('\n=== Recent Trading Activity ===');
      console.table(recentActivity);
    } catch (e) {
      console.log('No trading_activity table');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

checkWallets();

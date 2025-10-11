import { ProxiedSolanaConnection } from './src/backend/services/ProxiedSolanaConnection.js';
import { PublicKey } from '@solana/web3.js';

async function testProxies() {
  console.log('🧪 Testing Proxy Integration\n');

  const proxied = new ProxiedSolanaConnection(
    'https://api.mainnet-beta.solana.com',
    { commitment: 'confirmed' },
    './proxies.txt'
  );

  console.log(`Proxy Enabled: ${proxied.isProxyEnabled()}`);
  console.log(`Proxy Stats:`, proxied.getProxyStats());
  console.log('');

  // Test 5 calls with different proxies
  const testWallet = new PublicKey('DwdrYTtTWHfnfJBiN2RH6EgPbquDQLjZTfTwpykPEq1g');

  for (let i = 0; i < 5; i++) {
    console.log(`[Test ${i + 1}/5] Making proxied request...`);
    
    try {
      const result = await proxied.withProxy(async (connection) => {
        const balance = await connection.getBalance(testWallet);
        return balance / 1e9;
      });
      
      console.log(`✅ Success! Balance: ${result.toFixed(2)} SOL\n`);
    } catch (error: any) {
      console.error(`❌ Failed:`, error.message, '\n');
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('📊 Final Stats:', proxied.getProxyStats());
}

testProxies().catch(console.error);

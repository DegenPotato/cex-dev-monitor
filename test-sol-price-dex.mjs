import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

// Major SOL/USDC pools we can check
const pools = [
  {
    name: 'Raydium SOL/USDC',
    address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    solVault: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    usdcVault: '36c6YqAwyGKQG66XEp2dJc5JqjaBNv7sVghEtJv4c7u6',
    type: 'raydium'
  },
  {
    name: 'Orca SOL/USDC',
    address: 'EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U',
    solVault: 'ANP74VNsHwSrq9uUSjiSNyNWvf6ZPrKTmE4gHoNd13Lg',
    usdcVault: '75HgnSvXbWKZBpZHveX68ZzAhDqMzNDS29X6BGLtxMo1',
    type: 'orca'
  }
];

async function getSOLPriceFromPool(pool) {
  try {
    console.log(`\n📊 Checking ${pool.name}...`);
    
    const [solVault, usdcVault] = await Promise.all([
      connection.getAccountInfo(new PublicKey(pool.solVault)),
      connection.getAccountInfo(new PublicKey(pool.usdcVault))
    ]);
    
    if (!solVault || !usdcVault) {
      console.log('   ❌ Could not fetch vault data');
      return null;
    }
    
    // Parse token account data
    const solBalance = Number(solVault.data.readBigUInt64LE(64)) / 1e9; // SOL has 9 decimals
    const usdcBalance = Number(usdcVault.data.readBigUInt64LE(64)) / 1e6; // USDC has 6 decimals
    
    const price = usdcBalance / solBalance;
    
    console.log(`   SOL Reserve: ${solBalance.toFixed(2)} SOL`);
    console.log(`   USDC Reserve: $${usdcBalance.toFixed(2)}`);
    console.log(`   ✅ SOL Price: $${price.toFixed(2)}`);
    
    return price;
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function testSOLPrice() {
  console.log('🔍 Getting SOL Price from DEX Pools (On-Chain)\n');
  
  const prices = [];
  
  for (const pool of pools) {
    const price = await getSOLPriceFromPool(pool);
    if (price) prices.push(price);
  }
  
  if (prices.length > 0) {
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    console.log(`\n💰 Average SOL Price: $${avgPrice.toFixed(2)}`);
  } else {
    console.log('\n❌ Could not determine SOL price from any pool');
  }
}

testSOLPrice();

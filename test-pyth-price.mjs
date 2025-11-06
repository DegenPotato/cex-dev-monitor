import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

// Pyth SOL/USD price feed
const PYTH_SOL_USD = new PublicKey('H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG');

async function testPythPrice() {
  console.log('🔍 Testing Pyth SOL/USD Oracle\n');
  console.log(`Feed Address: ${PYTH_SOL_USD.toBase58()}\n`);
  
  try {
    const accountInfo = await connection.getAccountInfo(PYTH_SOL_USD);
    
    if (!accountInfo) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log(`Account Owner: ${accountInfo.owner.toBase58()}`);
    console.log(`Data Length: ${accountInfo.data.length} bytes\n`);
    
    const data = accountInfo.data;
    
    // Try different offsets to find the price
    console.log('📊 Trying different Pyth V2 price offsets:\n');
    
    // Pyth V2 format offsets
    const offsets = [
      { name: 'Price (offset 208)', offset: 208, type: 'i64' },
      { name: 'Confidence (offset 216)', offset: 216, type: 'u64' },
      { name: 'Exponent (offset 20)', offset: 20, type: 'i32' },
      { name: 'Status (offset 8)', offset: 8, type: 'u32' },
    ];
    
    for (const { name, offset, type } of offsets) {
      try {
        let value;
        if (type === 'i64') {
          value = data.readBigInt64LE(offset);
        } else if (type === 'u64') {
          value = data.readBigUInt64LE(offset);
        } else if (type === 'i32') {
          value = data.readInt32LE(offset);
        } else if (type === 'u32') {
          value = data.readUInt32LE(offset);
        }
        console.log(`${name}: ${value}`);
      } catch (err) {
        console.log(`${name}: Error reading - ${err.message}`);
      }
    }
    
    // Calculate price
    console.log('\n💰 Price Calculation:\n');
    
    const priceRaw = data.readBigInt64LE(208);
    const expo = data.readInt32LE(20);
    const confidence = data.readBigUInt64LE(216);
    
    console.log(`Raw Price: ${priceRaw}`);
    console.log(`Exponent: ${expo}`);
    console.log(`Confidence: ${confidence}`);
    
    const price = Number(priceRaw) * Math.pow(10, expo);
    const conf = Number(confidence) * Math.pow(10, expo);
    
    console.log(`\n✅ SOL/USD Price: $${price.toFixed(2)} ± $${conf.toFixed(2)}`);
    
    // Also try aggregate price (offset 240) and various other offsets
    console.log('\n🔍 Checking other possible price locations:\n');
    
    const testOffsets = [240, 248, 272, 280, 288, 304, 312];
    for (const offset of testOffsets) {
      try {
        const val = data.readBigInt64LE(offset);
        const calc = Number(val) * Math.pow(10, expo);
        if (calc > 50 && calc < 500) { // Reasonable SOL price range
          console.log(`Offset ${offset}: Raw=${val}, Price=$${calc.toFixed(2)}`);
        }
      } catch (err) {
        // Skip
      }
    }
    
    // Check if we need to look at a different structure
    console.log('\n🔍 Checking current timestamp and validity:\n');
    try {
      const pubSlot = data.readBigUInt64LE(72);
      const validSlot = data.readBigUInt64LE(80);
      console.log(`Publish Slot: ${pubSlot}`);
      console.log(`Valid Slot: ${validSlot}`);
    } catch (err) {
      console.log(`Slot info unavailable`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testPythPrice();

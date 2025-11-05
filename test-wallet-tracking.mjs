/**
 * Test script to verify wallet tracking logic
 * Simulates how SmartMoneyTracker would detect tracked vs new wallets
 */

// Simulate the walletPositions Map (walletAddress -> Set<positionId>)
const walletPositions = new Map();

// Simulate some tracked wallets with existing positions
walletPositions.set('WalletAAA', new Set(['WalletAAA-TokenX', 'WalletAAA-TokenY']));
walletPositions.set('WalletBBB', new Set(['WalletBBB-TokenZ']));
walletPositions.set('WalletCCC', new Set(['WalletCCC-TokenA']));

console.log('🧪 Testing Wallet Tracking Logic\n');
console.log('Tracked wallets:', Array.from(walletPositions.keys()), '\n');

// Test cases
const testCases = [
  { wallet: 'WalletAAA', token: 'TokenNEW', tokensBought: 1_000_000, description: 'Tracked wallet buys NEW token (below threshold)' },
  { wallet: 'WalletBBB', token: 'TokenZ', tokensBought: 500_000, description: 'Tracked wallet buys MORE of existing token' },
  { wallet: 'WalletNEW', token: 'TokenX', tokensBought: 10_000_000, description: 'NEW wallet buys ABOVE threshold' },
  { wallet: 'WalletNEW2', token: 'TokenY', tokensBought: 1_000_000, description: 'NEW wallet buys BELOW threshold' },
  { wallet: 'WalletCCC', token: 'TokenB', tokensBought: 100_000, description: 'Tracked wallet tiny buy (100k tokens)' },
];

const THRESHOLD = 5_000_000;

console.log(`Threshold: ${THRESHOLD.toLocaleString()} tokens\n`);
console.log('─'.repeat(80));

testCases.forEach((test, i) => {
  console.log(`\nTest ${i + 1}: ${test.description}`);
  console.log(`Wallet: ${test.wallet} | Token: ${test.token} | Amount: ${test.tokensBought.toLocaleString()}`);
  
  const isTrackedWallet = walletPositions.has(test.wallet);
  console.log(`Is tracked wallet: ${isTrackedWallet ? '✅ YES' : '❌ NO'}`);
  
  // OLD LOGIC (current)
  const existingPosition = walletPositions.get(test.wallet)?.has(`${test.wallet}-${test.token}`);
  const wouldRecordOld = test.tokensBought >= THRESHOLD || existingPosition;
  console.log(`OLD LOGIC would record: ${wouldRecordOld ? '✅' : '❌'}`);
  
  // NEW LOGIC (proposed)
  const wouldRecordNew = isTrackedWallet || test.tokensBought >= THRESHOLD;
  console.log(`NEW LOGIC would record: ${wouldRecordNew ? '✅' : '❌'}`);
  
  if (wouldRecordOld !== wouldRecordNew) {
    console.log('🔥 DIFFERENCE DETECTED! New logic would behave differently');
  }
});

console.log('\n' + '─'.repeat(80));
console.log('\n📊 Summary:');
console.log('OLD LOGIC: Only records if buy is above threshold OR same wallet+token pair exists');
console.log('NEW LOGIC: Records ALL activity from tracked wallets + new wallets above threshold');
console.log('\n✅ Key benefit: Catches ALL trades from smart money wallets, not just same token');

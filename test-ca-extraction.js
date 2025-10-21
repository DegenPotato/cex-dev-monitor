/**
 * Test script to verify CA extraction from messages with multiple URLs
 * This tests the edge case where a contract appears both standalone and in URLs
 */

// Simulated message from bot with lots of URLs
const testMessage = `🤖 0xBot AI Agent | Solana Network (https://t.me/pay0x_bot?start=BH00) 
🏖 Real Shitcoin | Shitcoin | Pump💊

🛒 Token Address:
GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump

📚 Supply: 1B Tokens
📊 Initial MC: $79.54K
💲 Call MC: $78.23K
💎 Initial LP: 86.5 SOL | $16.20K
💧 Call Liquidity: 86.8 SOL | $16.25K
⚙️ LP Tokens: 20%

💼 Top 10 holders: (https://solscan.io/token/GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump#holders) 24.2%

🛠️ Deployer (https://solscan.io/account/TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM) 0.0 SOL | 0.0 Tokens

❄️ FREEZE: ✅ Disabled
💼 MINT: ✅ Disabled
🔥 LP STATUS: ❌ Not Burned

📬 SOCIALS: X (https://x.com/i/communities/1972970006947274953)

🔗 BULLXW (https://bullx.io/terminal?chainId=1399811149&address=GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump&r=8SV03QS1X2C) | PHOTON (https://photon-sol.tinyastro.io/en/lp/GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump) | BONK (https://t.me/mcqueen_bonkbot?start=ref_tg1il_ca_GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump) | TROJAN (https://t.me/diomedes_trojanbot?start=r-bh00000000000-GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump) | BANANA (https://t.me/BananaGunSolana_bot?start=snp_solcall_GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump) | MAESTRO (https://t.me/MaestroProBot?start=GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump) | RUGCHECK (https://rugcheck.xyz/tokens/GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump) | SCREEN (https://dexscreener.com/solana/GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump)
💡 Strategy: Cobra Scan

Our VIP members get 30s early calls and more premium signals than the public group. 👉 @pay0x_bot (https://t.me/pay0x_bot?start=BH00)`;

// Solana address patterns
const SOL_PATTERN = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const SOL_PATTERN_WITH_SPECIALS = /[1-9A-HJ-NP-Za-km-z][-_.\s]*(?:[1-9A-HJ-NP-Za-km-z][-_.\s]*){31,43}/g;

// Simple Solana address validation
function isValidSolanaAddress(address) {
  // Check if it's a valid base58 string with proper length
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return false;
  }
  
  // Basic checks for common Solana suffixes
  const commonSuffixes = ['pump', '11111111111111111111111111111111', 'oo'];
  const hasValidPattern = commonSuffixes.some(suffix => address.includes(suffix)) || 
                          address.length === 44;
  
  return hasValidPattern;
}

function extractContracts(text) {
  const contracts = [];
  
  // FIRST: Extract ANY Solana address from ANY URL before removing them!
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlPattern) || [];
  for (const url of urls) {
    // Extract ANY valid Solana address from the URL (32-44 chars, base58)
    const addressMatches = url.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [];
    for (const addr of addressMatches) {
      if (isValidSolanaAddress(addr) && !contracts.find(c => c.address === addr)) {
        contracts.push({
          address: addr,
          type: 'url',
          original: url
        });
        console.log(`   🔗 Extracted from URL: ${addr.substring(0, 8)}...`);
      }
    }
  }
  
  // NOW remove URLs to avoid matching addresses within other links
  const textClean = text.replace(/https?:\/\/\S+/g, '');
  
  // Check standard format
  const standardMatches = textClean.match(SOL_PATTERN) || [];
  for (const match of standardMatches) {
    if (isValidSolanaAddress(match) && !contracts.find(c => c.address === match)) {
      contracts.push({
        address: match,
        type: 'standard',
        original: match
      });
    }
  }

  // Check obfuscated format
  const obfuscatedMatches = textClean.match(SOL_PATTERN_WITH_SPECIALS) || [];
  for (const match of obfuscatedMatches) {
    const cleaned = match.replace(/[-_.\s]/g, '');
    if (isValidSolanaAddress(cleaned) && !contracts.find(c => c.address === cleaned)) {
      contracts.push({
        address: cleaned,
        type: 'obfuscated',
        original: match
      });
    }
  }

  // Final deduplication and logging
  const uniqueAddresses = new Set();
  const dedupedContracts = [];
  for (const contract of contracts) {
    if (!uniqueAddresses.has(contract.address)) {
      uniqueAddresses.add(contract.address);
      dedupedContracts.push(contract);
    }
  }
  
  if (dedupedContracts.length > 0) {
    console.log(`   📋 Extracted ${dedupedContracts.length} unique contract(s): ${dedupedContracts.map(c => c.address.substring(0, 8) + '...').join(', ')}`);
  }

  return dedupedContracts;
}

// Run the test
console.log('🧪 Testing CA extraction from message with multiple URLs...\n');
console.log('Expected result: 1 unique token (GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump)\n');
console.log('-------------------------------------------\n');

const extractedContracts = extractContracts(testMessage);

console.log('\n-------------------------------------------');
console.log('📊 Results:');
console.log(`   Total unique contracts found: ${extractedContracts.length}`);

extractedContracts.forEach((contract, index) => {
  console.log(`\n   ${index + 1}. ${contract.address}`);
  console.log(`      Type: ${contract.type}`);
  if (contract.type === 'url') {
    console.log(`      Source URL: ${contract.original.substring(0, 50)}...`);
  }
});

// Also test another edge case - deployer wallet should NOT be extracted as a token
const deployerAddress = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';
const isDeployerIncluded = extractedContracts.some(c => c.address === deployerAddress);

console.log('\n-------------------------------------------');
console.log('✅ Test Results:');
console.log(`   ✓ Expected 1 unique token: ${extractedContracts.length === 1 ? 'PASS' : 'FAIL'}`);
console.log(`   ✓ Correct token extracted: ${extractedContracts[0]?.address === 'GMpuhpZtgguWDJLqhYVS4epZGXjDRiboGSdzAqWupump' ? 'PASS' : 'FAIL'}`);
console.log(`   ✓ Deployer wallet excluded: ${!isDeployerIncluded ? 'PASS' : 'FAIL'}`);

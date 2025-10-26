import { queryAll } from '../database/helpers.js';
async function checkTimestamps() {
    console.log('\n🔍 Checking OHLCV timestamp formats...\n');
    // Get some sample OHLCV data
    const samples = await queryAll(`
    SELECT timestamp, created_at, pool_address, timeframe
    FROM ohlcv_data
    ORDER BY created_at DESC
    LIMIT 5
  `);
    console.log('Sample OHLCV records:');
    console.log('='.repeat(80));
    for (const sample of samples) {
        console.log(`\nPool: ${sample.pool_address.slice(0, 8)}... (${sample.timeframe})`);
        console.log(`  timestamp field: ${sample.timestamp}`);
        // Try interpreting as seconds
        const asSeconds = new Date(sample.timestamp * 1000);
        console.log(`    As seconds: ${asSeconds.toISOString()} ${asSeconds.getFullYear() === 1970 ? '❌ (1970!)' : '✅'}`);
        // Try interpreting as milliseconds  
        const asMillis = new Date(sample.timestamp);
        console.log(`    As millis:  ${asMillis.toISOString()} ${asMillis.getFullYear() === 1970 ? '❌ (1970!)' : '✅'}`);
        console.log(`\n  created_at field: ${sample.created_at}`);
        const createdAt = new Date(sample.created_at);
        console.log(`    As millis:  ${createdAt.toISOString()} ${createdAt.getFullYear() === 2025 ? '✅' : '❌'}`);
    }
    // Check what GeckoTerminal actually returns
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Analysis:');
    if (samples.length > 0) {
        const firstTimestamp = samples[0].timestamp;
        // Unix seconds would be around 1,700,000,000 (2023-2025 range)
        // Unix milliseconds would be around 1,700,000,000,000
        if (firstTimestamp < 10000) {
            console.log('❌ Timestamps are way too small! Possibly array index or wrong field.');
        }
        else if (firstTimestamp < 1000000000) {
            console.log('❌ Timestamps are too small to be Unix seconds (would be before year 2001)');
        }
        else if (firstTimestamp < 10000000000) {
            console.log('✅ Timestamps appear to be Unix SECONDS');
            console.log('   But our display shows 1970, so conversion might be wrong in frontend');
        }
        else {
            console.log('✅ Timestamps appear to be Unix MILLISECONDS');
            console.log('   GeckoTerminal is returning milliseconds, not seconds!');
        }
    }
    process.exit(0);
}
checkTimestamps().catch(console.error);

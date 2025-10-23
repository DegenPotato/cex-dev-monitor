import { queryAll, queryOne } from '../database/helpers.js';

async function testTimestamps() {
  console.log('\n🔍 Testing OHLCV Timestamp Issues\n');
  
  // Check a few tokens to see what format timestamps are in
  const tokens = await queryAll<{ 
    mint_address: string; 
    timestamp: number;
  }>(
    `SELECT mint_address, timestamp 
     FROM token_mints 
     ORDER BY timestamp DESC 
     LIMIT 5`
  );
  
  console.log('📊 Sample token timestamps from database:');
  for (const token of tokens) {
    const ts = token.timestamp;
    console.log(`Token ${token.mint_address.slice(0, 8)}...:`);
    console.log(`  Raw value: ${ts}`);
    console.log(`  As seconds: ${new Date(ts * 1000).toISOString()}`);
    console.log(`  As milliseconds: ${new Date(ts).toISOString()}`);
    console.log(`  If divided by 1000: ${new Date(Math.floor(ts / 1000) * 1000).toISOString()}`);
    console.log('');
  }
  
  // Check progress table
  const progress = await queryAll<{
    pool_address: string;
    oldest_timestamp: number | null;
    newest_timestamp: number | null;
  }>(
    `SELECT pool_address, oldest_timestamp, newest_timestamp
     FROM ohlcv_backfill_progress
     WHERE oldest_timestamp IS NOT NULL
     LIMIT 3`
  );
  
  if (progress.length > 0) {
    console.log('📊 Sample progress timestamps:');
    for (const p of progress) {
      console.log(`Pool ${p.pool_address.slice(0, 8)}...:`);
      if (p.oldest_timestamp) {
        console.log(`  Oldest: ${p.oldest_timestamp} = ${new Date(p.oldest_timestamp * 1000).toISOString()}`);
      }
      if (p.newest_timestamp) {
        console.log(`  Newest: ${p.newest_timestamp} = ${new Date(p.newest_timestamp * 1000).toISOString()}`);
      }
      console.log('');
    }
  }
  
  // Check actual OHLCV data
  const candles = await queryAll<{
    timestamp: number;
    pool_address: string;
  }>(
    `SELECT timestamp, pool_address
     FROM ohlcv_data
     ORDER BY timestamp DESC
     LIMIT 3`
  );
  
  if (candles.length > 0) {
    console.log('📊 Sample OHLCV candle timestamps:');
    for (const c of candles) {
      console.log(`Pool ${c.pool_address.slice(0, 8)}... timestamp: ${c.timestamp} = ${new Date(c.timestamp * 1000).toISOString()}`);
    }
  }
  
  console.log('\n✅ Analysis:');
  if (tokens.length > 0) {
    const firstToken = tokens[0].timestamp;
    if (firstToken > 1000000000000) {
      console.log('❗ token_mints.timestamp is in MILLISECONDS');
      console.log('   But OHLCVCollector expects it in MILLISECONDS and converts to seconds');
      console.log('   This is CORRECT behavior');
    } else {
      console.log('⚠️ token_mints.timestamp is in SECONDS');
      console.log('   But OHLCVCollector treats it as MILLISECONDS and divides by 1000');
      console.log('   This causes dates to be in 1970!');
    }
  }
  
  process.exit(0);
}

testTimestamps().catch(console.error);

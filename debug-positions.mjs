#!/usr/bin/env node
import { queryAll } from './dist/backend/database/helpers.js';

async function debugPositions() {
  console.log('\n📊 Debugging Telegram Trading Positions\n');
  
  // Get all open positions
  const positions = await queryAll(`
    SELECT 
      p.id,
      p.token_mint,
      p.buy_amount_sol,
      p.tokens_bought,
      p.current_tokens,
      p.buy_price_usd,
      p.buy_price_sol,
      p.current_price,
      p.total_invested_sol,
      p.roi_percent,
      t.token_symbol,
      t.price_usd,
      t.price_sol
    FROM telegram_trading_positions p
    LEFT JOIN token_market_data t ON p.token_mint = t.mint_address
    WHERE p.status = 'open'
    ORDER BY p.created_at DESC
    LIMIT 10
  `);

  for (const pos of positions) {
    console.log(`\n=== Position ${pos.id} (${pos.token_symbol || pos.token_mint.slice(0, 8)}) ===`);
    console.log(`  Buy Amount: ${pos.buy_amount_sol} SOL`);
    console.log(`  Tokens Bought: ${pos.tokens_bought}`);
    console.log(`  Current Tokens: ${pos.current_tokens || pos.tokens_bought}`);
    console.log(`  Buy Price (USD col): ${pos.buy_price_usd} (actually SOL)`);
    console.log(`  Buy Price (SOL col): ${pos.buy_price_sol}`);
    console.log(`  Current Price: ${pos.current_price}`);
    console.log(`  Market Data USD: ${pos.price_usd}`);
    console.log(`  Market Data SOL: ${pos.price_sol}`);
    
    // Calculate what the values should be
    const actualBuyPriceSOL = pos.buy_price_sol || pos.buy_price_usd || 0;
    const currentTokens = pos.current_tokens || pos.tokens_bought || 0;
    
    if (actualBuyPriceSOL > 0 && currentTokens > 0) {
      const expectedTokensFromBuy = pos.buy_amount_sol / actualBuyPriceSOL;
      console.log(`\n  ⚠️ VALIDATION:`);
      console.log(`    Expected tokens from buy: ${expectedTokensFromBuy.toFixed(2)}`);
      console.log(`    Stored tokens: ${currentTokens}`);
      
      if (Math.abs(expectedTokensFromBuy - currentTokens) > 1) {
        console.log(`    ❌ MISMATCH! Price might be inverted!`);
        const invertedPrice = 1 / actualBuyPriceSOL;
        const tokensWithInverted = pos.buy_amount_sol / invertedPrice;
        console.log(`    If price was inverted: ${tokensWithInverted.toFixed(2)} tokens`);
      }
    }
  }

  // Check token_pools structure
  console.log('\n\n=== Token Pools Table Structure ===');
  const poolColumns = await queryAll(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='token_pools'
  `);
  if (poolColumns.length > 0) {
    console.log(poolColumns[0].sql);
  } else {
    console.log('❌ token_pools table not found!');
  }
  
  process.exit(0);
}

debugPositions().catch(console.error);

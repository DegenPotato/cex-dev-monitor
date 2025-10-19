/**
 * Migration Script: Populate migrated_pool_address column from metadata JSON
 * 
 * This script extracts migratedDestinationPoolAddress from the metadata JSON column
 * and updates the separate migrated_pool_address column for all existing tokens.
 */

import { queryAll, execute } from '../database/helpers.js';
import { saveDatabase } from '../database/connection.js';

async function migratePoolAddresses() {
  console.log('🔄 Starting migration: Populate migrated_pool_address from metadata...\n');
  
  try {
    // Get all tokens with metadata
    const tokens = await queryAll<any>(`
      SELECT id, mint_address, symbol, metadata, migrated_pool_address
      FROM token_mints
      WHERE metadata IS NOT NULL
    `);
    
    console.log(`📊 Found ${tokens.length} tokens with metadata\n`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const token of tokens) {
      try {
        const metadata = JSON.parse(token.metadata);
        const migratedPoolAddress = metadata?.geckoTerminal?.migratedDestinationPoolAddress;
        
        // Only update if:
        // 1. GeckoTerminal has a migrated pool address
        // 2. Current column is NULL (don't overwrite existing values)
        if (migratedPoolAddress && !token.migrated_pool_address) {
          await execute(`
            UPDATE token_mints 
            SET migrated_pool_address = ?
            WHERE id = ?
          `, [migratedPoolAddress, token.id]);
          
          console.log(`✅ Updated ${token.symbol} (${token.mint_address.slice(0, 8)}...)`);
          console.log(`   Migrated pool: ${migratedPoolAddress.slice(0, 8)}...`);
          updated++;
        } else if (token.migrated_pool_address) {
          // Already has a value
          skipped++;
        } else {
          // No migrated pool in metadata (not graduated yet)
          skipped++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${token.symbol}:`, error.message);
        errors++;
      }
    }
    
    // Save database changes
    saveDatabase();
    
    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total: ${tokens.length}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
migratePoolAddresses()
  .then(() => {
    console.log('\n✅ Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

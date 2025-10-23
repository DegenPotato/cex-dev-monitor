/**
 * Verify Telegram Data Deletion
 * 
 * This script checks all Telegram tables to verify that
 * deletion is working correctly for a user.
 */

import { queryOne } from '../database/helpers.js';

async function verifyTelegramDeletion(userId: number) {
  console.log(`\n🔍 Verifying Telegram data deletion for user ${userId}\n`);
  console.log('=' . repeat(80));
  
  // All Telegram tables that should have user_id
  const telegramTables = [
    // Core data tables
    'telegram_detected_contracts',
    'telegram_detections',
    'telegram_message_history',
    'telegram_chat_metadata',
    'telegram_monitored_chats',
    'telegram_chat_fetch_status',
    
    // Forwarding tables
    'telegram_forwarding_rules',
    'telegram_forwarding_history',
    'telegram_forward_destinations',
    'telegram_available_forward_targets',
    
    // Chat configuration
    'telegram_chat_configs',
    
    // Caller/KOL tracking
    'telegram_token_calls',
    'telegram_callers',
    'telegram_channel_stats',
    
    // Account tables
    'telegram_bot_accounts',
    'telegram_user_accounts'
  ];
  
  let totalRows = 0;
  let tablesWithData: string[] = [];
  
  for (const table of telegramTables) {
    try {
      const result = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table} WHERE user_id = ?`,
        [userId]
      );
      
      const count = result?.count || 0;
      totalRows += count;
      
      if (count > 0) {
        tablesWithData.push(table);
        console.log(`⚠️  ${table}: ${count} rows remaining`);
      } else {
        console.log(`✓ ${table}: clean`);
      }
    } catch (error: any) {
      console.log(`⚠️  ${table}: ${error.message}`);
    }
  }
  
  console.log('=' . repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   Total rows remaining: ${totalRows}`);
  console.log(`   Tables with data: ${tablesWithData.length}`);
  
  if (tablesWithData.length > 0) {
    console.log(`\n⚠️  WARNING: The following tables still have data:`);
    tablesWithData.forEach(table => console.log(`   - ${table}`));
    console.log(`\n   This indicates the deletion is incomplete!`);
  } else {
    console.log(`\n✅ SUCCESS: All Telegram data has been cleaned!`);
  }
  
  // Also check telegram_entity_cache (shared table, no user_id)
  console.log(`\n📝 Note: telegram_entity_cache is a shared cache and is not user-specific.\n`);
  
  process.exit(tablesWithData.length > 0 ? 1 : 0);
}

// Get user ID from command line
const userId = process.argv[2] ? parseInt(process.argv[2]) : 1;

if (isNaN(userId)) {
  console.error('Usage: tsx verify-telegram-deletion.ts <user_id>');
  process.exit(1);
}

verifyTelegramDeletion(userId).catch(console.error);

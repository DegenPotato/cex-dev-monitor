# Telegram Data Deletion - Complete Reference

## Overview
When a user deletes their Telegram data, ALL user-specific data is removed from 18+ tables.

## Deletion Scope

### ✅ Always Deleted (Data Tables)
These tables are ALWAYS deleted when user requests data deletion:

1. **Core Data Tables**
   - `telegram_detected_contracts` - Contract addresses detected in messages
   - `telegram_detections` - Comprehensive detection logs
   - `telegram_message_history` - Chat message history
   - `telegram_chat_metadata` - Chat metadata (members, activity, etc.)
   - `telegram_monitored_chats` - List of monitored chats
   - `telegram_chat_fetch_status` - Message fetch tracking

2. **Forwarding Tables**
   - `telegram_forwarding_rules` - Auto-forwarding rules
   - `telegram_forwarding_history` - History of forwarded messages
   - `telegram_forward_destinations` - Configured forward targets
   - `telegram_available_forward_targets` - Cache of available targets

3. **Configuration Tables**
   - `telegram_chat_configs` - Per-chat configuration (duplicate handling, etc.)

4. **Caller/KOL Tracking**
   - `telegram_token_calls` - Individual token calls/shills
   - `telegram_callers` - Caller/KOL profiles
   - `telegram_channel_stats` - Channel performance statistics

### ⚙️ Optionally Deleted (Account Tables)
These are deleted ONLY if `includeAccounts=true`:

- `telegram_bot_accounts` - Bot account credentials
- `telegram_user_accounts` - User account sessions

### 🔒 Never Deleted (Shared Resources)
These tables are shared across users and NOT deleted:

- `telegram_entity_cache` - Shared entity access hash cache (no user_id)

## API Usage

### Delete All Data (Keep Accounts)
```bash
DELETE /api/telegram/delete-all-data
```

### Delete All Data + Accounts
```bash
DELETE /api/telegram/delete-all-data?includeAccounts=true
```

## Response Format
```json
{
  "success": true,
  "message": "All Telegram data has been deleted (245 total rows, accounts kept)",
  "deletedTables": ["telegram_detected_contracts", ...],
  "deletionResults": [
    { "table": "telegram_detected_contracts", "deleted": 15 },
    { "table": "telegram_message_history", "deleted": 230 },
    ...
  ],
  "totalRowsDeleted": 245,
  "accountsDeleted": false
}
```

## Verification

Run the verification script to check deletion:
```bash
tsx src/backend/scripts/verify-telegram-deletion.ts <user_id>
```

This will show:
- ✓ Clean tables (0 rows)
- ⚠️ Tables with remaining data
- Total row count per table
- Summary of deletion completeness

## Database Constraints

Some tables have foreign keys:
- `telegram_token_calls` → `telegram_callers` (caller_id)

The deletion order is designed to handle these constraints by deleting child records first.

## Implementation Details

File: `src/backend/services/TelegramUserService.ts`  
Method: `deleteAllTelegramData(userId, includeAccounts)`

The deletion process:
1. Disconnects active Telegram client (if includeAccounts=true)
2. Deletes from 18 data tables in order
3. Optionally deletes from 2 account tables
4. Returns detailed results including per-table row counts
5. Handles errors gracefully (continues even if table doesn't exist)

## Safety Features

1. **User Isolation**: All deletions are scoped to `user_id`
2. **Graceful Failures**: Missing tables don't stop deletion
3. **Detailed Logging**: Each table deletion is logged with row count
4. **Result Tracking**: Returns comprehensive deletion report
5. **Account Protection**: Accounts only deleted if explicitly requested

## Testing

Before deploying to production, verify deletion:

1. Create test data in all tables for a test user
2. Run deletion: `DELETE /api/telegram/delete-all-data?includeAccounts=true`
3. Run verification: `tsx verify-telegram-deletion.ts <test_user_id>`
4. Confirm: `✅ SUCCESS: All Telegram data has been cleaned!`

## Migration History

Tables added over time via migrations:
- 007: forwarding_rules, forwarding_history
- 009: message_history, chat_fetch_status
- 011: chat_metadata
- 013: detections, chat_configs
- 014: forward_destinations, available_forward_targets
- 018: callers, token_calls, channel_stats
- 023: entity_cache (shared, not user-specific)

All tables with `user_id` are now included in deletion.

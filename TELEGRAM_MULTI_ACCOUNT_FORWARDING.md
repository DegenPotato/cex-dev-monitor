# Telegram Multi-Account & Auto-Forwarding System

## Overview
Enhanced Telegram monitoring with multi-account support and intelligent auto-forwarding with rate limiting.

## Features

### 1. Multi-Account Management
- ✅ Support for multiple Telegram accounts (up to 3 for free users)
- ✅ Each chat now tracks which Telegram account it belongs to
- ✅ Separate management/deletion per account
- ✅ Supports both user accounts and bot accounts

### 2. Auto-Forwarding System
- ✅ Create forwarding rules to automatically forward messages
- ✅ Forward from one chat to multiple target chats
- ✅ Choose which Telegram account to use for forwarding
- ✅ Comprehensive filtering options
- ✅ Built-in rate limiting to prevent FloodWait
- ✅ Full API call tracking with ApiProviderTracker

## Database Schema

### New Tables

#### `telegram_forwarding_rules`
Stores auto-forwarding configurations.

**Key Fields:**
- `source_chat_id` - Chat to monitor
- `source_account_id` - Account to listen with
- `target_chat_ids` - JSON array of chats to forward to
- `target_account_id` - Account to use for forwarding
- `filter_user_ids` - Filter by specific users (optional)
- `filter_keywords` - Filter by keywords (optional)
- `filter_media_types` - Filter by media type (optional)
- `forward_mode` - 'copy' or 'forward' (with attribution)
- `max_forwards_per_minute` - Rate limit (default: 20)
- `max_forwards_per_hour` - Rate limit (default: 200)

#### `telegram_forwarding_history`
Tracks all forwarding attempts for analytics and debugging.

**Key Fields:**
- `rule_id` - Which rule triggered this
- `source_message_id` - Original message
- `target_message_id` - Forwarded message ID
- `status` - 'success', 'failed', or 'rate_limited'
- `response_time_ms` - Performance tracking
- `error_message` - For failed attempts

### Updated Tables

#### `telegram_monitored_chats`
Now includes `telegram_account_id` to track which account owns each chat.

## API Endpoints

### Forwarding Rules Management

#### `GET /api/telegram/forwarding/rules`
Get all forwarding rules for the authenticated user.

**Response:**
```json
{
  "success": true,
  "rules": [
    {
      "id": 1,
      "ruleName": "Alpha Calls Forwarder",
      "sourceChatId": "123456",
      "sourceAccountId": 987654321,
      "targetChatIds": ["789012", "345678"],
      "targetAccountId": 987654321,
      "filterKeywords": ["CA:", "Contract"],
      "forwardMode": "copy",
      "maxForwardsPerMinute": 20,
      "isActive": true,
      "totalForwards": 145,
      "failedForwards": 3
    }
  ]
}
```

#### `POST /api/telegram/forwarding/rules`
Create a new forwarding rule.

**Request Body:**
```json
{
  "ruleName": "Alpha Calls Forwarder",
  "sourceChatId": "123456",
  "sourceAccountId": 987654321,
  "targetChatIds": ["789012", "345678"],
  "targetAccountId": 987654321,
  "filterKeywords": ["CA:", "Contract"],
  "filterUserIds": null,
  "filterMediaTypes": null,
  "includeSenderInfo": true,
  "forwardMode": "copy",
  "delaySeconds": 0,
  "maxForwardsPerMinute": 20,
  "maxForwardsPerHour": 200,
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "ruleId": 1
}
```

#### `DELETE /api/telegram/forwarding/rules/:ruleId`
Delete a forwarding rule.

#### `PATCH /api/telegram/forwarding/rules/:ruleId/toggle`
Toggle a rule on/off.

**Request Body:**
```json
{
  "isActive": false
}
```

#### `GET /api/telegram/forwarding/stats`
Get forwarding statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalRules": 5,
    "activeRules": 3,
    "totalForwards": 1247,
    "failedForwards": 12,
    "successRate": 99.04
  }
}
```

## Rate Limiting

### Per-Rule Limits
- **Per Minute:** Configurable (default: 20 forwards/min)
- **Per Hour:** Configurable (default: 200 forwards/hour)

### Global Tracking
- All forwarding operations tracked with `apiProviderTracker`
- Real-time visibility in dashboard
- FloodWait errors automatically trigger retries
- Failed operations logged for debugging

### How It Works
1. Before each forward attempt, check rate limits
2. If limit exceeded, skip and log as `rate_limited`
3. Track all attempts in memory (last hour window)
4. Cleanup old tracking data automatically

## Forward Modes

### 'copy' Mode (Default)
- Copies message content without attribution
- Optionally includes sender info in text
- Best for stealth forwarding

### 'forward' Mode
- Uses Telegram's native forward
- Shows "Forwarded from" attribution
- Preserves original message metadata

## Filtering Options

### User ID Filter
```json
{
  "filterUserIds": [123456, 789012]
}
```
Only forward messages from these user IDs.

### Keyword Filter
```json
{
  "filterKeywords": ["CA:", "pump", "contract"]
}
```
Only forward messages containing these keywords (case-insensitive).

### Media Type Filter
```json
{
  "filterMediaTypes": ["MessageMediaPhoto", "MessageMediaDocument"]
}
```
Only forward messages with specific media types.

## Usage Example

### 1. Create a Forwarding Rule
```javascript
const rule = {
  ruleName: "Alpha Signals",
  sourceChatId: "1234567890",  // Monitor this chat
  sourceAccountId: 987654321,   // Using this Telegram account
  targetChatIds: ["111111", "222222"],  // Forward to these chats
  targetAccountId: 987654321,   // Using this account to forward
  filterKeywords: ["CA:", "$"],  // Only messages with these keywords
  forwardMode: "copy",
  maxForwardsPerMinute: 15,
  isActive: true
};

fetch('/api/telegram/forwarding/rules', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(rule)
});
```

### 2. Integration with Message Monitoring

The forwarding service integrates with `TelegramClientService`. When a new message arrives:

```typescript
// In your message handler
telegramForwardingService.forwardMessage(
  chatId,
  accountId,
  {
    id: message.id,
    senderId: message.senderId,
    senderUsername: message.senderUsername,
    text: message.text,
    mediaType: message.media?.className
  },
  async (accountId) => {
    // Provide function to get Telegram client for given account
    return await telegramClientService.getClient(accountId);
  }
);
```

## Migration Instructions

### 1. Run Database Migration
```bash
cd src/backend/database/migrations
node run-migration.js 007_telegram_multi_account_forwarding.sql
```

### 2. Build & Deploy
```bash
npm run build:backend
pm2 restart cex-monitor
```

### 3. Verify
Check that:
- ✅ `telegram_monitored_chats` has `telegram_account_id` column
- ✅ `telegram_forwarding_rules` table exists
- ✅ `telegram_forwarding_history` table exists
- ✅ API endpoints respond at `/api/telegram/forwarding/*`

## Monitoring & Analytics

### Real-Time Dashboard
All forwarding operations appear in your API provider tracker:
- Provider: `telegram`
- Endpoints: `forwardMessages`, `sendMessage`
- Track: Success rate, response times, rate limits

### Forwarding History
Query the `telegram_forwarding_history` table for:
- Which messages were forwarded
- Success/failure status
- Response times
- Error messages for debugging

### Example Query
```sql
SELECT 
  rule_id,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  AVG(response_time_ms) as avg_response_time
FROM telegram_forwarding_history
WHERE forwarded_at > unixepoch('now', '-24 hours')
GROUP BY rule_id;
```

## Best Practices

### Rate Limiting
1. Start conservative (10-15 forwards/min)
2. Monitor for FloodWait errors
3. Adjust limits based on account age/reputation
4. Older accounts = higher limits

### Filtering
1. Use keyword filters to reduce noise
2. Combine multiple filters for precision
3. Test rules before enabling

### Account Management
1. Use dedicated accounts for forwarding (not main account)
2. Rotate between accounts if forwarding high volumes
3. Monitor FloodWait patterns per account

### Stealth Forwarding
1. Use 'copy' mode instead of 'forward'
2. Add delays between forwards (`delaySeconds`)
3. Lower rate limits for sensitive operations
4. Disable `includeSenderInfo` for complete anonymity

## Troubleshooting

### FloodWait Errors
- **Cause:** Exceeded Telegram's rate limits
- **Solution:** Reduce `maxForwardsPerMinute` or `maxForwardsPerHour`
- **Auto-retry:** Service automatically waits and retries

### Rule Not Triggering
- Check `isActive` status
- Verify filters aren't too restrictive
- Check `telegram_forwarding_history` for clues

### Failed Forwards
- Check target chat permissions
- Verify target account has access to target chats
- Review error messages in history table

## Future Enhancements

- [ ] Media forwarding (photos, videos, files)
- [ ] Schedule-based forwarding (time windows)
- [ ] Webhook notifications on forward
- [ ] AI-powered message filtering
- [ ] Cross-account load balancing
- [ ] Telegram Bot API integration

## Security Notes

- All session data encrypted at rest
- Rate limits prevent abuse
- Per-user isolation (can't access other users' rules)
- Forwarding history auto-cleanup (7 days retention)
- GDPR compliant (delete on user deletion)

---

**Created:** October 2025  
**Version:** 1.0.0  
**Status:** Production Ready 🚀

# Telegram Topic-Level Monitoring - TODO

## 📊 Status: Foundation Complete, Full Implementation Pending

### ✅ What's Done
- [x] Basic topic ID detection from forum messages
- [x] Topic ID extraction via `message.replyTo.forumTopic`
- [x] Topic logging in console output
- [x] Topic ID passed through event system (`message_cached`)
- [x] Database migration prepared (028_telegram_topic_monitoring.sql)

### ❌ What's Pending

#### Phase 1: Database & Backend (2-3 hours)
- [ ] Run migration 028 to add topic fields to database
- [ ] Update `telegram_monitored_chats` to store `monitored_topic_ids` (JSON array)
- [ ] Update `telegram_monitored_chats` to store `topic_user_filters` (JSON object)
- [ ] Add topic fields to `telegram_message_history` and `telegram_detected_contracts`
- [ ] Implement topic filtering in message handler
- [ ] Add topic-specific user filtering logic

#### Phase 2: API Endpoints (1-2 hours)
- [ ] **GET /api/telegram/chats/:chatId/topics** - List available topics in a forum
  - Returns: `[{ topicId, topicTitle, messageCount, lastActivity }]`
- [ ] **POST /api/telegram/monitored-chats/:chatId/topics** - Update monitored topics
  - Body: `{ monitoredTopicIds: ["1", "42", "69"] }`
- [ ] **POST /api/telegram/monitored-chats/:chatId/topic-filters** - Set topic-specific user filters
  - Body: `{ topicUserFilters: { "42": ["userId1", "userId2"] } }`

#### Phase 3: Frontend UI (3-4 hours)
- [ ] Add "Topic Monitoring" section to chat configuration modal
- [ ] Display available topics with checkboxes
- [ ] Show topic titles and metadata (message count, last activity)
- [ ] Add per-topic user filter configuration
- [ ] Visual indicator showing which topics are monitored
- [ ] Topic selection dropdown in chat settings

#### Phase 4: Analytics & Insights (2-3 hours)
- [ ] Create `telegram_topic_stats` view for analytics
- [ ] Track contract detection rate per topic
- [ ] Display topic performance metrics
- [ ] Show "hot topics" with recent activity
- [ ] Topic-based filtering in Intelligence Platform

## 🎯 Implementation Details

### Backend Logic Flow
```typescript
// In message handler:
1. Extract topicId from message.replyTo
2. Check if chat has topic filters configured
3. If monitoredTopicIds exists and topicId not in list -> skip
4. Check if topic has specific user filters
5. Apply topic-specific user filter if exists
6. Process contract detection normally
7. Store topic info with detection
```

### Database Schema (Already Prepared)
```sql
-- telegram_monitored_chats
ALTER TABLE telegram_monitored_chats ADD COLUMN monitored_topic_ids TEXT DEFAULT NULL;
ALTER TABLE telegram_monitored_chats ADD COLUMN topic_user_filters TEXT DEFAULT NULL;

-- telegram_message_history
ALTER TABLE telegram_message_history ADD COLUMN topic_id TEXT DEFAULT NULL;
ALTER TABLE telegram_message_history ADD COLUMN topic_title TEXT DEFAULT NULL;

-- telegram_detected_contracts
ALTER TABLE telegram_detected_contracts ADD COLUMN topic_id TEXT DEFAULT NULL;
ALTER TABLE telegram_detected_contracts ADD COLUMN topic_title TEXT DEFAULT NULL;
```

### Example Configuration
```json
{
  "chatId": "-1001234567890",
  "monitoredTopicIds": ["42", "69", "420"],  // Only these topics
  "topicUserFilters": {
    "42": ["123456", "789012"],  // Alpha callers in topic 42
    "69": [],                     // All users in topic 69
    "420": ["345678"]            // Specific caller in topic 420
  }
}
```

## 🔄 API Design

### List Topics in Forum
```bash
GET /api/telegram/chats/:chatId/topics

Response:
{
  "success": true,
  "topics": [
    {
      "topicId": "1",
      "topicTitle": "General",
      "messageCount": 1523,
      "uniqueSenders": 45,
      "lastActivityTime": 1729668000,
      "contractsDetected": 12
    },
    {
      "topicId": "42",
      "topicTitle": "Alpha Calls",
      "messageCount": 234,
      "uniqueSenders": 8,
      "lastActivityTime": 1729665234,
      "contractsDetected": 34
    }
  ]
}
```

### Configure Topic Monitoring
```bash
POST /api/telegram/monitored-chats/:chatId/configure
{
  "monitoredTopicIds": ["42", "69"],
  "topicUserFilters": {
    "42": ["123456", "789012"]
  }
}
```

## 📱 Frontend UI Mockup

```
┌─────────────────────────────────────┐
│ Chat Configuration: Crypto Alpha   │
├─────────────────────────────────────┤
│ Topic Monitoring (Forum Group)     │
│                                     │
│ ☑️ Monitor All Topics (default)    │
│ ☐ Monitor Specific Topics:         │
│                                     │
│   ☐ General (1,523 messages)       │
│   ☑️ Alpha Calls (234 messages)    │
│       Users: @whale1, @insider2    │
│   ☑️ Announcements (89 messages)   │
│       Users: (All)                 │
│   ☐ Off-topic (2,341 messages)     │
│                                     │
│ [Refresh Topics]  [Save]           │
└─────────────────────────────────────┘
```

## 🎯 Use Cases

### Use Case 1: Alpha Callers Topic
**Scenario**: Forum has an "Alpha Calls" topic where trusted callers post
**Configuration**:
- Monitor only topic ID "42"
- Filter to specific user IDs of verified callers
**Result**: Only process contracts from trusted users in alpha topic

### Use Case 2: Multi-Topic Strategy
**Scenario**: Monitor announcements + alpha calls, ignore general chat
**Configuration**:
- Monitor topics: ["42", "69"]
- No user filters (process all users in these topics)
**Result**: Reduced noise, focused on important topics

### Use Case 3: Topic-Specific Targeting
**Scenario**: Different user filters per topic
**Configuration**:
- Topic 42: Only @whale1, @insider2
- Topic 69: All users
- Topic 420: Only @mod1
**Result**: Granular control over what gets processed

## 📈 Benefits

1. **Noise Reduction** - Ignore off-topic discussions
2. **Targeted Monitoring** - Focus on high-value topics
3. **Flexible Filtering** - Different rules per topic
4. **Better Analytics** - Track performance by topic
5. **Scalability** - Handle large forums efficiently

## 🚀 Quick Start (When Implemented)

1. Run migration: `node run-all-migrations.mjs`
2. Open chat config modal
3. Click "Configure Topics"
4. Select topics to monitor
5. Set user filters if needed
6. Save and monitor!

## 📊 Timeline Estimate

- **Phase 1 (Backend)**: 2-3 hours
- **Phase 2 (API)**: 1-2 hours  
- **Phase 3 (Frontend)**: 3-4 hours
- **Phase 4 (Analytics)**: 2-3 hours

**Total**: 8-12 hours for full implementation

---

**Current Status**: 🟡 Foundation complete, awaiting full implementation
**Priority**: Medium (valuable but not critical)
**Complexity**: Medium (mostly UI work, backend is straightforward)

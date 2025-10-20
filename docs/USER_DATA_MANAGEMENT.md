# User Data Management & GDPR Compliance

Complete user data management system allowing users to view, export, and delete their personal data.

## Features

### 📊 Data Summary
View a complete overview of your stored data:
- Telegram user accounts
- Telegram bot accounts  
- Monitored chats
- Detected contracts
- Last activity timestamp

### 📥 Data Export (GDPR Right to Access)
Export all your data in JSON format:
- Complete backup of all your records
- Downloadable JSON file
- Includes all database tables related to your user ID
- Timestamped export for reference

### 🗑️ Selective Data Deletion
Delete specific data types individually:
- **Telegram User Account** - Authentication & sessions
- **Telegram Bot Account** - Bot tokens & configuration
- **Monitored Chats** - All chat configurations
- **Detected Contracts** - Contract detection history

### ☢️ Complete Data Deletion (Nuclear Option)
Delete ALL your data with safety confirmation:
- Requires typing `DELETE_ALL_MY_DATA` to confirm
- Permanently removes all records across all tables
- Cannot be undone
- Returns summary of deleted data

## API Endpoints

### Get Data Summary
```
GET /api/user/data-summary
Authentication: Required (Cookie-based)
```

**Response:**
```json
{
  "userId": 123,
  "summary": {
    "telegramUserAccounts": 1,
    "telegramBotAccounts": 1,
    "monitoredChats": 5,
    "detectedContracts": 42,
    "lastActivity": 1729417200
  }
}
```

### Delete Specific Data Type
```
DELETE /api/user/data/:type
Authentication: Required (Cookie-based)
```

**Parameters:**
- `type`: One of `telegram-user-account`, `telegram-bot-account`, `monitored-chats`, `detected-contracts`

**Response:**
```json
{
  "success": true,
  "dataType": "monitored-chats",
  "deletedCount": 5,
  "message": "Successfully deleted 5 monitored-chats record(s)"
}
```

### Delete All Data
```
DELETE /api/user/data/all
Authentication: Required (Cookie-based)
Body: { "confirmCode": "DELETE_ALL_MY_DATA" }
```

**Response:**
```json
{
  "success": true,
  "message": "All your data has been permanently deleted",
  "deletedData": {
    "telegramAccounts": 1,
    "telegramBots": 1,
    "monitoredChats": 5,
    "detectedContracts": 42
  },
  "totalRecords": 49
}
```

### Export All Data
```
GET /api/user/data/export
Authentication: Required (Cookie-based)
```

**Response:**
- Content-Type: `application/json`
- Downloads JSON file with complete data export
- Filename: `user-data-{userId}-{timestamp}.json`

**Export Format:**
```json
{
  "exportedAt": "2025-10-20T12:30:00.000Z",
  "userId": 123,
  "data": {
    "telegramUserAccounts": [...],
    "telegramBotAccounts": [...],
    "monitoredChats": [...],
    "detectedContracts": [...]
  }
}
```

## UI Component

### UserDataManagement.tsx

React component with complete UI for data management:

**Features:**
- Real-time data summary display
- One-click data export
- Individual delete buttons per data type
- Nuclear delete option with confirmation
- Success/error message display
- Loading states
- Disabled state when not authenticated

**Usage:**
```tsx
import { UserDataManagement } from '../components/UserDataManagement';

function SettingsPage() {
  return (
    <div>
      <UserDataManagement />
    </div>
  );
}
```

## Security

### Authentication
- All endpoints protected by `SecureAuthService.authenticateRoute`
- Cookie-based authentication with JWT
- User ID extracted from authenticated request
- No user can access or delete another user's data

### Safety Mechanisms

**Selective Deletion:**
- Confirmation dialog before deletion
- "Are you sure?" prompt with data type name
- Cannot be undone warning

**Complete Deletion:**
- Two-step confirmation process
- Must type exact confirmation text: `DELETE_ALL_MY_DATA`
- Real-time validation of confirmation text
- Cancel button available at all times

### Data Isolation
- All queries filtered by authenticated `user_id`
- SQL queries use parameterized statements (SQL injection protection)
- Foreign key cascade deletes handled at database level
- No orphaned records left behind

## Database Tables Affected

### Telegram User Accounts
```sql
DELETE FROM telegram_user_accounts WHERE user_id = ?
```
- Removes authentication credentials
- Clears session strings
- Deletes profile data

### Telegram Bot Accounts  
```sql
DELETE FROM telegram_bot_accounts WHERE user_id = ?
```
- Removes bot tokens
- Clears bot configurations

### Monitored Chats
```sql
DELETE FROM telegram_monitored_chats WHERE user_id = ?
```
- Removes chat configurations
- Clears monitored user lists

### Detected Contracts
```sql
DELETE FROM telegram_detected_contracts WHERE user_id = ?
```
- Removes all contract detections
- Clears detection history

## GDPR Compliance

### Right to Access (Article 15)
✅ Users can view all their data via data summary
✅ Users can export complete data in machine-readable format (JSON)

### Right to Erasure (Article 17 - "Right to be Forgotten")
✅ Users can delete specific data types
✅ Users can delete all their data completely
✅ Data deleted permanently without recovery

### Data Portability (Article 20)
✅ Export functionality provides data in JSON format
✅ Structured, commonly used format
✅ Can be transferred to another service

### Transparency (Article 12)
✅ Clear UI showing what data is stored
✅ Counts of each data type
✅ Last activity timestamp

## Error Handling

### Client-Side
- Loading states during API calls
- Success/error message display
- Disabled buttons during operations
- User-friendly error messages

### Server-Side
- Try-catch blocks on all operations
- SQL transaction safety
- Detailed error logging
- Generic error messages to client (no sensitive info)

## Logging

All deletion operations are logged:
```
✅ [User Data] User 123 deleted 5 monitored-chats record(s)
🗑️  [User Data] User 123 deleted ALL data: {
  telegramAccounts: 1,
  telegramBots: 1,
  monitoredChats: 5,
  detectedContracts: 42
}
```

## Testing

### Manual Testing Checklist
- [ ] Data summary loads correctly
- [ ] Export downloads valid JSON
- [ ] Selective delete removes correct data
- [ ] Selective delete shows confirmation
- [ ] Nuclear delete requires exact confirmation text
- [ ] Nuclear delete prevents typos
- [ ] All operations respect user authentication
- [ ] Cannot access other users' data
- [ ] Error messages display properly
- [ ] Loading states work correctly

### API Testing
```bash
# Get summary
curl -X GET https://api.sniff.agency/api/user/data-summary \
  --cookie "auth_token=YOUR_TOKEN"

# Export data
curl -X GET https://api.sniff.agency/api/user/data/export \
  --cookie "auth_token=YOUR_TOKEN" \
  -o export.json

# Delete specific type
curl -X DELETE https://api.sniff.agency/api/user/data/monitored-chats \
  --cookie "auth_token=YOUR_TOKEN"

# Delete all data
curl -X DELETE https://api.sniff.agency/api/user/data/all \
  --cookie "auth_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirmCode":"DELETE_ALL_MY_DATA"}'
```

## Future Enhancements

- [ ] Email notification on data deletion
- [ ] Scheduled data exports (monthly backup)
- [ ] Data retention policies
- [ ] Anonymous data retention for analytics (opt-in)
- [ ] Audit log of all data operations
- [ ] Soft delete with recovery period (30 days)
- [ ] Data archival before deletion
- [ ] Multi-factor authentication for deletion

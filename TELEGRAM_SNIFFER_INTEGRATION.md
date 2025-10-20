# Telegram Sniffer Integration

Complete integration of Telegram monitoring capabilities into the Sniff Agency dashboard for detecting and tracking contract addresses in Telegram chats.

## Overview

The Telegram Sniffer allows you to:
- Configure both **User Account** (via Telegram API) and **Bot Account** (via Bot API)
- Fetch and monitor your Telegram chats
- Detect contract addresses (including obfuscated and split addresses)
- Track detections with sender information and timestamps
- Forward detected contracts to designated chats

## Features

### 1. Dual Account Configuration

#### User Account (Telethon/TDLib)
- **Purpose**: Full chat access, reading messages, fetching chat lists
- **Requirements**:
  - API ID (get from https://my.telegram.org/apps)
  - API Hash (from same source)
  - Phone Number (your Telegram account)
- **Capabilities**:
  - Access to all your chats/channels/groups
  - Read message history
  - Monitor real-time messages
  - Filter by specific users

#### Bot Account (Bot API)
- **Purpose**: Sending notifications, forwarding messages
- **Requirements**:
  - Bot Token (get from @BotFather)
- **Capabilities**:
  - Send messages to chats where bot is member
  - Forward detected contracts
  - Notification delivery

### 2. Chat Monitoring

The system tracks:
- **Chat ID**: Unique identifier
- **Chat Name**: Display name
- **Chat Type**: group, supergroup, channel, private
- **Active Status**: Enable/disable monitoring per chat
- **Monitored User IDs**: Filter messages from specific users
- **Monitored Keywords**: Track specific keywords/patterns
- **Forward Destination**: Where to send detected contracts

### 3. Contract Detection

Supports three detection types:

#### Standard Detection
- Normal Solana contract addresses (Base58, 32-44 chars)
- Example: `7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr`

#### Obfuscated Detection
- Addresses with special characters inserted
- Example: `7GCihgDB8-fe6KNjn_2MYtkzZcRjQy.3t9GHdC8uHYmW2hr`
- System automatically removes `-`, `_`, `.`, and spaces

#### Split Detection
- Addresses broken into 2-3 fragments across message
- Example: 
  ```
  7GCihgDB8fe6KNjn2MY
  tkzZcRjQy3t9GHdC8uHYmW2hr
  ```
- System intelligently reconstructs the full address

## Architecture

### Frontend Components

**`TelegramSnifferTab.tsx`**
- Main interface with 3 sections:
  1. **Account Settings**: Configure user and bot accounts
  2. **Monitored Chats**: View and manage monitored chats
  3. **Detections**: View detected contracts
- Features:
  - Form validation
  - Secure credential input (password masking)
  - Real-time status indicators
  - Responsive grid layout
  - Glassmorphism design matching Sniff Agency theme

**Dashboard Integration**
- New tab in main navigation: "Telegram Sniffer"
- MessageSquare icon for branding consistency
- Cyan theme matching other tabs

### Backend API

**Endpoints** (`/api/telegram/*`):
```
GET    /status                      - Get account status summary
POST   /user-account                - Save user account credentials
GET    /user-account                - Get user account (masked)
POST   /user-account/verify         - Verify user account
POST   /bot-account                 - Save bot account credentials
GET    /bot-account                 - Get bot account (masked)
POST   /bot-account/verify          - Verify bot connection
POST   /fetch-chats                 - Fetch user's Telegram chats
GET    /monitored-chats             - Get monitored chats
POST   /monitored-chats             - Add/update monitored chat
PATCH  /monitored-chats/:id/toggle  - Toggle chat active status
DELETE /monitored-chats/:id         - Delete monitored chat
GET    /detected-contracts          - Get detected contracts
```

**Authentication**: All endpoints require JWT authentication via `authenticateToken` middleware.

### Database Schema

#### `telegram_user_accounts`
```sql
- id (INTEGER PRIMARY KEY)
- user_id (INTEGER, links to users table)
- api_id (TEXT)
- api_hash (TEXT, encrypted)
- phone_number (TEXT)
- session_string (TEXT, encrypted)
- is_verified (BOOLEAN)
- last_connected_at (INTEGER timestamp)
- created_at, updated_at
```

#### `telegram_bot_accounts`
```sql
- id (INTEGER PRIMARY KEY)
- user_id (INTEGER)
- bot_token (TEXT, encrypted)
- bot_username (TEXT)
- is_verified (BOOLEAN)
- last_connected_at (INTEGER timestamp)
- created_at, updated_at
```

#### `telegram_monitored_chats`
```sql
- id (INTEGER PRIMARY KEY)
- user_id (INTEGER)
- chat_id (TEXT)
- chat_name (TEXT)
- chat_type (TEXT)
- is_active (BOOLEAN)
- forward_to_chat_id (TEXT)
- monitored_user_ids (TEXT, JSON array)
- monitored_keywords (TEXT, JSON array)
- created_at, updated_at
```

#### `telegram_detected_contracts`
```sql
- id (INTEGER PRIMARY KEY)
- user_id (INTEGER)
- chat_id (TEXT)
- message_id (INTEGER)
- sender_id (TEXT)
- sender_username (TEXT)
- contract_address (TEXT)
- detection_type (TEXT: standard/obfuscated/split)
- original_format (TEXT)
- message_text (TEXT)
- forwarded (BOOLEAN)
- detected_at (INTEGER timestamp)
- created_at
```

### Services

**`TelegramUserService.ts`**
- Manages database operations for Telegram data
- Handles encryption/decryption of sensitive credentials
- Uses AES-256-CBC encryption for API hashes, bot tokens, session strings
- Provides deduplication checking for detected contracts
- Supports JSON storage for arrays (user IDs, keywords)

**Encryption**
```typescript
- Algorithm: AES-256-CBC
- Key: From TELEGRAM_ENCRYPTION_KEY env var
- IV: Random 16 bytes per encryption
- Format: iv:encrypted_data (hex)
```

## Setup Instructions

### 1. Database Migration

Run the Telegram integration migration:
```bash
# The migration is in: migrations/004_telegram_integration.sql
# It will be auto-applied on server start or run manually:
node run-db-migration.mjs
```

### 2. Environment Variables

Add to `.env`:
```env
# Telegram encryption key (32+ characters recommended)
TELEGRAM_ENCRYPTION_KEY=your-secure-encryption-key-here-min-32-chars
```

### 3. User Account Setup

1. **Get Telegram API Credentials**:
   - Go to https://my.telegram.org/apps
   - Login with your phone number
   - Create a new application
   - Copy your `api_id` and `api_hash`

2. **Configure in Dashboard**:
   - Navigate to Dashboard → Telegram Sniffer → Account Settings
   - Fill in API ID, API Hash, and Phone Number
   - Click "Save User Account"

3. **Verification** (Python integration required):
   - The current implementation marks accounts as verified
   - Full verification requires Python Telethon integration (see below)

### 4. Bot Account Setup

1. **Create Telegram Bot**:
   - Open Telegram and message @BotFather
   - Send `/newbot` command
   - Follow prompts to create bot
   - Copy the bot token

2. **Configure in Dashboard**:
   - Navigate to Dashboard → Telegram Sniffer → Account Settings
   - Paste bot token
   - Click "Save Bot Account"
   - Click "Verify" to test connection

### 5. Fetch Chats

1. Ensure user account is configured
2. Click "Fetch My Chats" in Monitored Chats section
3. (Requires Python integration to fully function)

## Python Integration (Advanced)

For full functionality, integrate with your existing `sol_monitor_userfilter_forward.py` script:

### Pattern Matching from Python Script

The Python script already implements advanced pattern matching:

```python
# SOL contract patterns
SOL_PATTERN = r'\b[1-9A-HJ-NP-Za-km-z]{32,44}\b'
SOL_PATTERN_WITH_SPECIALS = r'[1-9A-HJ-NP-Za-km-z]{8,}[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,}...'

# Functions to use:
- extract_contracts_from_text(text)  # Returns (cleaned, original, type)
- find_split_contracts(text)         # Handles 2-3 part splits
```

### Integration Options

**Option 1: API Webhook**
```python
# In your Python script, send detections to Node.js API
import requests

def send_detection_to_api(contract_data):
    response = requests.post(
        'http://localhost:3001/api/telegram/detected-contracts',
        headers={'Authorization': f'Bearer {JWT_TOKEN}'},
        json={
            'chatId': contract_data['chat_id'],
            'messageId': contract_data['message_id'],
            'contractAddress': contract_data['address'],
            'detectionType': contract_data['type'],
            'originalFormat': contract_data['original'],
            'messageText': contract_data['text'],
            'senderId': contract_data['sender_id'],
            'senderUsername': contract_data['sender_username']
        }
    )
    return response.json()
```

**Option 2: Direct Database**
```python
import sqlite3

def save_to_database(user_id, contract_data):
    conn = sqlite3.connect('monitor.db')
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO telegram_detected_contracts
        (user_id, chat_id, message_id, contract_address, detection_type, 
         original_format, message_text, sender_id, sender_username, detected_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        contract_data['chat_id'],
        contract_data['message_id'],
        contract_data['address'],
        contract_data['type'],
        contract_data['original'],
        contract_data['text'],
        str(contract_data['sender_id']),
        contract_data['sender_username'],
        int(time.time()),
        int(time.time())
    ))
    conn.commit()
    conn.close()
```

**Option 3: IPC/Message Queue**
- Use Redis pub/sub
- Use RabbitMQ
- Use ZeroMQ
- Python publishes, Node.js subscribes

### Chat Fetching with Telethon

```python
from telethon import TelegramClient
from telethon.tl.functions.messages import GetDialogsRequest
from telethon.tl.types import InputPeerEmpty

async def fetch_user_chats(api_id, api_hash, phone):
    client = TelegramClient('session', api_id, api_hash)
    await client.start(phone=phone)
    
    dialogs = await client.get_dialogs()
    
    chats = []
    for dialog in dialogs:
        chats.append({
            'chat_id': str(dialog.id),
            'chat_name': dialog.name,
            'chat_type': dialog.entity.__class__.__name__,
            'is_group': dialog.is_group,
            'is_channel': dialog.is_channel
        })
    
    return chats
```

## Security Considerations

1. **Credential Storage**
   - All sensitive data encrypted with AES-256-CBC
   - Encryption key stored in environment variables
   - Session strings encrypted before database storage
   - API hashes and bot tokens masked in API responses

2. **Authentication**
   - All endpoints require JWT authentication
   - User-specific data isolation (user_id constraints)
   - No cross-user data access

3. **Production Recommendations**
   - Use strong encryption key (32+ random characters)
   - Store encryption key in secure secret management (AWS Secrets Manager, HashiCorp Vault)
   - Enable SSL/TLS for all API communication
   - Rate limit API endpoints
   - Implement 2FA for dashboard access

## UI/UX Features

### Visual Design
- **Glassmorphism** effects matching Sniff Agency theme
- **Cyan color scheme** (#00ffdd primary)
- **Password masking** for sensitive inputs with toggle
- **Status badges**: Verified (green), Active/Paused indicators
- **Responsive grid** layouts
- **Hover effects** and transitions

### User Experience
- **Three-tab interface**: Settings, Chats, Detections
- **Real-time validation** and error messages
- **Loading states** for async operations
- **Success/error banners** for user feedback
- **Copy-to-clipboard** for addresses
- **External links** to Solscan for contracts
- **Contextual help** with links to setup resources

## Example Credentials

From your Python script (`sol_monitor_userfilter_forward.py`):

```python
api_id = '26373394'
api_hash = '45c5edf0039ffdd8efe7965189b42141'
phone_number = '+66642397038'
```

These values are shown as placeholders in the UI but should be configured with your actual credentials.

## Monitoring Configuration

### Group Targets (from Python script)
```python
GROUP_TARGETS = [-4945112939]  # numeric channel IDs
```

### User Filters
```python
USER_FILTER = [448480473]  # numeric user IDs to monitor
```

### Forward Destinations
```python
FORWARD_TO = [7181780057]  # Where to forward detected contracts
```

All these configurations will be manageable through the UI once chat fetching is integrated.

## Troubleshooting

### "User account not verified"
- Currently, verification is marked automatically
- For full functionality, implement Python Telethon integration
- Bot verification works immediately via Telegram Bot API

### "Failed to fetch chats"
- Requires Python integration with Telethon
- Endpoint returns placeholder message
- Implement webhook or IPC to Python service

### Encryption errors
- Ensure `TELEGRAM_ENCRYPTION_KEY` is set in environment
- Key must be consistent across server restarts
- Changing key will invalidate existing encrypted data

### Database errors
- Run migration: `node run-db-migration.mjs`
- Check database file permissions
- Verify sql.js database helpers are working

## Future Enhancements

1. **Python Service Integration**
   - Full Telethon/TDLib integration
   - Real-time message monitoring
   - Auto-detection background service

2. **Advanced Filtering**
   - Regex pattern support
   - Multi-keyword combinations
   - Time-based filtering

3. **Analytics Dashboard**
   - Detection trends over time
   - Top senders/chats
   - Contract success rates

4. **Notifications**
   - Browser push notifications
   - Email alerts
   - Discord/Slack webhooks

5. **Multi-Account Support**
   - Monitor multiple Telegram accounts
   - Cross-account duplicate detection
   - Unified detection feed

## API Response Examples

### Get Status
```json
{
  "userAccount": {
    "configured": true,
    "verified": true,
    "phoneNumber": "+66642397038",
    "lastConnected": 1698765432
  },
  "botAccount": {
    "configured": true,
    "verified": true,
    "username": "my_sniffer_bot",
    "lastConnected": 1698765432
  },
  "monitoredChatsCount": 5
}
```

### Detected Contract
```json
{
  "id": 123,
  "chatId": "-4945112939",
  "contractAddress": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  "detectionType": "obfuscated",
  "senderUsername": "crypto_whale",
  "detectedAt": 1698765432
}
```

## Conclusion

The Telegram Sniffer integration provides a robust foundation for monitoring Telegram chats and detecting contract addresses. The current implementation handles all UI, database, and API infrastructure, ready for Python service integration to enable full real-time monitoring capabilities.

For immediate use, you can:
1. ✅ Configure accounts
2. ✅ Verify bot connection
3. ✅ Store monitored chat configurations
4. ✅ View detection history

For full automation, integrate with the Python Telethon script using one of the suggested integration methods.

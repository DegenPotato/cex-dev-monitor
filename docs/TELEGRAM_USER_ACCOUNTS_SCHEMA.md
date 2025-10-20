# Telegram User Accounts Database Schema

## Overview
Enhanced `telegram_user_accounts` table that captures comprehensive Telegram user profile data.

## Fields Reference

### Core Identifiers
| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER | Primary key (auto-increment) |
| `user_id` | INTEGER | Links to users table (our internal user ID) |
| `telegram_user_id` | TEXT | Telegram's actual user ID |
| `access_hash` | TEXT | Access hash for API calls |

### Authentication
| Field | Type | Description |
|-------|------|-------------|
| `api_id` | TEXT | Telegram API ID from my.telegram.org |
| `api_hash` | TEXT | Telegram API Hash (encrypted) |
| `phone_number` | TEXT | Phone number used for authentication |
| `phone` | TEXT | Telegram phone number (may differ) |
| `session_string` | TEXT | Encrypted session data for persistence |
| `is_verified` | BOOLEAN | Has completed authentication flow |

### Profile Information
| Field | Type | Description |
|-------|------|-------------|
| `first_name` | TEXT | User's first name |
| `last_name` | TEXT | User's last name |
| `username` | TEXT | Telegram username (@handle) |
| `language_code` | TEXT | User's language preference (e.g., 'en') |
| `about` | TEXT | Bio/About section |

### Profile Photo
| Field | Type | Description |
|-------|------|-------------|
| `photo_id` | TEXT | Profile photo ID |
| `photo_dc_id` | INTEGER | Data center ID where photo is stored |
| `photo_has_video` | BOOLEAN | Has animated profile photo |

### Status & Verification Flags
| Field | Type | Description |
|-------|------|-------------|
| `is_bot` | BOOLEAN | Is this a bot account |
| `is_verified_telegram` | BOOLEAN | Has Telegram blue check mark |
| `is_restricted` | BOOLEAN | Account has restrictions |
| `is_scam` | BOOLEAN | Marked as scam by Telegram |
| `is_fake` | BOOLEAN | Marked as fake by Telegram |
| `is_premium` | BOOLEAN | Has Telegram Premium subscription |
| `is_support` | BOOLEAN | Official Telegram support account |
| `is_self` | BOOLEAN | Is the authenticated user themselves |

### Account Restrictions
| Field | Type | Description |
|-------|------|-------------|
| `restriction_reason` | TEXT | JSON array of restriction reasons |
| `restriction_platform` | TEXT | Platform that applied restriction |
| `restriction_text` | TEXT | Restriction message |

### Online/Activity Status
| Field | Type | Description |
|-------|------|-------------|
| `status_type` | TEXT | Status: online, offline, recently, within_week, within_month, long_ago |
| `status_was_online` | INTEGER | Last seen timestamp (Unix) |
| `status_expires` | INTEGER | When online status expires |

### Bot-Specific Fields
| Field | Type | Description |
|-------|------|-------------|
| `bot_inline_placeholder` | TEXT | Inline bot placeholder text |
| `bot_can_join_groups` | BOOLEAN | Bot can be added to groups |
| `bot_can_read_all_group_messages` | BOOLEAN | Bot can read all messages |
| `bot_is_inline` | BOOLEAN | Bot supports inline queries |
| `bot_info_version` | INTEGER | Bot API version |

### Privacy & Settings
| Field | Type | Description |
|-------|------|-------------|
| `stories_hidden` | BOOLEAN | User has hidden stories |
| `stories_unavailable` | BOOLEAN | Stories feature unavailable |
| `has_contact` | BOOLEAN | User is in your contacts |
| `mutual_contact` | BOOLEAN | Mutual contact |

### Business & Features
| Field | Type | Description |
|-------|------|-------------|
| `emoji_status_document_id` | TEXT | Custom emoji status ID |
| `emoji_status_until` | INTEGER | Emoji status expiry (Unix) |
| `common_chats_count` | INTEGER | Number of common chats |

### Technical Info
| Field | Type | Description |
|-------|------|-------------|
| `dc_id` | INTEGER | Primary datacenter ID (1-5) |
| `profile_fetched_at` | INTEGER | Last profile fetch timestamp |
| `profile_data_raw` | TEXT | Complete raw JSON backup |

### Usage Statistics
| Field | Type | Description |
|-------|------|-------------|
| `total_chats_fetched` | INTEGER | Total chats ever fetched |
| `last_chat_fetch_at` | INTEGER | Last chat fetch timestamp |
| `total_messages_monitored` | INTEGER | Total messages monitored |
| `total_contracts_detected` | INTEGER | Total contracts detected |

### Connection Quality
| Field | Type | Description |
|-------|------|-------------|
| `connection_failures` | INTEGER | Number of connection failures |
| `last_connection_error` | TEXT | Last error message |
| `last_error_at` | INTEGER | Last error timestamp |
| `session_expires_at` | INTEGER | Session expiration estimate |
| `auto_reconnect` | BOOLEAN | Auto-reconnect enabled |

### Timestamps
| Field | Type | Description |
|-------|------|-------------|
| `last_connected_at` | INTEGER | Last successful connection |
| `created_at` | INTEGER | Account creation timestamp |
| `updated_at` | INTEGER | Last update timestamp |

## Data Collection Points

### On Authentication (verifyCode/verify2FA)
- Complete user profile via `getMe()`
- Full user details via `users.GetFullUser()`
- Session string encrypted and stored
- All profile fields populated

### On Session Restore (Server Restart)
- Session validated with `getMe()`
- Profile data refreshed
- Connection timestamp updated

### Profile Data Raw (JSON Backup)
The `profile_data_raw` field stores a complete JSON backup including:
```json
{
  "me": {
    "id": "user_id",
    "firstName": "...",
    "lastName": "...",
    "username": "...",
    "phone": "...",
    "bot": false,
    "verified": true,
    "restricted": false,
    "scam": false,
    "fake": false,
    "premium": true,
    "support": false,
    "self": true,
    "langCode": "en",
    "photo": { ... },
    "status": { ... },
    "emojiStatus": { ... },
    "storiesHidden": false,
    "storiesUnavailable": false,
    "contact": false,
    "mutualContact": false
  },
  "fullUser": {
    "about": "...",
    "commonChatsCount": 42,
    "botInfo": { ... }
  },
  "fetchedAt": 1234567890
}
```

## Indexes
- `idx_telegram_user_accounts_user_id` - Fast lookup by our user ID
- `idx_telegram_user_accounts_telegram_user_id` - Fast lookup by Telegram ID
- `idx_telegram_user_accounts_username` - Username searches
- `idx_telegram_user_accounts_is_verified` - Verified accounts
- `idx_telegram_user_accounts_status_type` - Status filtering
- `idx_telegram_user_accounts_last_connected` - Connection history

## Migration
Run migration: `node run-enhance-telegram-migration.mjs`

## Deployment
```bash
ssh -i "C:\Users\User\.ssh\id_ed25519_new" root@139.59.237.215 "cd /var/www/cex-monitor && pm2 stop cex-monitor && git pull && node run-enhance-telegram-migration.mjs && pm2 start cex-monitor"
```

## Future Enhancements
- Profile photo download and storage
- Status change tracking over time
- Online/offline activity analytics
- Premium feature usage tracking
- Story interaction tracking

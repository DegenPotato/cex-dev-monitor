# API Endpoints

## Base URL
```
http://localhost:3001
```

---

## Stats & Monitoring

### Get Stats
**GET** `/api/stats`

Returns system statistics and currently monitored wallets.

**Response:**
```json
{
  "wallets": {
    "total": 42,
    "active": 38,
    "fresh": 5,
    "devs": 3
  },
  "transactions": {
    "total": 156
  },
  "tokens": {
    "total": 7
  },
  "monitoring": {
    "cexWallet": "DwdrYTtTWHfnfJBiN2RH6EgPbquDQLjZTfTwpykPEq1g",
    "activeSubscriptions": ["DwdrYTtT..."],
    "pumpFunMonitored": ["3CMHD35N...", "7AWnn76s..."]
  }
}
```

---

## Wallets

### Get All Wallets
**GET** `/api/wallets`

Returns all monitored wallets.

**Response:**
```json
[
  {
    "id": 1,
    "address": "7AWnn76sR39vdhcuQH5mhKm467fBQ5ADEka6ExWxGNNT",
    "source": "DwdrYTtT...",
    "first_seen": 1697123456789,
    "is_active": 1,
    "is_fresh": 0,
    "wallet_age_days": 160.52,
    "previous_tx_count": 1000,
    "is_dev_wallet": 0,
    "tokens_deployed": 0,
    "dev_checked": 1
  }
]
```

### Get Active Wallets
**GET** `/api/wallets/active`

Returns only active wallets (`is_active = 1`).

### Get Fresh Wallets
**GET** `/api/wallets/fresh`

Returns wallets with zero prior transactions (`is_fresh = 1`).

### Get Dev Wallets 🔥
**GET** `/api/wallets/devs`

Returns wallets that have deployed tokens (`is_dev_wallet = 1`), sorted by `tokens_deployed DESC`.

**Response:**
```json
[
  {
    "id": 5,
    "address": "5Sa5XkAL9s1tj89jrU5MXE7pXncQh61wZr215ijvS639",
    "is_dev_wallet": 1,
    "tokens_deployed": 2,
    "dev_checked": 1,
    "wallet_age_days": 65.3,
    "is_fresh": 0
  }
]
```

### Toggle Wallet Monitoring
**POST** `/api/wallets/:address/toggle`

Activates or deactivates pump.fun monitoring for a wallet.

---

## Transactions

### Get Recent Transactions
**GET** `/api/transactions?limit=50`

Returns recent transactions (default: 50).

**Response:**
```json
[
  {
    "id": 1,
    "signature": "4XsJM5Bi...",
    "from_address": "DwdrYTtT...",
    "to_address": "3CMHD35N...",
    "amount": 5.197,
    "timestamp": 1697123456789,
    "status": "confirmed"
  }
]
```

### Get Transactions for Wallet
**GET** `/api/transactions/:address`

Returns all transactions for a specific wallet.

---

## Tokens

### Get All Tokens
**GET** `/api/tokens`

Returns all discovered token mints.

**Response:**
```json
[
  {
    "id": 1,
    "mint_address": "7mpm9jYaDY1p7PrKSH8bbWhaAyHhZJmShYL7T712pump",
    "creator_address": "5Sa5XkAL...",
    "timestamp": 1697123456789,
    "platform": "pumpfun",
    "starting_mcap": 45200,
    "current_mcap": 120000,
    "ath_mcap": 450000,
    "last_updated": 1697123456789
  }
]
```

### Get Tokens by Creator
**GET** `/api/tokens/creator/:address`

Returns all tokens deployed by a specific wallet.

---

## Configuration

### Get Config
**GET** `/api/config`

Returns all configuration values.

### Update Config
**POST** `/api/config`

Updates a configuration value.

**Body:**
```json
{
  "key": "threshold_sol",
  "value": "1.5"
}
```

---

## Monitoring Control

### Start Monitoring
**POST** `/api/monitor/start`

Starts monitoring the configured CEX wallet.

### Stop Monitoring
**POST** `/api/monitor/stop`

Stops monitoring the CEX wallet.

---

## Example Usage

### Check for Dev Wallets
```bash
curl http://localhost:3001/api/wallets/devs
```

### Get Stats
```bash
curl http://localhost:3001/api/stats
```

### View Fresh Dev Wallets (🔥 High Signal!)
```bash
# Get fresh wallets
curl http://localhost:3001/api/wallets/fresh

# Then check if any are devs
curl http://localhost:3001/api/wallets/devs | jq '.[] | select(.is_fresh == 1)'
```

---

## WebSocket Events

Connect to: `ws://localhost:3001/ws`

### Events Received:
- `transaction` - New transaction detected
- `new_wallet` - New wallet discovered
- `wallet_analyzed` - Wallet analysis complete
- `token_mint` - Token mint detected
- `dev_wallet_found` 🔥 - Dev wallet discovered!

### Example (JavaScript):
```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'dev_wallet_found') {
    console.log('🔥 Dev wallet:', data.data);
    // {
    //   address: "5Sa5XkAL...",
    //   tokensDeployed: 2,
    //   deployments: [...]
    // }
  }
};
```

---

## Dev Wallet Badge System

### In Frontend:
```typescript
interface Wallet {
  address: string;
  is_dev_wallet: number;
  tokens_deployed: number;
  is_fresh: number;
}

function WalletCard({ wallet }: { wallet: Wallet }) {
  return (
    <div>
      <span>{wallet.address}</span>
      
      {wallet.is_fresh === 1 && (
        <Badge>✨ FRESH</Badge>
      )}
      
      {wallet.is_dev_wallet === 1 && (
        <Badge variant="fire">
          🔥 DEV ({wallet.tokens_deployed} tokens)
        </Badge>
      )}
      
      {wallet.is_fresh === 1 && wallet.is_dev_wallet === 1 && (
        <Badge variant="gold">
          ⭐ FRESH DEV - HIGH SIGNAL!
        </Badge>
      )}
    </div>
  );
}
```

---

## Testing

Start the server:
```bash
npm run dev
```

Test endpoints:
```bash
# Get stats
curl http://localhost:3001/api/stats | jq

# Get dev wallets
curl http://localhost:3001/api/wallets/devs | jq

# Get all wallets with dev status
curl http://localhost:3001/api/wallets | jq '.[] | {address, is_dev_wallet, tokens_deployed}'
```

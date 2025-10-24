# Campaign Builder - On-chain Solana Tracking Pipelines

## Overview
The Campaign Builder is an integrated module within Sniff Agency that lets you compose, run, and monitor modular on-chain "campaigns" (tracking pipelines) focused on following cashflows and behavioral trails on Solana. It leverages existing infrastructure and runs listeners in parallel with steps in sequence.

## Architecture

### Core Components

1. **SolanaEventDetector** - Monitors on-chain events via RPC/WebSocket
   - Transfer detection
   - Program log monitoring
   - Account creation tracking
   - Token mint detection

2. **CampaignExecutor** - Manages runtime execution of campaigns
   - Handles trigger → filter → monitor → action flow
   - Manages parallel execution groups
   - Tracks instance lifecycle

3. **CampaignManager** - CRUD operations and analytics
   - Campaign creation/editing
   - Template management
   - Metrics and reporting

4. **CampaignBuilder UI** - Visual campaign editor
   - Drag-and-drop node creation
   - Real-time monitoring dashboard
   - Alert management

## Database Schema

### Core Tables
- `campaigns` - Campaign definitions
- `campaign_nodes` - Individual nodes (triggers, filters, monitors, actions)
- `campaign_runtime_instances` - Active campaign executions
- `campaign_events` - Event log for audit trail
- `campaign_alerts` - User notifications
- `campaign_metrics` - Performance analytics

## Node Types

### 1. Triggers
Start a campaign instance when conditions are met:
- **Transfer Credited**: Wallet receives specific amount of SOL
- **Program Log**: Specific program emits matching log
- **Account Created**: New account created
- **Token Mint**: Token minting detected

### 2. Filters
Boolean checks to continue or halt execution:
- **Account Age**: Check if account is new/old
- **Prior Balance**: Check previous balance
- **Token Interaction**: Has interacted with Token Program
- **Custom Expression**: Complex conditions

### 3. Monitors
Watch addresses for specific activities over time:
- **Token Events**: InitializeMint, MintTo, Transfer, Burn
- **Program Interactions**: Track specific program calls
- **Time Windows**: Monitor for configurable duration

### 4. Actions
Execute when conditions are satisfied:
- **Webhook**: Call external URL with data
- **Database Tag**: Tag wallet/transaction in DB
- **Send to Fetcher**: Forward to trading bot
- **Create Alert**: Generate UI notification
- **Run Script**: Execute custom script

## Example Campaigns

### 2 SOL → Token Launch Detector
```json
{
  "name": "2 SOL → Token Launch Detector",
  "nodes": [
    {
      "type": "trigger",
      "config": {
        "trigger_type": "transfer_credited",
        "lamports_exact": 2000000000
      }
    },
    {
      "type": "filter",
      "config": {
        "expression": "account_age_seconds <= 300"
      }
    },
    {
      "type": "monitor",
      "config": {
        "window_ms": 3600000,
        "events": ["InitializeMint", "MintTo"]
      }
    },
    {
      "type": "action",
      "config": {
        "action_type": "create_alert"
      }
    }
  ]
}
```

### MEV Bot Tracker
Tracks high-frequency trading patterns on Raydium and other DEXes.

### Wash Trading Detector
Identifies circular token movements indicating market manipulation.

## API Endpoints

### Campaign Management
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns` - List campaigns
- `GET /api/campaigns/:id` - Get campaign details
- `PUT /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign
- `POST /api/campaigns/:id/activate` - Activate campaign
- `POST /api/campaigns/:id/deactivate` - Pause campaign

### Monitoring
- `GET /api/campaigns/:id/logs` - Get runtime instances
- `GET /api/campaigns/instances/running` - Active instances
- `GET /api/campaigns/:id/metrics` - Performance metrics
- `GET /api/campaigns/alerts` - User alerts

### Templates
- `GET /api/campaigns/templates` - List preset templates
- `POST /api/campaigns/import` - Import from template
- `GET /api/campaigns/:id/export` - Export as template

## Security & Performance

### Encryption
- RPC/API keys encrypted with AES-256-GCM
- Webhook URLs and sensitive configs encrypted at rest

### Rate Limiting
- Configurable max concurrent instances per campaign
- Global instance limit to prevent resource exhaustion
- Backpressure controls for monitors

### Low Latency
- WebSocket subscriptions for real-time events
- Parallel execution of independent nodes
- Redis queue for high-throughput processing

### Deduplication
- Configurable dedup windows (default 10 minutes)
- Prevents duplicate processing of same wallet/tx

## UI Features

### Campaign Builder
- Visual flow editor with drag-and-drop
- Node configuration panels
- Connection visualization
- Template library

### Monitoring Dashboard
- Real-time instance tracking
- Status indicators (running/completed/failed)
- Execution timeline
- Error diagnostics

### Alert Management
- Unread notification badges
- Alert acknowledgment
- Priority levels (info/warning/critical)
- Webhook delivery status

## Environment Variables

```env
# Required for enhanced features
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_API_KEY=your-helius-api-key

# Optional
WEBHOOK_RETRY_ATTEMPTS=3
CAMPAIGN_MAX_INSTANCES=1000
MONITOR_MAX_WINDOW_MS=86400000  # 24 hours
```

## Migration

Run the migration to create campaign tables:
```bash
node run-all-migrations.mjs
```

This will execute `035_onchain_campaigns.sql` which creates all necessary tables and indexes.

## Usage

1. **Create Campaign**: Use templates or build from scratch
2. **Configure Nodes**: Set up trigger conditions, filters, monitors, actions
3. **Activate**: Enable campaign to start monitoring
4. **Monitor**: View real-time instances and alerts
5. **Analyze**: Review metrics and optimize

## Performance Targets

- **Detection Latency**: <100ms from on-chain event
- **Execution Speed**: <50ms per node
- **Concurrent Instances**: 100+ per campaign
- **WebSocket Reliability**: 99.9% uptime
- **Dedup Accuracy**: 100% within window

## Future Enhancements

- Machine learning for pattern detection
- Cross-chain monitoring (Ethereum, BSC)
- Advanced analytics dashboard
- Campaign collaboration/sharing
- Automated strategy optimization
- Integration with DeFi protocols

## Troubleshooting

### Campaign Not Triggering
- Check RPC connection
- Verify trigger conditions
- Review deduplication window
- Check campaign is activated

### High Latency
- Reduce monitor window duration
- Decrease max concurrent instances
- Optimize filter expressions
- Use dedicated RPC endpoint

### Webhook Failures
- Verify webhook URL is accessible
- Check payload format
- Review retry settings
- Monitor response times

## Support

For issues or questions:
- Check logs in PM2: `pm2 logs cex-monitor`
- Review campaign events in database
- Check WebSocket connection status
- Verify RPC endpoint health

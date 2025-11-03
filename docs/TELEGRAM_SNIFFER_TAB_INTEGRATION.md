# Telegram Sniffer Tab - Auto-Trading Integration Guide

This guide shows how to integrate the auto-trading components into your existing `TelegramSnifferTab.tsx` file.

## Step 1: Update Imports

Add these imports at the top of `TelegramSnifferTab.tsx`:

```typescript
import { TelegramPositionsDashboard } from './TelegramPositionsDashboard';
import { TelegramAutoTradeConfig } from './TelegramAutoTradeConfig';
import { TrendingUp } from 'lucide-react'; // Add if not already imported
```

## Step 2: Update State Types

Update the `activeSection` state type (around line 79):

**From:**
```typescript
const [activeSection, setActiveSection] = useState<'sniffer' | 'monitored' | 'detections' | 'forwards' | 'traffic' | 'settings'>('sniffer');
```

**To:**
```typescript
const [activeSection, setActiveSection] = useState<'sniffer' | 'monitored' | 'positions' | 'detections' | 'forwards' | 'traffic' | 'settings'>('sniffer');
```

## Step 3: Add New State Variables

Add these after your existing state declarations (around line 140):

```typescript
const [autoTradeModalOpen, setAutoTradeModalOpen] = useState(false);
const [autoTradeChat, setAutoTradeChat] = useState<any | null>(null);
const [tradingWallets, setTradingWallets] = useState<any[]>([]);
```

## Step 4: Add Wallet Fetching Function

Add this function around line 400:

```typescript
const fetchTradingWallets = async () => {
  try {
    const response = await fetch(`${config.apiUrl}/api/trading/wallets`, {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      setTradingWallets(data.wallets || []);
    }
  } catch (error) {
    console.error('Failed to fetch wallets:', error);
  }
};
```

Then call it when the component mounts:

```typescript
useEffect(() => {
  fetchTradingWallets();
}, []);
```

## Step 5: Add Positions Tab Button

After the "Detections" button (around line 1068), add:

```typescript
<button
  onClick={() => setActiveSection('positions')}
  className={`px-6 py-3 font-medium transition-all ${
    activeSection === 'positions' 
      ? 'text-cyan-400 border-b-2 border-cyan-400' 
      : 'text-gray-400 hover:text-white'
  }`}
>
  Positions 💹
</button>
```

## Step 6: Add Positions Section

After the detections section (around line 2800), add:

```typescript
{activeSection === 'positions' && (
  <div className="space-y-6">
    <TelegramPositionsDashboard />
  </div>
)}
```

## Step 7: Add Auto-Trade Config Button

In the monitored chats section where each chat is rendered (around line 2200), add this button next to the other action buttons:

```typescript
<button
  onClick={(e) => {
    e.stopPropagation();
    setAutoTradeChat(chat);
    setAutoTradeModalOpen(true);
  }}
  className="p-2 bg-gradient-to-r from-green-500/20 to-blue-500/20 hover:from-green-500/30 hover:to-blue-500/30 border border-green-500/40 rounded-lg transition-all group"
  title="Configure Auto-Trading"
>
  <TrendingUp className="w-4 h-4 text-green-400 group-hover:text-green-300" />
</button>
```

## Step 8: Add Auto-Trade Configuration Modal

Add this modal at the bottom of your component (before the final closing `</div>`):

```typescript
{autoTradeModalOpen && autoTradeChat && createPortal(
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
      {/* Modal Header */}
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-cyan-500/20 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold text-cyan-300 mb-2">Auto-Trading Configuration</h3>
            <p className="text-gray-400">
              {autoTradeChat.chatName || autoTradeChat.chatId}
            </p>
          </div>
          <button
            onClick={() => {
              setAutoTradeModalOpen(false);
              setAutoTradeChat(null);
            }}
            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      {/* Modal Body */}
      <div className="p-6">
        <TelegramAutoTradeConfig
          chatId={autoTradeChat.chatId}
          currentConfig={autoTradeChat.autoTradeConfig}
          onSave={async (config) => {
            // Save configuration
            try {
              const response = await fetch(`${config.apiUrl}/api/telegram/auto-trade/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  chatId: autoTradeChat.chatId,
                  config
                })
              });

              if (response.ok) {
                setMessage({ type: 'success', text: 'Auto-trade configuration saved!' });
                setAutoTradeModalOpen(false);
                setAutoTradeChat(null);
                // Refresh monitored chats to show new config
                await loadSnifferChats();
              } else {
                setMessage({ type: 'error', text: 'Failed to save configuration' });
              }
            } catch (error) {
              setMessage({ type: 'error', text: 'Error saving configuration' });
            }
          }}
          onCancel={() => {
            setAutoTradeModalOpen(false);
            setAutoTradeChat(null);
          }}
        />
      </div>
    </div>
  </div>,
  document.body
)}
```

## Step 9: Add WebSocket Subscriptions

Add these subscriptions for position updates (around line 300 in your useEffect):

```typescript
useEffect(() => {
  const unsubscribePositionCreated = subscribe('telegram_position_created', (data: any) => {
    setMessage({ type: 'success', text: `New position: ${data.token_symbol || data.token_mint.slice(0, 8)}...` });
  });

  const unsubscribeTradeExecuted = subscribe('telegram_trade_executed', (data: any) => {
    const action = data.trade_type === 'buy' ? '🟢 Bought' : '🔴 Sold';
    setMessage({ type: 'success', text: `${action} ${data.token_symbol || ''}` });
  });

  const unsubscribePositionClosed = subscribe('telegram_position_closed', (data: any) => {
    const emoji = data.roi_percent > 0 ? '🎉' : '😔';
    setMessage({ 
      type: data.roi_percent > 0 ? 'success' : 'error', 
      text: `${emoji} Position closed: ${data.roi_percent > 0 ? '+' : ''}${data.roi_percent?.toFixed(2)}% ROI` 
    });
  });

  return () => {
    unsubscribePositionCreated();
    unsubscribeTradeExecuted();
    unsubscribePositionClosed();
  };
}, [subscribe]);
```

## Step 10: Add Trading Status Indicators

In the monitored chats list where each chat is displayed (around line 2180), add:

```typescript
{chat.action_on_detection && chat.action_on_detection !== 'forward_only' && (
  <span className={`px-2 py-1 text-xs rounded-full ${
    chat.action_on_detection === 'trade_only' ? 'bg-green-500/20 text-green-400' :
    chat.action_on_detection === 'monitor_only' ? 'bg-purple-500/20 text-purple-400' :
    chat.action_on_detection === 'forward_and_trade' ? 'bg-yellow-500/20 text-yellow-400' :
    'bg-blue-500/20 text-blue-400'
  }`}>
    {chat.action_on_detection === 'trade_only' ? '🤖 Auto-Trade' :
     chat.action_on_detection === 'monitor_only' ? '📊 Monitor' :
     chat.action_on_detection === 'forward_and_trade' ? '📤🤖 Forward+Trade' :
     chat.action_on_detection === 'forward_and_monitor' ? '📤📊 Forward+Monitor' :
     chat.action_on_detection === 'all' ? '🔥 All Actions' : ''}
  </span>
)}
```

## Testing

After making these changes:

1. The "Positions" tab should appear and show the positions dashboard
2. Each monitored chat should have an auto-trade configuration button
3. Clicking the button should open the configuration modal
4. Real-time position updates should appear as toast notifications
5. Trading status badges should show which chats have auto-trading enabled

## Troubleshooting

If you encounter any issues:

1. Ensure all imports are correctly added
2. Check that the API endpoints are accessible
3. Verify that wallets are properly configured
4. Check the browser console for any errors
5. Ensure the WebSocket connection is established

import { useEffect, useState } from 'react';
import { Activity, Wallet, Coins, TrendingUp, Settings, Circle, Sparkles, Flame, BarChart3, DollarSign } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { Stats, Transaction, TokenMint, MonitoredWallet } from '../types';
import { TransactionList } from './TransactionList';
import { WalletList } from './WalletList';
import { TokenList } from './TokenList';
import { SettingsPanel } from './SettingsPanel';
import { DevWalletList } from './DevWalletList';
import { RequestStatsPanel } from './RequestStatsPanel';
import { SourceWalletsPanel } from './SourceWalletsPanel';

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<MonitoredWallet[]>([]);
  const [devWallets, setDevWallets] = useState<MonitoredWallet[]>([]);
  const [tokens, setTokens] = useState<TokenMint[]>([]);
  const [activeTab, setActiveTab] = useState<'transactions' | 'wallets' | 'devWallets' | 'tokens' | 'stats' | 'sourceWallets' | 'settings'>('sourceWallets');
  
  const { isConnected, subscribe } = useWebSocket('ws://localhost:3001/ws');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubTransaction = subscribe('transaction', (data: any) => {
      setTransactions(prev => [{
        signature: data.signature,
        from_address: data.from,
        to_address: data.to,
        amount: data.amount,
        timestamp: data.timestamp,
        status: 'confirmed'
      }, ...prev].slice(0, 100));
      fetchStats();
    });

    const unsubWallet = subscribe('new_wallet', (data: any) => {
      setWallets(prev => [{
        address: data.address,
        source: data.source,
        first_seen: Date.now(),
        is_active: 1,
        is_fresh: 1,
        previous_tx_count: 0
      }, ...prev]);
      fetchStats();
    });

    const unsubToken = subscribe('token_mint', (data: any) => {
      setTokens(prev => [{
        mint_address: data.mintAddress,
        creator_address: data.creator,
        name: data.name,
        symbol: data.symbol,
        timestamp: data.timestamp,
        platform: 'pumpfun'
      }, ...prev].slice(0, 100));
      fetchStats();
    });

    const unsubDevWallet = subscribe('dev_wallet_found', (data: any) => {
      console.log('🔥 Dev wallet found:', data);
      fetchDevWallets();
      fetchStats();
    });

    return () => {
      unsubTransaction();
      unsubWallet();
      unsubToken();
      unsubDevWallet();
    };
  }, [subscribe]);

  const fetchData = async () => {
    await Promise.all([
      fetchStats(),
      fetchTransactions(),
      fetchWallets(),
      fetchDevWallets(),
      fetchTokens()
    ]);
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await fetch('/api/transactions');
      const data = await response.json();
      setTransactions(data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchWallets = async () => {
    try {
      const response = await fetch('/api/wallets');
      const data = await response.json();
      setWallets(data);
    } catch (error) {
      console.error('Error fetching wallets:', error);
    }
  };

  const fetchDevWallets = async () => {
    try {
      const response = await fetch('/api/wallets/devs');
      const data = await response.json();
      setDevWallets(data);
    } catch (error) {
      console.error('Error fetching dev wallets:', error);
    }
  };

  const fetchTokens = async () => {
    try {
      const response = await fetch('/api/tokens');
      const data = await response.json();
      setTokens(data);
    } catch (error) {
      console.error('Error fetching tokens:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">CEX Monitor</h1>
            <p className="text-purple-300">Real-time wallet tracking & pump.fun detection</p>
          </div>
          <div className="flex items-center gap-2">
            <Circle 
              className={`w-3 h-3 ${isConnected ? 'fill-green-400 text-green-400' : 'fill-red-400 text-red-400'}`}
            />
            <span className="text-white text-sm">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <StatCard
              icon={<Wallet className="w-6 h-6" />}
              title="Active Wallets"
              value={stats.active_wallets}
              subtitle={`${stats.total_wallets} total`}
              color="blue"
            />
            <StatCard
              icon={<Sparkles className="w-6 h-6" />}
              title="Fresh Wallets"
              value={stats.fresh_wallets}
              subtitle="New detected"
              color="amber"
            />
            <StatCard
              icon={<Activity className="w-6 h-6" />}
              title="Transactions (24h)"
              value={stats.transactions_24h}
              subtitle={`${stats.total_transactions} total`}
              color="green"
            />
            <StatCard
              icon={<Coins className="w-6 h-6" />}
              title="Tokens (24h)"
              value={stats.tokens_24h}
              subtitle={`${stats.total_tokens} total`}
              color="purple"
            />
            <StatCard
              icon={<TrendingUp className="w-6 h-6" />}
              title="Monitor Status"
              value={stats.monitoring_status}
              subtitle="Real-time tracking"
              color="orange"
            />
          </div>
        )}

        {/* Tabs */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-2 mb-6">
          <div className="flex gap-2">
            <TabButton
              active={activeTab === 'transactions'}
              onClick={() => setActiveTab('transactions')}
              icon={<Activity className="w-4 h-4" />}
              label="Transactions"
            />
            <TabButton
              active={activeTab === 'sourceWallets'}
              onClick={() => setActiveTab('sourceWallets')}
              icon={<DollarSign className="w-4 h-4" />}
              label="Source Wallets"
            />
            <TabButton
              active={activeTab === 'wallets'}
              onClick={() => setActiveTab('wallets')}
              icon={<Wallet className="w-4 h-4" />}
              label="Recipient Wallets"
            />
            <TabButton
              active={activeTab === 'devWallets'}
              onClick={() => setActiveTab('devWallets')}
              icon={<Flame className="w-4 h-4" />}
              label="Dev Wallets"
            />
            <TabButton
              active={activeTab === 'tokens'}
              onClick={() => setActiveTab('tokens')}
              icon={<Coins className="w-4 h-4" />}
              label="Tokens"
            />
            <TabButton
              active={activeTab === 'stats'}
              onClick={() => setActiveTab('stats')}
              icon={<BarChart3 className="w-4 h-4" />}
              label="Live Stats"
            />
            <TabButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              icon={<Settings className="w-4 h-4" />}
              label="Settings"
            />
          </div>
        </div>

        {/* Content */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
          {activeTab === 'transactions' && <TransactionList transactions={transactions} />}
          {activeTab === 'sourceWallets' && <SourceWalletsPanel />}
          {activeTab === 'wallets' && <WalletList wallets={wallets} onUpdate={fetchWallets} />}
          {activeTab === 'devWallets' && <DevWalletList devWallets={devWallets} onUpdate={fetchDevWallets} />}
          {activeTab === 'tokens' && <TokenList tokens={tokens} />}
          {activeTab === 'stats' && <RequestStatsPanel />}
          {activeTab === 'settings' && <SettingsPanel onUpdate={fetchData} />}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: any;
  subtitle: string;
  color: 'blue' | 'amber' | 'green' | 'purple' | 'orange';
}

function StatCard({ icon, title, value, subtitle, color }: StatCardProps) {
  const colors: Record<StatCardProps['color'], string> = {
    blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
    amber: 'from-amber-500/20 to-amber-600/20 border-amber-500/30',
    green: 'from-green-500/20 to-green-600/20 border-green-500/30',
    purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30',
    orange: 'from-orange-500/20 to-orange-600/20 border-orange-500/30'
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} backdrop-blur-sm rounded-lg border p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-white">{icon}</div>
      </div>
      <h3 className="text-white text-2xl font-bold mb-1">{value}</h3>
      <p className="text-gray-300 text-sm mb-1">{title}</p>
      <p className="text-gray-400 text-xs">{subtitle}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
        active
          ? 'bg-purple-600 text-white'
          : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

import { Transaction } from '../types';
import { ExternalLink, ArrowRight } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
}

export function TransactionList({ transactions }: TransactionListProps) {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">Recent Transactions</h2>
      
      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No transactions yet. Monitoring in progress...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.signature}
              className="bg-slate-700/50 rounded-lg p-4 border border-purple-500/10 hover:border-purple-500/30 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 flex-1">
                  <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-medium">
                    {tx.amount.toFixed(4)} SOL
                  </div>
                  <div className="flex items-center gap-2 text-gray-300 text-sm">
                    <span className="font-mono">{formatAddress(tx.from_address)}</span>
                    <ArrowRight className="w-4 h-4 text-purple-400" />
                    <span className="font-mono">{formatAddress(tx.to_address)}</span>
                  </div>
                </div>
                <a
                  href={`https://solscan.io/tx/${tx.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="font-mono">{tx.signature.slice(0, 16)}...</span>
                <span>{formatTime(tx.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

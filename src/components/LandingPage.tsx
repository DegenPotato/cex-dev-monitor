import { ArrowRight } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-6xl font-bold text-white mb-6">
          CEX Dev Monitor
        </h1>
        
        <p className="text-xl text-gray-300 mb-12">
          Real-time monitoring and analytics for Solana token launches and developer wallets
        </p>
        
        <div className="flex gap-4 justify-center">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-4 rounded-lg transition-all transform hover:scale-105"
          >
            Go to Dashboard
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
        
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="bg-slate-900/50 backdrop-blur-sm border border-purple-500/20 rounded-lg p-6">
            <div className="text-purple-400 font-semibold mb-2">🚀 Launch Tracking</div>
            <p className="text-gray-400 text-sm">
              Monitor new token launches from pump.fun and track developer wallets in real-time
            </p>
          </div>
          
          <div className="bg-slate-900/50 backdrop-blur-sm border border-purple-500/20 rounded-lg p-6">
            <div className="text-purple-400 font-semibold mb-2">📊 OHLCV Data</div>
            <p className="text-gray-400 text-sm">
              Comprehensive OHLCV candle data collection across multiple timeframes
            </p>
          </div>
          
          <div className="bg-slate-900/50 backdrop-blur-sm border border-purple-500/20 rounded-lg p-6">
            <div className="text-purple-400 font-semibold mb-2">⚡ API Traffic</div>
            <p className="text-gray-400 text-sm">
              Complete visibility into RPC endpoints and external API usage
            </p>
          </div>
        </div>
        
        <div className="mt-12 text-gray-500 text-sm">
          <p>Replace this placeholder with your custom landing page template</p>
        </div>
      </div>
    </div>
  );
}

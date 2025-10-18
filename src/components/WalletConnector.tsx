import { useState } from 'react';
import { Wallet, LogOut, Copy, Check, ExternalLink, Shield } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '../contexts/AuthContext';

export function WalletConnector() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, isAuthenticated, authenticateWallet, logout, isAuthenticating } = useAuth();
  const [copied, setCopied] = useState(false);

  const walletAddress = publicKey?.toBase58() || null;
  const isSuperAdmin = user?.role === 'super_admin';

  const handleConnect = async () => {
    if (!connected) {
      setVisible(true);
    } else if (!isAuthenticated) {
      await authenticateWallet();
    }
  };

  const handleDisconnect = async () => {
    await logout();
  };

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (connected && walletAddress) {
    return (
      <div className="relative group">
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
          <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse" />
          {isSuperAdmin ? (
            <Shield className="w-4 h-4 text-yellow-400" />
          ) : (
            <Wallet className="w-4 h-4 text-cyan-400" />
          )}
          <span className="text-sm font-mono text-cyan-300">
            {formatAddress(walletAddress)}
          </span>
        </div>
        
        {/* Dropdown Menu */}
        <div className="absolute top-full right-0 mt-2 w-64 bg-black/90 backdrop-blur-xl rounded-lg border border-cyan-500/20 shadow-2xl shadow-cyan-500/20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
          <div className="p-4 space-y-3">
            <div className="text-xs text-cyan-300/60 uppercase tracking-wider">Connected Wallet</div>
            
            <div className="bg-black/40 rounded-lg p-3 border border-cyan-500/10">
              <div className="font-mono text-xs text-cyan-400 break-all">
                {walletAddress}
              </div>
            </div>
            
            {user && (
              <div className="mb-3 p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <div className="text-xs text-cyan-300/60 mb-1">Status</div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isSuperAdmin ? 'bg-yellow-400' : 'bg-green-400'}`} />
                  <span className={`text-sm font-medium ${isSuperAdmin ? 'text-yellow-400' : 'text-green-400'}`}>
                    {isSuperAdmin ? 'Super Admin' : 'User'}
                  </span>
                </div>
                {user.username && (
                  <div className="text-xs text-cyan-300/60 mt-1">@{user.username}</div>
                )}
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={copyAddress}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 px-3 py-2 rounded-lg text-sm font-medium transition-all border border-cyan-500/40"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
              
              <a
                href={`https://solscan.io/account/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-3 py-2 rounded-lg text-sm font-medium transition-all border border-purple-500/40"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm font-medium transition-all border border-red-500/40"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isAuthenticating}
      className="flex items-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 px-4 py-2 rounded-full font-medium transition-all hover:shadow-lg hover:shadow-cyan-500/20 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Wallet className="w-4 h-4" />
      {isAuthenticating ? 'Authenticating...' : 'Connect Wallet'}
    </button>
  );
}

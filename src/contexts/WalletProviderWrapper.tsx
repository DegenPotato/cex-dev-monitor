import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    TorusWalletAdapter,
    LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProviderWrapperProps {
    children: ReactNode;
}

/**
 * Solana Wallet Provider Wrapper
 * Configures wallet adapters for Phantom, Solflare, Torus, and Ledger
 * Note: Architecture designed for multi-chain expansion (EVM support can be added later)
 */
export const WalletProviderWrapper: FC<WalletProviderWrapperProps> = ({ children }) => {
    // Use mainnet-beta for production
    const network = WalletAdapterNetwork.Mainnet;

    // RPC endpoint - using public endpoint (can be upgraded to private RPC)
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);

    // Configure supported wallets
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
            new TorusWalletAdapter(),
            new LedgerWalletAdapter(),
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={false}>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

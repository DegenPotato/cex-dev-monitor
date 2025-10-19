import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

// VPS Backend URL (use existing VITE_API_URL)
const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://api.sniff.agency';

// Super admin wallets from environment
const SUPER_ADMIN_WALLETS = (import.meta.env.VITE_SUPER_ADMIN_WALLETS || '').split(',').filter(Boolean).map((w: string) => w.trim().toLowerCase());

interface User {
    id: number;
    username: string;
    wallet_address?: string;
    solana_wallet_address?: string;
    role: string;
    referral_code?: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isAuthenticating: boolean;
    authenticateWallet: () => Promise<void>;
    authenticateWithCode: (code: string) => Promise<boolean>;
    logout: () => Promise<void>;
    checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const { publicKey, signMessage, connected, disconnect } = useWallet();
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    // Check auth status on mount
    useEffect(() => {
        checkAuthStatus();
    }, []);

    // Auto-refresh tokens before expiry
    useEffect(() => {
        if (isAuthenticated) {
            const refreshInterval = setInterval(() => {
                refreshAuth();
            }, 12 * 60 * 1000); // Refresh every 12 minutes (before 15min expiry)
            
            return () => clearInterval(refreshInterval);
        }
    }, [isAuthenticated]);

    /**
     * Check if user is already authenticated (via cookies)
     */
    const checkAuthStatus = async () => {
        try {
            console.log('🔍 [Auth] Checking authentication status...');
            
            const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
                method: 'GET',
                credentials: 'include', // Send cookies
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.user) {
                    setUser(data.user);
                    setIsAuthenticated(true);
                    console.log('✅ [Auth] User authenticated:', data.user.username);
                }
            } else {
                console.log('⚠️ [Auth] No active session');
                setIsAuthenticated(false);
                setUser(null);
            }
        } catch (error) {
            console.error('❌ [Auth] Status check failed:', error);
            setIsAuthenticated(false);
            setUser(null);
        }
    };

    /**
     * Refresh authentication tokens
     */
    const refreshAuth = async () => {
        try {
            console.log('🔄 [Auth] Refreshing tokens...');
            
            const response = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.user) {
                    setUser(data.user);
                    console.log('✅ [Auth] Tokens refreshed');
                }
            } else {
                console.log('⚠️ [Auth] Refresh failed, need re-authentication');
                setIsAuthenticated(false);
                setUser(null);
            }
        } catch (error) {
            console.error('❌ [Auth] Refresh failed:', error);
            setIsAuthenticated(false);
            setUser(null);
        }
    };

    /**
     * Authenticate wallet via VPS backend (challenge + verify flow)
     */
    const authenticateWallet = async () => {
        if (!connected || !publicKey || !signMessage) {
            throw new Error('Wallet not connected or does not support message signing');
        }

        setIsAuthenticating(true);

        try {
            const walletAddress = publicKey.toBase58();
            console.log('🔐 [Auth] Starting authentication for:', walletAddress);

            // Step 1: Get challenge from VPS backend
            console.log('📡 [Auth] Requesting challenge from VPS...');
            const challengeResponse = await fetch(`${BACKEND_URL}/api/auth/challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress }),
            });

            if (!challengeResponse.ok) {
                throw new Error('Failed to get challenge from backend');
            }

            const { challenge } = await challengeResponse.json();
            console.log('✅ [Auth] Challenge received');

            // Step 2: Sign the message with wallet
            console.log('✍️ [Auth] Signing message...');
            const messageBytes = new TextEncoder().encode(challenge.message);
            const signatureBytes = await signMessage(messageBytes);
            const signature = bs58.encode(signatureBytes);
            console.log('✅ [Auth] Message signed');

            // Step 3: Verify signature with VPS backend
            console.log('📡 [Auth] Verifying signature with VPS...');
            const verifyResponse = await fetch(`${BACKEND_URL}/api/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Receive cookies
                body: JSON.stringify({
                    walletAddress,
                    signature,
                }),
            });

            if (!verifyResponse.ok) {
                const errorData = await verifyResponse.json();
                throw new Error(errorData.error || 'Signature verification failed');
            }

            const { user: authenticatedUser } = await verifyResponse.json();
            console.log('✅ [Auth] Authentication successful!');
            
            // Check if wallet is in super admin list
            const isSuperAdmin = SUPER_ADMIN_WALLETS.includes(walletAddress.toLowerCase());
            if (isSuperAdmin && authenticatedUser.role !== 'super_admin') {
                // Override role to super_admin if wallet is in the list
                authenticatedUser.role = 'super_admin';
                console.log('🛡️ [Auth] Super admin wallet detected, elevating privileges');
            }

            setUser(authenticatedUser);
            setIsAuthenticated(true);
            
        } catch (error: any) {
            console.error('❌ [Auth] Authentication failed:', error);
            setIsAuthenticated(false);
            setUser(null);
            throw error;
        } finally {
            setIsAuthenticating(false);
        }
    };

    /**
     * Authenticate with secret code (for testing/VR access)
     */
    const authenticateWithCode = async (code: string): Promise<boolean> => {
        setIsAuthenticating(true);

        try {
            const SECRET_CODE = 'SNIFFAGENCY';
            
            if (code !== SECRET_CODE) {
                console.log('❌ [Auth] Invalid access code');
                return false;
            }

            console.log('🔑 [Auth] Secret code verified, granting super_admin access...');

            // Create a temporary super_admin user
            const superAdminUser: User = {
                id: 0, // Special ID for code-based auth
                username: 'SUPER_ADMIN_VR',
                wallet_address: undefined,
                solana_wallet_address: undefined,
                role: 'super_admin',
                referral_code: 'GENESIS'
            };

            setUser(superAdminUser);
            setIsAuthenticated(true);
            
            console.log('✅ [Auth] Super admin access granted via code');
            return true;
            
        } catch (error: any) {
            console.error('❌ [Auth] Code authentication failed:', error);
            return false;
        } finally {
            setIsAuthenticating(false);
        }
    };

    /**
     * Logout user
     */
    const logout = async () => {
        try {
            console.log('🚪 [Auth] Logging out...');
            
            await fetch(`${BACKEND_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });

            setUser(null);
            setIsAuthenticated(false);
            
            // Disconnect wallet
            if (connected) {
                await disconnect();
            }

            console.log('✅ [Auth] Logged out successfully');
        } catch (error) {
            console.error('❌ [Auth] Logout error:', error);
        }
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            isAuthenticated, 
            isAuthenticating,
            authenticateWallet,
            authenticateWithCode,
            logout,
            checkAuthStatus
        }}>
            {children}
        </AuthContext.Provider>
    );
};

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { WalletProviderWrapper } from './contexts/WalletProviderWrapper';
import { AuthProvider } from './contexts/AuthContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProviderWrapper>
      <AuthProvider>
        <App />
      </AuthProvider>
    </WalletProviderWrapper>
  </React.StrictMode>
);

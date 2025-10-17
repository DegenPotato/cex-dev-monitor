import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { WalletProviderWrapper } from './contexts/WalletProviderWrapper';
import { AuthProvider } from './contexts/AuthContext';
import { ExperienceSettingsProvider } from './contexts/ExperienceSettingsContext';
import { AudioProvider } from './contexts/AudioContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AudioProvider>
      <ExperienceSettingsProvider>
        <WalletProviderWrapper>
          <AuthProvider>
            <App />
          </AuthProvider>
        </WalletProviderWrapper>
      </ExperienceSettingsProvider>
    </AudioProvider>
  </React.StrictMode>
);

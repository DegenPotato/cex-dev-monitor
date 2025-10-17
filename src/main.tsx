import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { WalletProviderWrapper } from './contexts/WalletProviderWrapper';
import { AuthProvider } from './contexts/AuthContext';
import { ExperienceSettingsProvider } from './contexts/ExperienceSettingsContext';
import { AudioProvider } from './contexts/AudioContext';
import { YouTubeAudioProvider } from './contexts/YouTubeAudioContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProviderWrapper>
      <AuthProvider>
        <AudioProvider>
          <YouTubeAudioProvider>
            <ExperienceSettingsProvider>
              <App />
            </ExperienceSettingsProvider>
          </YouTubeAudioProvider>
        </AudioProvider>
      </AuthProvider>
    </WalletProviderWrapper>
  </React.StrictMode>
);

import React, { useState } from 'react';
import { useExperienceSettings, useReducedMotion } from '../../contexts/ExperienceSettingsContext';
import { useAudio } from '../../contexts/AudioContext';
import { YouTubeControls } from './YouTubeControls';

interface StatusData {
  online: boolean;
  latency: number;
  nodes: number;
  totalNodes: number;
}

interface WalletData {
  address: string;
  onDisconnect?: () => void;
}

interface ExperienceModeToggleProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
  showAudioControls?: boolean;
  showSystemStatus?: boolean;
  statusData?: StatusData;
  walletData?: WalletData;
}

export const ExperienceModeToggle: React.FC<ExperienceModeToggleProps> = ({ 
  position = 'bottom-right',
  className = '',
  showAudioControls = false,
  showSystemStatus = false,
  statusData,
  walletData
}) => {
  const { 
    settings, 
    toggleReducedMotion, 
    togglePerformanceMode,
    updateSetting,
    resetToDefaults 
  } = useExperienceSettings();
  const systemReducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Audio controls
  const audioContext = showAudioControls ? useAudio() : null;
  const {
    audioSource,
    setAudioSource,
    isPlaying,
    volume,
    distortionEnabled,
    currentTrack,
    togglePlayPause,
    setVolume,
    toggleDistortion,
    nextTrack,
    previousTrack
  } = audioContext || {};
  
  // Position classes
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-20'
  };
  
  const getModeIcon = () => {
    if (settings.performanceMode) return '⚡';
    if (settings.reducedMotion) return '🎯';
    return '✨';
  };
  
  const getModeName = () => {
    if (settings.performanceMode) return 'Performance';
    if (settings.reducedMotion) return 'Reduced Motion';
    return 'Full Experience';
  };
  
  const getModeColor = () => {
    if (settings.performanceMode) return 'text-plasma-yellow border-plasma-yellow';
    if (settings.reducedMotion) return 'text-accent-purple border-accent-purple';
    return 'text-cyber-cyan border-cyber-cyan';
  };
  
  return (
    <div className={`absolute ${positionClasses[position]} pointer-events-auto ${className}`}>
      <div className="flex flex-col items-end gap-2">
        {/* System Status (if enabled) */}
        {showSystemStatus && statusData && (
          <div className="glass-dark rounded-lg px-4 py-3 border border-green-500/30">
            <div className="text-green-400 font-mono text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">STATUS:</span>
                <span className="text-green-500 font-bold">{statusData.online ? 'ONLINE' : 'OFFLINE'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">LATENCY:</span>
                <span className="text-plasma-yellow font-mono">~{statusData.latency}ms</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">NODES:</span>
                <span className="text-quantum-blue font-mono">{statusData.nodes}/{statusData.totalNodes}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Primary Wallet Indicator with Dropdown */}
        <div className="relative">
          {walletData ? (
            <>
              {/* Wallet Display - Main Button */}
              <div className="glass-dark rounded-lg border border-cyan-500/30 overflow-hidden">
                <div className="px-4 py-3 space-y-2">
                  {/* Wallet Address */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👛</span>
                      <div>
                        <div className="text-xs text-gray-400 font-mono">CONNECTED</div>
                        <div className="text-cyan-300 font-mono text-sm font-bold">
                          {walletData.address.slice(0, 6)}...{walletData.address.slice(-4)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="text-cyan-400 hover:text-cyan-300 transition-colors p-1"
                      aria-label="Toggle settings"
                    >
                      <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                    </button>
                  </div>
                  
                  {/* Disconnect Button */}
                  {walletData.onDisconnect && (
                    <button
                      onClick={walletData.onDisconnect}
                      className="w-full text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded hover:bg-red-500/30 transition-colors font-mono border border-red-500/30"
                    >
                      🔌 DISCONNECT WALLET
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Fallback: Show experience mode button if no wallet */
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`
                glass-dark rounded-lg px-4 py-3 transition-all duration-300
                hover:shadow-glow-md hover:scale-105 flex items-center gap-2
                ${getModeColor()} border focus:outline-none focus:ring-2 focus:ring-cyber-cyan
              `}
              aria-label="Experience mode settings"
            >
              <span className="text-xl">{getModeIcon()}</span>
              <span className="font-mono text-sm">{getModeName()}</span>
            </button>
          )}
        </div>
        
        {/* Expanded Settings Dropdown Panel */}
        {isExpanded && (
          <div className="absolute top-full mt-2 right-0 glass-dark rounded-lg p-4 min-w-[320px] max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-top-5 duration-300 border border-cyan-500/20 shadow-xl">
            <h3 className="font-display text-lg text-cyber-cyan mb-3">Experience Settings</h3>
            
            {/* Quick Modes */}
            <div className="space-y-2 mb-4">
              <button
                onClick={() => {
                  updateSetting('performanceMode', false);
                  updateSetting('reducedMotion', false);
                  updateSetting('particleQuality', 'high');
                  updateSetting('bloomEnabled', true);
                }}
                className={`
                  w-full text-left px-3 py-2 rounded-lg transition-all
                  ${!settings.performanceMode && !settings.reducedMotion
                    ? 'bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan'
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                  }
                `}
              >
                <div className="font-mono text-sm">✨ Full Experience</div>
                <div className="text-xs opacity-70">All effects enabled</div>
              </button>
              
              <button
                onClick={toggleReducedMotion}
                className={`
                  w-full text-left px-3 py-2 rounded-lg transition-all
                  ${settings.reducedMotion
                    ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple'
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                  }
                `}
              >
                <div className="font-mono text-sm">🎯 Reduced Motion</div>
                <div className="text-xs opacity-70">Less animation, easier on eyes</div>
              </button>
              
              <button
                onClick={togglePerformanceMode}
                className={`
                  w-full text-left px-3 py-2 rounded-lg transition-all
                  ${settings.performanceMode
                    ? 'bg-plasma-yellow/20 text-plasma-yellow border border-plasma-yellow'
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                  }
                `}
              >
                <div className="font-mono text-sm">⚡ Performance Mode</div>
                <div className="text-xs opacity-70">Optimized for speed</div>
              </button>
            </div>
            
            {/* Audio Controls Section */}
            {showAudioControls && (
              <div className="border-t border-gray-700 pt-3 space-y-3">
                <h4 className="font-mono text-sm text-cyan-400 mb-2">🎵 Audio</h4>
                
                {/* Audio Source Toggle */}
                <div className="space-y-2">
                  <label className="block text-xs text-gray-400 font-mono mb-2">Source</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setAudioSource?.('local')}
                      className={`
                        px-3 py-2 rounded-lg font-mono text-xs transition-all
                        ${audioSource === 'local'
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                          : 'bg-gray-800/50 text-gray-400 border border-gray-600/30 hover:bg-gray-700/50'
                        }
                      `}
                    >
                      💿 Local MP3s
                    </button>
                    <button
                      onClick={() => setAudioSource?.('youtube')}
                      className={`
                        px-3 py-2 rounded-lg font-mono text-xs transition-all
                        ${audioSource === 'youtube'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                          : 'bg-gray-800/50 text-gray-400 border border-gray-600/30 hover:bg-gray-700/50'
                        }
                      `}
                    >
                      📺 YouTube
                    </button>
                  </div>
                </div>
                
                {/* Conditional Rendering based on Audio Source */}
                {audioSource === 'local' ? (
                  /* Local MP3 Controls */
                  <>
                    {/* Track Info */}
                    {currentTrack && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-cyan-300 font-mono">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="truncate max-w-[200px]">{currentTrack}</span>
                  </div>
                )}
                
                {/* Playback Controls */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={previousTrack}
                    className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/30 
                               hover:border-cyan-400/50 transition-all duration-200"
                    title="Previous Track"
                  >
                    <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                    </svg>
                  </button>

                  <button
                    onClick={togglePlayPause}
                    className="p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 
                               hover:border-cyan-400/50 transition-all duration-200"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  <button
                    onClick={nextTrack}
                    className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/30 
                               hover:border-cyan-400/50 transition-all duration-200"
                    title="Next Track"
                  >
                    <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                    </svg>
                  </button>
                </div>

                {/* Volume Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Volume</span>
                    <span className="text-cyan-400 font-mono">{Math.round(((volume || 0) / 5) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={volume || 0}
                    onChange={(e) => setVolume?.(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                               [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 
                               [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-glow-sm
                               [&::-webkit-slider-thumb]:hover:shadow-glow-md [&::-webkit-slider-thumb]:transition-all"
                  />
                </div>

                {/* Distortion Toggle */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-400">Cosmic Distortion</span>
                  <button
                    onClick={toggleDistortion}
                    className={`
                      w-12 h-6 rounded-full relative transition-colors
                      ${distortionEnabled ? 'bg-cyan-500/50' : 'bg-gray-700'}
                    `}
                    aria-label="Toggle distortion effect"
                  >
                    <div className={`
                      absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                      ${distortionEnabled ? 'translate-x-6' : 'translate-x-1'}
                    `} />
                  </button>
                </div>
                  </>
                ) : (
                  /* YouTube Controls */
                  <YouTubeControls />
                )}
              </div>
            )}
            
            {/* Detailed Settings */}
            <div className="border-t border-gray-700 pt-3 space-y-3">
              {/* Particle Quality */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-gray-400">Particles</span>
                <div className="flex gap-1">
                  {(['low', 'medium', 'high'] as const).map(quality => (
                    <button
                      key={quality}
                      onClick={() => updateSetting('particleQuality', quality)}
                      className={`
                        px-2 py-1 rounded text-xs font-mono capitalize transition-colors
                        ${settings.particleQuality === quality
                          ? 'bg-cyber-cyan/20 text-cyber-cyan'
                          : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50'
                        }
                      `}
                    >
                      {quality}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Bloom Toggle */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-gray-400">Bloom</span>
                <button
                  onClick={() => updateSetting('bloomEnabled', !settings.bloomEnabled)}
                  className={`
                    w-12 h-6 rounded-full relative transition-colors
                    ${settings.bloomEnabled ? 'bg-cyber-cyan/50' : 'bg-gray-700'}
                  `}
                  aria-label="Toggle bloom effect"
                >
                  <div className={`
                    absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${settings.bloomEnabled ? 'translate-x-6' : 'translate-x-1'}
                  `} />
                </button>
              </div>
              
              {/* Show FPS */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-gray-400">Show FPS</span>
                <button
                  onClick={() => updateSetting('showFPS', !settings.showFPS)}
                  className={`
                    w-12 h-6 rounded-full relative transition-colors
                    ${settings.showFPS ? 'bg-cyber-cyan/50' : 'bg-gray-700'}
                  `}
                  aria-label="Toggle FPS display"
                >
                  <div className={`
                    absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${settings.showFPS ? 'translate-x-6' : 'translate-x-1'}
                  `} />
                </button>
              </div>
            </div>
            
            {/* System Info */}
            {systemReducedMotion && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-xs text-accent-purple font-mono">
                  ⚠️ System prefers reduced motion
                </div>
              </div>
            )}
            
            {/* Reset Button */}
            <button
              onClick={() => {
                resetToDefaults();
                setIsExpanded(false);
              }}
              className="mt-3 w-full py-2 text-xs font-mono text-gray-400 hover:text-alert-red transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

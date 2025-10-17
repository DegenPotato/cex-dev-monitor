import React, { useState } from 'react';
import { useExperienceSettings, useReducedMotion } from '../../contexts/ExperienceSettingsContext';

interface ExperienceModeToggleProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}

export const ExperienceModeToggle: React.FC<ExperienceModeToggleProps> = ({ 
  position = 'bottom-right',
  className = ''
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
      <div className="flex items-center gap-2">
        {/* Main Toggle Button */}
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
        
        {/* Expanded Settings Panel */}
        {isExpanded && (
          <div className="absolute bottom-full mb-2 right-0 glass-dark rounded-lg p-4 min-w-[280px] animate-in fade-in slide-in-from-bottom duration-300">
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

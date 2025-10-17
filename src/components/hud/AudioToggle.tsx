import React, { useState, useRef, useEffect } from 'react';
import { useExperienceSettings } from '../../contexts/ExperienceSettingsContext';

interface AudioToggleProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showVolumeSlider?: boolean;
  className?: string;
}

export const AudioToggle: React.FC<AudioToggleProps> = ({ 
  position = 'top-right',
  showVolumeSlider = true,
  className = ''
}) => {
  const { settings, toggleAudio, setVolume, updateSetting } = useExperienceSettings();
  const [isExpanded, setIsExpanded] = useState(false);
  const [localVolume, setLocalVolume] = useState(settings.audioVolume);
  const volumeDebounceRef = useRef<NodeJS.Timeout>();
  
  // Position classes
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-20',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };
  
  // Update local volume when settings change
  useEffect(() => {
    setLocalVolume(settings.audioVolume);
  }, [settings.audioVolume]);
  
  const handleVolumeChange = (newVolume: number) => {
    setLocalVolume(newVolume);
    
    // Debounce the actual update
    if (volumeDebounceRef.current) {
      clearTimeout(volumeDebounceRef.current);
    }
    
    volumeDebounceRef.current = setTimeout(() => {
      setVolume(newVolume);
    }, 100);
  };
  
  const getVolumeIcon = () => {
    if (!settings.audioEnabled || localVolume === 0) return '🔇';
    if (localVolume < 33) return '🔈';
    if (localVolume < 66) return '🔉';
    return '🔊';
  };
  
  return (
    <div 
      className={`absolute ${positionClasses[position]} pointer-events-auto ${className}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={toggleAudio}
          className={`
            glass-dark rounded-lg p-3 transition-all duration-300
            hover:shadow-glow-md hover:scale-105
            ${settings.audioEnabled ? 'border-cyber-cyan' : 'border-gray-600'}
            border focus:outline-none focus:ring-2 focus:ring-cyber-cyan
          `}
          aria-label={settings.audioEnabled ? 'Mute audio' : 'Unmute audio'}
        >
          <span className="text-xl">{getVolumeIcon()}</span>
        </button>
        
        {/* Volume Slider */}
        {showVolumeSlider && isExpanded && settings.audioEnabled && (
          <div className="glass-dark rounded-lg px-4 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-left duration-200">
            <input
              type="range"
              min="0"
              max="100"
              value={localVolume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-24 accent-cyber-cyan"
              aria-label="Volume"
            />
            <span className="font-mono text-xs text-cyber-cyan min-w-[3ch]">
              {localVolume}%
            </span>
          </div>
        )}
        
        {/* Advanced Audio Settings */}
        {isExpanded && (
          <div className="glass-dark rounded-lg px-3 py-2 flex gap-2 animate-in fade-in slide-in-from-left duration-300">
            <button
              onClick={() => updateSetting('sfxEnabled', !settings.sfxEnabled)}
              className={`
                px-2 py-1 rounded text-xs font-mono transition-colors
                ${settings.sfxEnabled 
                  ? 'bg-cyber-cyan/20 text-cyber-cyan' 
                  : 'bg-gray-700/50 text-gray-400'
                }
              `}
              aria-label="Toggle sound effects"
            >
              SFX
            </button>
            <button
              onClick={() => updateSetting('ambientEnabled', !settings.ambientEnabled)}
              className={`
                px-2 py-1 rounded text-xs font-mono transition-colors
                ${settings.ambientEnabled 
                  ? 'bg-cyber-cyan/20 text-cyber-cyan' 
                  : 'bg-gray-700/50 text-gray-400'
                }
              `}
              aria-label="Toggle ambient sound"
            >
              AMB
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useAudio } from '../../contexts/AudioContext';

interface AudioControlsProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showDistortionToggle?: boolean;
}

export const AudioControls: React.FC<AudioControlsProps> = ({ 
  position = 'top-right',
  showDistortionToggle = true 
}) => {
  const { 
    isPlaying, 
    volume, 
    distortionEnabled, 
    currentTrack,
    togglePlayPause, 
    setVolume, 
    toggleDistortion,
    nextTrack,
    previousTrack
  } = useAudio();
  
  const [isExpanded, setIsExpanded] = useState(false);

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50 pointer-events-auto`}>
      <div className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg shadow-glow-md
                      transition-all duration-300 hover:border-cyan-400/50 hover:shadow-glow-lg">
        
        {/* Compact View */}
        <div className="flex items-center gap-2 p-3">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlayPause}
            className="p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 
                       hover:border-cyan-400/50 transition-all duration-200 group"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          {/* Volume Indicator */}
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
            <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-200"
                style={{ width: `${(volume / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* Expand Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 
                       hover:border-cyan-400/50 transition-all duration-200"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg 
              className={`w-4 h-4 text-cyan-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Expanded Controls */}
        {isExpanded && (
          <div className="border-t border-cyan-500/20 p-3 space-y-3 animate-fadeIn">
            {/* Track Info */}
            <div className="text-xs text-cyan-300 font-mono">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="truncate max-w-[200px]">{currentTrack?.name || 'No track'}</span>
              </div>
            </div>

            {/* Track Controls */}
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

            {/* Volume Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Volume</span>
                <span className="text-cyan-400 font-mono">{Math.round((volume / 5) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 
                           [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-glow-sm
                           [&::-webkit-slider-thumb]:hover:shadow-glow-md [&::-webkit-slider-thumb]:transition-all"
              />
            </div>

            {/* Distortion Toggle */}
            {showDistortionToggle && (
              <div className="pt-2 border-t border-cyan-500/20">
                <button
                  onClick={toggleDistortion}
                  className={`w-full p-2 rounded-lg border transition-all duration-200 flex items-center justify-between ${
                    distortionEnabled
                      ? 'bg-cyan-500/20 border-cyan-500/50 hover:bg-cyan-500/30'
                      : 'bg-gray-800/50 border-gray-600/30 hover:bg-gray-700/50'
                  }`}
                >
                  <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    Cosmic Distortion
                  </span>
                  <div className={`w-10 h-5 rounded-full transition-all duration-200 relative ${
                    distortionEnabled ? 'bg-cyan-500' : 'bg-gray-600'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                      distortionEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </div>
                </button>
                <p className="text-xs text-gray-500 mt-1 px-1">
                  {distortionEnabled ? 'Space-warped audio enabled' : 'Clean audio playback'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

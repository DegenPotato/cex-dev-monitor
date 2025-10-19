import { useState } from 'react';
import { 
  Youtube, Play, Pause, SkipForward, SkipBack, Volume2, 
  Shuffle, Repeat, Repeat1, List, Disc3,
  Sliders
} from 'lucide-react';
import { useAudio } from '../contexts/AudioContext';
import { useYouTubeAudio } from '../contexts/YouTubeAudioContext';

interface UnifiedMusicControllerProps {
  compact?: boolean;
}

export function UnifiedMusicController({ compact = false }: UnifiedMusicControllerProps) {
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  
  // Local audio context
  const {
    audioSource,
    setAudioSource,
    isPlaying: localIsPlaying,
    volume: localVolume,
    currentTrack,
    currentTime: localCurrentTime,
    duration: localDuration,
    playlist,
    currentTrackIndex,
    bassLevel,
    trebleLevel,
    distortionAmount,
    distortionEnabled: localDistortionEnabled,
    shuffleEnabled: localShuffleEnabled,
    repeatMode: localRepeatMode,
    togglePlayPause: toggleLocalPlayPause,
    setVolume: setLocalVolume,
    toggleDistortion: toggleLocalDistortion,
    setBassLevel,
    setTrebleLevel,
    setDistortionAmount,
    nextTrack: nextLocalTrack,
    previousTrack: previousLocalTrack,
    seekTo: seekLocalTo,
    toggleShuffle: toggleLocalShuffle,
    setRepeatMode: setLocalRepeatMode,
    selectTrack
  } = useAudio();
  
  // YouTube audio context  
  const {
    isPlaying: youtubeIsPlaying,
    currentVideo,
    volume: youtubeVolume,
    currentTime: youtubeCurrentTime,
    duration: youtubeDuration,
    distortionEnabled: youtubeDistortionEnabled,
    isAuthenticated: isYouTubeSignedIn,
    play: playYoutube,
    pause: pauseYoutube,
    skip: skipYoutube,
    previous: previousYoutube,
    setVolume: setYoutubeVolume,
    seekTo: seekYoutubeTo,
    toggleDistortion: toggleYoutubeDistortion,
    signIn: signInYoutube
  } = useYouTubeAudio();

  // Unified state based on audio source
  const isPlaying = audioSource === 'local' ? localIsPlaying : youtubeIsPlaying;
  const volume = audioSource === 'local' ? localVolume * 100 : youtubeVolume;
  const currentTime = audioSource === 'local' ? localCurrentTime : youtubeCurrentTime;
  const duration = audioSource === 'local' ? localDuration : youtubeDuration;
  const distortionEnabled = audioSource === 'local' ? localDistortionEnabled : youtubeDistortionEnabled;
  
  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Unified controls
  const handlePlayPause = () => {
    if (audioSource === 'local') {
      toggleLocalPlayPause();
    } else {
      if (youtubeIsPlaying) {
        pauseYoutube();
      } else {
        playYoutube();
      }
    }
  };

  const handleNext = () => {
    if (audioSource === 'local') {
      nextLocalTrack();
    } else {
      skipYoutube();
    }
  };

  const handlePrevious = () => {
    if (audioSource === 'local') {
      previousLocalTrack();
    } else {
      previousYoutube();
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    if (audioSource === 'local') {
      setLocalVolume(newVolume / 100);
    } else {
      setYoutubeVolume(newVolume);
    }
  };

  const handleSeek = (newTime: number) => {
    if (audioSource === 'local') {
      seekLocalTo(newTime);
    } else {
      seekYoutubeTo(newTime);
    }
  };

  const toggleDistortion = () => {
    if (audioSource === 'local') {
      toggleLocalDistortion();
    } else {
      toggleYoutubeDistortion();
    }
  };

  const handleSourceToggle = () => {
    // Pause current source before switching
    if (audioSource === 'local' && localIsPlaying) {
      toggleLocalPlayPause();
    } else if (audioSource === 'youtube' && youtubeIsPlaying) {
      pauseYoutube();
    }
    
    // Switch source
    setAudioSource(audioSource === 'local' ? 'youtube' : 'local');
  };

  const getRepeatIcon = () => {
    if (audioSource !== 'local') return <Repeat className="w-4 h-4" />;
    
    switch (localRepeatMode) {
      case 'one': return <Repeat1 className="w-4 h-4" />;
      case 'all': return <Repeat className="w-4 h-4 text-cyan-400" />;
      default: return <Repeat className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-full space-y-2">
      {/* Source Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {audioSource === 'local' ? (
            <Disc3 className="w-4 h-4 text-cyan-400" />
          ) : (
            <Youtube className="w-4 h-4 text-red-500" />
          )}
          <span className="text-xs text-gray-400 uppercase">
            {audioSource === 'local' ? 'Local Music' : 'YouTube'}
          </span>
        </div>
        
        <button
          onClick={handleSourceToggle}
          className="px-2 py-1 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 
                   border border-cyan-500/40 rounded text-cyan-400 transition-colors"
        >
          Switch to {audioSource === 'local' ? 'YouTube' : 'Local'}
        </button>
      </div>

      {/* YouTube Sign In (if YouTube source and not signed in) */}
      {audioSource === 'youtube' && !isYouTubeSignedIn && (
        <button
          onClick={signInYoutube}
          className="w-full px-3 py-2 bg-red-600/20 hover:bg-red-600/30 
                   border border-red-500/40 rounded text-red-400 transition-colors
                   text-xs font-medium"
        >
          Connect YouTube Account
        </button>
      )}

      {/* Current Track/Video Info */}
      <div className="min-h-[20px]">
        {audioSource === 'local' && currentTrack && (
          <div className="text-xs text-cyan-100 truncate">{currentTrack.name}</div>
        )}
        {audioSource === 'youtube' && currentVideo && (
          <div className="text-xs text-cyan-100 truncate">{currentVideo.title}</div>
        )}
      </div>

      {/* Progress Bar */}
      {duration > 0 && (
        <div className="space-y-1">
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={(e) => handleSeek(parseInt(e.target.value))}
            className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 
                     [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-cyan-400 
                     [&::-webkit-slider-thumb]:rounded-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Player Controls */}
      <div className="flex items-center justify-center gap-1">
        {/* Shuffle (Local only) */}
        {audioSource === 'local' && (
          <button 
            onClick={toggleLocalShuffle}
            className={`p-1.5 rounded transition-colors ${
              localShuffleEnabled 
                ? 'text-cyan-400 bg-cyan-500/20' 
                : 'text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
        )}
        
        {/* Previous */}
        <button 
          onClick={handlePrevious}
          className="p-1.5 hover:bg-cyan-500/20 rounded transition-colors text-cyan-400"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-full transition-colors 
                   text-cyan-400 border border-cyan-500/40"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        
        {/* Next */}
        <button 
          onClick={handleNext}
          className="p-1.5 hover:bg-cyan-500/20 rounded transition-colors text-cyan-400"
        >
          <SkipForward className="w-4 h-4" />
        </button>
        
        {/* Repeat (Local only) */}
        {audioSource === 'local' && (
          <button 
            onClick={() => {
              const modes = ['off', 'all', 'one'] as const;
              const currentIndex = modes.indexOf(localRepeatMode);
              setLocalRepeatMode(modes[(currentIndex + 1) % modes.length]);
            }}
            className={`p-1.5 rounded transition-colors ${
              localRepeatMode !== 'off' 
                ? 'text-cyan-400 bg-cyan-500/20' 
                : 'text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10'
            }`}
          >
            {getRepeatIcon()}
          </button>
        )}
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-2">
        <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
          className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 
                   [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-cyan-400 
                   [&::-webkit-slider-thumb]:rounded-full"
        />
        <span className="text-cyan-400 text-xs w-8 text-right">{Math.round(volume)}%</span>
      </div>

      {/* Advanced Controls Toggle */}
      {!compact && (
        <button
          onClick={() => setShowAdvancedControls(!showAdvancedControls)}
          className="w-full flex items-center justify-center gap-2 py-1.5 
                   text-xs text-gray-400 hover:text-cyan-400 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          {showAdvancedControls ? 'Hide' : 'Show'} Advanced Controls
        </button>
      )}

      {/* Advanced Audio Controls (Local only) */}
      {!compact && showAdvancedControls && audioSource === 'local' && (
        <div className="space-y-2 p-2 bg-black/40 rounded border border-cyan-500/20">
          {/* Bass Control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16">Bass</span>
            <input
              type="range"
              min="0"
              max="100"
              value={bassLevel}
              onChange={(e) => setBassLevel(parseInt(e.target.value))}
              className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 
                       [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-purple-400 
                       [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="text-xs text-purple-400 w-8 text-right">{bassLevel}%</span>
          </div>

          {/* Treble Control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16">Treble</span>
            <input
              type="range"
              min="0"
              max="100"
              value={trebleLevel}
              onChange={(e) => setTrebleLevel(parseInt(e.target.value))}
              className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 
                       [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-yellow-400 
                       [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="text-xs text-yellow-400 w-8 text-right">{trebleLevel}%</span>
          </div>

          {/* Distortion */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Distortion</span>
            <button
              onClick={toggleDistortion}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                distortionEnabled 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40' 
                  : 'bg-gray-700 text-gray-400 border border-gray-600'
              }`}
            >
              {distortionEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {distortionEnabled && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16">Amount</span>
              <input
                type="range"
                min="0"
                max="100"
                value={distortionAmount}
                onChange={(e) => setDistortionAmount(parseInt(e.target.value))}
                className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 
                         [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-red-400 
                         [&::-webkit-slider-thumb]:rounded-full"
              />
              <span className="text-xs text-red-400 w-8 text-right">{distortionAmount}%</span>
            </div>
          )}
        </div>
      )}

      {/* Playlist (Local only) */}
      {!compact && audioSource === 'local' && (
        <>
          <button
            onClick={() => setShowPlaylist(!showPlaylist)}
            className="w-full flex items-center justify-center gap-2 py-1.5 
                     text-xs text-gray-400 hover:text-cyan-400 transition-colors"
          >
            <List className="w-3.5 h-3.5" />
            {showPlaylist ? 'Hide' : 'Show'} Playlist
          </button>
          
          {showPlaylist && (
            <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-black/40 rounded border border-cyan-500/20">
              {playlist.map((track, index) => (
                <button
                  key={track.id}
                  onClick={() => selectTrack(index)}
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                    index === currentTrackIndex
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-gray-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{track.name}</span>
                    <span className="text-xs opacity-50">{track.duration}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

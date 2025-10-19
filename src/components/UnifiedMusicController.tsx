import { useState } from 'react';
import { 
  Youtube, Play, Pause, SkipForward, SkipBack, Volume2, 
  Disc3, Music2
} from 'lucide-react';
import { useAudio } from '../contexts/AudioContext';
import { useYouTubeAudio } from '../contexts/YouTubeAudioContext';
import { MusicManager } from './MusicManager';

export function UnifiedMusicController() {
  const [showMusicManager, setShowMusicManager] = useState(false);
  
  // Local audio context
  const {
    audioSource,
    isPlaying: localIsPlaying,
    volume: localVolume,
    currentTrack,
    togglePlayPause: toggleLocalPlayPause,
    setVolume: setLocalVolume,
    nextTrack: nextLocalTrack,
    previousTrack: previousLocalTrack
  } = useAudio();
  
  // YouTube audio context  
  const {
    isPlaying: youtubeIsPlaying,
    currentVideo,
    volume: youtubeVolume,
    play: playYoutube,
    pause: pauseYoutube,
    skip: skipYoutube,
    previous: previousYoutube,
    setVolume: setYoutubeVolume
  } = useYouTubeAudio();

  // Unified state based on audio source
  const isPlaying = audioSource === 'local' ? localIsPlaying : youtubeIsPlaying;
  const volume = audioSource === 'local' ? localVolume * 100 : youtubeVolume;

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

  return (
    <>
      <div className="w-full space-y-2">
        {/* Source and Manager Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {audioSource === 'local' ? (
              <Disc3 className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Youtube className="w-3.5 h-3.5 text-red-500" />
            )}
            <span className="text-xs text-gray-400 uppercase">
              {audioSource === 'local' ? 'Local' : 'YouTube'}
            </span>
          </div>
          
          <button
            onClick={() => setShowMusicManager(true)}
            className="px-2 py-1 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 
                     border border-cyan-500/40 rounded text-cyan-400 transition-colors
                     flex items-center gap-1"
          >
            <Music2 className="w-3.5 h-3.5" />
            Manage
          </button>
        </div>

        {/* Current Track/Video Info */}
        <div className="min-h-[16px]">
          {audioSource === 'local' && currentTrack && (
            <div className="text-xs text-cyan-100 truncate">{currentTrack.name}</div>
          )}
          {audioSource === 'youtube' && currentVideo && (
            <div className="text-xs text-cyan-100 truncate">{currentVideo.title}</div>
          )}
        </div>

        {/* Player Controls */}
        <div className="flex items-center justify-center gap-2">
          {/* Previous */}
          <button 
            onClick={handlePrevious}
            className="p-1.5 hover:bg-cyan-500/20 rounded transition-colors text-cyan-400"
          >
            <SkipBack className="w-3.5 h-3.5" />
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
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <Volume2 className="w-3 h-3 text-cyan-400" />
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
          <span className="text-cyan-400 text-xs w-6 text-right">{Math.round(volume)}%</span>
        </div>
      </div>
      
      {/* Music Manager Modal - rendered outside main container */}
      <MusicManager 
        isOpen={showMusicManager} 
        onClose={() => setShowMusicManager(false)} 
      />
    </>
  );
}

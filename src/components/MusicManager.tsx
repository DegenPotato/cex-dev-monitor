import { useState, useEffect } from 'react';
import { 
  Youtube, Play, Pause, SkipForward, SkipBack, Volume2, 
  Shuffle, Repeat, Repeat1, List, Disc3, Search, X,
  Sliders, Music, Plus, Trash2, ExternalLink
} from 'lucide-react';
import { useAudio } from '../contexts/AudioContext';
import { useYouTubeAudio } from '../contexts/YouTubeAudioContext';

interface MusicManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicManager({ isOpen, onClose }: MusicManagerProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'youtube'>('local');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);
  
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
    queue: youtubeQueue,
    shuffle: youtubeShuffle,
    repeat: youtubeRepeat,
    distortionEnabled: youtubeDistortionEnabled,
    isAuthenticated: isYouTubeSignedIn,
    userEmail,
    userPlaylists,
    play: playYoutube,
    pause: pauseYoutube,
    skip: skipYoutube,
    previous: previousYoutube,
    setVolume: setYoutubeVolume,
    seekTo: seekYoutubeTo,
    toggleDistortion: toggleYoutubeDistortion,
    signIn: signInYoutube,
    signOut: signOutYoutube,
    searchVideos,
    addToQueue,
    removeFromQueue,
    clearQueue,
    playVideo,
    loadPlaylist
  } = useYouTubeAudio();

  // Switch audio source when tab changes
  useEffect(() => {
    if (audioSource !== activeTab) {
      // Pause current source
      if (audioSource === 'local' && localIsPlaying) {
        toggleLocalPlayPause();
      } else if (audioSource === 'youtube' && youtubeIsPlaying) {
        pauseYoutube();
      }
      // Switch source
      setAudioSource(activeTab);
    }
  }, [activeTab]);

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // YouTube search
  const handleYouTubeSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await searchVideos(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
      <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-cyan-500/30 
                    shadow-[0_0_40px_rgba(0,255,255,0.3)] w-full max-w-4xl max-h-[90vh] 
                    flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <Music className="w-6 h-6 text-cyan-400" />
            <h2 className="text-2xl font-bold text-cyan-400">Music Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors text-gray-400 hover:text-cyan-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-cyan-500/20">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 transition-colors ${
              activeTab === 'local'
                ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-400'
                : 'text-gray-400 hover:text-cyan-300 hover:bg-cyan-500/10'
            }`}
          >
            <Disc3 className="w-4 h-4" />
            Local Music
          </button>
          <button
            onClick={() => setActiveTab('youtube')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 transition-colors ${
              activeTab === 'youtube'
                ? 'bg-red-500/20 text-red-400 border-b-2 border-red-400'
                : 'text-gray-400 hover:text-red-300 hover:bg-red-500/10'
            }`}
          >
            <Youtube className="w-4 h-4" />
            YouTube
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Panel - Playlist/Queue */}
          <div className="w-1/3 border-r border-cyan-500/20 flex flex-col">
            <div className="p-4 border-b border-cyan-500/20">
              <h3 className="text-sm font-bold text-gray-400 uppercase">
                {activeTab === 'local' ? 'Playlist' : 'Queue'}
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {activeTab === 'local' ? (
                // Local Playlist
                playlist.map((track, index) => (
                  <div
                    key={track.id}
                    onClick={() => selectTrack(index)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      index === currentTrackIndex
                        ? 'bg-cyan-500/20 border border-cyan-500/40'
                        : 'hover:bg-cyan-500/10 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${
                          index === currentTrackIndex ? 'text-cyan-400' : 'text-gray-300'
                        }`}>
                          {track.name}
                        </div>
                        <div className="text-xs text-gray-500">{track.artist}</div>
                      </div>
                      <span className="text-xs text-gray-400 ml-2">{track.duration}</span>
                    </div>
                  </div>
                ))
              ) : (
                // YouTube Queue
                <>
                  {!isYouTubeSignedIn ? (
                    <div className="text-center py-8">
                      <button
                        onClick={signInYoutube}
                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 
                                 border border-red-500/40 rounded-lg text-red-400 
                                 transition-colors"
                      >
                        Connect YouTube Account
                      </button>
                    </div>
                  ) : (
                    <>
                      {youtubeQueue.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                          Queue is empty. Search for songs to add.
                        </div>
                      ) : (
                        youtubeQueue.map((video) => (
                          <div
                            key={video.id}
                            className="p-3 rounded-lg hover:bg-red-500/10 border border-transparent 
                                     hover:border-red-500/40 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <img 
                                src={video.thumbnail} 
                                alt={video.title}
                                className="w-12 h-12 rounded object-cover"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-300 truncate">
                                  {video.title}
                                </div>
                                <div className="text-xs text-gray-500">{video.channelTitle}</div>
                              </div>
                              <button
                                onClick={() => removeFromQueue(video.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 
                                         rounded transition-all"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Search/Controls */}
          <div className="flex-1 flex flex-col">
            {activeTab === 'youtube' && isYouTubeSignedIn && (
              <>
                {/* YouTube Search */}
                <div className="p-4 border-b border-cyan-500/20">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleYouTubeSearch()}
                      placeholder="Search YouTube..."
                      className="flex-1 px-4 py-2 bg-black/40 border border-cyan-500/30 rounded-lg
                               text-gray-300 placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      onClick={handleYouTubeSearch}
                      disabled={isSearching}
                      className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40
                               rounded-lg text-cyan-400 transition-colors disabled:opacity-50"
                    >
                      {isSearching ? '...' : <Search className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Search Results */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {searchResults.map((video) => (
                    <div
                      key={video.id}
                      className="p-3 rounded-lg hover:bg-cyan-500/10 border border-transparent 
                               hover:border-cyan-500/40 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <img 
                          src={video.thumbnail} 
                          alt={video.title}
                          className="w-16 h-16 rounded object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-300 truncate">
                            {video.title}
                          </div>
                          <div className="text-xs text-gray-500">{video.channelTitle}</div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => playVideo(video)}
                            className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg 
                                     text-cyan-400 transition-colors"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => addToQueue(video)}
                            className="p-2 bg-green-500/20 hover:bg-green-500/30 rounded-lg 
                                     text-green-400 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Equalizer Section */}
            <div className="p-4 border-t border-cyan-500/20">
              <button
                onClick={() => setShowEqualizer(!showEqualizer)}
                className="w-full flex items-center justify-center gap-2 py-2 
                         text-sm text-gray-400 hover:text-cyan-400 transition-colors"
              >
                <Sliders className="w-4 h-4" />
                {showEqualizer ? 'Hide' : 'Show'} Equalizer & Effects
              </button>
              
              {showEqualizer && (
                <div className="mt-4 space-y-4">
                  {/* Volume */}
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-gray-400 w-16">Volume</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={activeTab === 'local' ? localVolume * 100 : youtubeVolume}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        activeTab === 'local' ? setLocalVolume(val / 100) : setYoutubeVolume(val);
                      }}
                      className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 
                               [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 
                               [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <span className="text-xs text-cyan-400 w-12 text-right">
                      {Math.round(activeTab === 'local' ? localVolume * 100 : youtubeVolume)}%
                    </span>
                  </div>

                  {activeTab === 'local' && (
                    <>
                      {/* Bass */}
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 flex items-center justify-center">
                          <span className="text-xs font-bold text-purple-400">B</span>
                        </div>
                        <span className="text-xs text-gray-400 w-16">Bass</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={bassLevel}
                          onChange={(e) => setBassLevel(parseInt(e.target.value))}
                          className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 
                                   [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-purple-400 
                                   [&::-webkit-slider-thumb]:rounded-full"
                        />
                        <span className="text-xs text-purple-400 w-12 text-right">{bassLevel}%</span>
                      </div>

                      {/* Treble */}
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 flex items-center justify-center">
                          <span className="text-xs font-bold text-yellow-400">T</span>
                        </div>
                        <span className="text-xs text-gray-400 w-16">Treble</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={trebleLevel}
                          onChange={(e) => setTrebleLevel(parseInt(e.target.value))}
                          className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 
                                   [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-yellow-400 
                                   [&::-webkit-slider-thumb]:rounded-full"
                        />
                        <span className="text-xs text-yellow-400 w-12 text-right">{trebleLevel}%</span>
                      </div>

                      {/* Distortion */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 flex items-center justify-center">
                              <span className="text-xs font-bold text-red-400">D</span>
                            </div>
                            <span className="text-xs text-gray-400">Distortion</span>
                          </div>
                          <button
                            onClick={toggleLocalDistortion}
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              localDistortionEnabled 
                                ? 'bg-red-500/20 text-red-400 border border-red-500/40' 
                                : 'bg-gray-700 text-gray-400 border border-gray-600'
                            }`}
                          >
                            {localDistortionEnabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
                        
                        {localDistortionEnabled && (
                          <div className="flex items-center gap-3 pl-7">
                            <span className="text-xs text-gray-400 w-16">Amount</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={distortionAmount}
                              onChange={(e) => setDistortionAmount(parseInt(e.target.value))}
                              className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer 
                                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 
                                       [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-400 
                                       [&::-webkit-slider-thumb]:rounded-full"
                            />
                            <span className="text-xs text-red-400 w-12 text-right">{distortionAmount}%</span>
                          </div>
                        )}
                      </div>

                      {/* Playback Modes */}
                      <div className="flex items-center justify-between pt-2 border-t border-cyan-500/10">
                        <button
                          onClick={toggleLocalShuffle}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                            localShuffleEnabled 
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' 
                              : 'bg-gray-700 text-gray-400 border border-gray-600'
                          }`}
                        >
                          <Shuffle className="w-4 h-4" />
                          <span className="text-xs">Shuffle</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            const modes = ['off', 'all', 'one'] as const;
                            const currentIndex = modes.indexOf(localRepeatMode);
                            setLocalRepeatMode(modes[(currentIndex + 1) % modes.length]);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                            localRepeatMode !== 'off'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' 
                              : 'bg-gray-700 text-gray-400 border border-gray-600'
                          }`}
                        >
                          {localRepeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                          <span className="text-xs">
                            {localRepeatMode === 'off' ? 'No Repeat' : 
                             localRepeatMode === 'one' ? 'Repeat One' : 'Repeat All'}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {activeTab === 'local' && (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Music className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">Local music player ready</p>
                  <p className="text-xs mt-2">Select a track from the playlist to begin</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

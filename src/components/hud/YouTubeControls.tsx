import React, { useState } from 'react';
import { useYouTubeAudio } from '../../contexts/YouTubeAudioContext';

export const YouTubeControls: React.FC = () => {
  const {
    isYouTubeReady,
    isPlaying,
    currentVideo,
    queue,
    volume,
    isAuthenticated,
    userEmail,
    play,
    pause,
    skip,
    previous,
    setVolume,
    addToQueue,
    removeFromQueue,
    clearQueue,
    userPlaylists,
    loadPlaylist,
    searchVideos,
    signIn,
    signOut,
  } = useYouTubeAudio();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const handleSearch = async () => {
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

  const handleAddToQueue = (video: any) => {
    addToQueue(video);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleLoadPlaylist = async (playlistId: string) => {
    try {
      await loadPlaylist(playlistId);
      setShowPlaylists(false);
    } catch (error) {
      console.error('Failed to load playlist:', error);
    }
  };

  if (!isYouTubeReady) {
    return (
      <div className="p-4 text-center">
        <div className="text-cyan-400 font-mono text-sm animate-pulse">
          🎬 Loading YouTube Player...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Authentication Section */}
      {!isAuthenticated ? (
        <div className="border-t border-gray-700 pt-3">
          <h4 className="font-mono text-sm text-cyan-400 mb-2">📺 YouTube Music</h4>
          <button
            onClick={signIn}
            className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 
                       hover:border-cyan-400/50 rounded-lg text-cyan-400 font-mono text-sm transition-all duration-200"
          >
            Connect Google Account
          </button>
          <p className="text-xs text-gray-500 mt-2 font-mono">
            Connect to access your playlists and search YouTube music
          </p>
        </div>
      ) : (
        <div className="border-t border-gray-700 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-mono text-sm text-cyan-400">📺 YouTube Music</h4>
              <p className="text-xs text-gray-500 font-mono">✓ {userEmail}</p>
            </div>
            <button
              onClick={signOut}
              className="px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 
                         rounded text-red-400 font-mono transition-all"
            >
              Disconnect
            </button>
          </div>

          {/* Search Section */}
          <div>
            <label className="block text-xs text-gray-400 font-mono mb-2">🔍 Search Music</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter song name or artist..."
                className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-600/30 rounded-lg 
                           text-cyan-400 text-sm font-mono focus:outline-none focus:border-cyan-400/50"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 
                           rounded-lg text-cyan-400 font-mono text-sm transition-all disabled:opacity-50"
              >
                {isSearching ? '⏳' : '🔎'}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2 border border-cyan-500/20 rounded-lg p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 font-mono">Search Results</span>
                <button
                  onClick={() => setSearchResults([])}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  ✕ Clear
                </button>
              </div>
              {searchResults.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center gap-2 p-2 bg-gray-800/50 rounded hover:bg-gray-700/50 transition-all"
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-16 h-12 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-cyan-300 font-mono truncate">{video.title}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{video.channelTitle}</p>
                  </div>
                  <button
                    onClick={() => handleAddToQueue(video)}
                    className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 
                               rounded text-cyan-400 text-xs font-mono"
                  >
                    + Queue
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Playlists Section */}
          <div>
            <button
              onClick={() => setShowPlaylists(!showPlaylists)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/30 
                         hover:bg-gray-700/50 rounded-lg border border-gray-600/20 transition-all"
            >
              <span className="text-xs text-gray-400 font-mono">📚 Your Playlists ({userPlaylists.length})</span>
              <span className="text-cyan-400">{showPlaylists ? '▼' : '▶'}</span>
            </button>
            
            {showPlaylists && userPlaylists.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-2 border border-cyan-500/20 rounded-lg p-2">
                {userPlaylists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="flex items-center gap-2 p-2 bg-gray-800/50 rounded hover:bg-gray-700/50 
                               transition-all cursor-pointer"
                    onClick={() => handleLoadPlaylist(playlist.id)}
                  >
                    <img
                      src={playlist.thumbnail}
                      alt={playlist.title}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-cyan-300 font-mono truncate">{playlist.title}</p>
                      <p className="text-xs text-gray-500 font-mono">{playlist.itemCount} tracks</p>
                    </div>
                    <span className="text-cyan-400 text-sm">▶</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Now Playing */}
          {currentVideo && (
            <div className="border border-cyan-500/30 rounded-lg p-3 bg-cyan-500/5">
              <div className="flex items-center gap-2 mb-2 text-xs text-cyan-300 font-mono">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="truncate">Now Playing</span>
              </div>
              <div className="flex items-center gap-2">
                <img
                  src={currentVideo.thumbnail}
                  alt={currentVideo.title}
                  className="w-16 h-12 rounded object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cyan-300 font-mono truncate">{currentVideo.title}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{currentVideo.channelTitle}</p>
                </div>
              </div>
            </div>
          )}

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={previous}
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/30 
                         hover:border-cyan-400/50 transition-all duration-200"
              title="Previous Track"
            >
              <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>

            <button
              onClick={isPlaying ? pause : play}
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
              onClick={skip}
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
              <span className="text-cyan-400 font-mono">{Math.round(volume)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 
                         [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-glow-sm
                         [&::-webkit-slider-thumb]:hover:shadow-glow-md [&::-webkit-slider-thumb]:transition-all"
            />
          </div>

          {/* Queue Section */}
          {queue.length > 0 && (
            <div>
              <button
                onClick={() => setShowQueue(!showQueue)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/30 
                           hover:bg-gray-700/50 rounded-lg border border-gray-600/20 transition-all"
              >
                <span className="text-xs text-gray-400 font-mono">📋 Queue ({queue.length})</span>
                <span className="text-cyan-400">{showQueue ? '▼' : '▶'}</span>
              </button>
              
              {showQueue && (
                <div className="mt-2 max-h-48 overflow-y-auto space-y-2 border border-cyan-500/20 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 font-mono">Up Next</span>
                    <button
                      onClick={clearQueue}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Clear All
                    </button>
                  </div>
                  {queue.map((video, index) => (
                    <div
                      key={`${video.id}-${index}`}
                      className="flex items-center gap-2 p-2 bg-gray-800/50 rounded group"
                    >
                      <span className="text-xs text-gray-500 font-mono w-6">{index + 1}.</span>
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-12 h-9 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-cyan-300 font-mono truncate">{video.title}</p>
                      </div>
                      <button
                        onClick={() => removeFromQueue(video.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

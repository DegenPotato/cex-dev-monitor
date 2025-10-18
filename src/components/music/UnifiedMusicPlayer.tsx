/**
 * Unified Music Player - Supports both Local MP3s and YouTube Music
 * Toggleable between the two sources with full controls for both
 */

import React, { useState } from 'react';
import { useAudio, type AudioSource } from '../../contexts/AudioContext';
import { useYouTubeAudio } from '../../contexts/YouTubeAudioContext';

interface UnifiedMusicPlayerProps {
  onClose: () => void;
}

export const UnifiedMusicPlayer: React.FC<UnifiedMusicPlayerProps> = ({ onClose }) => {
  // Get both audio contexts
  const localAudio = useAudio();
  const youtubeAudio = useYouTubeAudio();
  
  // Audio source toggle
  const [audioSource, setAudioSource] = useState<AudioSource>('local');
  
  // YouTube search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // Determine which context to use
  const isLocal = audioSource === 'local';
  const currentContext = isLocal ? localAudio : youtubeAudio;
  
  // Handle YouTube search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    console.log('🔍 Searching for:', searchQuery);
    const results = await youtubeAudio.searchVideos(searchQuery);
    setSearchResults(results);
    console.log('✅ Search results:', results.length);
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center pointer-events-auto">
      <div className="w-full max-w-6xl h-[90vh] bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-lg border-2 border-pink-500 p-6 flex flex-col">
        
        {/* Header with Source Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-bold text-pink-400">🎵 Music Player</h2>
            
            {/* Source Toggle */}
            <div className="flex gap-2 bg-black/50 p-1 rounded-lg">
              <button
                onClick={() => setAudioSource('local')}
                className={`px-4 py-2 rounded transition-all ${
                  isLocal 
                    ? 'bg-pink-500 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                💿 Local
              </button>
              <button
                onClick={() => setAudioSource('youtube')}
                className={`px-4 py-2 rounded transition-all ${
                  !isLocal 
                    ? 'bg-red-500 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                📺 YouTube
              </button>
            </div>
          </div>
          
          <button 
            onClick={onClose} 
            className="text-red-400 hover:text-red-300 hover:bg-red-500/20 text-3xl font-bold px-3 py-1 rounded transition-all"
          >
            ×
          </button>
        </div>

        {/* Now Playing Section */}
        <div className="bg-gradient-to-r from-pink-900/20 to-purple-900/20 border border-pink-500/30 rounded-lg p-6 mb-4">
          <div className="flex items-center gap-6">
            {/* Album Art / Thumbnail */}
            <div className="w-32 h-32 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center overflow-hidden">
              {!isLocal && youtubeAudio.currentVideo?.thumbnail ? (
                <img src={youtubeAudio.currentVideo.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
              ) : (
                <span className="text-6xl">🎵</span>
              )}
            </div>
            
            {/* Track Info */}
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-pink-300 mb-1">
                {isLocal 
                  ? (localAudio.currentTrack?.name || 'No Track Playing')
                  : (youtubeAudio.currentVideo?.title || 'No Video Selected')
                }
              </h3>
              <p className="text-pink-400/60 mb-4">
                {isLocal 
                  ? (localAudio.currentTrack?.artist || 'Local Collection')
                  : (youtubeAudio.currentVideo?.channelTitle || 'YouTube Music')
                }
              </p>
              
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>
                    {Math.floor((isLocal ? localAudio.currentTime : 0) / 60)}:
                    {String(Math.floor((isLocal ? localAudio.currentTime : 0) % 60)).padStart(2, '0')}
                  </span>
                  <span>
                    {Math.floor((isLocal ? localAudio.duration : 0) / 60)}:
                    {String(Math.floor((isLocal ? localAudio.duration : 0) % 60)).padStart(2, '0')}
                  </span>
                </div>
                <div 
                  className="w-full bg-gray-800 rounded-full h-2 cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    if (isLocal) {
                      localAudio.seekTo(localAudio.duration * percent);
                    } else {
                      youtubeAudio.seekTo(percent);
                    }
                  }}
                >
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full pointer-events-none" 
                    style={{ 
                      width: `${isLocal 
                        ? (localAudio.duration > 0 ? (localAudio.currentTime / localAudio.duration) * 100 : 0)
                        : 0
                      }%` 
                    }}
                  />
                </div>
              </div>
              
              {/* Playback Controls */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => isLocal ? localAudio.previousTrack() : youtubeAudio.previous()}
                  className="text-pink-400 hover:text-pink-300 transition-colors text-2xl"
                >
                  ⏮️
                </button>
                <button 
                  onClick={() => isLocal ? localAudio.togglePlayPause() : (currentContext.isPlaying ? youtubeAudio.pause() : youtubeAudio.play())}
                  className="text-pink-400 hover:text-pink-300 transition-colors text-4xl"
                >
                  {currentContext.isPlaying ? '⏸️' : '▶️'}
                </button>
                <button 
                  onClick={() => isLocal ? localAudio.nextTrack() : youtubeAudio.skip()}
                  className="text-pink-400 hover:text-pink-300 transition-colors text-2xl"
                >
                  ⏭️
                </button>
                
                {/* Volume Control */}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xl">🔊</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isLocal ? localAudio.volume * 100 : youtubeAudio.volume}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (isLocal) {
                        localAudio.setVolume(val / 100);
                      } else {
                        youtubeAudio.setVolume(val);
                      }
                    }}
                    className="w-24"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area - Different for Local vs YouTube */}
        <div className="flex-1 overflow-hidden">
          {isLocal ? (
            // Local Music Player View
            <div className="h-full flex flex-col">
              <h3 className="text-pink-300 text-xl mb-4">📀 Local Playlist ({localAudio.playlist.length} tracks)</h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {localAudio.playlist.map((track, index) => (
                  <div
                    key={track.id}
                    onClick={() => localAudio.selectTrack(index)}
                    className={`p-3 rounded cursor-pointer transition-all ${
                      index === localAudio.currentTrackIndex
                        ? 'bg-pink-500/30 border border-pink-500'
                        : 'bg-gray-800/50 hover:bg-gray-800/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">{track.name}</div>
                        <div className="text-gray-400 text-sm">{track.artist || 'Unknown Artist'} • {track.duration}</div>
                      </div>
                      {index === localAudio.currentTrackIndex && localAudio.isPlaying && (
                        <span className="text-pink-400">🎵</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // YouTube Music Player View
            <div className="h-full flex gap-4">
              {/* YouTube Search & Queue */}
              <div className="w-1/2 flex flex-col">
                <h3 className="text-pink-300 text-xl mb-4">🔍 YouTube Search</h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search YouTube..."
                    className="flex-1 bg-black/50 text-white px-4 py-2 rounded border border-pink-500/30 focus:border-pink-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
                  />
                  <button 
                    onClick={handleSearch}
                    className="bg-pink-500/20 text-pink-400 px-6 py-2 rounded hover:bg-pink-500/30"
                  >
                    Search
                  </button>
                </div>
                
                {/* Search Results */}
                {searchResults.length > 0 && (
                  <>
                    <h4 className="text-pink-300 mb-2">Search Results ({searchResults.length})</h4>
                    <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                      {searchResults.map((video) => (
                        <div
                          key={video.id}
                          onClick={() => {
                            youtubeAudio.addToQueue(video);
                            youtubeAudio.playVideo(video.id);
                          }}
                          className="p-3 bg-gray-800/50 rounded border border-transparent hover:border-pink-500/50 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <img src={video.thumbnail} alt={video.title} className="w-16 h-12 object-cover rounded" />
                            <div className="flex-1 min-w-0">
                              <div className="text-white text-sm truncate">{video.title}</div>
                              <div className="text-gray-400 text-xs">{video.channelTitle}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                
                {/* Queue */}
                <h4 className="text-pink-300 mb-2">Current Queue ({youtubeAudio.queue.length})</h4>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {youtubeAudio.queue.map((video) => (
                  <div
                    key={video.id}
                    className="p-3 bg-gray-800/50 rounded border border-transparent hover:border-pink-500/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <img src={video.thumbnail} alt={video.title} className="w-16 h-12 object-cover rounded" />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm truncate">{video.title}</div>
                        <div className="text-gray-400 text-xs">{video.channelTitle}</div>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </div>
              
              {/* YouTube Auth & Playlists */}
              <div className="w-1/2 flex flex-col">
                {!youtubeAudio.isAuthenticated ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-gray-400 mb-4">Connect your Google account to access your YouTube playlists</p>
                    <button 
                      onClick={youtubeAudio.signIn}
                      className="bg-red-500/20 text-red-400 px-6 py-3 rounded hover:bg-red-500/30"
                    >
                      🔐 Connect Google Account
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-green-400">✅ Connected: {youtubeAudio.userEmail}</h3>
                      <button 
                        onClick={youtubeAudio.signOut}
                        className="text-red-400 text-sm hover:text-red-300"
                      >
                        Sign Out
                      </button>
                    </div>
                    <h4 className="text-pink-300 mb-2">📚 Your Playlists</h4>
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {youtubeAudio.userPlaylists.map((playlist) => (
                        <div
                          key={playlist.id}
                          className="p-3 bg-gray-800/50 rounded hover:bg-gray-800/70 cursor-pointer border border-transparent hover:border-pink-500/50"
                          onClick={() => youtubeAudio.loadPlaylist(playlist.id)}
                        >
                          <div className="text-white font-medium">{playlist.title}</div>
                          <div className="text-gray-400 text-sm">{playlist.itemCount} videos</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

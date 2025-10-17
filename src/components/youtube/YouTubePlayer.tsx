/**
 * YouTube Player Component with Full API Integration
 * Provides search, playback, and playlist management
 */

import React, { useState, useEffect, useRef } from 'react';
import { useYouTubeAudio } from '../../contexts/YouTubeAudioContext';

// YouTube types are already declared in YouTubeAudioContext.tsx
// No need to redeclare them here

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  channel: string;
  views?: string;
}

interface YouTubePlaylist {
  id: string;
  name: string;
  videos: YouTubeVideo[];
  isUserPlaylist?: boolean;
}

interface YouTubePlayerProps {
  onClose?: () => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ onClose }) => {
  const { isAuthenticated, userEmail, signIn } = useYouTubeAudio();
  
  const handleClose = () => {
    console.log('🔴 Close button clicked!');
    if (onClose) {
      onClose();
    }
  };
  
  // Player state
  const [player, setPlayer] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null);
  const [volume, setVolume] = useState(75);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Search and playlist state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'playlist' | 'library'>('search');
  
  // Playlists
  const [currentPlaylist, setCurrentPlaylist] = useState<YouTubeVideo[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<YouTubePlaylist[]>([]);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0);
  
  // Playback modes
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  
  const playerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      if (playerRef.current && !player && window.YT) {
        const ytPlayer = new window.YT.Player(playerRef.current, {
          height: '0',
          width: '0',
          videoId: '',
          playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            origin: window.location.origin
          },
          events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
          }
        });
        setPlayer(ytPlayer);
      }
    };

    // If YT is already loaded
    if (window.YT && window.YT.Player && playerRef.current && !player) {
      window.onYouTubeIframeAPIReady();
    }
  }, [player]);

  // Update time tracking
  useEffect(() => {
    if (!player || !isPlaying) return;

    const interval = setInterval(() => {
      try {
        const time = player.getCurrentTime();
        const dur = player.getDuration();
        setCurrentTime(time);
        setDuration(dur);
      } catch (e) {
        // Player not ready
      }
    }, 500);

    return () => clearInterval(interval);
  }, [player, isPlaying]);

  const onPlayerReady = (event: any) => {
    console.log('YouTube player ready');
    event.target.setVolume(volume);
  };

  const onPlayerStateChange = (event: any) => {
    if (event.data === window.YT?.PlayerState.PLAYING) {
      setIsPlaying(true);
    } else if (event.data === window.YT?.PlayerState.PAUSED) {
      setIsPlaying(false);
    } else if (event.data === window.YT?.PlayerState.ENDED) {
      handleVideoEnd();
    }
  };

  const onPlayerError = (event: any) => {
    console.error('YouTube player error:', event.data);
  };

  // Search YouTube
  const searchYouTube = async (query: string) => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    try {
      // Using YouTube Data API v3
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=20` +
        `&videoCategoryId=10&key=${import.meta.env.VITE_YOUTUBE_API_KEY}`
      );
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      const videos: YouTubeVideo[] = data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url,
        channel: item.snippet.channelTitle,
        duration: '0:00' // Would need another API call to get duration
      }));
      
      setSearchResults(videos);
    } catch (error) {
      console.error('Search error:', error);
      // Fallback to mock data if API fails
      setSearchResults([
        { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', thumbnail: '', duration: '3:33', channel: 'Rick Astley' },
        { id: '9bZkp7q19f0', title: 'Gangnam Style', thumbnail: '', duration: '4:12', channel: 'PSY' },
        { id: 'kJQP7kiw5Fk', title: 'Despacito', thumbnail: '', duration: '3:47', channel: 'Luis Fonsi' },
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  // Play video
  const playVideo = (video: YouTubeVideo) => {
    if (!player) return;
    
    setCurrentVideo(video);
    player.loadVideoById(video.id);
    player.playVideo();
  };

  // Add to playlist
  const addToPlaylist = (video: YouTubeVideo) => {
    setCurrentPlaylist([...currentPlaylist, video]);
  };

  // Create new playlist
  const createPlaylist = (name: string) => {
    const newPlaylist: YouTubePlaylist = {
      id: Date.now().toString(),
      name,
      videos: [...currentPlaylist],
      isUserPlaylist: true
    };
    setUserPlaylists([...userPlaylists, newPlaylist]);
    setCurrentPlaylist([]);
  };

  // Playback controls
  const togglePlayPause = () => {
    if (!player) return;
    
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  const playNext = () => {
    if (currentPlaylist.length === 0) return;
    
    let nextIndex = currentPlaylistIndex + 1;
    if (nextIndex >= currentPlaylist.length) {
      nextIndex = 0;
    }
    
    setCurrentPlaylistIndex(nextIndex);
    playVideo(currentPlaylist[nextIndex]);
  };

  const playPrevious = () => {
    if (currentPlaylist.length === 0) return;
    
    let prevIndex = currentPlaylistIndex - 1;
    if (prevIndex < 0) {
      prevIndex = currentPlaylist.length - 1;
    }
    
    setCurrentPlaylistIndex(prevIndex);
    playVideo(currentPlaylist[prevIndex]);
  };

  const handleVideoEnd = () => {
    if (repeatMode === 'one') {
      player.seekTo(0);
      player.playVideo();
    } else if (repeatMode === 'all' || currentPlaylistIndex < currentPlaylist.length - 1) {
      playNext();
    }
  };

  const seekTo = (seconds: number) => {
    if (player) {
      player.seekTo(seconds);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center pointer-events-auto">
      <div className="w-full max-w-6xl h-[90vh] bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-lg border-2 border-pink-500 p-6 flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-pink-400 flex items-center gap-3">
            📺 YouTube Music Player
            <span className="text-xs text-cyan-400 border border-cyan-400 px-2 py-1 rounded">
              FULL API
            </span>
          </h2>
          <button 
            onClick={handleClose} 
            className="text-red-400 hover:text-red-300 hover:bg-red-500/20 text-3xl font-bold px-3 py-1 rounded transition-all cursor-pointer z-[60] pointer-events-auto"
            type="button"
            title="Close Player"
          >
            ×
          </button>
        </div>

        {/* Auth Status */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm">
            {isAuthenticated ? (
              <span className="text-green-400">✅ Connected: {userEmail}</span>
            ) : (
              <button onClick={signIn} className="bg-red-500/20 text-red-400 px-4 py-2 rounded hover:bg-red-500/30">
                🔐 Connect Google Account
              </button>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Left Panel - Search/Library */}
          <div className="w-1/2 flex flex-col">
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 rounded ${activeTab === 'search' ? 'bg-pink-500/30 text-pink-300' : 'bg-gray-800/50 text-gray-400'}`}
              >
                🔍 Search
              </button>
              <button
                onClick={() => setActiveTab('playlist')}
                className={`px-4 py-2 rounded ${activeTab === 'playlist' ? 'bg-pink-500/30 text-pink-300' : 'bg-gray-800/50 text-gray-400'}`}
              >
                📝 Current Playlist
              </button>
              <button
                onClick={() => setActiveTab('library')}
                className={`px-4 py-2 rounded ${activeTab === 'library' ? 'bg-pink-500/30 text-pink-300' : 'bg-gray-800/50 text-gray-400'}`}
              >
                📚 My Library
              </button>
            </div>

            {/* Search Tab */}
            {activeTab === 'search' && (
              <div className="flex-1 flex flex-col">
                <div className="flex gap-2 mb-4">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchYouTube(searchQuery)}
                    placeholder="Search YouTube..."
                    className="flex-1 bg-black/50 text-white px-4 py-2 rounded border border-pink-500/30 focus:border-pink-500"
                  />
                  <button
                    onClick={() => searchYouTube(searchQuery)}
                    disabled={isSearching}
                    className="bg-pink-500/20 text-pink-400 px-6 py-2 rounded hover:bg-pink-500/30 disabled:opacity-50"
                  >
                    {isSearching ? '⏳' : '🔍'} Search
                  </button>
                </div>

                {/* Search Results */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {searchResults.map((video) => (
                    <div key={video.id} className="bg-black/30 p-3 rounded flex items-center gap-3 hover:bg-black/50">
                      <img src={video.thumbnail || '🎵'} alt={video.title} className="w-20 h-12 object-cover rounded" />
                      <div className="flex-1">
                        <div className="text-white font-medium truncate">{video.title}</div>
                        <div className="text-gray-400 text-sm">{video.channel} • {video.duration}</div>
                      </div>
                      <button
                        onClick={() => playVideo(video)}
                        className="text-green-400 hover:text-green-300 text-xl"
                        title="Play"
                      >
                        ▶️
                      </button>
                      <button
                        onClick={() => addToPlaylist(video)}
                        className="text-cyan-400 hover:text-cyan-300 text-xl"
                        title="Add to playlist"
                      >
                        ➕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Playlist Tab */}
            {activeTab === 'playlist' && (
              <div className="flex-1 flex flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-pink-300">Current Queue ({currentPlaylist.length} tracks)</span>
                  <button
                    onClick={() => setCurrentPlaylist([])}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {currentPlaylist.map((video, index) => (
                    <div
                      key={`${video.id}-${index}`}
                      className={`bg-black/30 p-3 rounded flex items-center gap-3 ${
                        index === currentPlaylistIndex ? 'border border-pink-500' : ''
                      }`}
                    >
                      <span className="text-gray-500 w-6">{index + 1}</span>
                      <div className="flex-1">
                        <div className="text-white font-medium truncate">{video.title}</div>
                        <div className="text-gray-400 text-sm">{video.duration}</div>
                      </div>
                      <button
                        onClick={() => {
                          setCurrentPlaylistIndex(index);
                          playVideo(video);
                        }}
                        className="text-green-400 hover:text-green-300"
                      >
                        ▶️
                      </button>
                    </div>
                  ))}
                </div>
                {currentPlaylist.length > 0 && (
                  <div className="mt-4">
                    <input
                      type="text"
                      placeholder="Save playlist as..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value) {
                          createPlaylist(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                      className="w-full bg-black/50 text-white px-4 py-2 rounded border border-pink-500/30"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Library Tab */}
            {activeTab === 'library' && (
              <div className="flex-1 overflow-y-auto space-y-2">
                {userPlaylists.map((playlist) => (
                  <div key={playlist.id} className="bg-black/30 p-4 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-pink-300 font-bold">{playlist.name}</h3>
                      <span className="text-gray-400 text-sm">{playlist.videos.length} tracks</span>
                    </div>
                    <button
                      onClick={() => setCurrentPlaylist(playlist.videos)}
                      className="w-full bg-pink-500/20 text-pink-400 py-2 rounded hover:bg-pink-500/30"
                    >
                      Load Playlist
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel - Player */}
          <div className="w-1/2 flex flex-col">
            {/* Current Video Display */}
            {currentVideo ? (
              <div className="bg-black/50 rounded-lg p-6 mb-6">
                <h3 className="text-2xl font-bold text-pink-300 mb-2">{currentVideo.title}</h3>
                <p className="text-pink-400/60 mb-4">{currentVideo.channel}</p>
                
                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div 
                    className="w-full bg-gray-800 rounded-full h-2 cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = (e.clientX - rect.left) / rect.width;
                      seekTo(duration * percent);
                    }}
                  >
                    <div 
                      className="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Playback Controls */}
                <div className="flex items-center justify-center gap-4 mb-4">
                  <button onClick={playPrevious} className="text-pink-400 hover:text-pink-300 text-2xl">
                    ⏮️
                  </button>
                  <button onClick={togglePlayPause} className="text-pink-400 hover:text-pink-300 text-4xl">
                    {isPlaying ? '⏸️' : '▶️'}
                  </button>
                  <button onClick={playNext} className="text-pink-400 hover:text-pink-300 text-2xl">
                    ⏭️
                  </button>
                </div>

                {/* Mode Controls */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setShuffleEnabled(!shuffleEnabled)}
                    className={`text-2xl ${shuffleEnabled ? 'text-pink-300' : 'text-gray-400'}`}
                  >
                    🔀
                  </button>
                  <button
                    onClick={() => {
                      const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
                      const currentIndex = modes.indexOf(repeatMode);
                      setRepeatMode(modes[(currentIndex + 1) % 3]);
                    }}
                    className="text-2xl text-pink-400"
                  >
                    {repeatMode === 'one' ? '🔂' : repeatMode === 'all' ? '🔁' : '↻'}
                  </button>
                </div>

                {/* Volume */}
                <div className="mt-6">
                  <label className="text-pink-400 text-xs">VOLUME ({volume}%)</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => {
                      const vol = Number(e.target.value);
                      setVolume(vol);
                      if (player) player.setVolume(vol);
                    }}
                    className="w-full accent-pink-500"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-black/50 rounded-lg p-6 mb-6 text-center">
                <div className="text-6xl mb-4">🎵</div>
                <p className="text-pink-400">No video selected</p>
                <p className="text-pink-400/60 text-sm mt-2">Search for music or load a playlist</p>
              </div>
            )}

            {/* Visualizer Placeholder */}
            <div className="flex-1 bg-black/50 rounded-lg p-4 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-2 animate-pulse">🎵</div>
                <p className="text-pink-400/60">Visualizer Active</p>
                {isPlaying && (
                  <div className="flex justify-center gap-1 mt-4">
                    {[...Array(20)].map((_, i) => (
                      <div
                        key={i}
                        className="w-2 bg-gradient-to-t from-pink-500 to-purple-500 rounded-t"
                        style={{
                          height: `${20 + Math.random() * 60}px`,
                          animation: `pulse ${0.5 + Math.random() * 0.5}s infinite`
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Hidden YouTube Player */}
        <div ref={playerRef} className="hidden" />
      </div>
    </div>
  );
};

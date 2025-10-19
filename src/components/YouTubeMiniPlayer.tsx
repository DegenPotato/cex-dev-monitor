import { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, SkipForward, SkipBack, Volume2, X, Minimize2, Maximize2, Youtube, Search, List } from 'lucide-react';
import { useYouTubeAudio } from '../contexts/YouTubeAudioContext';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    gapi?: any;
  }
}

// Use same interface as context to avoid conflicts

export function YouTubeMiniPlayer() {
  // Use the existing YouTube context instead of reinventing OAuth
  const {
    isAuthenticated: isSignedIn,
    userEmail,
    signIn,
    signOut,
    searchVideos: contextSearchVideos,
    userPlaylists,
    playVideo: contextPlayVideo,
    isPlaying,
    currentVideo,
    volume: contextVolume,
    setVolume: setContextVolume,
    play,
    pause,
    skip,
    previous
  } = useYouTubeAudio();
  
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [localVolume, setLocalVolume] = useState(contextVolume);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Remove YouTube iframe player init - we're using the context
  useEffect(() => {
    // Load YouTube IFrame API for the player widget only
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = initializePlayer;

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, []);

  const handleAuthClick = async () => {
    if (isSignedIn) {
      signOut();
    } else {
      await signIn();
    }
  };

  const initializePlayer = () => {
    if (!window.YT || !playerContainerRef.current) return;

    const YT = window.YT;
    playerRef.current = new YT.Player('youtube-player', {
      height: '200',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        fs: 0,
        playsinline: 1
      },
      events: {
        onStateChange: onPlayerStateChange,
        onReady: onPlayerReady
      },
      host: 'https://www.youtube.com',
      origin: window.location.origin
    });
  };

  const onPlayerReady = () => {
    if (playerRef.current) {
      playerRef.current.setVolume(localVolume);
    }
  };

  const onPlayerStateChange = (event: any) => {
    if (!window.YT) return;
    // Sync with context state if needed
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      const results = await contextSearchVideos(searchQuery);
      if (results) {
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const handlePlayVideo = (video: any) => {
    contextPlayVideo(video);
    setShowSearch(false);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setLocalVolume(newVolume);
    setContextVolume(newVolume);
    if (playerRef.current) {
      playerRef.current.setVolume(newVolume);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 px-4 py-3 rounded-full font-medium transition-all hover:shadow-lg hover:shadow-red-500/20 backdrop-blur-xl z-40"
      >
        <Youtube className="w-5 h-5" />
        <span>YouTube Music</span>
      </button>
    );
  }

  return (
    <div 
      className={`fixed z-50 bg-black/95 backdrop-blur-xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/20 rounded-2xl transition-all duration-300 ${
        isMinimized 
          ? 'bottom-6 right-6 w-80 h-20' 
          : 'bottom-6 right-6 w-96 h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-cyan-500/20">
        <div className="flex items-center gap-3">
          <Youtube className="w-5 h-5 text-red-500" />
          <span className="text-cyan-400 font-semibold">YouTube Music</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAuthClick}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              isSignedIn 
                ? 'bg-green-500/20 text-green-400 border border-green-500/40' 
                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
            }`}
          >
            {isSignedIn ? 'Connected' : 'Connect'}
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-cyan-500/20 rounded-lg transition-colors text-cyan-400"
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-red-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Player */}
          <div className="p-4 border-b border-cyan-500/20">
            <div id="youtube-player" ref={playerContainerRef} className="w-full bg-black rounded-lg overflow-hidden" />
            {currentVideo && (
              <div className="mt-3">
                <h3 className="text-white font-semibold text-sm truncate">{currentVideo.title}</h3>
                <p className="text-cyan-300/60 text-xs truncate">{(currentVideo as any).channelTitle || 'YouTube'}</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-4 border-b border-cyan-500/20">
            <div className="flex items-center justify-center gap-4 mb-3">
              <button 
                className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors text-cyan-400"
                onClick={previous}
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlayPause}
                className="p-3 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-full transition-colors text-cyan-400 border border-cyan-500/40"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button 
                className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors text-cyan-400"
                onClick={skip}
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>
            
            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <input
                type="range"
                min="0"
                max="100"
                value={localVolume}
                onChange={handleVolumeChange}
                className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-cyan-400 text-xs w-8 text-right">{localVolume}%</span>
            </div>
          </div>

          {/* Search and Playlists */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-cyan-500/20">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    showSearch 
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : 'bg-black/40 text-cyan-300/60 border border-cyan-500/20'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  Search
                </button>
                <button
                  onClick={() => setShowSearch(false)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    !showSearch 
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : 'bg-black/40 text-cyan-300/60 border border-cyan-500/20'
                  }`}
                >
                  <List className="w-4 h-4" />
                  Playlists
                </button>
              </div>
            </div>

            {showSearch ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search for music..."
                    className="flex-1 bg-black/40 backdrop-blur-sm text-white rounded-lg px-3 py-2 text-sm border border-cyan-500/20 focus:border-cyan-500/50 focus:outline-none"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg border border-cyan-500/40 transition-all"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-2">
                  {searchResults.map((video) => (
                    <button
                      key={video.id}
                      onClick={() => handlePlayVideo(video)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-cyan-500/10 rounded-lg transition-all text-left group"
                    >
                      <img 
                        src={video.thumbnail} 
                        alt={video.title}
                        className="w-12 h-12 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white text-sm truncate group-hover:text-cyan-400 transition-colors">
                          {video.title}
                        </h4>
                        <p className="text-cyan-300/60 text-xs truncate">{video.channelTitle || video.channel || ''}</p>
                      </div>
                      <Play className="w-4 h-4 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                {!isSignedIn ? (
                  <div className="text-center py-8">
                    <Music className="w-12 h-12 text-cyan-400/40 mx-auto mb-3" />
                    <p className="text-cyan-300/60 text-sm mb-4">
                      Connect your YouTube account to access your playlists
                    </p>
                    <button
                      onClick={handleAuthClick}
                      className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg border border-cyan-500/40 font-medium transition-all"
                    >
                      Connect YouTube
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userPlaylists.map((playlist: any) => (
                      <button
                        key={playlist.id}
                        className="w-full flex items-center gap-3 p-2 hover:bg-cyan-500/10 rounded-lg transition-all text-left"
                      >
                        <img 
                          src={playlist.snippet.thumbnails.default.url} 
                          alt={playlist.snippet.title}
                          className="w-12 h-12 rounded object-cover"
                        />
                        <div className="flex-1">
                          <h4 className="text-white text-sm truncate">{playlist.snippet.title}</h4>
                          <p className="text-cyan-300/60 text-xs">{playlist.snippet.itemCount} videos</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

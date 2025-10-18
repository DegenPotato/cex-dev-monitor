import { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, SkipForward, SkipBack, Volume2, X, Minimize2, Maximize2, Youtube, Search, List } from 'lucide-react';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    gapi?: any;
  }
}

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
}

export function YouTubeMiniPlayer() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [volume, setVolume] = useState(50);
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // YouTube API configuration
  const CLIENT_ID = import.meta.env.VITE_YOUTUBE_CLIENT_ID || '';
  const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';
  const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest'];
  const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

  useEffect(() => {
    // Load YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // Load Google API
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = initGoogleAPI;
    document.body.appendChild(gapiScript);

    window.onYouTubeIframeAPIReady = initializePlayer;

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, []);

  const initGoogleAPI = () => {
    if (!window.gapi) return;
    
    window.gapi.load('client:auth2', () => {
      window.gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
      }).then(() => {
        console.log('✅ Google API initialized');
        const authInstance = window.gapi.auth2?.getAuthInstance();
        if (authInstance) {
          authInstance.isSignedIn.listen(updateSigninStatus);
          updateSigninStatus(authInstance.isSignedIn.get());
        }
      }).catch((error: any) => {
        console.error('❌ Google API init failed:', error);
      });
    });
  };

  const updateSigninStatus = (isSignedIn: boolean) => {
    setIsSignedIn(isSignedIn);
    if (isSignedIn) {
      loadUserPlaylists();
    }
  };

  const handleAuthClick = () => {
    if (!window.gapi) return;
    
    const authInstance = window.gapi.auth2?.getAuthInstance();
    if (!authInstance) {
      console.error('❌ Auth not initialized');
      return;
    }
    
    if (isSignedIn) {
      authInstance.signOut();
    } else {
      authInstance.signIn();
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
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onStateChange: onPlayerStateChange,
        onReady: onPlayerReady
      }
    });
  };

  const onPlayerReady = () => {
    playerRef.current.setVolume(volume);
  };

  const onPlayerStateChange = (event: any) => {
    if (!window.YT) return;
    if (event.data === window.YT.PlayerState.PLAYING) {
      setIsPlaying(true);
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      setIsPlaying(false);
    }
  };

  const searchVideos = async () => {
    if (!API_KEY || !searchQuery || !window.gapi) return;

    try {
      const response = await window.gapi.client.youtube.search.list({
        part: 'snippet',
        q: searchQuery,
        maxResults: 10,
        type: 'video'
      });

      const videos = response.result.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.default.url,
        channel: item.snippet.channelTitle
      }));

      setSearchResults(videos);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const loadUserPlaylists = async () => {
    if (!window.gapi) return;
    try {
      const response = await window.gapi.client.youtube.playlists.list({
        part: 'snippet',
        mine: true,
        maxResults: 20
      });
      setPlaylists(response.result.items || []);
    } catch (error) {
      console.error('Failed to load playlists:', error);
    }
  };

  const playVideo = (video: YouTubeVideo) => {
    if (playerRef.current) {
      playerRef.current.loadVideoById(video.id);
      setCurrentVideo(video);
      setIsPlaying(true);
      setShowSearch(false);
    }
  };

  const togglePlayPause = () => {
    if (!playerRef.current) return;
    
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
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
                <p className="text-cyan-300/60 text-xs truncate">{currentVideo.channel}</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-4 border-b border-cyan-500/20">
            <div className="flex items-center justify-center gap-4 mb-3">
              <button 
                className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors text-cyan-400"
                onClick={() => playerRef.current?.previousVideo()}
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
                onClick={() => playerRef.current?.nextVideo()}
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
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1 bg-black/40 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-xs text-cyan-300/60 w-8">{volume}%</span>
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
                    onKeyPress={(e) => e.key === 'Enter' && searchVideos()}
                    placeholder="Search for music..."
                    className="flex-1 bg-black/40 backdrop-blur-sm text-white rounded-lg px-3 py-2 text-sm border border-cyan-500/20 focus:border-cyan-500/50 focus:outline-none"
                  />
                  <button
                    onClick={searchVideos}
                    className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg border border-cyan-500/40 transition-all"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-2">
                  {searchResults.map((video) => (
                    <button
                      key={video.id}
                      onClick={() => playVideo(video)}
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
                        <p className="text-cyan-300/60 text-xs truncate">{video.channel}</p>
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
                    {playlists.map((playlist) => (
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

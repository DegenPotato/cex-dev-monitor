import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

// YouTube and Google types are already declared in src/types/youtube.d.ts
// No need to redeclare them here

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  channelTitle: string;
}

interface YouTubePlaylist {
  id: string;
  title: string;
  thumbnail: string;
  itemCount: number;
}

interface YouTubeAudioContextType {
  // Player state
  isYouTubeReady: boolean;
  isPlaying: boolean;
  currentVideo: YouTubeVideo | null;
  queue: YouTubeVideo[];
  volume: number;
  autoplay: boolean;
  loop: boolean;
  distortionEnabled: boolean;
  
  // Auth state
  isAuthenticated: boolean;
  userEmail: string | null;
  
  // Player controls
  play: () => void;
  pause: () => void;
  skip: () => void;
  previous: () => void;
  setVolume: (volume: number) => void;
  seekTo: (seconds: number) => void;
  toggleAutoplay: () => void;
  toggleLoop: () => void;
  toggleDistortion: () => void;
  
  // Queue management
  addToQueue: (video: YouTubeVideo) => void;
  removeFromQueue: (videoId: string) => void;
  clearQueue: () => void;
  playVideo: (video: YouTubeVideo) => void;
  
  // Playlist management
  userPlaylists: YouTubePlaylist[];
  loadPlaylist: (playlistId: string) => Promise<void>;
  
  // Search
  searchVideos: (query: string) => Promise<YouTubeVideo[]>;
  
  // Auth
  signIn: () => Promise<void>;
  signOut: () => void;
  
  // Player instance access
  getPlayerState: () => number;
}

const YouTubeAudioContext = createContext<YouTubeAudioContextType | undefined>(undefined);

export const useYouTubeAudio = () => {
  const context = useContext(YouTubeAudioContext);
  if (!context) {
    throw new Error('useYouTubeAudio must be used within YouTubeAudioProvider');
  }
  return context;
};

interface YouTubeAudioProviderProps {
  children: ReactNode;
}

export const YouTubeAudioProvider: React.FC<YouTubeAudioProviderProps> = ({ children }) => {
  const [isYouTubeReady, setIsYouTubeReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null);
  const [queue, setQueue] = useState<YouTubeVideo[]>([]);
  const [volume, setVolumeState] = useState(50);
  const [autoplay, setAutoplay] = useState(true);
  const [loop, setLoop] = useState(false);
  const [distortionEnabled, setDistortionEnabled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<YouTubePlaylist[]>([]);
  // Remove unused accessToken state - we use the ref instead
  
  const playerRef = useRef<any>(null);
  const accessTokenRef = useRef<string | null>(null);
  const isLoadingAPIRef = useRef(false);
  // const hasLoadedSavedAccountRef = useRef(false); // Not used currently
  
  // Web Audio API for distortion
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const distortionNodeRef = useRef<WaveShaperNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // YouTube API Key (you'll need to replace this with your own)
  const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';
  // OAuth Client ID is used in signIn function via import.meta.env
  // const OAUTH_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';

  // Enable YouTube for authenticated user
  const signIn = async () => {
    console.log('🎵 YouTube: Enabling YouTube integration...');
    
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('❌ User not authenticated');
        return;
      }

      // Get user info from auth token
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        console.error('❌ User data not found');
        return;
      }

      const user = JSON.parse(userStr);
      
      // Enable YouTube for this user
      const response = await fetch('/api/youtube/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          enabled: true,
          email: user.email || `${user.username}@youtube.local`,
          preferences: {
            volume: 75,
            shuffle: false,
            repeat: 'off'
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to enable YouTube');
      }

      setIsAuthenticated(true);
      setUserEmail(user.email || user.username);
      console.log('✅ YouTube: Enabled for user', user.username);
      
      // Load user's playlists
      await loadUserPlaylists();
    } catch (error) {
      console.error('❌ YouTube enable error:', error);
    }
  };

  // Google OAuth functions removed - we use our own auth system now

  // Check if user is authenticated and load YouTube preferences
  useEffect(() => {
    const checkYouTubeAuth = async () => {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('user');
      
      if (!token || !userStr) return;

      try {
        const response = await fetch('/api/youtube/preferences', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.enabled) {
            setIsAuthenticated(true);
            setUserEmail(data.email);
            await loadUserPlaylists();
          }
        }
      } catch (error) {
        console.error('Failed to check YouTube auth:', error);
      }
    };

    checkYouTubeAuth();
  }, []);

  // YouTube API loading and initialization
  useEffect(() => {
    console.log('🎬 YouTubeAudioProvider mounted');
    
    if (isLoadingAPIRef.current || window.YT) {
      console.log('🎬 YouTube API already loaded or loading');
      if (window.YT?.Player) {
        setIsYouTubeReady(true);
      }
      return;
    }

    isLoadingAPIRef.current = true;
    console.log('🎬 Loading YouTube IFrame API...');

    // Create callback for when API is ready
    window.onYouTubeIframeAPIReady = () => {
      console.log('✅ YouTube IFrame API ready');
      setIsYouTubeReady(true);
      initializePlayer();
    };

    // Load the API script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => {
      console.error('❌ Failed to load YouTube IFrame API');
      isLoadingAPIRef.current = false;
    };
    
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    
    return () => {
      console.log('🎬 YouTubeAudioProvider unmounting');
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (error) {
          console.warn('⚠️ Error destroying YouTube player:', error);
        }
      }
    };
  }, []);

  // Initialize YouTube player (hidden)
  const initializePlayer = () => {
    if (playerRef.current || !window.YT) return;

    console.log('🎬 Initializing YouTube player...');

    // Create hidden div for player if it doesn't exist
    let playerDiv = document.getElementById('youtube-audio-player');
    if (!playerDiv) {
      playerDiv = document.createElement('div');
      playerDiv.id = 'youtube-audio-player';
      playerDiv.style.display = 'none';
      document.body.appendChild(playerDiv);
    }

    try {
      playerRef.current = new window.YT.Player('youtube-audio-player', {
        height: '0',
        width: '0',
        videoId: '', // Start with no video
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          origin: window.location.origin, // Fix postMessage origin error
          enablejsapi: 1, // Enable JS API
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
          onError: onPlayerError,
        },
      });
      
      console.log('✅ YouTube player initialized');
    } catch (error) {
      console.error('❌ Failed to initialize YouTube player:', error);
    }
  };

  // Create distortion curve (same as AudioContext)
  const makeDistortionCurve = (amount: number) => {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    
    return curve;
  };

  // Setup Web Audio API for distortion
  const setupAudioProcessing = () => {
    try {
      // Get the iframe element
      const iframe = document.querySelector('#youtube-audio-player iframe') as HTMLIFrameElement;
      if (!iframe) {
        console.warn('⚠️ YouTube iframe not found for audio processing');
        return;
      }

      // Create audio context if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('✅ AudioContext created for YouTube');
      }

      const context = audioContextRef.current;

      // Try to get the video element from YouTube player
      // Note: This will likely fail due to CORS restrictions on YouTube iframes
      const player = playerRef.current as any;
      const videoElement = player?.getIframe?.()?.contentWindow?.document?.querySelector('video');
      
      if (videoElement && !sourceNodeRef.current) {
        // Create source node from video element
        sourceNodeRef.current = context.createMediaElementSource(videoElement);
        
        // Create filter node (lowpass)
        filterRef.current = context.createBiquadFilter();
        filterRef.current.type = 'lowpass';
        filterRef.current.frequency.value = distortionEnabled ? 100 : 20000;
        
        // Create distortion node
        distortionNodeRef.current = context.createWaveShaper();
        distortionNodeRef.current.curve = makeDistortionCurve(distortionEnabled ? 50 : 0);
        distortionNodeRef.current.oversample = '4x';
        
        // Create gain node
        gainNodeRef.current = context.createGain();
        gainNodeRef.current.gain.value = volume / 100;
        
        // Connect nodes: source -> filter -> distortion -> gain -> destination
        sourceNodeRef.current.connect(filterRef.current);
        filterRef.current.connect(distortionNodeRef.current);
        distortionNodeRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(context.destination);
        
        console.log('✅ Web Audio processing chain set up for YouTube');
      }
    } catch (error) {
      console.warn('⚠️ Could not set up audio processing (CORS restriction):', error);
      // This is expected due to CORS - YouTube iframe doesn't allow direct audio access
    }
  };

  // Player event handlers
  const onPlayerReady = (event: any) => {
    console.log('✅ YouTube player ready');
    event.target.setVolume(volume);
    
    // Try to setup audio processing (may fail due to CORS)
    setTimeout(() => setupAudioProcessing(), 1000);
  };

  const onPlayerStateChange = (event: any) => {
    const state = event.data;
    console.log('🎬 Player state changed:', state);

    switch (state) {
      case window.YT?.PlayerState.PLAYING:
        setIsPlaying(true);
        console.log('▶️ YouTube video playing');
        break;
      case window.YT?.PlayerState.PAUSED:
        setIsPlaying(false);
        console.log('⏸️ YouTube video paused');
        break;
      case window.YT?.PlayerState.ENDED:
        setIsPlaying(false);
        console.log('⏹️ YouTube video ended');
        handleVideoEnded();
        break;
      case window.YT?.PlayerState.BUFFERING:
        console.log('⏳ YouTube video buffering...');
        break;
      case window.YT?.PlayerState.CUED:
        console.log('📋 YouTube video cued');
        break;
    }
  };

  const onPlayerError = (event: any) => {
    const errorCode = event.data;
    console.error('❌ YouTube player error:', errorCode);
    
    let errorMessage = 'Unknown error';
    switch (errorCode) {
      case 2:
        errorMessage = 'Invalid video ID';
        break;
      case 5:
        errorMessage = 'HTML5 player error';
        break;
      case 100:
        errorMessage = 'Video not found or private';
        break;
      case 101:
      case 150:
        errorMessage = 'Video cannot be embedded';
        break;
    }
    
    console.error(`🚫 ${errorMessage} - Skipping to next video`);
    playNextInQueue();
  };


  // Player controls
  const play = () => {
    if (!playerRef.current) return;
    playerRef.current.playVideo();
  };

  const pause = () => {
    if (!playerRef.current) return;
    playerRef.current.pauseVideo();
  };

  const skip = () => {
    playNextInQueue();
  };

  const previous = () => {
    // TODO: Implement previous track history
    console.log('⏮️ Previous track not implemented yet');
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    if (playerRef.current) {
      playerRef.current.setVolume(vol);
    }
  };

  const seekTo = (seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, true);
    }
  };

  const getPlayerState = (): number => {
    return playerRef.current?.getPlayerState() ?? -1;
  };

  // Handle video ended with autoplay/loop logic
  const handleVideoEnded = () => {
    if (!autoplay) {
      console.log('⏸️ Autoplay disabled, stopping');
      return;
    }

    if (loop && currentVideo) {
      console.log('🔁 Loop enabled, replaying current video');
      playerRef.current?.seekTo(0, true);
      playerRef.current?.playVideo();
      return;
    }

    console.log('⏭️ Playing next in queue');
    playNextInQueue();
  };

  // Queue management
  const playNextInQueue = () => {
    if (queue.length === 0) {
      console.log('📭 Queue empty');
      
      // If loop is enabled and we have a current video, add it back to queue
      if (loop && currentVideo) {
        console.log('🔁 Loop enabled, restarting queue');
        setQueue([currentVideo]);
        playVideo(currentVideo);
        return;
      }
      
      setCurrentVideo(null);
      setIsPlaying(false);
      return;
    }

    const nextVideo = queue[0];
    
    // If loop is enabled, add current video back to end of queue
    if (loop && currentVideo) {
      setQueue(prev => [...prev.slice(1), currentVideo]);
    } else {
      setQueue(prev => prev.slice(1));
    }
    
    playVideo(nextVideo);
  };

  const playVideo = (video: YouTubeVideo) => {
    if (!playerRef.current) {
      console.error('❌ Player not ready');
      return;
    }

    console.log('▶️ Playing video:', video.title);
    setCurrentVideo(video);
    playerRef.current.loadVideoById(video.id);
  };

  const addToQueue = (video: YouTubeVideo) => {
    console.log('➕ Adding to queue:', video.title);
    setQueue(prev => [...prev, video]);
    
    // If nothing is playing, start playing
    if (!currentVideo) {
      playVideo(video);
    }
  };

  const removeFromQueue = (videoId: string) => {
    setQueue(prev => prev.filter(v => v.id !== videoId));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  // Search videos
  const searchVideos = async (query: string): Promise<YouTubeVideo[]> => {
    if (!API_KEY) {
      console.error('❌ No YouTube API key configured');
      return [];
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(query)}&` +
        `type=video&videoCategoryId=10&` + // Music category
        `maxResults=25&key=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      return data.items?.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url,
        duration: 0, // Would need additional API call to get duration
        channelTitle: item.snippet.channelTitle,
      })) || [];
    } catch (error) {
      console.error('❌ Search failed:', error);
      return [];
    }
  };

  // Load user's playlists from database
  const loadUserPlaylists = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch('/api/youtube/playlists', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load playlists');
      }

      const playlists = await response.json();
      
      const formatted: YouTubePlaylist[] = playlists.map((p: any) => ({
        id: p.id.toString(),
        title: p.name,
        thumbnail: p.videos[0]?.thumbnail || '',
        itemCount: p.videos.length,
      }));

      setUserPlaylists(formatted);
      console.log('✅ Loaded user playlists:', formatted.length);
    } catch (error) {
      console.error('❌ Failed to load playlists:', error);
    }
  };

  // Load playlist videos
  const loadPlaylist = async (playlistId: string) => {
    if (!API_KEY) return;

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?` +
        `part=snippet&playlistId=${playlistId}&maxResults=50&key=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load playlist: ${response.statusText}`);
      }

      const data = await response.json();
      
      const videos: YouTubeVideo[] = data.items?.map((item: any) => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url,
        duration: 0,
        channelTitle: item.snippet.channelTitle,
      })) || [];

      // Add all videos to queue
      setQueue(videos);
      
      // Start playing first video
      if (videos.length > 0) {
        playVideo(videos[0]);
        setQueue(videos.slice(1));
      }

      console.log('✅ Loaded playlist videos:', videos.length);
    } catch (error) {
      console.error('❌ Failed to load playlist:', error);
    }
  };

  // Sign out - disable YouTube for user
  const signOut = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        await fetch('/api/youtube/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ enabled: false })
        });
      }
    } catch (error) {
      console.error('Error disabling YouTube:', error);
    }
    
    setIsAuthenticated(false);
    setUserEmail(null);
    accessTokenRef.current = null;
    setUserPlaylists([]);
    
    // Backend revocation commented out until backend is ready
    // revokeAccountOnBackend().catch((err: any) => 
    //   console.error('❌ Failed to revoke on backend:', err)
    // );
    
    console.log('✅ Signed out');
  };

  // Save YouTube account to backend
  // Backend integration - commented out until backend is ready
  /*
  const saveAccountToBackend = async (accountData: {
    google_user_id: string;
    email: string;
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('⚠️ No auth token, cannot save YouTube account');
        return;
      }

      const response = await fetch('/api/youtube/account/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(accountData)
      });

      if (!response.ok) {
        throw new Error(`Failed to save account: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ YouTube account saved to backend:', data);
    } catch (error) {
      console.error('❌ Failed to save YouTube account:', error);
    }
  };

  // Load saved YouTube account from backend
  const loadSavedAccount = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.log('ℹ️ No auth token, skipping YouTube account load');
        return;
      }

      const response = await fetch('/api/youtube/account', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load account: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.account) {
        const account = data.account;
        
        // Check if token is expired
        if (account.is_expired) {
          console.warn('⚠️ Saved token is expired, user needs to re-authenticate');
          return;
        }

        // Restore session
        accessTokenRef.current = account.access_token;
        refreshTokenRef.current = account.refresh_token;
        googleUserIdRef.current = account.google_user_id;
        setUserEmail(account.email);
        setIsAuthenticated(true);
        
        console.log('✅ Restored YouTube session:', account.email);
        
        // Load playlists
        loadUserPlaylists();
      } else {
        console.log('ℹ️ No saved YouTube account found');
      }
    } catch (error) {
      console.error('❌ Failed to load saved account:', error);
    }
  };
  */

  // Revoke account on backend - also commented out until backend is ready
  /*
  const revokeAccountOnBackend = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      await fetch('/api/youtube/account/revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('✅ YouTube account revoked on backend');
    } catch (error) {
      console.error('❌ Failed to revoke account:', error);
    }
  };
  */

  // Toggle functions
  const toggleAutoplay = () => {
    setAutoplay(prev => {
      console.log('🔄 Autoplay:', !prev ? 'ON' : 'OFF');
      return !prev;
    });
  };

  const toggleLoop = () => {
    setLoop(prev => {
      console.log('🔁 Loop:', !prev ? 'ON' : 'OFF');
      return !prev;
    });
  };

  const toggleDistortion = () => {
    const newState = !distortionEnabled;
    setDistortionEnabled(newState);
    
    // Update filter and distortion nodes if they exist
    if (filterRef.current) {
      filterRef.current.frequency.value = newState ? 100 : 20000;
    }
    
    if (distortionNodeRef.current) {
      distortionNodeRef.current.curve = makeDistortionCurve(newState ? 50 : 0);
    }
    
    console.log('🎛️ YouTube Distortion:', newState ? 'ON' : 'OFF');
  };

  // Provide the context value with all available functions and state
  const value: YouTubeAudioContextType = {
    // State
    isYouTubeReady: isYouTubeReady || false,
    isPlaying: isPlaying || false,
    currentVideo: currentVideo || null,
    queue: queue || [],
    volume: volume || 50,
    autoplay: autoplay || true,
    loop: loop || false,
    distortionEnabled: distortionEnabled || false,
    isAuthenticated: isAuthenticated || false,
    userEmail: userEmail || null,
    // Controls
    play: play || (() => {}),
    pause: pause || (() => {}),
    skip: skip || (() => {}),
    previous: previous || (() => {}),
    setVolume: setVolume || (() => {}),
    seekTo: seekTo || (() => {}),
    toggleAutoplay: toggleAutoplay || (() => {}),
    toggleLoop: toggleLoop || (() => {}),
    toggleDistortion: toggleDistortion || (() => {}),
    // Queue management
    addToQueue: addToQueue || (() => {}),
    removeFromQueue: removeFromQueue || (() => {}),
    clearQueue: clearQueue || (() => {}),
    playVideo: playVideo || (() => {}),
    // Playlists
    userPlaylists: userPlaylists || [],
    loadPlaylist: loadPlaylist || (async () => {}),
    // Search
    searchVideos: searchVideos || (async () => []),
    // Auth
    signIn: signIn || (async () => {}),
    signOut: signOut || (() => {}),
    // Player state
    getPlayerState: getPlayerState || (() => ({ state: -1, time: 0, duration: 0 })),
  };

  return (
    <YouTubeAudioContext.Provider value={value}>
      {children}
    </YouTubeAudioContext.Provider>
  );
};

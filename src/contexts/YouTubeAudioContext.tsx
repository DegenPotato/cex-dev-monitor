import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

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
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
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

export const YouTubeAudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated: userIsAuthenticated } = useAuth();
  
  const [isYouTubeReady, setIsYouTubeReady] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null);
  const [queue, setQueue] = useState<YouTubeVideo[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [currentTime, _setCurrentTime] = useState(0);
  const [duration, _setDuration] = useState(0);
  const [shuffle, _setShuffle] = useState(false);
  const [repeat, _setRepeat] = useState<'off' | 'one' | 'all'>('off');
  const [autoplay, setAutoplay] = useState(true);
  const [loop, setLoop] = useState(false);
  const [distortionEnabled, setDistortionEnabled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<YouTubePlaylist[]>([]);
  
  const playerRef = useRef<any>(null);
  const accessTokenRef = useRef<string | null>(null);
  const isLoadingAPIRef = useRef(false);
  
  // Web Audio API for distortion
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const distortionNodeRef = useRef<WaveShaperNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // YouTube API Key (you'll need to replace this with your own)
  const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || '';
  // OAuth Client ID for Google Sign-In
  const OAUTH_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';
  const OAUTH_REDIRECT_URI = window.location.origin + '/oauth/google/callback.html';

  // Google OAuth 2.0 Sign-In with Popup
  const signIn = async () => {
    console.log('🔐 YouTube: Initiating Google OAuth...');
    
    try {
      if (!userIsAuthenticated || !user) {
        console.error('❌ User not authenticated with our system');
        return;
      }

      if (!OAUTH_CLIENT_ID) {
        console.error('❌ Google OAuth Client ID not configured');
        console.log('⚠️ Fallback: Enabling YouTube without Google account');
        // Fallback to local-only mode
        setIsAuthenticated(true);
        setUserEmail(user.username + '@local');
        return;
      }
      
      // Build Google OAuth URL
      const scopes = [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ].join(' ');
      
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'token');
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('state', `user_${user.id}`);
      
      console.log('🌐 Opening Google OAuth popup...');
      
      // Open OAuth popup
      const width = 500;
      const height = 600;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;
      
      const popup = window.open(
        authUrl.toString(),
        'Google Sign-In',
        `width=${width},height=${height},left=${left},top=${top},popup=yes`
      );
      
      if (!popup) {
        console.error('❌ Popup blocked! Please allow popups for this site.');
        alert('Please allow popups to connect your Google account.');
        return;
      }
      
      // Listen for OAuth callback
      const handleOAuthCallback = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
          console.log('✅ Google OAuth successful!');
          const { accessToken, email } = event.data;
          
          // Store access token
          accessTokenRef.current = accessToken;
          
          // Update state
          setIsAuthenticated(true);
          setUserEmail(email);
          
          // Sync with backend
          fetch('/api/youtube/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              enabled: true,
              email: email,
              accessToken: accessToken,
              preferences: { volume: 75, shuffle: false, repeat: 'off' }
            })
          }).catch(err => console.warn('⚠️ Backend sync failed (non-critical):', err.message));
          
          // Load user's playlists
          loadUserPlaylists().catch(() => console.log('ℹ️ No saved playlists'));
          
          // Cleanup
          window.removeEventListener('message', handleOAuthCallback);
          popup?.close();
        } else if (event.data.type === 'GOOGLE_OAUTH_ERROR') {
          console.error('❌ Google OAuth failed:', event.data.error);
          window.removeEventListener('message', handleOAuthCallback);
          popup?.close();
        }
      };
      
      window.addEventListener('message', handleOAuthCallback);
      
      // Check if popup was closed without completing
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          window.removeEventListener('message', handleOAuthCallback);
          console.log('🔒 OAuth popup closed');
        }
      }, 500);
      
    } catch (error) {
      console.error('❌ YouTube OAuth error:', error);
    }
  };

  // Check if user is authenticated and load YouTube preferences
  useEffect(() => {
    const checkYouTubeAuth = async () => {
      if (!userIsAuthenticated || !user) return;

      try {
        const response = await fetch('/api/youtube/preferences', {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.enabled) {
            setIsAuthenticated(true);
            setUserEmail(data.email);
            loadUserPlaylists().catch(() => {});
          }
        }
      } catch (error) {
        // Backend unavailable - YouTube still works for playback
        console.log('ℹ️ Backend unavailable, YouTube playback still enabled');
      }
    };

    checkYouTubeAuth();
  }, [userIsAuthenticated, user]);

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

  const updateVolume = (vol: number) => {
    setVolume(vol);
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
      if (!userIsAuthenticated) return;

      const response = await fetch('/api/youtube/playlists', {
        credentials: 'include'
      });

      if (!response.ok) {
        console.log('ℹ️ No saved playlists available');
        return;
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
      console.log('ℹ️ Playlists not available (backend optional)');
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
      if (userIsAuthenticated) {
        await fetch('/api/youtube/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
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
    
    console.log('✅ YouTube signed out');
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
    currentTime: currentTime || 0,
    duration: duration || 0,
    shuffle: shuffle || false,
    repeat: repeat || 'off',
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
    setVolume: updateVolume || (() => {}),
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

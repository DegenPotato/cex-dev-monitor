import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import * as THREE from 'three';

interface AudioContextType {
  isPlaying: boolean;
  volume: number;
  distortionEnabled: boolean;
  currentTrack: string;
  togglePlayPause: () => void;
  setVolume: (volume: number) => void;
  toggleDistortion: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  initializeAudio: () => Promise<void>;
  getAudioAnalyzer: () => THREE.AudioAnalyser | null;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
};

interface AudioProviderProps {
  children: ReactNode;
}

export const AudioProvider: React.FC<AudioProviderProps> = ({ children }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(2.0);
  const [distortionEnabled, setDistortionEnabled] = useState(true);
  const [currentTrack, setCurrentTrack] = useState('');
  
  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const soundRef = useRef<THREE.Audio | null>(null);
  const audioAnalyzerRef = useRef<THREE.AudioAnalyser | null>(null);
  const playlistRef = useRef<string[]>([]);
  const currentTrackIndexRef = useRef(0);
  const audioLoaderRef = useRef<THREE.AudioLoader | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const distortionRef = useRef<WaveShaperNode | null>(null);
  const isAdvancingTrackRef = useRef(false);
  const isInitializedRef = useRef(false);

  // Audio files
  const audioFiles = [
    '/blackHole.mp3',
    '/blackHole2.mp3',
    '/blackHole3.mp3',
    '/blackHole4.mp3',
  ];

  // Shuffle playlist
  const shufflePlaylist = (arr: string[]) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Create distortion curve
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

  // Play next track
  const playNextTrack = () => {
    if (isAdvancingTrackRef.current || !soundRef.current) return;
    
    isAdvancingTrackRef.current = true;
    console.log('🎵 Track ended, advancing to next...');
    
    if (soundRef.current.isPlaying) {
      soundRef.current.stop();
    }
    
    if (soundRef.current.source) {
      soundRef.current.source.onended = null;
      soundRef.current.source = null;
    }
    
    currentTrackIndexRef.current = (currentTrackIndexRef.current + 1) % playlistRef.current.length;
    
    if (currentTrackIndexRef.current === 0) {
      console.log('🔄 Playlist complete! Reshuffling...');
      playlistRef.current = shufflePlaylist(audioFiles);
    }
    
    setTimeout(() => {
      loadTrack(currentTrackIndexRef.current, true);
    }, 100);
  };

  // Load a track
  const loadTrack = (trackIndex: number, autoPlay = false) => {
    if (!soundRef.current || !audioLoaderRef.current || !listenerRef.current) return;
    
    const trackPath = playlistRef.current[trackIndex];
    console.log(`🎵 Loading track ${trackIndex + 1}/${playlistRef.current.length}: ${trackPath}`);
    setCurrentTrack(trackPath.split('/').pop() || '');
    
    if (soundRef.current.isPlaying) {
      soundRef.current.stop();
    }
    
    audioLoaderRef.current.load(
      trackPath, 
      (buffer) => {
      if (!soundRef.current || !listenerRef.current) return;
      
      soundRef.current.setBuffer(buffer);
      soundRef.current.setLoop(false);
      soundRef.current.setVolume(volume);
      
      // Setup audio chain with effects
      const context = listenerRef.current.context;
      if (context.state === 'running' || context.state === 'suspended') {
        // Lowpass filter for space effect
        if (!filterRef.current) {
          filterRef.current = context.createBiquadFilter();
          filterRef.current.type = 'lowpass';
          filterRef.current.frequency.value = distortionEnabled ? 100 : 20000;
        }
        
        // Distortion for cosmic effect
        if (!distortionRef.current) {
          distortionRef.current = context.createWaveShaper();
          distortionRef.current.curve = makeDistortionCurve(distortionEnabled ? 50 : 0);
          distortionRef.current.oversample = '4x';
        }
        
        // Chain the filters: sound -> filter -> distortion -> destination
        if (filterRef.current && distortionRef.current) {
          filterRef.current.connect(distortionRef.current);
          soundRef.current.setFilter(filterRef.current);
        } else if (filterRef.current) {
          soundRef.current.setFilter(filterRef.current);
        }
      }
      
      console.log('🔊 Audio loaded and ready');
      
      if (autoPlay && context.state === 'running') {
        console.log('▶️ Auto-playing track');
        soundRef.current.play();
        setIsPlaying(true);
        
        setTimeout(() => {
          if (soundRef.current?.source) {
            soundRef.current.source.onended = playNextTrack;
            isAdvancingTrackRef.current = false;
          }
        }, 100);
      } else {
        isAdvancingTrackRef.current = false;
      }
    },
    // Progress handler
    undefined,
    // Error handler
    (error) => {
      console.error('❌ Failed to load audio track:', trackPath, error);
      isAdvancingTrackRef.current = false;
      // Try next track on error
      if (playlistRef.current.length > 1) {
        console.log('⏭️ Skipping to next track...');
        playNextTrack();
      }
    }
  );
  };

  // Initialize audio system
  const initializeAudio = async () => {
    if (isInitializedRef.current) {
      console.log('🎵 Audio already initialized');
      return;
    }

    console.log('🎵 Initializing global audio system');
    
    const listener = new THREE.AudioListener();
    const sound = new THREE.Audio(listener);
    const audioAnalyzer = new THREE.AudioAnalyser(sound, 256);
    
    listenerRef.current = listener;
    soundRef.current = sound;
    audioAnalyzerRef.current = audioAnalyzer;
    audioLoaderRef.current = new THREE.AudioLoader();
    
    playlistRef.current = shufflePlaylist(audioFiles);
    console.log('🎵 Playlist shuffled:', playlistRef.current);
    
    // Resume audio context if suspended
    if (listener.context.state === 'suspended') {
      await listener.context.resume();
      console.log('🔊 Audio context resumed');
    }
    
    // Load first track and auto-play
    loadTrack(0, true); // Pass true to auto-play when loaded
    isInitializedRef.current = true;
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    if (!soundRef.current || !listenerRef.current) return;
    
    if (soundRef.current.isPlaying) {
      soundRef.current.pause();
      setIsPlaying(false);
      console.log('⏸️ Audio paused');
    } else {
      if (listenerRef.current.context.state === 'suspended') {
        listenerRef.current.context.resume().then(() => {
          soundRef.current?.play();
          setIsPlaying(true);
          console.log('▶️ Audio playing');
        });
      } else {
        soundRef.current.play();
        setIsPlaying(true);
        console.log('▶️ Audio playing');
      }
    }
  };

  // Set volume
  const setVolume = (newVolume: number) => {
    setVolumeState(newVolume);
    if (soundRef.current) {
      soundRef.current.setVolume(newVolume);
      console.log('🔊 Volume set to:', newVolume);
    }
  };

  // Toggle distortion
  const toggleDistortion = () => {
    const newState = !distortionEnabled;
    setDistortionEnabled(newState);
    
    if (filterRef.current) {
      filterRef.current.frequency.value = newState ? 100 : 20000;
    }
    
    if (distortionRef.current) {
      distortionRef.current.curve = makeDistortionCurve(newState ? 50 : 0);
    }
    
    console.log('🎛️ Distortion:', newState ? 'ON' : 'OFF');
  };

  // Next track
  const nextTrack = () => {
    currentTrackIndexRef.current = (currentTrackIndexRef.current + 1) % playlistRef.current.length;
    loadTrack(currentTrackIndexRef.current, isPlaying);
  };

  // Previous track
  const previousTrack = () => {
    currentTrackIndexRef.current = currentTrackIndexRef.current === 0 
      ? playlistRef.current.length - 1 
      : currentTrackIndexRef.current - 1;
    loadTrack(currentTrackIndexRef.current, isPlaying);
  };

  // Get audio analyzer for visualizations
  const getAudioAnalyzer = () => audioAnalyzerRef.current;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current?.isPlaying) {
        soundRef.current.stop();
      }
    };
  }, []);

  return (
    <AudioContext.Provider value={{
      isPlaying,
      volume,
      distortionEnabled,
      currentTrack,
      togglePlayPause,
      setVolume,
      toggleDistortion,
      nextTrack,
      previousTrack,
      initializeAudio,
      getAudioAnalyzer
    }}>
      {children}
    </AudioContext.Provider>
  );
};

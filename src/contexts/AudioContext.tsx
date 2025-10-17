import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import * as THREE from 'three';

export type AudioSource = 'local' | 'youtube';

export interface Track {
  id: string;
  name: string;
  path: string;
  duration: string;
  artist?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

interface AudioContextType {
  // Source selection
  audioSource: AudioSource;
  setAudioSource: (source: AudioSource) => void;
  
  // Playback state
  isPlaying: boolean;
  volume: number;
  distortionEnabled: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  
  // Playlist
  playlist: Track[];
  currentTrackIndex: number;
  
  // Effects
  bassLevel: number;
  trebleLevel: number;
  distortionAmount: number;
  
  // Playback modes
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  
  // Controls
  togglePlayPause: () => void;
  setVolume: (volume: number) => void;
  toggleDistortion: () => void;
  setBassLevel: (level: number) => void;
  setTrebleLevel: (level: number) => void;
  setDistortionAmount: (amount: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seekTo: (time: number) => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  selectTrack: (index: number) => void;
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
  const [audioSource, setAudioSource] = useState<AudioSource>('local');
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.75);
  const [distortionEnabled, setDistortionEnabled] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bassLevel, setBassLevelState] = useState(50);
  const [trebleLevel, setTrebleLevelState] = useState(50);
  const [distortionAmount, setDistortionAmountState] = useState(30);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>('all');
  const [playlist, setPlaylist] = useState<Track[]>([]);
  
  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const soundRef = useRef<THREE.Audio | null>(null);
  const audioAnalyzerRef = useRef<THREE.AudioAnalyser | null>(null);
  const currentTrackIndexRef = useRef(0);
  const audioLoaderRef = useRef<THREE.AudioLoader | null>(null);
  const bassFilterRef = useRef<BiquadFilterNode | null>(null);
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null);
  const distortionRef = useRef<WaveShaperNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isAdvancingTrackRef = useRef(false);
  const isInitializedRef = useRef(false);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track metadata
  const trackDatabase: Track[] = [
    { id: '1', name: 'Black Hole Symphony', path: '/blackHole.mp3', duration: '3:45', artist: 'Cosmic Audio' },
    { id: '2', name: 'Quantum Drift', path: '/blackHole2.mp3', duration: '4:12', artist: 'Neural Beats' },
    { id: '3', name: 'Stellar Evolution', path: '/blackHole3.mp3', duration: '5:23', artist: 'Space Harmonics' },
    { id: '4', name: 'Event Horizon', path: '/blackHole4.mp3', duration: '3:07', artist: 'Matrix Soundscape' },
  ];

  // Initialize playlist
  useEffect(() => {
    setPlaylist(trackDatabase);
  }, []);

  // Time update interval
  useEffect(() => {
    if (isPlaying && soundRef.current) {
      timeUpdateIntervalRef.current = setInterval(() => {
        if (soundRef.current?.source) {
          const context = soundRef.current.source.context;
          const currentTime = context.currentTime - (soundRef.current as any).startTime || 0;
          setCurrentTime(Math.min(currentTime, duration));
        }
      }, 100);
    } else {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }
    }

    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
    };
  }, [isPlaying, duration]);

  // Shuffle playlist
  const shufflePlaylist = (arr: Track[]) => {
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
    
    if (repeatMode === 'one') {
      // Repeat the same track
      currentTrackIndexRef.current = currentTrackIndexRef.current;
    } else if (repeatMode === 'all' || repeatMode === 'off') {
      currentTrackIndexRef.current = (currentTrackIndexRef.current + 1) % playlist.length;
      
      if (currentTrackIndexRef.current === 0) {
        if (repeatMode === 'off') {
          console.log('🛑 Playlist complete, stopping.');
          setIsPlaying(false);
          isAdvancingTrackRef.current = false;
          return;
        } else if (shuffleEnabled) {
          console.log('🔄 Playlist complete! Reshuffling...');
          setPlaylist(shufflePlaylist(trackDatabase));
        }
      }
    }
    
    setCurrentTrackIndex(currentTrackIndexRef.current);
    
    setTimeout(() => {
      loadTrack(currentTrackIndexRef.current, true);
    }, 100);
  };

  // Load a track
  const loadTrack = (trackIndex: number, autoPlay = false) => {
    if (!soundRef.current || !audioLoaderRef.current || !listenerRef.current) return;
    
    const track = playlist[trackIndex];
    if (!track) return;
    
    console.log(`🎵 Loading track ${trackIndex + 1}/${playlist.length}: ${track.name}`);
    setCurrentTrack(track);
    setCurrentTime(0);
    
    // Parse duration to seconds
    const [min, sec] = track.duration.split(':').map(Number);
    setDuration(min * 60 + sec);
    
    if (soundRef.current.isPlaying) {
      soundRef.current.stop();
    }
    
    audioLoaderRef.current.load(
      track.path, 
      (buffer) => {
      if (!soundRef.current || !listenerRef.current) return;
      
      soundRef.current.setBuffer(buffer);
      soundRef.current.setLoop(false);
      soundRef.current.setVolume(volume);
      
      // Setup audio chain with effects
      const context = listenerRef.current.context;
      if (context.state === 'running' || context.state === 'suspended') {
        // Create gain node for volume control
        if (!gainNodeRef.current) {
          gainNodeRef.current = context.createGain();
          gainNodeRef.current.gain.value = volume;
        }
        
        // Bass filter (low shelf)
        if (!bassFilterRef.current) {
          bassFilterRef.current = context.createBiquadFilter();
          bassFilterRef.current.type = 'lowshelf';
          bassFilterRef.current.frequency.value = 320;
          bassFilterRef.current.gain.value = (bassLevel - 50) / 5; // -10 to +10 dB
        }
        
        // Treble filter (high shelf)
        if (!trebleFilterRef.current) {
          trebleFilterRef.current = context.createBiquadFilter();
          trebleFilterRef.current.type = 'highshelf';
          trebleFilterRef.current.frequency.value = 3200;
          trebleFilterRef.current.gain.value = (trebleLevel - 50) / 5; // -10 to +10 dB
        }
        
        // Distortion for cosmic effect
        if (!distortionRef.current) {
          distortionRef.current = context.createWaveShaper();
          distortionRef.current.curve = makeDistortionCurve(distortionEnabled ? distortionAmount : 0);
          distortionRef.current.oversample = '4x';
        }
        
        // Chain the effects: sound -> bass -> treble -> distortion -> gain -> destination
        if (bassFilterRef.current && trebleFilterRef.current && distortionRef.current && gainNodeRef.current) {
          bassFilterRef.current.connect(trebleFilterRef.current);
          trebleFilterRef.current.connect(distortionRef.current);
          distortionRef.current.connect(gainNodeRef.current);
          soundRef.current.setFilter(bassFilterRef.current);
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
      console.error('❌ Failed to load audio track:', track.name, error);
      isAdvancingTrackRef.current = false;
      // Try next track on error
      if (playlist.length > 1) {
        console.log('⏭️ Skipping to next track...');
        playNextTrack();
      }
    }
  );
  };

  // Initialize audio system
  const initializeAudio = async () => {
    // Strong guard - check both flag and actual refs
    if (isInitializedRef.current || soundRef.current || listenerRef.current) {
      console.log('🎵 Audio already initialized - preventing duplicate');
      console.log('🎵 Current state:', {
        isPlaying: soundRef.current?.isPlaying,
        hasListener: !!listenerRef.current,
        hasSound: !!soundRef.current,
        currentTrack: playlist[currentTrackIndexRef.current]?.name
      });
      return;
    }

    // Set flag immediately to prevent race conditions
    isInitializedRef.current = true;
    console.log('🎵 Initializing global audio system (first time)');
    
    const listener = new THREE.AudioListener();
    const sound = new THREE.Audio(listener);
    const audioAnalyzer = new THREE.AudioAnalyser(sound, 256);
    
    listenerRef.current = listener;
    soundRef.current = sound;
    audioAnalyzerRef.current = audioAnalyzer;
    audioLoaderRef.current = new THREE.AudioLoader();
    
    if (shuffleEnabled) {
      setPlaylist(shufflePlaylist(trackDatabase));
      console.log('🎵 Playlist shuffled');
    } else {
      setPlaylist(trackDatabase);
    }
    
    // Resume audio context if suspended
    if (listener.context.state === 'suspended') {
      await listener.context.resume();
      console.log('🔊 Audio context resumed');
    }
    
    // Load first track and auto-play
    loadTrack(0, true); // Pass true to auto-play when loaded
    // Flag already set at the start of this function to prevent race conditions
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
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newVolume;
    }
    console.log(`🔊 Volume: ${Math.round(newVolume * 100)}%`);
  };

  // Set bass level
  const setBassLevel = (level: number) => {
    setBassLevelState(level);
    if (bassFilterRef.current) {
      bassFilterRef.current.gain.value = (level - 50) / 5; // -10 to +10 dB
      console.log(`🎵 Bass: ${level}%`);
    }
  };

  // Set treble level
  const setTrebleLevel = (level: number) => {
    setTrebleLevelState(level);
    if (trebleFilterRef.current) {
      trebleFilterRef.current.gain.value = (level - 50) / 5; // -10 to +10 dB
      console.log(`🎵 Treble: ${level}%`);
    }
  };

  // Set distortion amount
  const setDistortionAmount = (amount: number) => {
    setDistortionAmountState(amount);
    if (distortionRef.current && distortionEnabled) {
      distortionRef.current.curve = makeDistortionCurve(amount);
      console.log(`🎸 Distortion: ${amount}%`);
    }
  };

  // Toggle distortion
  const toggleDistortion = () => {
    const newState = !distortionEnabled;
    setDistortionEnabled(newState);
    if (distortionRef.current) {
      distortionRef.current.curve = makeDistortionCurve(newState ? distortionAmount : 0);
    }
    console.log(`🎸 Distortion: ${newState ? 'ON' : 'OFF'}`);
  };

  // Next track
  const nextTrack = () => {
    currentTrackIndexRef.current = (currentTrackIndexRef.current + 1) % playlist.length;
    setCurrentTrackIndex(currentTrackIndexRef.current);
    loadTrack(currentTrackIndexRef.current, isPlaying);
  };

  // Previous track
  const previousTrack = () => {
    currentTrackIndexRef.current = currentTrackIndexRef.current === 0 
      ? playlist.length - 1 
      : currentTrackIndexRef.current - 1;
    setCurrentTrackIndex(currentTrackIndexRef.current);
    loadTrack(currentTrackIndexRef.current, isPlaying);
  };

  // Seek to time
  const seekTo = (time: number) => {
    if (!soundRef.current || !soundRef.current.isPlaying) return;
    
    const position = Math.max(0, Math.min(time, duration));
    // Note: Three.js Audio doesn't support seeking easily, would need custom implementation
    console.log(`⏩ Seek to: ${position}s`);
    setCurrentTime(position);
  };

  // Toggle shuffle
  const toggleShuffle = () => {
    const newState = !shuffleEnabled;
    setShuffleEnabled(newState);
    if (newState) {
      setPlaylist(shufflePlaylist(trackDatabase));
      console.log('🔀 Shuffle ON');
    } else {
      setPlaylist(trackDatabase);
      console.log('🔀 Shuffle OFF');
    }
  };

  // Set repeat mode
  const setRepeatMode = (mode: RepeatMode) => {
    setRepeatModeState(mode);
    console.log(`🔁 Repeat: ${mode}`);
  };

  // Select track
  const selectTrack = (index: number) => {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndexRef.current = index;
    setCurrentTrackIndex(index);
    loadTrack(index, isPlaying);
  };

  // Get audio analyzer for visualizations
  const getAudioAnalyzer = () => audioAnalyzerRef.current;

  // Format time helper (not used in AudioContext itself, but available)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Cleanup on unmount (only runs when provider unmounts, not on scene changes)
  useEffect(() => {
    console.log('🎵 AudioProvider mounted');
    
    return () => {
      console.log('🎵 AudioProvider unmounting - cleaning up audio');
      if (soundRef.current?.isPlaying) {
        soundRef.current.stop();
      }
      isInitializedRef.current = false;
    };
  }, []);

  return (
    <AudioContext.Provider value={{
      // Source
      audioSource,
      setAudioSource,
      // Playback state
      isPlaying,
      volume,
      distortionEnabled,
      currentTrack,
      currentTime,
      duration,
      // Playlist
      playlist,
      currentTrackIndex,
      // Effects
      bassLevel,
      trebleLevel,
      distortionAmount,
      // Modes
      shuffleEnabled,
      repeatMode,
      // Controls
      togglePlayPause,
      setVolume,
      toggleDistortion,
      setBassLevel,
      setTrebleLevel,
      setDistortionAmount,
      nextTrack,
      previousTrack,
      seekTo,
      toggleShuffle,
      setRepeatMode,
      selectTrack,
      initializeAudio,
      getAudioAnalyzer
    }}>
      {children}
    </AudioContext.Provider>
  );
};

/**
 * Comprehensive Music Player with Full Audio Control Suite
 * Integrates YouTube, Local MP3s, and Advanced Audio Processing
 * 
 * Features:
 * - YouTube & Local MP3 playback
 * - Bass/Treble EQ controls
 * - Distortion effects
 * - Playlist management
 * - OAuth integration
 * - Full transport controls
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAudio, type AudioSource } from '../../contexts/AudioContext';
import { useYouTubeAudio } from '../../contexts/YouTubeAudioContext';
import { useAuth } from '../../contexts/AuthContext';

interface ComprehensiveMusicPlayerProps {
  onClose: () => void;
}

interface EQSettings {
  bass: number;
  treble: number;
  distortion: number;
  distortionEnabled: boolean;
}

export const ComprehensiveMusicPlayer: React.FC<ComprehensiveMusicPlayerProps> = ({ onClose }) => {
  // Contexts
  const localAudio = useAudio();
  const youtubeAudio = useYouTubeAudio();
  const { user } = useAuth();
  
  // Audio source state
  const [audioSource, setAudioSource] = useState<AudioSource>('local');
  const isLocal = audioSource === 'local';
  
  // YouTube specific states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // EQ Settings (works for both sources)
  const [eqSettings, setEQSettings] = useState<EQSettings>({
    bass: localAudio.bassLevel || 50,
    treble: localAudio.trebleLevel || 50,
    distortion: localAudio.distortionAmount || 30,
    distortionEnabled: localAudio.distortionEnabled || false
  });
  
  // Visualization
  const [showVisualizer, setShowVisualizer] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  
  // Handle YouTube search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    console.log('🔍 Searching YouTube for:', searchQuery);
    
    try {
      const results = await youtubeAudio.searchVideos(searchQuery);
      setSearchResults(results);
      console.log('✅ Found', results.length, 'results');
    } catch (error) {
      console.error('❌ Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };
  
  // Handle EQ changes for local audio
  useEffect(() => {
    if (isLocal) {
      localAudio.setBassLevel?.(eqSettings.bass);
      localAudio.setTrebleLevel?.(eqSettings.treble);
      localAudio.setDistortionAmount?.(eqSettings.distortion);
      if (eqSettings.distortionEnabled !== localAudio.distortionEnabled) {
        localAudio.toggleDistortion?.();
      }
    }
  }, [eqSettings, isLocal]);
  
  // Visualizer animation
  useEffect(() => {
    if (!showVisualizer || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const analyzer = localAudio.getAudioAnalyzer?.();
    if (!analyzer) return;
    
    const draw = () => {
      const data = analyzer.getFrequencyData();
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = canvas.width / data.length;
      data.forEach((value, i) => {
        const barHeight = (value / 255) * canvas.height;
        const hue = (i / data.length) * 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth, barHeight);
      });
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [showVisualizer, localAudio.isPlaying]);

  return (
    <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center pointer-events-auto">
      <div className="w-full max-w-7xl h-[95vh] bg-gradient-to-br from-purple-900/30 via-black to-pink-900/30 rounded-lg border-2 border-pink-500/50 shadow-2xl shadow-pink-500/20 overflow-hidden">
        
        {/* Header Bar */}
        <div className="bg-black/60 backdrop-blur-md border-b border-pink-500/30 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 text-transparent bg-clip-text">
                🎵 Comprehensive Music Player
              </h2>
              
              {/* Source Toggle with Animation */}
              <div className="relative flex bg-black/50 p-1 rounded-lg border border-gray-700">
                <div 
                  className="absolute inset-y-1 transition-all duration-300 rounded-md"
                  style={{
                    width: '50%',
                    left: isLocal ? '0' : '50%',
                    background: isLocal 
                      ? 'linear-gradient(135deg, #00ffcc 0%, #0088ff 100%)' 
                      : 'linear-gradient(135deg, #ff0040 0%, #ff6000 100%)'
                  }}
                />
                <button
                  onClick={() => setAudioSource('local')}
                  className={`relative z-10 px-6 py-2 rounded-md font-bold transition-all ${
                    isLocal ? 'text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  💿 Local MP3s
                </button>
                <button
                  onClick={() => setAudioSource('youtube')}
                  className={`relative z-10 px-6 py-2 rounded-md font-bold transition-all ${
                    !isLocal ? 'text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  📺 YouTube
                </button>
              </div>
            </div>
            
            <button 
              onClick={onClose}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/20 text-3xl font-bold px-3 py-1 rounded-lg transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex h-[calc(100%-5rem)]">
          {/* Left Panel - Player & Controls */}
          <div className="w-2/3 flex flex-col p-6 border-r border-pink-500/20">
            
            {/* Now Playing Display */}
            <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 backdrop-blur-md rounded-lg p-6 mb-6 border border-pink-500/30">
              <div className="flex items-center gap-6">
                {/* Album Art */}
                <div className="relative w-40 h-40 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg overflow-hidden group">
                  {!isLocal && youtubeAudio.currentVideo?.thumbnail ? (
                    <img 
                      src={youtubeAudio.currentVideo.thumbnail} 
                      alt="Thumbnail" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-7xl animate-pulse">🎵</span>
                    </div>
                  )}
                  {/* Spinning overlay effect */}
                  {(isLocal ? localAudio.isPlaying : youtubeAudio.isPlaying) && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-spin-slow" />
                  )}
                </div>
                
                {/* Track Info */}
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {isLocal 
                      ? (localAudio.currentTrack?.name || 'No Track Selected')
                      : (youtubeAudio.currentVideo?.title || 'No Video Selected')
                    }
                  </h3>
                  <p className="text-gray-400 mb-4">
                    {isLocal 
                      ? (localAudio.currentTrack?.artist || 'Unknown Artist')
                      : (youtubeAudio.currentVideo?.channelTitle || 'Unknown Channel')
                    }
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${((isLocal ? localAudio.currentTime : youtubeAudio.currentTime) / 
                                     (isLocal ? localAudio.duration : youtubeAudio.duration)) * 100 || 0}%` 
                        }}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg shadow-pink-500/50" />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{formatTime(isLocal ? localAudio.currentTime : youtubeAudio.currentTime)}</span>
                      <span>{formatTime(isLocal ? localAudio.duration : youtubeAudio.duration)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Transport Controls */}
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => isLocal ? localAudio.toggleShuffle() : youtubeAudio.toggleShuffle()}
                  className={`p-2 rounded-lg transition-all ${
                    (isLocal ? localAudio.shuffleEnabled : youtubeAudio.shuffle)
                      ? 'bg-pink-500/30 text-pink-400'
                      : 'bg-gray-800/50 text-gray-400 hover:text-white'
                  }`}
                  title="Shuffle"
                >
                  🔀
                </button>
                
                <button
                  onClick={() => isLocal ? localAudio.previousTrack() : youtubeAudio.previousVideo()}
                  className="p-3 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-white transition-all"
                  title="Previous"
                >
                  ⏮️
                </button>
                
                <button
                  onClick={() => isLocal ? localAudio.togglePlayPause() : youtubeAudio.togglePlayPause()}
                  className="p-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white transition-all transform hover:scale-105 shadow-lg shadow-pink-500/50"
                >
                  {(isLocal ? localAudio.isPlaying : youtubeAudio.isPlaying) ? '⏸️' : '▶️'}
                </button>
                
                <button
                  onClick={() => isLocal ? localAudio.nextTrack() : youtubeAudio.nextVideo()}
                  className="p-3 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-white transition-all"
                  title="Next"
                >
                  ⏭️
                </button>
                
                <button
                  onClick={() => {
                    if (isLocal) {
                      const modes: any[] = ['off', 'all', 'one'];
                      const currentIndex = modes.indexOf(localAudio.repeatMode);
                      localAudio.setRepeatMode(modes[(currentIndex + 1) % 3]);
                    } else {
                      youtubeAudio.toggleRepeat();
                    }
                  }}
                  className={`p-2 rounded-lg transition-all ${
                    (isLocal ? localAudio.repeatMode !== 'off' : youtubeAudio.repeat !== 'off')
                      ? 'bg-pink-500/30 text-pink-400'
                      : 'bg-gray-800/50 text-gray-400 hover:text-white'
                  }`}
                  title="Repeat"
                >
                  {isLocal 
                    ? (localAudio.repeatMode === 'one' ? '🔂' : '🔁')
                    : (youtubeAudio.repeat === 'one' ? '🔂' : '🔁')
                  }
                </button>
              </div>
            </div>
            
            {/* Audio Controls Panel */}
            <div className="bg-black/50 backdrop-blur-md rounded-lg p-6 border border-purple-500/30">
              <h3 className="text-xl font-bold text-purple-400 mb-4">🎛️ Audio Controls</h3>
              
              <div className="grid grid-cols-2 gap-6">
                {/* Volume Control */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm text-gray-400">Volume</label>
                    <span className="text-pink-400 font-mono">
                      {Math.round(isLocal ? (localAudio.volume * 20) : youtubeAudio.volume)}%
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100"
                    value={isLocal ? (localAudio.volume * 20) : youtubeAudio.volume}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (isLocal) {
                        localAudio.setVolume(val / 20);
                      } else {
                        youtubeAudio.updateVolume(val);
                      }
                    }}
                    className="w-full accent-pink-500"
                  />
                </div>
                
                {/* Bass Control */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm text-gray-400">Bass</label>
                    <span className="text-purple-400 font-mono">{eqSettings.bass}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100"
                    value={eqSettings.bass}
                    onChange={(e) => setEQSettings({...eqSettings, bass: Number(e.target.value)})}
                    className="w-full accent-purple-500"
                    disabled={!isLocal}
                  />
                </div>
                
                {/* Treble Control */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm text-gray-400">Treble</label>
                    <span className="text-cyan-400 font-mono">{eqSettings.treble}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100"
                    value={eqSettings.treble}
                    onChange={(e) => setEQSettings({...eqSettings, treble: Number(e.target.value)})}
                    className="w-full accent-cyan-500"
                    disabled={!isLocal}
                  />
                </div>
                
                {/* Distortion Control */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                      <input 
                        type="checkbox"
                        checked={eqSettings.distortionEnabled}
                        onChange={(e) => setEQSettings({...eqSettings, distortionEnabled: e.target.checked})}
                        className="accent-pink-500"
                        disabled={!isLocal}
                      />
                      Space Distortion
                    </label>
                    <span className="text-pink-400 font-mono">{eqSettings.distortion}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100"
                    value={eqSettings.distortion}
                    onChange={(e) => setEQSettings({...eqSettings, distortion: Number(e.target.value)})}
                    className="w-full accent-pink-500"
                    disabled={!isLocal || !eqSettings.distortionEnabled}
                  />
                </div>
              </div>
              
              {!isLocal && (
                <p className="text-xs text-gray-500 mt-4">
                  Note: Advanced audio processing is currently only available for local MP3 playback
                </p>
              )}
            </div>
            
            {/* Visualizer */}
            {showVisualizer && isLocal && (
              <div className="mt-6 bg-black/50 rounded-lg p-4 border border-cyan-500/30">
                <canvas 
                  ref={canvasRef}
                  width={600}
                  height={150}
                  className="w-full h-full rounded"
                />
              </div>
            )}
            
            {/* Visualizer Toggle */}
            <button
              onClick={() => setShowVisualizer(!showVisualizer)}
              className="mt-4 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all font-mono text-sm"
              disabled={!isLocal}
            >
              {showVisualizer ? '🔲 Hide' : '📊 Show'} Visualizer {!isLocal && '(Local Only)'}
            </button>
          </div>
          
          {/* Right Panel - Playlists & Search */}
          <div className="w-1/3 flex flex-col p-6">
            {isLocal ? (
              /* Local Playlist */
              <>
                <h3 className="text-xl font-bold text-cyan-400 mb-4">📝 Playlist</h3>
                <div className="flex-1 overflow-y-auto space-y-2 bg-black/30 rounded-lg p-3">
                  {localAudio.playlist.map((track, index) => (
                    <div
                      key={track.id}
                      onClick={() => localAudio.selectTrack(index)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        index === localAudio.currentTrackIndex
                          ? 'bg-gradient-to-r from-pink-500/30 to-purple-500/30 border border-pink-500/50'
                          : 'bg-gray-800/50 hover:bg-gray-700/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white">
                            {index === localAudio.currentTrackIndex && localAudio.isPlaying && '▶ '}
                            {track.name}
                          </div>
                          <div className="text-sm text-gray-400">{track.artist}</div>
                        </div>
                        <span className="text-xs text-gray-500">{track.duration}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* YouTube Search & Queue */
              <>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-red-400 mb-3">🔍 YouTube Search</h3>
                  
                  {/* YouTube Connection Status */}
                  {youtubeAudio.isAuthenticated ? (
                    <div className="mb-3 p-2 bg-green-500/20 rounded-lg border border-green-500/30">
                      <div className="text-green-400 text-sm flex items-center gap-2">
                        ✅ Connected: {youtubeAudio.userEmail || user?.username}
                        <button
                          onClick={() => youtubeAudio.signOut()}
                          className="ml-auto text-xs text-red-400 hover:text-red-300"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => youtubeAudio.signIn()}
                      className="w-full mb-3 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all border border-red-500/30"
                    >
                      🔐 Connect Google Account
                    </button>
                  )}
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Search for music..."
                      className="flex-1 bg-black/50 text-white px-4 py-2 rounded-lg border border-red-500/30 focus:border-red-500 focus:outline-none"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={isSearching}
                      className="px-6 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all border border-red-500/30 disabled:opacity-50"
                    >
                      {isSearching ? '🔄' : '🔍'}
                    </button>
                  </div>
                </div>
                
                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-bold text-red-300 mb-2">
                      Search Results ({searchResults.length})
                    </h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 bg-black/30 rounded-lg p-2">
                      {searchResults.map((video) => (
                        <div
                          key={video.id}
                          onClick={() => {
                            youtubeAudio.addToQueue(video);
                            youtubeAudio.playVideo(video.id);
                          }}
                          className="p-2 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 cursor-pointer transition-all flex items-center gap-3"
                        >
                          <img 
                            src={video.thumbnail} 
                            alt={video.title}
                            className="w-20 h-14 object-cover rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white font-bold truncate">{video.title}</div>
                            <div className="text-xs text-gray-400">{video.channelTitle}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* YouTube Queue */}
                <h4 className="text-sm font-bold text-red-300 mb-2">
                  Queue ({youtubeAudio.queue.length})
                </h4>
                <div className="flex-1 overflow-y-auto space-y-2 bg-black/30 rounded-lg p-2">
                  {youtubeAudio.queue.map((video, index) => (
                    <div
                      key={video.id}
                      onClick={() => youtubeAudio.playVideo(video.id)}
                      className={`p-2 rounded-lg cursor-pointer transition-all ${
                        youtubeAudio.currentVideo?.id === video.id
                          ? 'bg-gradient-to-r from-red-500/30 to-orange-500/30 border border-red-500/50'
                          : 'bg-gray-800/50 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img 
                          src={video.thumbnail} 
                          alt={video.title}
                          className="w-16 h-12 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">
                            {youtubeAudio.currentVideo?.id === video.id && youtubeAudio.isPlaying && '▶ '}
                            {video.title}
                          </div>
                          <div className="text-xs text-gray-400">{video.channelTitle}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* User Playlists */}
                {youtubeAudio.userPlaylists.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-bold text-red-300 mb-2">
                      📋 Your Playlists
                    </h4>
                    <div className="space-y-2">
                      {youtubeAudio.userPlaylists.map((playlist) => (
                        <button
                          key={playlist.id}
                          onClick={() => youtubeAudio.loadPlaylist(playlist.id)}
                          className="w-full p-2 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 text-left transition-all"
                        >
                          <div className="text-sm text-white">{playlist.title}</div>
                          <div className="text-xs text-gray-400">{playlist.itemCount} videos</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to format time
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

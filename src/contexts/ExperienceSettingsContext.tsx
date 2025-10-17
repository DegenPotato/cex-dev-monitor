import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface ExperienceSettings {
  // Visual Settings
  reducedMotion: boolean;
  performanceMode: boolean;
  particleQuality: 'low' | 'medium' | 'high';
  bloomEnabled: boolean;
  
  // Audio Settings
  audioEnabled: boolean;
  audioVolume: number; // 0-100
  sfxEnabled: boolean;
  ambientEnabled: boolean;
  
  // UI Settings
  hudVisible: boolean;
  showFPS: boolean;
  showDebugInfo: boolean;
  
  // Accessibility
  highContrast: boolean;
  largeText: boolean;
  keyboardNavigation: boolean;
}

interface ExperienceSettingsContextType {
  settings: ExperienceSettings;
  updateSetting: <K extends keyof ExperienceSettings>(
    key: K,
    value: ExperienceSettings[K]
  ) => void;
  resetToDefaults: () => void;
  toggleReducedMotion: () => void;
  togglePerformanceMode: () => void;
  toggleAudio: () => void;
  setVolume: (volume: number) => void;
  getQualityMultiplier: () => number;
  shouldReduceEffects: () => boolean;
}

const DEFAULT_SETTINGS: ExperienceSettings = {
  // Visual Settings
  reducedMotion: false,
  performanceMode: false,
  particleQuality: 'high',
  bloomEnabled: true,
  
  // Audio Settings
  audioEnabled: false, // Start with audio disabled (user must opt-in)
  audioVolume: 70,
  sfxEnabled: true,
  ambientEnabled: true,
  
  // UI Settings
  hudVisible: true,
  showFPS: false,
  showDebugInfo: false,
  
  // Accessibility
  highContrast: false,
  largeText: false,
  keyboardNavigation: true,
};

const ExperienceSettingsContext = createContext<ExperienceSettingsContextType | undefined>(undefined);

export const useExperienceSettings = () => {
  const context = useContext(ExperienceSettingsContext);
  if (!context) {
    throw new Error('useExperienceSettings must be used within ExperienceSettingsProvider');
  }
  return context;
};

interface ExperienceSettingsProviderProps {
  children: ReactNode;
}

export const ExperienceSettingsProvider: React.FC<ExperienceSettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<ExperienceSettings>(DEFAULT_SETTINGS);
  
  // Load settings from localStorage on mount
  useEffect(() => {
    const loadedSettings = localStorage.getItem('experienceSettings');
    if (loadedSettings) {
      try {
        const parsed = JSON.parse(loadedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        console.log('🎨 Loaded experience settings from localStorage');
      } catch (error) {
        console.error('❌ Failed to load experience settings:', error);
      }
    }
    
    // Check for system preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setSettings(prev => ({ ...prev, reducedMotion: true }));
      console.log('🎬 System prefers reduced motion - enabling');
    }
    
    // Check device capabilities for auto performance mode
    const isLowEndDevice = checkDeviceCapabilities();
    if (isLowEndDevice) {
      setSettings(prev => ({ 
        ...prev, 
        performanceMode: true,
        particleQuality: 'low',
        bloomEnabled: false
      }));
      console.log('📱 Low-end device detected - enabling performance mode');
    }
  }, []);
  
  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('experienceSettings', JSON.stringify(settings));
    
    // Apply theme attributes to document
    if (settings.reducedMotion) {
      document.documentElement.setAttribute('data-theme', 'reduced');
    } else if (settings.performanceMode) {
      document.documentElement.setAttribute('data-theme', 'performance');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    // Apply accessibility classes
    if (settings.highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    
    if (settings.largeText) {
      document.documentElement.classList.add('large-text');
    } else {
      document.documentElement.classList.remove('large-text');
    }
  }, [settings]);
  
  // Update a single setting
  const updateSetting = useCallback(<K extends keyof ExperienceSettings>(
    key: K,
    value: ExperienceSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    console.log(`⚙️ Updated setting: ${key} = ${value}`);
  }, []);
  
  // Reset to default settings
  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    console.log('🔄 Reset to default settings');
  }, []);
  
  // Toggle reduced motion
  const toggleReducedMotion = useCallback(() => {
    setSettings(prev => ({ 
      ...prev, 
      reducedMotion: !prev.reducedMotion,
      // If enabling reduced motion, also reduce effects
      bloomEnabled: prev.reducedMotion ? true : false,
      particleQuality: prev.reducedMotion ? 'high' : 'low'
    }));
  }, []);
  
  // Toggle performance mode
  const togglePerformanceMode = useCallback(() => {
    setSettings(prev => ({ 
      ...prev, 
      performanceMode: !prev.performanceMode,
      // Adjust related settings
      particleQuality: prev.performanceMode ? 'high' : 'low',
      bloomEnabled: prev.performanceMode ? true : false,
      showFPS: !prev.performanceMode // Show FPS in performance mode
    }));
  }, []);
  
  // Toggle audio
  const toggleAudio = useCallback(() => {
    setSettings(prev => ({ 
      ...prev, 
      audioEnabled: !prev.audioEnabled 
    }));
  }, []);
  
  // Set volume
  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    setSettings(prev => ({ ...prev, audioVolume: clampedVolume }));
  }, []);
  
  // Get quality multiplier based on settings
  const getQualityMultiplier = useCallback(() => {
    if (settings.performanceMode) return 0.25;
    if (settings.reducedMotion) return 0.5;
    
    switch (settings.particleQuality) {
      case 'low': return 0.3;
      case 'medium': return 0.6;
      case 'high': return 1.0;
      default: return 1.0;
    }
  }, [settings]);
  
  // Check if effects should be reduced
  const shouldReduceEffects = useCallback(() => {
    return settings.reducedMotion || settings.performanceMode;
  }, [settings]);
  
  return (
    <ExperienceSettingsContext.Provider value={{
      settings,
      updateSetting,
      resetToDefaults,
      toggleReducedMotion,
      togglePerformanceMode,
      toggleAudio,
      setVolume,
      getQualityMultiplier,
      shouldReduceEffects
    }}>
      {children}
    </ExperienceSettingsContext.Provider>
  );
};

// Helper function to check device capabilities
function checkDeviceCapabilities(): boolean {
  // Check for low-end device indicators
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const hasLowMemory = 'deviceMemory' in navigator && (navigator as any).deviceMemory < 4;
  const hasLowCores = 'hardwareConcurrency' in navigator && navigator.hardwareConcurrency < 4;
  const isLowDPR = window.devicePixelRatio < 2;
  
  // Check WebGL capabilities
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  let hasWeakGPU = false;
  
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      // Check for integrated or weak GPUs
      hasWeakGPU = /Intel|Integrated|UHD|HD Graphics/i.test(renderer);
    }
  }
  
  // Return true if any low-end indicator is present
  return isMobile || hasLowMemory || hasLowCores || hasWeakGPU;
}

// Hook to detect reduced motion preference changes
export const useReducedMotion = () => {
  const { settings } = useExperienceSettings();
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => {
      setSystemPrefersReducedMotion(event.matches);
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return settings.reducedMotion || systemPrefersReducedMotion;
};

// Hook for performance metrics
export const usePerformanceMetrics = () => {
  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState(0);
  
  useEffect(() => {
    let lastTime = performance.now();
    let frames = 0;
    let animationId: number;
    
    const measureFPS = () => {
      frames++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round(frames * 1000 / (currentTime - lastTime)));
        setFrameTime(Math.round((currentTime - lastTime) / frames));
        frames = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };
    
    animationId = requestAnimationFrame(measureFPS);
    
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  return { fps, frameTime };
};

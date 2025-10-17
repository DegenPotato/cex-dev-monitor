/**
 * Performance utilities for adaptive quality scaling
 */

interface QualitySettings {
  particleCount: number;
  bloomStrength: number;
  shadowsEnabled: boolean;
  antialias: boolean;
  pixelRatio: number;
  shaderComplexity: 'low' | 'medium' | 'high';
  maxLights: number;
  reflectionQuality: number;
  postProcessingEnabled: boolean;
}

export const getAdaptiveQualitySettings = (
  qualityMultiplier: number,
  isReducedMotion: boolean,
  isPerformanceMode: boolean
): QualitySettings => {
  // Base settings for high quality
  const baseSettings: QualitySettings = {
    particleCount: 5000,
    bloomStrength: 1.2,
    shadowsEnabled: true,
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    shaderComplexity: 'high',
    maxLights: 8,
    reflectionQuality: 256,
    postProcessingEnabled: true,
  };
  
  // Performance mode overrides
  if (isPerformanceMode) {
    return {
      particleCount: Math.floor(baseSettings.particleCount * 0.2),
      bloomStrength: 0,
      shadowsEnabled: false,
      antialias: false,
      pixelRatio: 1,
      shaderComplexity: 'low',
      maxLights: 2,
      reflectionQuality: 0,
      postProcessingEnabled: false,
    };
  }
  
  // Reduced motion adjustments
  if (isReducedMotion) {
    return {
      ...baseSettings,
      particleCount: Math.floor(baseSettings.particleCount * 0.5),
      bloomStrength: baseSettings.bloomStrength * 0.5,
      shaderComplexity: 'medium',
      maxLights: 4,
      reflectionQuality: 128,
    };
  }
  
  // Apply quality multiplier
  return {
    particleCount: Math.floor(baseSettings.particleCount * qualityMultiplier),
    bloomStrength: baseSettings.bloomStrength * qualityMultiplier,
    shadowsEnabled: qualityMultiplier > 0.5,
    antialias: qualityMultiplier > 0.3,
    pixelRatio: qualityMultiplier > 0.7 ? baseSettings.pixelRatio : 1,
    shaderComplexity: qualityMultiplier > 0.7 ? 'high' : qualityMultiplier > 0.4 ? 'medium' : 'low',
    maxLights: Math.floor(baseSettings.maxLights * qualityMultiplier),
    reflectionQuality: Math.floor(baseSettings.reflectionQuality * qualityMultiplier),
    postProcessingEnabled: qualityMultiplier > 0.3,
  };
};

/**
 * Calculate optimal particle count based on device capabilities
 */
export const getOptimalParticleCount = (
  baseCount: number,
  qualityMultiplier: number
): number => {
  // Check device capabilities
  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const deviceMemory = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  
  let optimalCount = baseCount;
  
  // Reduce for mobile
  if (isMobile) {
    optimalCount *= 0.3;
  }
  
  // Adjust based on memory
  if (deviceMemory < 4) {
    optimalCount *= 0.5;
  } else if (deviceMemory < 8) {
    optimalCount *= 0.75;
  }
  
  // Adjust based on CPU cores
  if (cores < 4) {
    optimalCount *= 0.6;
  } else if (cores < 8) {
    optimalCount *= 0.8;
  }
  
  // Apply quality multiplier
  optimalCount *= qualityMultiplier;
  
  return Math.floor(Math.max(100, optimalCount)); // Minimum 100 particles
};

/**
 * Detect GPU capabilities for shader complexity
 */
export const detectGPUCapabilities = (): {
  tier: 'low' | 'medium' | 'high';
  supportsWebGL2: boolean;
  maxTextureSize: number;
} => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
  if (!gl) {
    return {
      tier: 'low',
      supportsWebGL2: false,
      maxTextureSize: 1024,
    };
  }
  
  const supportsWebGL2 = !!canvas.getContext('webgl2');
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  
  // Try to detect GPU tier based on renderer info
  let tier: 'low' | 'medium' | 'high' = 'medium';
  
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    // Check for high-end GPUs
    if (/RTX|GTX 10[6-8]0|GTX 16|GTX 20|RX 5[6-9]|RX 6[6-9]|M1|M2/i.test(renderer)) {
      tier = 'high';
    }
    // Check for low-end GPUs
    else if (/Intel|Integrated|UHD|HD Graphics|Mali|Adreno [1-5]/i.test(renderer)) {
      tier = 'low';
    }
  }
  
  return {
    tier,
    supportsWebGL2,
    maxTextureSize,
  };
};

/**
 * Dynamic LOD (Level of Detail) calculator
 */
export const calculateLOD = (distance: number, baseQuality: number = 1): {
  geometryDetail: number;
  textureQuality: number;
  particleDensity: number;
} => {
  const distanceFactors = {
    near: distance < 10 ? 1 : 0,
    medium: distance >= 10 && distance < 50 ? 1 : 0,
    far: distance >= 50 ? 1 : 0,
  };
  
  return {
    geometryDetail: distanceFactors.near ? baseQuality : 
                    distanceFactors.medium ? baseQuality * 0.5 : 
                    baseQuality * 0.25,
    textureQuality: distanceFactors.near ? 512 : 
                    distanceFactors.medium ? 256 : 
                    128,
    particleDensity: distanceFactors.near ? 1 : 
                     distanceFactors.medium ? 0.5 : 
                     0.1,
  };
};

/**
 * Frame rate monitor with automatic quality adjustment suggestions
 */
export class FrameRateMonitor {
  private samples: number[] = [];
  private maxSamples = 60;
  private lastTime = performance.now();
  
  update(): number {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    
    const fps = 1000 / delta;
    this.samples.push(fps);
    
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    
    return fps;
  }
  
  getAverageFPS(): number {
    if (this.samples.length === 0) return 60;
    const sum = this.samples.reduce((a, b) => a + b, 0);
    return sum / this.samples.length;
  }
  
  suggestQualityAdjustment(): 'increase' | 'maintain' | 'decrease' {
    const avgFPS = this.getAverageFPS();
    
    if (avgFPS < 30) return 'decrease';
    if (avgFPS > 55) return 'increase';
    return 'maintain';
  }
  
  reset(): void {
    this.samples = [];
    this.lastTime = performance.now();
  }
}

/**
 * Solar System Real-Time Data Service
 * Implements the 3-Stream Architecture for optimal performance
 */

import * as THREE from 'three';

// ============================================
// DATA TYPES
// ============================================

export interface SpaceUpdate {
  type: 'space_update';
  spaceId: string;
  title: string;
  hostId: string;
  speakerCount: number;
  listenerCount: number;
  state: 'scheduled' | 'live' | 'ended';
  chatActivity: number; // 0-1 normalized
  timestamp: number;
}

export interface UserMovement {
  type: 'user_movement';
  userId: string;
  username: string;
  fromSpace?: string;
  toSpace: string;
  level: number;
  role: 'viewer' | 'speaker' | 'host';
  position?: { x: number; y: number; z: number };
}

export interface DonationEvent {
  type: 'donation';
  fromUserId: string;
  fromUsername: string;
  toSpaceId: string;
  amount: number;
  message?: string;
  tokenType: 'SOL' | 'USDC';
}

export interface OnChainEvent {
  type: 'onchain';
  wallet: string;
  action: 'buy' | 'sell' | 'transfer' | 'mint' | 'burn';
  token: string;
  amount: number;
  txHash: string;
  programId?: string;
}

export type DataPacket = SpaceUpdate | UserMovement | DonationEvent | OnChainEvent;

// ============================================
// PERFORMANCE CONFIGURATIONS
// ============================================

export interface PerformanceConfig {
  maxAsteroids: number;
  maxComets: number;
  planetDetail: number;
  bloomStrength: number;
  shadowsEnabled: boolean;
  reflectionsEnabled: boolean;
  wsUpdateRate: number; // Hz
  interpolationSpeed: number;
  enableRealtime: boolean;
  enableVR: boolean;
  enableVoice: boolean;
}

export const PERFORMANCE_CONFIGS = {
  HIGH: {
    maxAsteroids: 10000,
    maxComets: 100,
    planetDetail: 64,
    bloomStrength: 1.5,
    shadowsEnabled: true,
    reflectionsEnabled: true,
    wsUpdateRate: 20,
    interpolationSpeed: 0.15,
    enableRealtime: true,
    enableVR: true,
    enableVoice: true
  },
  MID: {
    maxAsteroids: 3000,
    maxComets: 30,
    planetDetail: 32,
    bloomStrength: 0.8,
    shadowsEnabled: false,
    reflectionsEnabled: false,
    wsUpdateRate: 10,
    interpolationSpeed: 0.1,
    enableRealtime: true,
    enableVR: true,
    enableVoice: true
  },
  LOW: {
    maxAsteroids: 500,
    maxComets: 10,
    planetDetail: 16,
    bloomStrength: 0.3,
    shadowsEnabled: false,
    reflectionsEnabled: false,
    wsUpdateRate: 5,
    interpolationSpeed: 0.08,
    enableRealtime: true,
    enableVR: false,
    enableVoice: false
  },
  QUEST: {
    maxAsteroids: 800,
    maxComets: 15,
    planetDetail: 16,
    bloomStrength: 0.4,
    shadowsEnabled: false,
    reflectionsEnabled: false,
    wsUpdateRate: 5,
    interpolationSpeed: 0.08,
    enableRealtime: true,
    enableVR: true,
    enableVoice: true
  }
} as const;

// ============================================
// STREAM 1: DATA STREAM
// ============================================

export class DataStream {
  private socket: WebSocket | null = null;
  private buffer: DataPacket[] = [];
  private worker: Worker | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  
  constructor(private wsUrl: string, private config: PerformanceConfig) {
    if (config.enableRealtime) {
      this.initializeWorker();
      this.connect();
    }
  }
  
  private initializeWorker() {
    // Create inline worker for data parsing
    const workerCode = `
      self.onmessage = function(e) {
        try {
          const data = JSON.parse(e.data);
          // Add timestamp if missing
          if (!data.timestamp) {
            data.timestamp = Date.now();
          }
          self.postMessage(data);
        } catch (error) {
          console.error('Worker parse error:', error);
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));
    
    this.worker.onmessage = (e) => {
      this.buffer.push(e.data);
      
      // Limit buffer size to prevent memory issues
      if (this.buffer.length > 1000) {
        this.buffer = this.buffer.slice(-500); // Keep last 500
      }
    };
  }
  
  private connect() {
    if (this.isConnecting || !this.config.enableRealtime) return;
    
    this.isConnecting = true;
    console.log('🔌 Connecting to WebSocket:', this.wsUrl);
    
    try {
      this.socket = new WebSocket(this.wsUrl);
      
      this.socket.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };
      
      this.socket.onmessage = (event) => {
        if (this.worker) {
          this.worker.postMessage(event.data);
        }
      };
      
      this.socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
      };
      
      this.socket.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.isConnecting = false;
        this.scheduleReconnect();
      };
      
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }
  
  private scheduleReconnect() {
    if (this.reconnectTimer || !this.config.enableRealtime) return;
    
    console.log('⏰ Scheduling reconnect in 5 seconds...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
  
  consume(maxItems: number = 1): DataPacket[] {
    return this.buffer.splice(0, maxItems);
  }
  
  getBufferSize(): number {
    return this.buffer.length;
  }
  
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.buffer = [];
  }
  
  // Send data back to server
  send(data: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }
}

// ============================================
// STREAM 2: LOGIC STREAM
// ============================================

export interface SolarSystemState {
  planets: Map<string, PlanetState>;
  users: Map<string, UserState>;
  comets: CometState[];
  lastUpdate: number;
}

export interface PlanetState {
  id: string;
  name: string;
  viewerCount: number;
  chatActivity: number;
  isFeatured: boolean;
  isLive: boolean;
  targetScale: number;
  currentScale: number;
}

export interface UserState {
  id: string;
  username: string;
  planetId: string | null;
  level: number;
  role: string;
  targetPosition: THREE.Vector3;
  currentPosition: THREE.Vector3;
  velocity: THREE.Vector3;
}

export interface CometState {
  id: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
  amount: number;
  color: number;
}

export class LogicStream {
  private state: SolarSystemState = {
    planets: new Map(),
    users: new Map(),
    comets: [],
    lastUpdate: Date.now()
  };
  
  private updateQueue: (() => void)[] = [];
  
  processData(packets: DataPacket[]) {
    packets.forEach(packet => {
      switch (packet.type) {
        case 'space_update':
          this.handleSpaceUpdate(packet);
          break;
        case 'user_movement':
          this.handleUserMovement(packet);
          break;
        case 'donation':
          this.handleDonation(packet);
          break;
        case 'onchain':
          this.handleOnChainEvent(packet);
          break;
      }
    });
  }
  
  private handleSpaceUpdate(data: SpaceUpdate) {
    this.updateQueue.push(() => {
      let planet = this.state.planets.get(data.spaceId);
      
      if (!planet) {
        planet = {
          id: data.spaceId,
          name: data.title,
          viewerCount: 0,
          chatActivity: 0,
          isFeatured: false,
          isLive: data.state === 'live',
          targetScale: 1,
          currentScale: 1
        };
        this.state.planets.set(data.spaceId, planet);
      }
      
      planet.viewerCount = data.listenerCount;
      planet.chatActivity = data.chatActivity;
      planet.isLive = data.state === 'live';
      
      // Calculate target scale based on viewers
      planet.targetScale = Math.log10(Math.max(10, data.listenerCount)) * 0.5;
    });
  }
  
  private handleUserMovement(data: UserMovement) {
    this.updateQueue.push(() => {
      let user = this.state.users.get(data.userId);
      
      if (!user) {
        const randomPos = new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 40
        );
        
        user = {
          id: data.userId,
          username: data.username,
          planetId: null,
          level: data.level,
          role: data.role,
          targetPosition: randomPos.clone(),
          currentPosition: randomPos.clone(),
          velocity: new THREE.Vector3()
        };
        this.state.users.set(data.userId, user);
      }
      
      user.level = data.level;
      user.role = data.role;
      
      // Update target position if moving to a planet
      if (data.toSpace) {
        const planet = this.state.planets.get(data.toSpace);
        if (planet) {
          // Calculate orbit position
          const angle = Math.random() * Math.PI * 2;
          const orbitRadius = 3 + Math.random() * 2;
          user.targetPosition.set(
            Math.cos(angle) * orbitRadius,
            (Math.random() - 0.5) * 2,
            Math.sin(angle) * orbitRadius
          );
          user.planetId = data.toSpace;
        }
      }
    });
  }
  
  private handleDonation(data: DonationEvent) {
    this.updateQueue.push(() => {
      const user = this.state.users.get(data.fromUserId);
      const planet = this.state.planets.get(data.toSpaceId);
      
      if (user && planet) {
        const comet: CometState = {
          id: `comet_${Date.now()}_${Math.random()}`,
          from: user.currentPosition.clone(),
          to: new THREE.Vector3(0, 0, 0), // Will be updated with planet position
          progress: 0,
          amount: data.amount,
          color: data.tokenType === 'SOL' ? 0x9945ff : 0x00ff00
        };
        
        this.state.comets.push(comet);
        
        // Remove comet after animation (3 seconds)
        setTimeout(() => {
          const index = this.state.comets.findIndex(c => c.id === comet.id);
          if (index !== -1) {
            this.state.comets.splice(index, 1);
          }
        }, 3000);
      }
    });
  }
  
  private handleOnChainEvent(data: OnChainEvent) {
    // Convert on-chain events to visual effects
    // For now, just log them
    console.log('📊 On-chain event:', data);
  }
  
  tick() {
    // Process one batch of updates per tick
    const batchSize = Math.min(10, this.updateQueue.length);
    const batch = this.updateQueue.splice(0, batchSize);
    
    batch.forEach(update => update());
    
    this.state.lastUpdate = Date.now();
  }
  
  getState(): SolarSystemState {
    return this.state;
  }
}

// ============================================
// STREAM 3: VISUAL STREAM
// ============================================

export class VisualStream {
  private interpolationSpeed: number;
  
  constructor(config: PerformanceConfig) {
    this.interpolationSpeed = config.interpolationSpeed;
  }
  
  interpolatePlanetScales(planets: Map<string, any>, state: SolarSystemState) {
    state.planets.forEach((planetState, id) => {
      const planet = planets.get(id);
      if (planet?.mesh) {
        // Smooth scale interpolation
        planetState.currentScale = THREE.MathUtils.lerp(
          planetState.currentScale,
          planetState.targetScale,
          this.interpolationSpeed * 0.5
        );
        
        planet.mesh.scale.setScalar(planetState.currentScale);
        
        // Update glow based on chat activity
        if (planet.mesh.material) {
          planet.mesh.material.emissiveIntensity = THREE.MathUtils.lerp(
            planet.mesh.material.emissiveIntensity,
            planetState.chatActivity * 0.5,
            this.interpolationSpeed
          );
        }
      }
    });
  }
  
  interpolateUserPositions(users: Map<string, any>, state: SolarSystemState) {
    state.users.forEach((userState, id) => {
      const user = users.get(id);
      if (user?.mesh) {
        // Smooth position interpolation
        userState.currentPosition.lerp(
          userState.targetPosition,
          this.interpolationSpeed
        );
        
        user.mesh.position.copy(userState.currentPosition);
        
        // Scale based on level
        const targetScale = 0.1 + (userState.level / 100) * 0.6;
        user.mesh.scale.lerp(
          new THREE.Vector3(targetScale, targetScale, targetScale),
          this.interpolationSpeed
        );
      }
    });
  }
  
  updateComets(comets: CometState[], _scene: THREE.Scene) {
    comets.forEach(comet => {
      comet.progress = Math.min(1, comet.progress + 0.01);
      
      // Update comet position along path
      // This would integrate with existing comet animation system
    });
  }
}

// ============================================
// PERFORMANCE DETECTOR
// ============================================

export function detectOptimalConfig(): PerformanceConfig {
  // Check if VR capable
  const hasVR = 'xr' in navigator;
  
  // Check GPU
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo ? 
    gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 
    'unknown';
  
  // Check if Quest browser
  const isQuest = /OculusBrowser/.test(navigator.userAgent);
  
  // Check performance
  const memory = (performance as any).memory?.jsHeapSizeLimit;
  const cores = navigator.hardwareConcurrency || 4;
  
  console.log('🔍 System Detection:', {
    renderer,
    isQuest,
    hasVR,
    memory,
    cores
  });
  
  // Determine config
  if (isQuest) {
    return PERFORMANCE_CONFIGS.QUEST;
  } else if (renderer?.includes('NVIDIA RTX')) {
    return PERFORMANCE_CONFIGS.HIGH;
  } else if (cores >= 8 && memory > 4000000000) {
    return PERFORMANCE_CONFIGS.MID;
  } else {
    return PERFORMANCE_CONFIGS.LOW;
  }
}

// ============================================
// MAIN PIPELINE
// ============================================

export class SolarSystemDataPipeline {
  private dataStream: DataStream;
  private logicStream: LogicStream;
  private visualStream: VisualStream;
  private updateTimer: NodeJS.Timeout | null = null;
  private stats = {
    fps: 60,
    packetsPerSecond: 0,
    bufferSize: 0,
    connected: false
  };
  
  constructor(wsUrl: string, private config: PerformanceConfig) {
    this.dataStream = new DataStream(wsUrl, config);
    this.logicStream = new LogicStream();
    this.visualStream = new VisualStream(config);
    
    if (config.enableRealtime) {
      this.startPipeline();
    }
  }
  
  private startPipeline() {
    const updateInterval = 1000 / this.config.wsUpdateRate;
    
    this.updateTimer = setInterval(() => {
      // Consume data packets
      const packets = this.dataStream.consume(5);
      
      if (packets.length > 0) {
        this.logicStream.processData(packets);
        this.stats.packetsPerSecond = packets.length * this.config.wsUpdateRate;
      }
      
      // Update logic state
      this.logicStream.tick();
      
      // Update stats
      this.stats.bufferSize = this.dataStream.getBufferSize();
      this.stats.connected = this.dataStream.isConnected();
      
    }, updateInterval);
  }
  
  // Call this every animation frame
  onAnimationFrame(
    planets: Map<string, any>,
    users: Map<string, any>,
    scene: THREE.Scene
  ) {
    const state = this.logicStream.getState();
    
    // Smooth visual interpolation
    this.visualStream.interpolatePlanetScales(planets, state);
    this.visualStream.interpolateUserPositions(users, state);
    this.visualStream.updateComets(state.comets, scene);
  }
  
  getStats() {
    return this.stats;
  }
  
  getState() {
    return this.logicStream.getState();
  }
  
  // Send user action to server
  sendUserAction(action: any) {
    this.dataStream.send(action);
  }
  
  disconnect() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    this.dataStream.disconnect();
  }
}

// ============================================
// EXPORTS
// ============================================

export default SolarSystemDataPipeline;

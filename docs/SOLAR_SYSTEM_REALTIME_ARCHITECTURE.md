# 🌌 Solar System Real-Time Architecture Plan

## 📊 Current Architecture Analysis & Enhancement Strategy

### Current State
- **Static Demo Data**: Hardcoded 4 planets with fixed viewer counts
- **Simple Animation Loop**: Basic orbital mechanics, random comet launches
- **No Data Streaming**: No WebSocket connections
- **No VR Support**: Standard 3D view only
- **Limited Optimization**: 50 asteroids, basic bloom effects

### Target State
- **Real-Time Data**: Live X Spaces, on-chain activity, user movements
- **Optimized Streaming**: Buffered WebSocket with interpolation
- **VR-Ready**: WebXR support with gesture/voice controls
- **Scalable Performance**: 5,000-10,000 objects on high-end, 300-800 on Quest 2

---

## 🏗️ Architecture Layers

### Layer 1: Data Pipeline (The Rule of 3 Streams)

```typescript
// 1. DATA STREAM - Raw WebSocket ingestion
class DataStream {
  private socket: WebSocket;
  private buffer: DataPacket[] = [];
  private worker: Worker;
  
  constructor() {
    // Offload heavy parsing to Web Worker
    this.worker = new Worker('/workers/dataParser.js');
    this.socket = new WebSocket('wss://api.sniff.agency/spaces');
    
    this.socket.onmessage = (event) => {
      // Send to worker for parsing
      this.worker.postMessage(event.data);
    };
    
    this.worker.onmessage = (e) => {
      // Processed data comes back
      this.buffer.push(e.data);
    };
  }
  
  consume(): DataPacket | null {
    return this.buffer.shift() || null;
  }
}

// 2. LOGIC STREAM - State management
class LogicStream {
  private state: SolarSystemState;
  private updateQueue: StateUpdate[] = [];
  
  processData(packet: DataPacket) {
    // Transform raw data to state changes
    const updates = this.transformToStateUpdates(packet);
    this.updateQueue.push(...updates);
  }
  
  tick() {
    // Process one batch per frame
    const batch = this.updateQueue.splice(0, 10);
    batch.forEach(update => this.applyUpdate(update));
  }
}

// 3. VISUAL STREAM - Smooth interpolation
class VisualStream {
  interpolatePositions() {
    planets.forEach(planet => {
      planet.mesh.position.lerp(planet.targetPosition, 0.1);
      planet.mesh.scale.lerp(planet.targetScale, 0.05);
    });
  }
  
  updateGlow() {
    // Smooth chat activity glow transitions
    planets.forEach(planet => {
      const material = planet.mesh.material as THREE.MeshPhongMaterial;
      material.emissiveIntensity = THREE.MathUtils.lerp(
        material.emissiveIntensity,
        planet.chatActivity * 0.3,
        0.1
      );
    });
  }
}
```

---

## 🚀 Performance Optimization Strategy

### 1. Instanced Rendering for Asteroids

```typescript
// BEFORE: Individual meshes (50 objects)
userAsteroids.forEach(user => {
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
});

// AFTER: Instanced mesh (10,000+ objects possible)
class AsteroidField {
  private instancedMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  
  constructor(count: number = 5000) {
    const geometry = new THREE.DodecahedronGeometry(0.1);
    const material = new THREE.MeshPhongMaterial({ color: 0x8888ff });
    
    this.instancedMesh = new THREE.InstancedMesh(
      geometry, 
      material, 
      count
    );
    
    // Initialize positions
    for (let i = 0; i < count; i++) {
      this.setInstancePosition(i, randomPosition());
    }
  }
  
  updateInstance(index: number, position: THREE.Vector3, scale: number) {
    this.dummy.position.copy(position);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    this.instancedMesh.setMatrixAt(index, this.dummy.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
```

### 2. Level of Detail (LOD) System

```typescript
class PlanetLOD {
  private lodGroup: THREE.LOD;
  
  constructor(planet: Planet) {
    this.lodGroup = new THREE.LOD();
    
    // High detail (close)
    const highDetail = new THREE.SphereGeometry(planet.size, 32, 32);
    const highMesh = new THREE.Mesh(highDetail, planet.material);
    this.lodGroup.addLevel(highMesh, 0);
    
    // Medium detail 
    const medDetail = new THREE.SphereGeometry(planet.size, 16, 16);
    const medMesh = new THREE.Mesh(medDetail, planet.material);
    this.lodGroup.addLevel(medMesh, 50);
    
    // Low detail (far)
    const lowDetail = new THREE.SphereGeometry(planet.size, 8, 8);
    const lowMesh = new THREE.Mesh(lowDetail, planet.material);
    this.lodGroup.addLevel(lowMesh, 100);
    
    // Billboard sprite (very far)
    const sprite = new THREE.Sprite(spriteMaterial);
    this.lodGroup.addLevel(sprite, 200);
  }
}
```

### 3. Culling & Spatial Partitioning

```typescript
class VisibilityManager {
  private octree: THREE.Octree;
  private frustum = new THREE.Frustum();
  private matrix = new THREE.Matrix4();
  
  updateVisibility(camera: THREE.Camera) {
    // Update frustum from camera
    this.matrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.matrix);
    
    // Query octree for visible objects
    const visibleObjects = this.octree.query(this.frustum);
    
    // Update only visible
    visibleObjects.forEach(obj => obj.update());
  }
}
```

---

## 🥽 VR Integration (WebXR)

### 1. Enable VR Mode

```typescript
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

class VRSolarSystem {
  private renderer: THREE.WebGLRenderer;
  private xrControllers: THREE.Group[] = [];
  
  enableVR() {
    // Enable WebXR
    this.renderer.xr.enabled = true;
    
    // Add VR button to DOM
    document.body.appendChild(VRButton.createButton(this.renderer));
    
    // Setup controllers
    this.setupControllers();
    
    // Adjust render loop for VR
    this.renderer.setAnimationLoop(() => this.render());
  }
  
  setupControllers() {
    const controllerModelFactory = new XRControllerModelFactory();
    
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('selectstart', this.onSelectStart);
      controller.addEventListener('selectend', this.onSelectEnd);
      
      // Add laser pointer
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const line = new THREE.Line(geometry);
      line.scale.z = 5;
      controller.add(line);
      
      this.scene.add(controller);
    }
  }
  
  onSelectStart = (event: any) => {
    const controller = event.target;
    const intersections = this.getIntersections(controller);
    
    if (intersections.length > 0) {
      const planet = intersections[0].object;
      this.selectPlanet(planet);
    }
  };
}
```

### 2. 3D UI Panels in VR

```typescript
import { Text } from 'troika-three-text';

class VRUIPanel {
  private panel: THREE.Mesh;
  private text: Text;
  
  constructor(position: THREE.Vector3) {
    // Glass panel background
    const geometry = new THREE.PlaneGeometry(2, 1);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1
    });
    
    this.panel = new THREE.Mesh(geometry, material);
    this.panel.position.copy(position);
    
    // 3D Text
    this.text = new Text();
    this.text.text = 'Solar System Control';
    this.text.fontSize = 0.1;
    this.text.color = 0x00ffff;
    this.text.position.z = 0.01;
    this.panel.add(this.text);
  }
  
  update(data: PlanetData) {
    this.text.text = `
      Channel: ${data.name}
      Viewers: ${data.viewerCount}
      Activity: ${(data.chatActivity * 100).toFixed(0)}%
    `;
    this.text.sync();
  }
}
```

### 3. Voice Commands Integration

```typescript
class VoiceCommander {
  private recognition: SpeechRecognition;
  private commands: Map<string, () => void>;
  
  constructor(scene: SolarSystemScene) {
    this.recognition = new (window.SpeechRecognition || 
                            window.webkitSpeechRecognition)();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    
    this.commands = new Map([
      ['show dashboard', () => scene.showDashboard()],
      ['hide dashboard', () => scene.hideDashboard()],
      ['focus earth', () => scene.focusPlanet('earth')],
      ['focus mars', () => scene.focusPlanet('mars')],
      ['launch comet', () => scene.launchDemoComet()],
      ['toggle music', () => scene.toggleMusic()],
      ['show stats', () => scene.showStats()],
      ['enter planet', () => scene.enterSelectedPlanet()],
      ['exit planet', () => scene.exitPlanet()],
      ['show wallets', () => scene.showWalletTracker()]
    ]);
    
    this.recognition.onresult = (event) => {
      const command = event.results[event.results.length - 1][0]
        .transcript.toLowerCase().trim();
      
      this.executeCommand(command);
    };
  }
  
  executeCommand(command: string) {
    // Find closest matching command
    for (const [key, action] of this.commands) {
      if (command.includes(key)) {
        console.log(`🎙️ Voice Command: ${key}`);
        action();
        this.showFeedback(`Command: ${key}`);
        break;
      }
    }
  }
  
  start() {
    this.recognition.start();
    console.log('🎤 Voice commands activated');
  }
}
```

---

## 📡 WebSocket Data Schema

### Incoming Data Types

```typescript
// X Spaces Update
interface SpaceUpdate {
  type: 'space_update';
  spaceId: string;
  title: string;
  hostId: string;
  speakerCount: number;
  listenerCount: number;
  state: 'scheduled' | 'live' | 'ended';
  chatActivity: number; // 0-1 normalized
}

// User Movement
interface UserMovement {
  type: 'user_movement';
  userId: string;
  fromSpace?: string;
  toSpace: string;
  level: number;
  role: 'viewer' | 'speaker' | 'host';
}

// Super Chat/Donation
interface DonationEvent {
  type: 'donation';
  fromUserId: string;
  toSpaceId: string;
  amount: number;
  message?: string;
  tokenType: 'SOL' | 'USDC';
}

// On-Chain Activity
interface OnChainEvent {
  type: 'onchain';
  wallet: string;
  action: 'buy' | 'sell' | 'transfer' | 'mint';
  token: string;
  amount: number;
  txHash: string;
}
```

### Data Flow Pipeline

```typescript
class SolarSystemDataPipeline {
  private dataStream: DataStream;
  private logicStream: LogicStream;
  private visualStream: VisualStream;
  private updateFrequency = 1000 / 30; // 30Hz logic updates
  private lastUpdate = 0;
  
  constructor(wsUrl: string) {
    this.dataStream = new DataStream(wsUrl);
    this.logicStream = new LogicStream();
    this.visualStream = new VisualStream();
    
    this.startPipeline();
  }
  
  private startPipeline() {
    // Logic update loop (30Hz)
    setInterval(() => {
      const packet = this.dataStream.consume();
      if (packet) {
        this.logicStream.processData(packet);
      }
      this.logicStream.tick();
    }, this.updateFrequency);
  }
  
  // Called every frame (60Hz)
  onAnimationFrame() {
    // Smooth visual interpolation
    this.visualStream.interpolatePositions();
    this.visualStream.updateGlow();
    this.visualStream.updateComets();
  }
}
```

---

## 🎮 Performance Targets by Device

### High-End PC (RTX 3080+, Quest Link)
```typescript
const CONFIG_HIGH = {
  maxAsteroids: 10000,
  maxComets: 100,
  planetDetail: 64,
  bloomStrength: 1.5,
  shadowsEnabled: true,
  reflectionsEnabled: true,
  wsUpdateRate: 20, // Hz
  interpolationSpeed: 0.15
};
```

### Mid-Range Laptop
```typescript
const CONFIG_MID = {
  maxAsteroids: 3000,
  maxComets: 30,
  planetDetail: 32,
  bloomStrength: 0.8,
  shadowsEnabled: false,
  reflectionsEnabled: false,
  wsUpdateRate: 10, // Hz
  interpolationSpeed: 0.1
};
```

### Quest 2 Standalone
```typescript
const CONFIG_QUEST = {
  maxAsteroids: 500,
  maxComets: 10,
  planetDetail: 16,
  bloomStrength: 0.3,
  shadowsEnabled: false,
  reflectionsEnabled: false,
  wsUpdateRate: 5, // Hz
  interpolationSpeed: 0.08,
  fixedFoveation: 2 // Quest-specific optimization
};
```

---

## 🛠️ Implementation Roadmap

### Phase 1: Data Pipeline (Week 1-2)
- [ ] Create WebSocket service class
- [ ] Implement Web Worker for data parsing
- [ ] Add buffering system
- [ ] Create state management layer
- [ ] Test with mock data stream

### Phase 2: Performance Optimization (Week 2-3)
- [ ] Convert asteroids to InstancedMesh
- [ ] Implement LOD for planets
- [ ] Add frustum culling
- [ ] Optimize shaders
- [ ] Profile and benchmark

### Phase 3: VR Support (Week 3-4)
- [ ] Add WebXR initialization
- [ ] Implement controller support
- [ ] Create VR UI panels
- [ ] Add teleportation movement
- [ ] Test on Quest 2

### Phase 4: Voice & Gesture (Week 4-5)
- [ ] Integrate Web Speech API
- [ ] Map voice commands
- [ ] Add hand tracking (Quest)
- [ ] Create gesture recognizer
- [ ] Polish interactions

### Phase 5: Production Integration (Week 5-6)
- [ ] Connect to production WebSocket
- [ ] Add error handling
- [ ] Implement reconnection logic
- [ ] Add analytics
- [ ] Performance monitoring

---

## 🔧 Code Integration Points

### 1. Update SolarSystemScene Constructor

```typescript
export function SolarSystemScene() {
  // Add new systems
  const [dataConfig, setDataConfig] = useState<PerformanceConfig>();
  const dataPipelineRef = useRef<SolarSystemDataPipeline>();
  const voiceCommanderRef = useRef<VoiceCommander>();
  const vrManagerRef = useRef<VRSolarSystem>();
  
  useEffect(() => {
    // Detect device capabilities
    const config = detectOptimalConfig();
    setDataConfig(config);
    
    // Initialize data pipeline
    if (config.enableRealtime) {
      dataPipelineRef.current = new SolarSystemDataPipeline(
        'wss://api.sniff.agency/spaces'
      );
    }
    
    // Initialize VR if available
    if ('xr' in navigator) {
      vrManagerRef.current = new VRSolarSystem(renderer, scene);
      vrManagerRef.current.enableVR();
    }
    
    // Initialize voice commands
    if ('SpeechRecognition' in window) {
      voiceCommanderRef.current = new VoiceCommander(sceneControls);
      voiceCommanderRef.current.start();
    }
  }, []);
}
```

### 2. Update Animation Loop

```typescript
const animate = () => {
  animationId = requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  
  // Process data updates
  if (dataPipelineRef.current) {
    dataPipelineRef.current.onAnimationFrame();
  }
  
  // Update instanced asteroids
  if (asteroidField) {
    asteroidField.updateFromState(currentState);
  }
  
  // Update LODs
  if (vrManagerRef.current?.isPresenting) {
    // VR render path
    // Already handled by XR animation loop
  } else {
    // Normal render
    controls.update();
    composer.render();
  }
};
```

---

## 📊 Monitoring & Metrics

```typescript
class PerformanceMonitor {
  private stats = {
    fps: 60,
    drawCalls: 0,
    triangles: 0,
    wsMessagesPerSec: 0,
    interpolationLag: 0,
    memoryUsage: 0
  };
  
  update() {
    this.stats.fps = 1000 / clock.getDelta();
    this.stats.drawCalls = renderer.info.render.calls;
    this.stats.triangles = renderer.info.render.triangles;
    
    // Send to analytics
    if (this.stats.fps < 30) {
      console.warn('Performance degradation detected');
      this.adjustQuality();
    }
  }
  
  adjustQuality() {
    // Dynamic quality adjustment
    if (this.stats.fps < 30) {
      bloomPass.strength *= 0.8;
      maxAsteroids = Math.floor(maxAsteroids * 0.7);
    }
  }
}
```

---

## 🎯 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Frame Rate | 60 FPS (2D), 72 FPS (VR) | Performance monitor |
| Data Latency | < 100ms | WebSocket timestamp |
| Visual Smoothness | No stuttering | Interpolation quality |
| Memory Usage | < 2GB | Chrome DevTools |
| Load Time | < 3 seconds | Performance API |
| User Engagement | 10min+ sessions | Analytics |

---

## 🚀 Conclusion

By implementing this architecture, we can:
1. **Handle 5,000-10,000 dynamic objects** with instancing
2. **Stream real-time data** without blocking the render loop
3. **Support VR headsets** with optimized rendering
4. **Enable voice/gesture control** for minimal typing
5. **Scale performance** based on device capabilities

The key is the **three-stream architecture**: keeping data, logic, and visuals separate but synchronized. This prevents the common pitfall of WebSocket data flooding the GPU.

Next step: Start with Phase 1 (Data Pipeline) and progressively enhance.

---

*"Real-time doesn't mean every tick - it means the right data at the right time."* 🌊

/**
 * MULTILAYER SPACETIME SIMULATION
 * 
 * Concept: Spacetime consists of multiple 2D membrane layers stacked in a higher dimension
 * - Black holes: Punctures in the fabric, one-way doors DOWN between layers
 * - White holes: Create new universe bubbles UP into the next layer
 * - Matter falls through black holes to lower layers
 * - Information emerges as new universes in higher layers
 * 
 * Modified Metric:
 * f(r, z) = (1 + 2GM/(c²r²)) * exp(-|z - z_layer|/λ)
 * Where:
 * - z is the layer coordinate (0, 1, 2, 3 for 4 layers)
 * - λ is the layer coupling strength
 * - Black holes create discontinuities at r_min
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'dat.gui';

// Layer of spacetime
interface SpacetimeLayer {
  id: number;
  z: number; // Height in stack
  mesh: THREE.Mesh; // The membrane itself
  holes: Hole[]; // Black/white holes in this layer
  particles: Particle[];
  universes: Universe[]; // Bubble universes (from white holes)
  color: THREE.Color;
  distortion: number; // Curvature at this layer
}

// Hole in spacetime fabric
interface Hole {
  id: string;
  type: 'black' | 'white';
  position: THREE.Vector3;
  radius: number;
  layer: number;
  targetLayer: number; // Where it leads
  strength: number;
  mesh?: THREE.Mesh;
  ringMesh?: THREE.Mesh; // Event horizon ring
  tunnelMesh?: THREE.Mesh; // Tunnel to next layer
}

// Particle traveling through layers
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  layer: number;
  mesh?: THREE.Mesh;
  trail: THREE.Vector3[];
  transitioning: boolean;
  targetLayer?: number;
}

// Bubble universe created by white hole
interface Universe {
  id: string;
  position: THREE.Vector3;
  radius: number;
  layer: number;
  age: number;
  mesh?: THREE.Mesh;
  expandRate: number;
}

// Simulation parameters
interface SimParams {
  G: number;
  M: number;
  c: number;
  layerSeparation: number;
  layerCoupling: number;
  holeFormationRate: number;
  particleCount: number;
  showTunnels: boolean;
  showGrid: boolean;
  timeStep: number;
}

export const MultilayerSpacetimeSimulation: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const composerRef = useRef<EffectComposer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<OrbitControls>();
  const layersRef = useRef<SpacetimeLayer[]>([]);
  const animationIdRef = useRef<number>();
  const guiRef = useRef<GUI>();
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());

  const [params] = useState<SimParams>({
    G: 1,
    M: 1,
    c: 1,
    layerSeparation: 10,
    layerCoupling: 0.5,
    holeFormationRate: 0.01,
    particleCount: 50,
    showTunnels: true,
    showGrid: true,
    timeStep: 0.01
  });

  // Modified metric for multilayer spacetime - currently unused but available for physics calculations
  // const f = (r: number, z: number, layer: number): number => {
  //   const { G, M, c, layerCoupling } = params;
  //   const layerZ = layer * params.layerSeparation;
  //   
  //   // Base metric (in-layer)
  //   const base = 1 + (2 * G * M) / (c * c * r * r);
  //   
  //   // Layer coupling (exponential decay between layers)
  //   const coupling = Math.exp(-Math.abs(z - layerZ) / layerCoupling);
  //   
  //   return base * coupling;
  // };

  // Create spacetime layer mesh (2D membrane)
  const createLayerMesh = (layer: number, scene: THREE.Scene): THREE.Mesh => {
    const size = 100;
    const segments = 100;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    
    // Create rippled surface to show curvature
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const r = Math.sqrt(x * x + y * y);
      
      // Gravitational well shape
      const depth = -2 * Math.exp(-r / 10);
      positions[i + 2] = depth;
    }
    geometry.computeVertexNormals();
    
    // Shader material for spacetime fabric
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        layer: { value: layer },
        color: { value: new THREE.Color().setHSL(layer * 0.2, 0.7, 0.5) }
      },
      vertexShader: `
        uniform float time;
        uniform float layer;
        varying vec2 vUv;
        varying float vDistortion;
        
        void main() {
          vUv = uv;
          vec3 pos = position;
          
          // Wave distortion
          float dist = length(pos.xy);
          pos.z += sin(dist * 0.1 + time) * 0.5;
          vDistortion = pos.z;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float layer;
        varying vec2 vUv;
        varying float vDistortion;
        
        void main() {
          // Grid pattern
          float grid = step(0.98, max(
            abs(sin(vUv.x * 50.0)),
            abs(sin(vUv.y * 50.0))
          ));
          
          // Color based on distortion
          vec3 finalColor = mix(color, vec3(0.0, 0.0, 0.0), vDistortion * 0.1);
          finalColor = mix(finalColor, vec3(1.0), grid * 0.3);
          
          gl_FragColor = vec4(finalColor, 0.7);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = layer * params.layerSeparation;
    scene.add(mesh);
    
    return mesh;
  };

  // Create a hole in spacetime
  const createHole = (type: 'black' | 'white', layer: number, position: THREE.Vector2, scene: THREE.Scene): Hole => {
    const hole: Hole = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      position: new THREE.Vector3(position.x, layer * params.layerSeparation, position.y),
      radius: 2 + Math.random() * 2,
      layer,
      targetLayer: type === 'black' ? Math.max(0, layer - 1) : Math.min(3, layer + 1),
      strength: 1 + Math.random() * 0.5
    };
    
    if (type === 'black') {
      // Black hole: A literal hole (torus to show event horizon)
      const ringGeometry = new THREE.TorusGeometry(hole.radius, 0.2, 16, 32);
      const ringMaterial = new THREE.MeshPhongMaterial({
        color: 0x000000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5
      });
      hole.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      hole.ringMesh.position.copy(hole.position);
      hole.ringMesh.rotation.x = Math.PI / 2;
      scene.add(hole.ringMesh);
      
      // Create funnel/tunnel to lower layer
      if (params.showTunnels && hole.targetLayer !== hole.layer) {
        const tunnelCurve = new THREE.CatmullRomCurve3([
          hole.position,
          new THREE.Vector3(
            hole.position.x,
            hole.position.y - params.layerSeparation / 2,
            hole.position.z
          ),
          new THREE.Vector3(
            hole.position.x + (Math.random() - 0.5) * 5,
            hole.targetLayer * params.layerSeparation,
            hole.position.z + (Math.random() - 0.5) * 5
          )
        ]);
        
        const tunnelGeometry = new THREE.TubeGeometry(tunnelCurve, 20, hole.radius * 0.8, 8, false);
        const tunnelMaterial = new THREE.MeshPhongMaterial({
          color: 0x660066,
          emissive: 0xff00ff,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        });
        hole.tunnelMesh = new THREE.Mesh(tunnelGeometry, tunnelMaterial);
        scene.add(hole.tunnelMesh);
      }
    } else {
      // White hole: Glowing emitter
      const sphereGeometry = new THREE.SphereGeometry(hole.radius, 32, 32);
      const sphereMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.8
      });
      hole.mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
      hole.mesh.position.copy(hole.position);
      scene.add(hole.mesh);
    }
    
    return hole;
  };

  // Create a bubble universe
  const createUniverse = (whiteHole: Hole, scene: THREE.Scene): Universe => {
    const universe: Universe = {
      id: Math.random().toString(36).substr(2, 9),
      position: new THREE.Vector3(
        whiteHole.position.x,
        (whiteHole.targetLayer + 0.5) * params.layerSeparation,
        whiteHole.position.z
      ),
      radius: 0.1,
      layer: whiteHole.targetLayer,
      age: 0,
      expandRate: 0.5 + Math.random() * 0.5
    };
    
    // Create bubble mesh
    const geometry = new THREE.SphereGeometry(universe.radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color().setHSL(Math.random(), 1, 0.5),
      emissive: new THREE.Color().setHSL(Math.random(), 1, 0.5),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    
    universe.mesh = new THREE.Mesh(geometry, material);
    universe.mesh.position.copy(universe.position);
    scene.add(universe.mesh);
    
    return universe;
  };

  // Initialize particle
  const createParticle = (layer: number): Particle => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 20;
    
    return {
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        layer * params.layerSeparation,
        Math.sin(angle) * radius
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0,
        (Math.random() - 0.5) * 0.5
      ),
      layer,
      trail: [],
      transitioning: false
    };
  };

  // Update particle physics
  const updateParticle = (particle: Particle, holes: Hole[], dt: number): void => {
    // Check for nearby black holes
    holes.forEach(hole => {
      if (hole.type === 'black' && hole.layer === particle.layer) {
        const toHole = hole.position.clone().sub(particle.position);
        const distance = toHole.length();
        
        if (distance < hole.radius * 3) {
          // Gravitational attraction
          const force = hole.strength * params.G * params.M / (distance * distance);
          toHole.normalize().multiplyScalar(force * dt);
          particle.velocity.add(toHole);
          
          // Fall through hole
          if (distance < hole.radius && !particle.transitioning) {
            particle.transitioning = true;
            particle.targetLayer = hole.targetLayer;
            particle.velocity.y = -2; // Fall downward
          }
        }
      }
    });
    
    // Update position
    particle.position.add(particle.velocity.clone().multiplyScalar(dt));
    
    // Handle layer transitions
    if (particle.transitioning && particle.targetLayer !== undefined) {
      const targetY = particle.targetLayer * params.layerSeparation;
      if (Math.abs(particle.position.y - targetY) < 0.5) {
        particle.layer = particle.targetLayer;
        particle.transitioning = false;
        particle.velocity.y = 0;
        particle.position.y = targetY;
        
        // Emerge with random velocity
        particle.velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2
        );
      }
    }
    
    // Keep on layer if not transitioning
    if (!particle.transitioning) {
      particle.position.y = particle.layer * params.layerSeparation;
    }
    
    // Trail
    particle.trail.push(particle.position.clone());
    if (particle.trail.length > 50) {
      particle.trail.shift();
    }
  };

  // Update bubble universes
  const updateUniverse = (universe: Universe, dt: number): void => {
    universe.age += dt;
    universe.radius += universe.expandRate * dt;
    
    if (universe.mesh) {
      universe.mesh.scale.setScalar(universe.radius / 0.1);
      
      // Fade as it expands
      const material = universe.mesh.material as THREE.MeshPhongMaterial;
      material.opacity = Math.max(0.1, 0.6 * Math.exp(-universe.age * 0.2));
      
      // Float upward slightly
      universe.mesh.position.y += dt * 0.1;
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000511);
    scene.fog = new THREE.Fog(0x000511, 50, 200);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(50, 30, 50);
    camera.lookAt(0, 15, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.4,
      0.85
    );
    bloomPass.threshold = 0;
    bloomPass.strength = 2;
    bloomPass.radius = 0.5;
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 200;
    controls.minDistance = 10;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 50, 10);
    scene.add(directionalLight);

    // Initialize 4 spacetime layers
    const layers: SpacetimeLayer[] = [];
    for (let i = 0; i < 4; i++) {
      const layer: SpacetimeLayer = {
        id: i,
        z: i * params.layerSeparation,
        mesh: createLayerMesh(i, scene),
        holes: [],
        particles: [],
        universes: [],
        color: new THREE.Color().setHSL(i * 0.25, 0.7, 0.5),
        distortion: 0
      };
      
      // Add some initial black holes
      if (i < 3) { // Not on the top layer
        for (let j = 0; j < 2; j++) {
          const hole = createHole(
            'black',
            i,
            new THREE.Vector2(
              (Math.random() - 0.5) * 30,
              (Math.random() - 0.5) * 30
            ),
            scene
          );
          layer.holes.push(hole);
        }
      }
      
      // Add white holes (except bottom layer)
      if (i > 0) {
        const whiteHole = createHole(
          'white',
          i,
          new THREE.Vector2(
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 30
          ),
          scene
        );
        layer.holes.push(whiteHole);
      }
      
      // Add particles
      for (let j = 0; j < params.particleCount / 4; j++) {
        const particle = createParticle(i);
        
        // Create mesh
        const pGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const pMaterial = new THREE.MeshPhongMaterial({
          color: layer.color,
          emissive: layer.color,
          emissiveIntensity: 0.5
        });
        particle.mesh = new THREE.Mesh(pGeometry, pMaterial);
        particle.mesh.position.copy(particle.position);
        scene.add(particle.mesh);
        
        layer.particles.push(particle);
      }
      
      layers.push(layer);
    }
    layersRef.current = layers;

    // GUI
    const gui = new GUI();
    guiRef.current = gui;
    
    const simFolder = gui.addFolder('Simulation');
    simFolder.add(params, 'layerSeparation', 5, 20).name('Layer Separation');
    simFolder.add(params, 'layerCoupling', 0.1, 2).name('Layer Coupling');
    simFolder.add(params, 'holeFormationRate', 0, 0.1).name('Hole Formation');
    simFolder.add(params, 'timeStep', 0.001, 0.1).name('Time Step');
    simFolder.open();
    
    const visualFolder = gui.addFolder('Visualization');
    visualFolder.add(params, 'showTunnels').name('Show Tunnels');
    visualFolder.add(params, 'showGrid').name('Show Grid');
    visualFolder.open();

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      clockRef.current.getDelta(); // Keep clock timing accurate
      const elapsedTime = clockRef.current.getElapsedTime();
      
      // Update shader uniforms for layer meshes
      layers.forEach(layer => {
        if (layer.mesh.material instanceof THREE.ShaderMaterial) {
          layer.mesh.material.uniforms.time.value = elapsedTime;
        }
        
        // Update particles
        layer.particles.forEach(particle => {
          const allHoles = layers.flatMap(l => l.holes);
          updateParticle(particle, allHoles, params.timeStep);
          
          if (particle.mesh) {
            particle.mesh.position.copy(particle.position);
          }
        });
        
        // Update universes
        layer.universes.forEach(universe => {
          updateUniverse(universe, params.timeStep);
        });
        
        // Occasionally spawn new universes from white holes
        layer.holes.forEach(hole => {
          if (hole.type === 'white' && Math.random() < params.holeFormationRate) {
            const universe = createUniverse(hole, scene);
            layer.universes.push(universe);
          }
        });
        
        // Remove old universes
        layer.universes = layer.universes.filter(u => {
          if (u.age > 10 || u.radius > 20) {
            if (u.mesh) {
              scene.remove(u.mesh);
            }
            return false;
          }
          return true;
        });
      });
      
      controls.update();
      composer.render();
    };
    
    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (guiRef.current) {
        guiRef.current.destroy();
      }
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={mountRef} className="w-full h-screen relative">
      <div className="absolute top-4 left-4 text-white bg-black/50 p-4 rounded-lg backdrop-blur-sm max-w-md">
        <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Multilayer Spacetime
        </h2>
        <div className="text-sm space-y-1">
          <p className="text-cyan-400 font-semibold">4 Layers of 2D spacetime membranes</p>
          <p className="text-red-400">⚫ Black holes = One-way punctures DOWN</p>
          <p className="text-white">⚪ White holes = Universe creators UP</p>
          <p className="text-purple-400">🔮 Tunnels connect layers</p>
          <p className="text-yellow-400">🟡 Particles fall through black holes</p>
          <p className="text-green-400">🌌 New universes bubble up from white holes</p>
          <p className="mt-2 text-gray-300 text-xs">Modified metric: f(r,z) = base × exp(-|z-z_layer|/λ)</p>
        </div>
      </div>
      
      <div className="absolute top-4 right-4 text-white bg-black/50 p-4 rounded-lg backdrop-blur-sm">
        <div className="text-sm space-y-1">
          <p>Layer 0 (Bottom): <span className="text-blue-400">Base reality</span></p>
          <p>Layer 1: <span className="text-green-400">Secondary space</span></p>
          <p>Layer 2: <span className="text-yellow-400">Tertiary space</span></p>
          <p>Layer 3 (Top): <span className="text-red-400">Universe nursery</span></p>
        </div>
      </div>
    </div>
  );
};

export default MultilayerSpacetimeSimulation;

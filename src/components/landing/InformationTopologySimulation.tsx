/**
 * INFORMATION TOPOLOGY SIMULATION
 * 
 * A radical approach where information flow creates spacetime geometry
 * Based on the concept: "Information forms topology, not the other way around"
 * 
 * CORE CONCEPTS:
 * - Nodes = Information packets (qubits, energy states, data)
 * - Edges = Information flow/entanglement/relationships
 * - Black holes = Information compression points
 * - White holes = Information expansion/emission points
 * - Observer = Measurement collapse through camera focus
 * 
 * The geometry emerges from the data, not vice versa
 * Spacetime is an emergent property of information dynamics
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'dat.gui';

// Information Node - fundamental unit of reality
interface InfoNode {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  state: number; // Information content (0-1)
  entropy: number; // Disorder/uncertainty
  connections: number[]; // Connected node IDs
  phase: 'stable' | 'compressing' | 'expanding' | 'tunneling';
  color: THREE.Color;
  mesh?: THREE.Mesh;
  coreMesh?: THREE.Mesh; // Inner glowing core
  haloMesh?: THREE.Mesh; // Outer energy halo
  isBlackHole?: boolean;
  isWhiteHole?: boolean;
  compressionLevel?: number;
  pulsePhase?: number; // For animation
  distortionSphere?: THREE.Mesh; // Gravitational lensing
}

// Edge between nodes - information flow
interface InfoEdge {
  from: number;
  to: number;
  strength: number; // Information transfer rate
  line?: THREE.Line;
  tube?: THREE.Mesh; // 3D tube geometry
  flowParticles?: THREE.Points; // Animated particles
}

// Simulation parameters
interface SimParams {
  nodeCount: number;
  connectionRadius: number;
  informationFlow: number;
  compressionThreshold: number;
  expansionRate: number;
  gravityStrength: number;
  quantumNoise: number;
  observerEffect: boolean;
  showHigherDimensions: boolean;
  timeEvolution: number;
  showTunnels: boolean;
  entanglementStrength: number;
  informationDecay: number;
}

export const InformationTopologySimulation: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const composerRef = useRef<EffectComposer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<OrbitControls>();
  const nodesRef = useRef<InfoNode[]>([]);
  const edgesRef = useRef<InfoEdge[]>([]);
  const blackHolesRef = useRef<Set<number>>(new Set());
  const whiteHolesRef = useRef<Set<number>>(new Set());
  const animationIdRef = useRef<number>();
  const guiRef = useRef<GUI>();
  const timeRef = useRef<number>(0);

  const [params] = useState<SimParams>({
    nodeCount: 200,
    connectionRadius: 3,
    informationFlow: 0.1,
    compressionThreshold: 0.9,
    expansionRate: 0.5,
    gravityStrength: 0.1,
    quantumNoise: 0.01,
    observerEffect: true,
    showHigherDimensions: true,
    timeEvolution: 0.01,
    showTunnels: true,
    entanglementStrength: 0.5,
    informationDecay: 0.02
  });

  // Initialize information nodes with random states
  const initializeNodes = (): InfoNode[] => {
    const nodes: InfoNode[] = [];
    
    for (let i = 0; i < params.nodeCount; i++) {
      // Distribute nodes in a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 10 + Math.random() * 10;
      
      nodes.push({
        id: i,
        position: new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        ),
        state: Math.random(), // Initial information content
        entropy: Math.random() * 0.5,
        connections: [],
        phase: 'stable',
        color: new THREE.Color()
      });
    }
    
    // Establish initial connections based on proximity
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = nodes[i].position.distanceTo(nodes[j].position);
        if (distance < params.connectionRadius) {
          nodes[i].connections.push(j);
          nodes[j].connections.push(i);
        }
      }
    }
    
    return nodes;
  };

  // Update information flow between nodes with entanglement
  const updateInformationFlow = (nodes: InfoNode[]) => {
    // Calculate state updates based on connected neighbors
    const newStates = new Array(nodes.length).fill(0);
    const entanglements = new Map<number, number>(); // Store entangled pairs
    
    nodes.forEach((node, i) => {
      let totalInfluence = 0;
      let influenceCount = 0;
      let maxEntanglement = 0;
      let entangledNode = -1;
      
      node.connections.forEach(connId => {
        const neighbor = nodes[connId];
        if (neighbor) {
          const distance = node.position.distanceTo(neighbor.position);
          
          // Local information transfer
          const influence = neighbor.state / (1 + distance);
          totalInfluence += influence;
          influenceCount++;
          
          // Quantum entanglement - instantaneous correlation
          const similarity = 1 - Math.abs(node.state - neighbor.state);
          const entanglement = similarity * params.entanglementStrength / (1 + distance);
          
          if (entanglement > maxEntanglement && entanglement > 0.3) {
            maxEntanglement = entanglement;
            entangledNode = connId;
          }
        }
      });
      
      // Store strongest entanglement
      if (entangledNode >= 0) {
        entanglements.set(i, entangledNode);
      }
      
      // Update state: local flow + decay + quantum noise
      if (influenceCount > 0) {
        // Information flows from neighbors
        const localFlow = (totalInfluence / influenceCount) * params.informationFlow;
        
        // Information decay (2nd law of thermodynamics)
        const decay = node.state * params.informationDecay;
        
        // Quantum fluctuations
        const noise = (Math.random() - 0.5) * params.quantumNoise;
        
        newStates[i] = node.state * 0.95 + localFlow - decay + noise;
        newStates[i] = Math.max(0, Math.min(1, newStates[i])); // Clamp [0, 1]
      } else {
        // Isolated nodes decay faster
        newStates[i] = node.state * (1 - params.informationDecay * 2);
      }
      
      // Update entropy based on information flow
      node.entropy = Math.abs(newStates[i] - node.state) * 10 + node.entropy * 0.9;
    });
    
    // Apply entanglement correlations (instantaneous)
    entanglements.forEach((targetId, sourceId) => {
      if (targetId < newStates.length && sourceId < newStates.length) {
        // Entangled nodes tend toward similar states
        const correlation = (newStates[sourceId] + newStates[targetId]) / 2;
        const strength = params.entanglementStrength * 0.5;
        newStates[sourceId] = newStates[sourceId] * (1 - strength) + correlation * strength;
        newStates[targetId] = newStates[targetId] * (1 - strength) + correlation * strength;
      }
    });
    
    // Apply new states
    nodes.forEach((node, i) => {
      node.state = newStates[i];
    });
  };

  // Check for black hole formation (information compression)
  const checkBlackHoleFormation = (nodes: InfoNode[], scene: THREE.Scene) => {
    nodes.forEach(node => {
      // High information density creates black holes
      if (node.state > params.compressionThreshold && !node.isBlackHole) {
        node.isBlackHole = true;
        node.phase = 'compressing';
        node.compressionLevel = 0;
        blackHolesRef.current.add(node.id);
      }
      
      // Black holes attract nearby information
      if (node.isBlackHole) {
        nodes.forEach(other => {
          if (other.id !== node.id) {
            const direction = node.position.clone().sub(other.position);
            const distance = direction.length();
            
            if (distance < 10 && distance > 0.1) {
              const force = params.gravityStrength * node.state / (distance * distance);
              direction.normalize().multiplyScalar(force);
              other.velocity.add(direction);
              
              // Information gets absorbed
              if (distance < 1) {
                const transfer = other.state * 0.1;
                node.state += transfer;
                other.state -= transfer;
                node.compressionLevel! += transfer;
              }
            }
          }
        });
        
        // Check for white hole transition
        if (node.compressionLevel! > 1.5) {
          triggerWhiteHoleTransition(node, nodes, scene);
        }
      }
    });
  };

  // Trigger white hole emission (information expansion)
  const triggerWhiteHoleTransition = (node: InfoNode, allNodes: InfoNode[], scene: THREE.Scene) => {
    const oldPosition = node.position.clone();
    
    node.isBlackHole = false;
    node.isWhiteHole = true;
    node.phase = 'expanding';
    blackHolesRef.current.delete(node.id);
    whiteHolesRef.current.add(node.id);
    
    // Emit information in a new location (tunneling)
    const tunnelDistance = 15 + Math.random() * 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    const newPosition = new THREE.Vector3(
      tunnelDistance * Math.sin(phi) * Math.cos(theta),
      tunnelDistance * Math.sin(phi) * Math.sin(theta),
      tunnelDistance * Math.cos(phi)
    );
    
    // Create dramatic wormhole tunnel visualization
    if (params.showTunnels) {
      const curve = new THREE.CubicBezierCurve3(
        oldPosition,
        oldPosition.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        )),
        newPosition.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        )),
        newPosition
      );
      
      // Create tube tunnel
      const tunnelTubeGeometry = new THREE.TubeGeometry(curve, 50, 0.3, 16, false);
      const tunnelTubeMaterial = new THREE.MeshPhongMaterial({
        color: 0xff00ff,
        emissive: 0xff00ff,
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const tunnelTube = new THREE.Mesh(tunnelTubeGeometry, tunnelTubeMaterial);
      scene.add(tunnelTube);
      
      // Create particle stream through tunnel
      const streamParticleCount = 100;
      const streamPositions = new Float32Array(streamParticleCount * 3);
      const streamColors = new Float32Array(streamParticleCount * 3);
      
      for (let i = 0; i < streamParticleCount; i++) {
        const t = i / streamParticleCount;
        const point = curve.getPoint(t);
        streamPositions[i * 3] = point.x;
        streamPositions[i * 3 + 1] = point.y;
        streamPositions[i * 3 + 2] = point.z;
        
        const color = new THREE.Color().setHSL(0.8 - t * 0.3, 1, 0.5);
        streamColors[i * 3] = color.r;
        streamColors[i * 3 + 1] = color.g;
        streamColors[i * 3 + 2] = color.b;
      }
      
      const streamGeometry = new THREE.BufferGeometry();
      streamGeometry.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));
      streamGeometry.setAttribute('color', new THREE.BufferAttribute(streamColors, 3));
      
      const streamMaterial = new THREE.PointsMaterial({
        size: 0.2,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      
      const streamParticles = new THREE.Points(streamGeometry, streamMaterial);
      scene.add(streamParticles);
      
      // Fade out and remove tunnel with pulsing effect
      let tunnelTime = 0;
      const tunnelInterval = setInterval(() => {
        tunnelTime += 0.05;
        const pulse = Math.sin(tunnelTime * 5) * 0.5 + 0.5;
        tunnelTubeMaterial.opacity = 0.5 * (1 - tunnelTime / 2) * (0.5 + pulse * 0.5);
        streamMaterial.opacity = 1 * (1 - tunnelTime / 2);
        
        if (tunnelTime >= 2) {
          clearInterval(tunnelInterval);
          scene.remove(tunnelTube);
          scene.remove(streamParticles);
          tunnelTubeGeometry.dispose();
          tunnelTubeMaterial.dispose();
          streamGeometry.dispose();
          streamMaterial.dispose();
        }
      }, 50);
    }
    
    node.position.copy(newPosition);
    
    // Emit information to nearby nodes with wave effect
    setTimeout(() => {
      allNodes.forEach(other => {
        const distance = node.position.distanceTo(other.position);
        if (distance < 8 && other.id !== node.id) {
          // Information transfer
          const transfer = node.compressionLevel! * params.expansionRate / (1 + distance);
          other.state = Math.min(1, other.state + transfer);
          
          // Momentum transfer (push nodes away)
          const direction = other.position.clone().sub(node.position).normalize();
          other.velocity.addScaledVector(direction, 0.5);
          
          // Create entanglement
          if (!node.connections.includes(other.id) && Math.random() < 0.3) {
            node.connections.push(other.id);
            other.connections.push(node.id);
          }
        }
      });
      
      // Reset node with residual state
      node.isWhiteHole = false;
      node.phase = 'stable';
      node.state = 0.3 + Math.random() * 0.2; // Some information retained
      node.compressionLevel = 0;
      whiteHolesRef.current.delete(node.id);
    }, 1000);
  };

  // Observer effect - measurement collapse near camera
  const applyObserverEffect = (nodes: InfoNode[], camera: THREE.Camera) => {
    if (!params.observerEffect) return;
    
    const cameraPos = camera.position;
    const observerRadius = 5;
    
    nodes.forEach(node => {
      const distance = node.position.distanceTo(cameraPos);
      
      if (distance < observerRadius) {
        // Observation collapses quantum uncertainty
        const collapseStrength = 1 - distance / observerRadius;
        node.entropy *= (1 - collapseStrength * 0.5);
        node.phase = 'stable';
        
        // Stabilize velocity
        node.velocity.multiplyScalar(1 - collapseStrength * 0.1);
      }
    });
  };

  // Update node colors based on state and phase
  const updateNodeColors = (nodes: InfoNode[], time: number) => {
    nodes.forEach(node => {
      const hue = node.state; // Information content maps to hue
      const saturation = 1 - node.entropy; // Low entropy = high saturation
      let lightness = 0.5;
      
      // Special colors for black/white holes
      if (node.isBlackHole) {
        node.color.setRGB(0.1, 0, 0.2); // Deep purple/black
      } else if (node.isWhiteHole) {
        node.color.setRGB(1, 1, 0.9); // Bright white/yellow
      } else {
        // Higher dimensional projection through color
        if (params.showHigherDimensions) {
          const hdPhase = Math.sin(time + node.id * 0.1) * 0.5 + 0.5;
          lightness = 0.3 + hdPhase * 0.4;
        }
        
        node.color.setHSL(hue, saturation, lightness);
      }
      
      // Update mesh color
      if (node.mesh) {
        (node.mesh.material as THREE.MeshPhongMaterial).color = node.color;
        (node.mesh.material as THREE.MeshPhongMaterial).emissive = node.color.clone().multiplyScalar(0.3);
      }
    });
  };

  // Update edges with realistic tubes and particle flows
  const updateEdges = (nodes: InfoNode[], edges: InfoEdge[], scene: THREE.Scene) => {
    // Clear old edges
    edges.forEach(edge => {
      if (edge.tube) scene.remove(edge.tube);
      if (edge.flowParticles) scene.remove(edge.flowParticles);
    });
    edges.length = 0;
    
    // Create new edges with tube geometry
    const processedPairs = new Set<string>();
    
    nodes.forEach(node => {
      node.connections.forEach(connId => {
        const pairKey = `${Math.min(node.id, connId)}-${Math.max(node.id, connId)}`;
        
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);
          const other = nodes[connId];
          
          if (other) {
            // Create curved path for the tube
            const curve = new THREE.QuadraticBezierCurve3(
              node.position,
              node.position.clone().lerp(other.position, 0.5).add(
                new THREE.Vector3(
                  (Math.random() - 0.5) * 2,
                  (Math.random() - 0.5) * 2,
                  (Math.random() - 0.5) * 2
                )
              ),
              other.position
            );
            
            // Create tube geometry along curve
            const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.05, 8, false);
            
            // Edge color based on information flow
            const flowStrength = Math.abs(node.state - other.state);
            const isEntangled = flowStrength < 0.2; // Similar states = entangled
            
            const tubeMaterial = new THREE.MeshPhongMaterial({
              color: isEntangled ? 0xff00ff : new THREE.Color().setHSL(0.6, 1, 0.3 + flowStrength * 0.5),
              emissive: isEntangled ? 0xff00ff : 0x0066ff,
              emissiveIntensity: 0.3 + flowStrength * 0.7,
              transparent: true,
              opacity: 0.4 + flowStrength * 0.4,
              side: THREE.DoubleSide
            });
            
            const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            scene.add(tube);
            
            // Create flow particles along the edge
            const particleCount = 10;
            const particlePositions = new Float32Array(particleCount * 3);
            const particleColors = new Float32Array(particleCount * 3);
            
            for (let i = 0; i < particleCount; i++) {
              const t = i / particleCount;
              const point = curve.getPoint(t);
              particlePositions[i * 3] = point.x;
              particlePositions[i * 3 + 1] = point.y;
              particlePositions[i * 3 + 2] = point.z;
              
              // Color gradient along flow
              const color = new THREE.Color().setHSL(0.6 + t * 0.2, 1, 0.5);
              particleColors[i * 3] = color.r;
              particleColors[i * 3 + 1] = color.g;
              particleColors[i * 3 + 2] = color.b;
            }
            
            const particleGeometry = new THREE.BufferGeometry();
            particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
            particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
            
            const particleMaterial = new THREE.PointsMaterial({
              size: 0.15,
              vertexColors: true,
              transparent: true,
              opacity: 0.8,
              blending: THREE.AdditiveBlending,
              depthWrite: false
            });
            
            const flowParticles = new THREE.Points(particleGeometry, particleMaterial);
            scene.add(flowParticles);
            
            edges.push({
              from: node.id,
              to: connId,
              strength: flowStrength,
              tube,
              flowParticles
            });
          }
        }
      });
    });
  };

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000511);
    scene.fog = new THREE.Fog(0x000511, 20, 100);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(30, 20, 30);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing for bloom effect
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
    controls.maxDistance = 100;
    controls.minDistance = 5;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const pointLight1 = new THREE.PointLight(0xffffff, 1, 100);
    pointLight1.position.set(20, 20, 20);
    scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0x00ffff, 0.5, 100);
    pointLight2.position.set(-20, -20, -20);
    scene.add(pointLight2);

    // Initialize information nodes
    const nodes = initializeNodes();
    nodesRef.current = nodes;
    
    // Create realistic node geometries
    const outerGeometry = new THREE.IcosahedronGeometry(0.3, 2); // Faceted outer shell
    const coreGeometry = new THREE.SphereGeometry(0.15, 32, 32); // Smooth core
    const haloGeometry = new THREE.SphereGeometry(0.5, 32, 32); // Energy halo
    
    nodes.forEach(node => {
      node.pulsePhase = Math.random() * Math.PI * 2;
      
      // Outer shell - crystalline structure
      const outerMaterial = new THREE.MeshPhysicalMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.2,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      });
      
      const mesh = new THREE.Mesh(outerGeometry, outerMaterial);
      mesh.position.copy(node.position);
      node.mesh = mesh;
      scene.add(mesh);
      
      // Inner glowing core
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9
      });
      
      const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
      coreMesh.position.copy(node.position);
      node.coreMesh = coreMesh;
      scene.add(coreMesh);
      
      // Energy halo (for high-energy states)
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: 0,
        side: THREE.BackSide,
        depthWrite: false
      });
      
      const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
      haloMesh.position.copy(node.position);
      node.haloMesh = haloMesh;
      scene.add(haloMesh);
    });

    // Initialize edges
    const edges: InfoEdge[] = [];
    edgesRef.current = edges;
    updateEdges(nodes, edges, scene);

    // Add ambient quantum foam particles
    const ambientParticleCount = 1000;
    const ambientPositions = new Float32Array(ambientParticleCount * 3);
    const ambientColors = new Float32Array(ambientParticleCount * 3);
    
    for (let i = 0; i < ambientParticleCount; i++) {
      // Random spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 20 + Math.random() * 30;
      
      ambientPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      ambientPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      ambientPositions[i * 3 + 2] = r * Math.cos(phi);
      
      // Subtle colors - quantum vacuum fluctuations
      const color = new THREE.Color().setHSL(Math.random(), 0.5, 0.5);
      ambientColors[i * 3] = color.r;
      ambientColors[i * 3 + 1] = color.g;
      ambientColors[i * 3 + 2] = color.b;
    }
    
    const ambientGeometry = new THREE.BufferGeometry();
    ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
    ambientGeometry.setAttribute('color', new THREE.BufferAttribute(ambientColors, 3));
    
    const ambientMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const ambientParticles = new THREE.Points(ambientGeometry, ambientMaterial);
    scene.add(ambientParticles);

    // GUI controls
    const gui = new GUI();
    guiRef.current = gui;
    
    const simFolder = gui.addFolder('Simulation Parameters');
    simFolder.add(params, 'informationFlow', 0, 1).name('Info Flow Rate');
    simFolder.add(params, 'compressionThreshold', 0.5, 1).name('Black Hole Threshold');
    simFolder.add(params, 'expansionRate', 0, 1).name('White Hole Expansion');
    simFolder.add(params, 'gravityStrength', 0, 0.5).name('Gravity Strength');
    simFolder.add(params, 'quantumNoise', 0, 0.1).name('Quantum Noise');
    simFolder.add(params, 'timeEvolution', 0, 0.1).name('Time Evolution');
    simFolder.add(params, 'entanglementStrength', 0, 1).name('Entanglement');
    simFolder.add(params, 'informationDecay', 0, 0.1).name('Info Decay (Entropy)');
    simFolder.open();
    
    const visualFolder = gui.addFolder('Visualization');
    visualFolder.add(params, 'observerEffect').name('Observer Effect');
    visualFolder.add(params, 'showHigherDimensions').name('Higher Dimensions');
    visualFolder.add(params, 'showTunnels').name('Show Wormhole Tunnels');
    visualFolder.add(params, 'connectionRadius', 1, 10).name('Connection Range').onChange(() => {
      // Rebuild connections
      nodes.forEach(node => node.connections = []);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const distance = nodes[i].position.distanceTo(nodes[j].position);
          if (distance < params.connectionRadius) {
            nodes[i].connections.push(j);
            nodes[j].connections.push(i);
          }
        }
      }
    });
    visualFolder.open();

    // Animation loop
    const clock = new THREE.Clock();
    
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      const deltaTime = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();
      timeRef.current = elapsedTime;
      
      // Update information flow
      updateInformationFlow(nodes);
      
      // Check for black hole formation
      checkBlackHoleFormation(nodes, scene);
      
      // Apply observer effect
      if (camera) {
        applyObserverEffect(nodes, camera);
      }
      
      // Update node positions and visuals
      nodes.forEach(node => {
        node.position.add(node.velocity.clone().multiplyScalar(deltaTime));
        node.velocity.multiplyScalar(0.99);
        
        // Update pulse animation
        node.pulsePhase! += deltaTime * 2;
        const pulse = Math.sin(node.pulsePhase!) * 0.5 + 0.5;
        
        // Update outer shell
        if (node.mesh) {
          node.mesh.position.copy(node.position);
          
          // Scale based on information content + pulse
          const baseScale = 0.7 + node.state * 1.3;
          const pulseScale = 1 + pulse * 0.1 * node.state;
          node.mesh.scale.setScalar(baseScale * pulseScale);
          
          // Rotation for quantum uncertainty
          if (params.showHigherDimensions) {
            node.mesh.rotation.x += deltaTime * (0.5 + node.entropy * 0.5);
            node.mesh.rotation.y += deltaTime * (0.3 + node.entropy * 0.3);
          }
          
          // Update material based on state
          const material = node.mesh.material as THREE.MeshPhysicalMaterial;
          material.emissiveIntensity = 0.3 + node.state * 0.7;
          material.opacity = 0.6 + node.state * 0.3;
        }
        
        // Update glowing core
        if (node.coreMesh) {
          node.coreMesh.position.copy(node.position);
          const coreScale = 0.5 + node.state * 0.8 + pulse * 0.2;
          node.coreMesh.scale.setScalar(coreScale);
          
          const coreMaterial = node.coreMesh.material as THREE.MeshBasicMaterial;
          coreMaterial.opacity = 0.7 + node.state * 0.3;
        }
        
        // Update energy halo (visible at high states)
        if (node.haloMesh) {
          node.haloMesh.position.copy(node.position);
          const haloMaterial = node.haloMesh.material as THREE.MeshBasicMaterial;
          
          if (node.state > 0.6 || node.isBlackHole || node.isWhiteHole) {
            // High energy or special states
            const haloIntensity = node.isBlackHole ? 0.3 : 
                                 node.isWhiteHole ? 0.8 : 
                                 (node.state - 0.6) * 2;
            haloMaterial.opacity = haloIntensity * (0.5 + pulse * 0.5);
            const haloScale = 1.5 + pulse * 0.5;
            node.haloMesh.scale.setScalar(haloScale);
          } else {
            haloMaterial.opacity = 0;
          }
        }
        
        // Black hole gravitational lensing effect
        if (node.isBlackHole) {
          if (!node.distortionSphere) {
            const distortionGeometry = new THREE.SphereGeometry(2, 32, 32);
            const distortionMaterial = new THREE.MeshBasicMaterial({
              color: 0x000000,
              transparent: true,
              opacity: 0.3,
              side: THREE.BackSide,
              blending: THREE.AdditiveBlending
            });
            node.distortionSphere = new THREE.Mesh(distortionGeometry, distortionMaterial);
            scene.add(node.distortionSphere);
          }
          
          node.distortionSphere.position.copy(node.position);
          const distortScale = 1 + node.compressionLevel! * 0.5 + pulse * 0.1;
          node.distortionSphere.scale.setScalar(distortScale);
          
          const distortMaterial = node.distortionSphere.material as THREE.MeshBasicMaterial;
          distortMaterial.opacity = 0.2 + node.compressionLevel! * 0.3;
        } else if (node.distortionSphere) {
          // Remove distortion sphere if no longer black hole
          scene.remove(node.distortionSphere);
          node.distortionSphere = undefined;
        }
        
        // White hole emission effects
        if (node.isWhiteHole && node.haloMesh) {
          const haloMaterial = node.haloMesh.material as THREE.MeshBasicMaterial;
          haloMaterial.opacity = 0.8 + pulse * 0.2;
          node.haloMesh.scale.setScalar(3 + pulse * 1);
        }
      });
      
      // Update colors
      updateNodeColors(nodes, elapsedTime);
      
      // Animate flow particles along edges
      edges.forEach(edge => {
        if (edge.flowParticles) {
          const positions = edge.flowParticles.geometry.attributes.position.array as Float32Array;
          const fromNode = nodes.find(n => n.id === edge.from);
          const toNode = nodes.find(n => n.id === edge.to);
          
          if (fromNode && toNode) {
            // Recreate curve with updated positions
            const curve = new THREE.QuadraticBezierCurve3(
              fromNode.position,
              fromNode.position.clone().lerp(toNode.position, 0.5),
              toNode.position
            );
            
            // Animate particles along the curve
            for (let i = 0; i < positions.length / 3; i++) {
              const t = ((i / (positions.length / 3)) + elapsedTime * 0.2) % 1;
              const point = curve.getPoint(t);
              positions[i * 3] = point.x;
              positions[i * 3 + 1] = point.y;
              positions[i * 3 + 2] = point.z;
            }
            
            edge.flowParticles.geometry.attributes.position.needsUpdate = true;
          }
        }
      });
      
      // Update edges periodically
      if (Math.floor(elapsedTime * 10) % 5 === 0) {
        updateEdges(nodes, edges, scene);
      }
      
      // Evolve topology over time
      nodes.forEach(node => {
        // Slowly drift in higher dimensions
        if (params.showHigherDimensions) {
          const hdDrift = new THREE.Vector3(
            Math.sin(elapsedTime * params.timeEvolution + node.id) * 0.01,
            Math.cos(elapsedTime * params.timeEvolution * 1.3 + node.id) * 0.01,
            Math.sin(elapsedTime * params.timeEvolution * 0.7 + node.id) * 0.01
          );
          node.position.add(hdDrift);
        }
      });
      
      controls.update();
      composer.render();
    };
    
    animate();

    // Handle window resize
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
  }, []); // Empty dependency array for single initialization

  return (
    <div ref={mountRef} className="w-full h-screen relative">
      <div className="absolute top-4 left-4 text-white bg-black/50 p-4 rounded-lg backdrop-blur-sm max-w-md">
        <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
          Information Topology Simulation
        </h2>
        <div className="text-sm space-y-1">
          <p className="text-cyan-400 font-semibold">Information creates geometry, not vice versa</p>
          <p>⚪ Nodes = Information packets (qubits/data)</p>
          <p>➖ Edges = Information flow (local + entangled)</p>
          <p>🔗 Entanglement = Instantaneous correlation</p>
          <p>⚫ Black holes = Information compression</p>
          <p>⚡ White holes = Emission via wormhole tunnels</p>
          <p className="text-purple-400">💜 Tunnels visualize BH→WH transitions</p>
          <p className="text-yellow-400">👁 Observer collapses quantum uncertainty</p>
          <p className="text-red-400 text-xs mt-2">⚠️ Information decay: 2nd law of thermodynamics</p>
        </div>
      </div>
      
      {/* Status indicators */}
      <div className="absolute top-4 right-4 text-white bg-black/50 p-4 rounded-lg backdrop-blur-sm">
        <div className="text-sm space-y-1">
          <p>Black Holes: {blackHolesRef.current.size}</p>
          <p>White Holes: {whiteHolesRef.current.size}</p>
          <p>Time: {timeRef.current.toFixed(1)}</p>
        </div>
      </div>
    </div>
  );
};

export default InformationTopologySimulation;

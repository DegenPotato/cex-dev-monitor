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
  isBlackHole?: boolean;
  isWhiteHole?: boolean;
  compressionLevel?: number;
}

// Edge between nodes - information flow
interface InfoEdge {
  from: number;
  to: number;
  strength: number; // Information transfer rate
  line?: THREE.Line;
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
    timeEvolution: 0.01
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

  // Update information flow between nodes
  const updateInformationFlow = (nodes: InfoNode[]) => {
    // Calculate state updates based on connected neighbors
    const newStates = new Array(nodes.length).fill(0);
    
    nodes.forEach((node, i) => {
      let totalInfluence = 0;
      let influenceCount = 0;
      
      node.connections.forEach(connId => {
        const neighbor = nodes[connId];
        if (neighbor) {
          const distance = node.position.distanceTo(neighbor.position);
          const influence = neighbor.state / (1 + distance);
          totalInfluence += influence;
          influenceCount++;
        }
      });
      
      // Update state based on neighbors + quantum noise
      if (influenceCount > 0) {
        newStates[i] = node.state * 0.95 + (totalInfluence / influenceCount) * params.informationFlow;
        // Add quantum fluctuations
        newStates[i] += (Math.random() - 0.5) * params.quantumNoise;
        newStates[i] = Math.max(0, Math.min(1, newStates[i])); // Clamp [0, 1]
      } else {
        newStates[i] = node.state;
      }
      
      // Update entropy based on information flow
      node.entropy = Math.abs(newStates[i] - node.state) * 10 + node.entropy * 0.9;
    });
    
    // Apply new states
    nodes.forEach((node, i) => {
      node.state = newStates[i];
    });
  };

  // Check for black hole formation (information compression)
  const checkBlackHoleFormation = (nodes: InfoNode[]) => {
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
          triggerWhiteHoleTransition(node, nodes);
        }
      }
    });
  };

  // Trigger white hole emission (information expansion)
  const triggerWhiteHoleTransition = (node: InfoNode, allNodes: InfoNode[]) => {
    node.isBlackHole = false;
    node.isWhiteHole = true;
    node.phase = 'expanding';
    blackHolesRef.current.delete(node.id);
    whiteHolesRef.current.add(node.id);
    
    // Emit information in a new location (tunneling)
    const tunnelDistance = 15 + Math.random() * 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    node.position.set(
      tunnelDistance * Math.sin(phi) * Math.cos(theta),
      tunnelDistance * Math.sin(phi) * Math.sin(theta),
      tunnelDistance * Math.cos(phi)
    );
    
    // Emit information to nearby nodes
    setTimeout(() => {
      allNodes.forEach(other => {
        const distance = node.position.distanceTo(other.position);
        if (distance < 5 && other.id !== node.id) {
          other.state += node.compressionLevel! * params.expansionRate / (1 + distance);
          other.velocity.addScaledVector(
            other.position.clone().sub(node.position).normalize(),
            0.5
          );
        }
      });
      
      // Reset node
      node.isWhiteHole = false;
      node.phase = 'stable';
      node.state = 0.5;
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

  // Update edges based on current connections
  const updateEdges = (nodes: InfoNode[], edges: InfoEdge[], scene: THREE.Scene) => {
    // Clear old edges
    edges.forEach(edge => {
      if (edge.line) {
        scene.remove(edge.line);
      }
    });
    edges.length = 0;
    
    // Create new edges
    const processedPairs = new Set<string>();
    
    nodes.forEach(node => {
      node.connections.forEach(connId => {
        const pairKey = `${Math.min(node.id, connId)}-${Math.max(node.id, connId)}`;
        
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);
          const other = nodes[connId];
          
          if (other) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
              node.position,
              other.position
            ]);
            
            // Edge color based on information flow
            const flowStrength = Math.abs(node.state - other.state);
            const material = new THREE.LineBasicMaterial({
              color: new THREE.Color().setHSL(0.6, 1, 0.5),
              opacity: 0.2 + flowStrength * 0.5,
              transparent: true
            });
            
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            
            edges.push({
              from: node.id,
              to: connId,
              strength: flowStrength,
              line
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
    
    // Create node meshes
    const nodeGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    
    nodes.forEach(node => {
      const material = new THREE.MeshPhongMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: 0.3
      });
      
      const mesh = new THREE.Mesh(nodeGeometry, material);
      mesh.position.copy(node.position);
      node.mesh = mesh;
      scene.add(mesh);
    });

    // Initialize edges
    const edges: InfoEdge[] = [];
    edgesRef.current = edges;
    updateEdges(nodes, edges, scene);

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
    simFolder.open();
    
    const visualFolder = gui.addFolder('Visualization');
    visualFolder.add(params, 'observerEffect').name('Observer Effect');
    visualFolder.add(params, 'showHigherDimensions').name('Higher Dimensions');
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
      checkBlackHoleFormation(nodes);
      
      // Apply observer effect
      if (camera) {
        applyObserverEffect(nodes, camera);
      }
      
      // Update node positions based on velocity
      nodes.forEach(node => {
        node.position.add(node.velocity.clone().multiplyScalar(deltaTime));
        
        // Apply damping
        node.velocity.multiplyScalar(0.99);
        
        // Update mesh position
        if (node.mesh) {
          node.mesh.position.copy(node.position);
          
          // Scale based on information content
          const scale = 0.5 + node.state * 1.5;
          node.mesh.scale.setScalar(scale);
          
          // Rotation for higher dimensional projection
          if (params.showHigherDimensions) {
            node.mesh.rotation.x = elapsedTime * 0.5 + node.id * 0.1;
            node.mesh.rotation.y = elapsedTime * 0.3 + node.id * 0.2;
          }
        }
      });
      
      // Update colors
      updateNodeColors(nodes, elapsedTime);
      
      // Update edges
      if (Math.floor(elapsedTime * 10) % 5 === 0) { // Update every 0.5 seconds
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
        <h2 className="text-2xl font-bold mb-2">Information Topology Simulation</h2>
        <div className="text-sm space-y-1">
          <p className="text-cyan-400">Information creates geometry, not vice versa</p>
          <p>⚪ Nodes = Information packets (qubits/data)</p>
          <p>➖ Edges = Information flow/entanglement</p>
          <p>⚫ Black holes = Information compression</p>
          <p>⚡ White holes = Information expansion</p>
          <p className="text-yellow-400">Observer effect collapses uncertainty near camera</p>
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

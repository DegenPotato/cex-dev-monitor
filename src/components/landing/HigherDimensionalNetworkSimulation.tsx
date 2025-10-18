/**
 * HIGHER-DIMENSIONAL NETWORK TOPOLOGY SIMULATION
 * 
 * Exploring the true shape of spacetime as a network of black-to-white hole transitions
 * 
 * CONCEPTS:
 * 1. Physical: 4D spacetime (3 space + 1 time) projected to 3D
 * 2. Topological: Wormhole handles connecting bubble universes
 * 3. Informational: High-dimensional parameter space (10+ dimensions)
 * 4. Visual: Color, size, motion encode hidden dimensions
 * 
 * The universe is not a simple shape but a hypergraph where:
 * - Nodes = Universe bubbles
 * - Edges = Wormhole throats
 * - Colors = Extra dimensions (energy, charge, spin, information)
 * - Motion = Time evolution through higher dimensions
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'dat.gui';

// Universe node in the hypergraph
interface UniverseNode {
  id: string;
  position: THREE.Vector3; // 3D projection
  hiddenCoords: number[]; // Higher dimensions (energy, charge, spin, entropy, etc.)
  radius: number;
  connections: string[]; // Connected universe IDs
  mesh?: THREE.Mesh;
  core?: THREE.Mesh;
  field?: THREE.Mesh; // Energy field
  type: 'standard' | 'black' | 'white';
  age: number;
  informationContent: number;
}

// Wormhole connection between universes
interface WormholeEdge {
  id: string;
  from: string;
  to: string;
  throat?: THREE.Mesh; // The tunnel geometry
  flow?: THREE.Points; // Particle flow through wormhole
  strength: number;
  curvature: number; // How much the tunnel curves
  active: boolean;
}

// Information packet traveling through network
interface InfoPacket {
  id: string;
  currentNode: string;
  targetNode?: string;
  position: THREE.Vector3;
  hiddenState: number[]; // State in hidden dimensions
  mesh?: THREE.Mesh;
  trail: THREE.Vector3[];
  transitioning: boolean;
  progress: number; // 0-1 through wormhole
}

// Simulation parameters
interface SimParams {
  dimensions: number; // Total dimensions (visible + hidden)
  nodeCount: number;
  connectionProbability: number;
  wormholeCurvature: number;
  informationFlow: number;
  timeEvolution: number;
  showHiddenDimensions: boolean;
  projectionMode: 'pca' | 'tsne' | 'spherical';
  colorDimension: number; // Which hidden dim to map to color
  sizeDimension: number; // Which hidden dim to map to size
  pulseRate: number;
}

export const HigherDimensionalNetworkSimulation: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const composerRef = useRef<EffectComposer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<OrbitControls>();
  const nodesRef = useRef<Map<string, UniverseNode>>(new Map());
  const edgesRef = useRef<Map<string, WormholeEdge>>(new Map());
  const packetsRef = useRef<Map<string, InfoPacket>>(new Map());
  const animationIdRef = useRef<number>();
  const guiRef = useRef<GUI>();
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());

  const [params] = useState<SimParams>({
    dimensions: 10, // 3 visible + 7 hidden
    nodeCount: 20,
    connectionProbability: 0.15,
    wormholeCurvature: 0.5,
    informationFlow: 0.1,
    timeEvolution: 0.01,
    showHiddenDimensions: true,
    projectionMode: 'spherical',
    colorDimension: 4, // Map 5th dimension to color
    sizeDimension: 5, // Map 6th dimension to size
    pulseRate: 1
  });

  // Project higher dimensions to 3D position
  const projectTo3D = (hiddenCoords: number[], mode: string): THREE.Vector3 => {
    if (mode === 'spherical') {
      // Map first 3 hidden dims to spherical coords
      const r = 10 + hiddenCoords[0] * 20;
      const theta = hiddenCoords[1] * Math.PI * 2;
      const phi = hiddenCoords[2] * Math.PI;
      
      return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    } else if (mode === 'pca') {
      // Simple PCA-like projection
      return new THREE.Vector3(
        hiddenCoords[0] * 30,
        hiddenCoords[1] * 30,
        hiddenCoords[2] * 30
      );
    } else {
      // t-SNE style (simplified)
      const x = Math.tanh(hiddenCoords[0] - hiddenCoords[1]) * 30;
      const y = Math.tanh(hiddenCoords[2] - hiddenCoords[3]) * 30;
      const z = Math.tanh(hiddenCoords[4] - hiddenCoords[5]) * 30;
      return new THREE.Vector3(x, y, z);
    }
  };

  // Create universe node with higher dimensions
  const createUniverseNode = (scene: THREE.Scene): UniverseNode => {
    const node: UniverseNode = {
      id: Math.random().toString(36).substr(2, 9),
      position: new THREE.Vector3(),
      hiddenCoords: Array.from({ length: params.dimensions }, () => Math.random()),
      radius: 1 + Math.random() * 2,
      connections: [],
      type: Math.random() < 0.7 ? 'standard' : Math.random() < 0.5 ? 'black' : 'white',
      age: 0,
      informationContent: Math.random()
    };

    // Project to 3D
    node.position = projectTo3D(node.hiddenCoords, params.projectionMode);

    // Create multi-layer visualization
    // Outer shell - represents the universe bubble
    const shellGeometry = new THREE.IcosahedronGeometry(node.radius, 2);
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(node.hiddenCoords[params.colorDimension], 0.7, 0.5),
      metalness: 0.3,
      roughness: 0.7,
      transparent: true,
      opacity: node.type === 'black' ? 0.3 : 0.7,
      side: THREE.DoubleSide
    });
    node.mesh = new THREE.Mesh(shellGeometry, shellMaterial);
    node.mesh.position.copy(node.position);
    scene.add(node.mesh);

    // Inner core - information singularity
    const coreGeometry = new THREE.SphereGeometry(node.radius * 0.3, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: node.type === 'black' ? 0x000000 : node.type === 'white' ? 0xffffff : 0x00ffff,
      transparent: true,
      opacity: 0.9
    });
    node.core = new THREE.Mesh(coreGeometry, coreMaterial);
    node.core.position.copy(node.position);
    scene.add(node.core);

    // Energy field (for high-dimensional visualization)
    if (params.showHiddenDimensions) {
      const fieldGeometry = new THREE.SphereGeometry(
        node.radius * (1 + node.hiddenCoords[params.sizeDimension]),
        32,
        32
      );
      const fieldMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(
          node.hiddenCoords[params.colorDimension + 1],
          1,
          0.5
        ),
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide,
        depthWrite: false
      });
      node.field = new THREE.Mesh(fieldGeometry, fieldMaterial);
      node.field.position.copy(node.position);
      scene.add(node.field);
    }

    return node;
  };

  // Create wormhole connection with curved geometry
  const createWormholeEdge = (
    from: UniverseNode,
    to: UniverseNode,
    scene: THREE.Scene
  ): WormholeEdge => {
    const edge: WormholeEdge = {
      id: `${from.id}-${to.id}`,
      from: from.id,
      to: to.id,
      strength: Math.random(),
      curvature: params.wormholeCurvature + (Math.random() - 0.5) * 0.5,
      active: true
    };

    // Create curved tunnel using CatmullRom spline
    const midpoint = from.position.clone().lerp(to.position, 0.5);
    
    // Add curvature based on hidden dimensions
    const offset = new THREE.Vector3(
      (from.hiddenCoords[6] - to.hiddenCoords[6]) * 10,
      (from.hiddenCoords[7] - to.hiddenCoords[7]) * 10,
      (from.hiddenCoords[8] - to.hiddenCoords[8]) * 10
    );
    midpoint.add(offset.multiplyScalar(edge.curvature));

    const curve = new THREE.CatmullRomCurve3([
      from.position,
      midpoint,
      to.position
    ]);

    // Create tube geometry for wormhole
    const tubeGeometry = new THREE.TubeGeometry(curve, 50, 0.2, 16, false);
    
    // Material shows information flow direction
    const tubeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        fromColor: { value: new THREE.Color().setHSL(from.hiddenCoords[4], 1, 0.5) },
        toColor: { value: new THREE.Color().setHSL(to.hiddenCoords[4], 1, 0.5) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 fromColor;
        uniform vec3 toColor;
        varying vec2 vUv;
        
        void main() {
          float flow = fract(vUv.x * 5.0 - time);
          vec3 color = mix(fromColor, toColor, vUv.x);
          float alpha = 0.3 + flow * 0.4;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    edge.throat = new THREE.Mesh(tubeGeometry, tubeMaterial);
    scene.add(edge.throat);

    // Add particle flow visualization
    const particleCount = 20;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const t = i / particleCount;
      const point = curve.getPoint(t);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.3,
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    edge.flow = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(edge.flow);

    return edge;
  };

  // Create information packet
  const createInfoPacket = (startNode: UniverseNode, scene: THREE.Scene): InfoPacket => {
    const packet: InfoPacket = {
      id: Math.random().toString(36).substr(2, 9),
      currentNode: startNode.id,
      position: startNode.position.clone(),
      hiddenState: Array.from({ length: params.dimensions }, () => Math.random()),
      trail: [],
      transitioning: false,
      progress: 0
    };

    // Visualize as glowing particle
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(packet.hiddenState[4], 1, 0.5),
      transparent: true,
      opacity: 0.9
    });
    packet.mesh = new THREE.Mesh(geometry, material);
    packet.mesh.position.copy(packet.position);
    scene.add(packet.mesh);

    return packet;
  };

  // Update packet movement through wormholes
  const updatePacket = (
    packet: InfoPacket,
    nodes: Map<string, UniverseNode>,
    edges: Map<string, WormholeEdge>,
    dt: number
  ): void => {
    const currentNode = nodes.get(packet.currentNode);
    if (!currentNode) return;

    if (!packet.transitioning) {
      // Choose random connected node
      if (Math.random() < params.informationFlow && currentNode.connections.length > 0) {
        const targetId = currentNode.connections[Math.floor(Math.random() * currentNode.connections.length)];
        packet.targetNode = targetId;
        packet.transitioning = true;
        packet.progress = 0;
      }
    } else if (packet.targetNode) {
      // Move through wormhole
      const targetNode = nodes.get(packet.targetNode);
      if (targetNode) {
        packet.progress += dt * 0.5;
        
        if (packet.progress >= 1) {
          // Arrived at target
          packet.currentNode = packet.targetNode;
          packet.position.copy(targetNode.position);
          packet.transitioning = false;
          packet.targetNode = undefined;
          
          // Exchange information with node
          targetNode.informationContent = (targetNode.informationContent + packet.hiddenState[0]) / 2;
        } else {
          // Interpolate position through wormhole
          const edge = edges.get(`${currentNode.id}-${targetNode.id}`) || 
                       edges.get(`${targetNode.id}-${currentNode.id}`);
          if (edge && edge.throat) {
            // Follow the tube curve
            const curve = (edge.throat.geometry as THREE.TubeGeometry).parameters.path;
            const point = curve.getPoint(packet.progress);
            packet.position.copy(point);
          }
        }
      }
    }

    // Update mesh position
    if (packet.mesh) {
      packet.mesh.position.copy(packet.position);
    }

    // Trail
    packet.trail.push(packet.position.clone());
    if (packet.trail.length > 30) {
      packet.trail.shift();
    }
  };

  // Evolve hidden dimensions over time
  const evolveHiddenDimensions = (node: UniverseNode, dt: number): void => {
    // Each hidden dimension evolves according to its own dynamics
    for (let i = 3; i < node.hiddenCoords.length; i++) {
      // Oscillation in higher dimensions
      const freq = 0.5 + i * 0.1;
      const phase = node.age * freq;
      const delta = Math.sin(phase) * dt * params.timeEvolution;
      
      node.hiddenCoords[i] = Math.max(0, Math.min(1, node.hiddenCoords[i] + delta));
    }

    // Update position based on new coordinates
    if (params.showHiddenDimensions) {
      const newPos = projectTo3D(node.hiddenCoords, params.projectionMode);
      node.position.lerp(newPos, dt * 0.1);
    }

    // Update visual properties based on hidden dimensions
    if (node.mesh) {
      node.mesh.position.copy(node.position);
      
      const material = node.mesh.material as THREE.MeshPhysicalMaterial;
      material.color.setHSL(node.hiddenCoords[params.colorDimension], 0.7, 0.5);
      
      const scale = 1 + node.hiddenCoords[params.sizeDimension];
      node.mesh.scale.setScalar(scale);
    }

    if (node.core) {
      node.core.position.copy(node.position);
    }

    if (node.field) {
      node.field.position.copy(node.position);
      const fieldScale = 1 + node.hiddenCoords[params.sizeDimension] * 2;
      node.field.scale.setScalar(fieldScale);
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
    camera.lookAt(0, 0, 0);
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
    
    const pointLight1 = new THREE.PointLight(0xffffff, 1, 100);
    pointLight1.position.set(20, 20, 20);
    scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0x00ffff, 0.5, 100);
    pointLight2.position.set(-20, -20, -20);
    scene.add(pointLight2);

    // Initialize network
    const nodes = new Map<string, UniverseNode>();
    const edges = new Map<string, WormholeEdge>();
    const packets = new Map<string, InfoPacket>();

    // Create universe nodes
    for (let i = 0; i < params.nodeCount; i++) {
      const node = createUniverseNode(scene);
      nodes.set(node.id, node);
    }

    // Create wormhole connections
    const nodeArray = Array.from(nodes.values());
    for (let i = 0; i < nodeArray.length; i++) {
      for (let j = i + 1; j < nodeArray.length; j++) {
        if (Math.random() < params.connectionProbability) {
          const edge = createWormholeEdge(nodeArray[i], nodeArray[j], scene);
          edges.set(edge.id, edge);
          
          // Update node connections
          nodeArray[i].connections.push(nodeArray[j].id);
          nodeArray[j].connections.push(nodeArray[i].id);
        }
      }
    }

    // Create information packets
    for (let i = 0; i < 10; i++) {
      const startNode = nodeArray[Math.floor(Math.random() * nodeArray.length)];
      const packet = createInfoPacket(startNode, scene);
      packets.set(packet.id, packet);
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    packetsRef.current = packets;

    // GUI
    const gui = new GUI();
    guiRef.current = gui;
    
    const dimFolder = gui.addFolder('Dimensions');
    dimFolder.add(params, 'dimensions', 4, 20, 1).name('Total Dimensions');
    dimFolder.add(params, 'colorDimension', 3, 10, 1).name('Color Dimension');
    dimFolder.add(params, 'sizeDimension', 3, 10, 1).name('Size Dimension');
    dimFolder.add(params, 'showHiddenDimensions').name('Show Hidden Dims');
    dimFolder.open();
    
    const flowFolder = gui.addFolder('Information Flow');
    flowFolder.add(params, 'informationFlow', 0, 1).name('Flow Rate');
    flowFolder.add(params, 'timeEvolution', 0, 0.1).name('Evolution Speed');
    flowFolder.add(params, 'wormholeCurvature', 0, 2).name('Wormhole Curve');
    flowFolder.open();

    const projFolder = gui.addFolder('Projection');
    projFolder.add(params, 'projectionMode', ['pca', 'tsne', 'spherical']).name('Mode');
    projFolder.open();

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      const dt = clockRef.current.getDelta();
      const elapsedTime = clockRef.current.getElapsedTime();
      
      // Update universe nodes
      nodes.forEach(node => {
        node.age += dt;
        evolveHiddenDimensions(node, dt);
        
        // Pulsing based on information content
        if (node.mesh) {
          const pulse = Math.sin(elapsedTime * params.pulseRate + node.age) * 0.5 + 0.5;
          const scale = (1 + node.hiddenCoords[params.sizeDimension]) * (0.9 + pulse * 0.1);
          node.mesh.scale.setScalar(scale);
        }
      });

      // Update wormhole shaders
      edges.forEach(edge => {
        if (edge.throat && edge.throat.material instanceof THREE.ShaderMaterial) {
          edge.throat.material.uniforms.time.value = elapsedTime;
        }
        
        // Animate particle flow through wormholes
        if (edge.flow) {
          const positions = edge.flow.geometry.attributes.position.array as Float32Array;
          const curve = (edge.throat!.geometry as THREE.TubeGeometry).parameters.path;
          
          for (let i = 0; i < positions.length / 3; i++) {
            const t = (i / (positions.length / 3) + elapsedTime * 0.2) % 1;
            const point = curve.getPoint(t);
            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y;
            positions[i * 3 + 2] = point.z;
          }
          
          edge.flow.geometry.attributes.position.needsUpdate = true;
        }
      });

      // Update information packets
      packets.forEach(packet => {
        updatePacket(packet, nodes, edges, dt);
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
        <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Higher-Dimensional Network Topology
        </h2>
        <div className="text-sm space-y-1">
          <p className="text-cyan-400 font-semibold">The true shape of spacetime</p>
          <div className="border-l-2 border-purple-500 pl-2 space-y-1">
            <p className="text-xs">📐 <span className="text-gray-300">Physical: 4D spacetime (3+1)</span></p>
            <p className="text-xs">🔗 <span className="text-gray-300">Topology: Wormhole handles</span></p>
            <p className="text-xs">💾 <span className="text-gray-300">Information: 10+ dimensions</span></p>
            <p className="text-xs">🎨 <span className="text-gray-300">Visual: Color = Dim {params.colorDimension}</span></p>
            <p className="text-xs">📏 <span className="text-gray-300">Visual: Size = Dim {params.sizeDimension}</span></p>
          </div>
          
          <div className="mt-2 pt-2 border-t border-gray-700">
            <p className="text-yellow-400 text-xs">🌌 Nodes = Universe bubbles</p>
            <p className="text-purple-400 text-xs">🌀 Edges = Wormhole throats</p>
            <p className="text-white text-xs">✨ Particles = Information packets</p>
            <p className="text-blue-400 text-xs">🔄 Motion = Evolution in hidden dims</p>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 text-white bg-black/50 p-4 rounded-lg backdrop-blur-sm">
        <div className="text-sm space-y-1">
          <p className="font-semibold">Network Stats</p>
          <p>Universes: {nodesRef.current.size}</p>
          <p>Wormholes: {edgesRef.current.size}</p>
          <p>Info Packets: {packetsRef.current.size}</p>
          <p>Dimensions: {params.dimensions}</p>
        </div>
      </div>
    </div>
  );
};

export default HigherDimensionalNetworkSimulation;

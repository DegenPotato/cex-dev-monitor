/**
 * Matrix Skynet Dashboard - Super Admin Data Command Center
 * A standalone 3D command center for super admins
 */

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useAuth } from '../../contexts/AuthContext';

export function MatrixSkynetScene({ onBack }: { onBack: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const animationIdRef = useRef<number>();
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  
  const [isLoading, setIsLoading] = useState(true);
  
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  
  // Initialize Matrix scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000511);
    scene.fog = new THREE.FogExp2(0x000511, 0.02);
    sceneRef.current = scene;
    
    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(15, 10, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x001122, 0.5);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x00ffff, 2, 50);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);
    
    // Create singularity core
    const createCore = () => {
      const group = new THREE.Group();
      
      // Inner core
      const coreGeometry = new THREE.IcosahedronGeometry(2, 2);
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.8
      });
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      group.add(core);
      
      // Outer shells
      for (let i = 1; i <= 5; i++) {
        const shellGeometry = new THREE.IcosahedronGeometry(2 + i * 0.5, 1);
        const shellMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color(0, 1 - i * 0.15, i * 0.2),
          wireframe: true,
          transparent: true,
          opacity: 0.3
        });
        const shell = new THREE.Mesh(shellGeometry, shellMaterial);
        shell.rotation.x = i * 0.1;
        shell.rotation.y = i * 0.2;
        group.add(shell);
      }
      
      // Particle field
      const particleCount = 5000;
      const particleGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      
      for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const radius = 3 + Math.random() * 3;
        
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);
        
        colors[i * 3] = 0;
        colors[i * 3 + 1] = Math.random() * 0.5 + 0.5;
        colors[i * 3 + 2] = Math.random() * 0.3;
      }
      
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      const particleMaterial = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      group.add(particles);
      
      return group;
    };
    
    const singularity = createCore();
    scene.add(singularity);
    
    // Create neural nodes
    const nodeColors = [0x00ff00, 0x0088ff, 0xff00ff, 0xffffff, 0xff0000, 0x8800ff];
    const nodePositions = [
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(-10, 0, 0),
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(7, 7, 7),
      new THREE.Vector3(-7, -7, -7)
    ];
    
    const nodes: THREE.Mesh[] = [];
    nodeColors.forEach((color, index) => {
      const geometry = new THREE.OctahedronGeometry(1, 0);
      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        wireframe: true
      });
      const node = new THREE.Mesh(geometry, material);
      node.position.copy(nodePositions[index]);
      scene.add(node);
      nodes.push(node);
    });
    
    // Create data streams between nodes
    nodes.forEach((node1, i) => {
      nodes.forEach((node2, j) => {
        if (i < j && Math.random() > 0.6) {
          const points = [];
          points.push(node1.position);
          points.push(node2.position);
          
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.3
          });
          
          const line = new THREE.Line(geometry, material);
          scene.add(line);
        }
      });
    });
    
    // Matrix rain background
    const createMatrixRain = () => {
      const geometry = new THREE.PlaneGeometry(100, 100);
      const material = new THREE.MeshBasicMaterial({
        color: 0x003300,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
      });
      const rain = new THREE.Mesh(geometry, material);
      rain.position.z = -30;
      return rain;
    };
    
    const matrixRain = createMatrixRain();
    scene.add(matrixRain);
    
    // Animation
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      const elapsedTime = clockRef.current.getElapsedTime();
      
      // Rotate singularity
      singularity.rotation.y = elapsedTime * 0.1;
      singularity.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh) {
          child.rotation.x = elapsedTime * (0.1 + i * 0.02);
          child.rotation.y = elapsedTime * (0.15 - i * 0.01);
        }
      });
      
      // Pulse nodes
      nodes.forEach((node, i) => {
        const scale = 1 + Math.sin(elapsedTime * 3 + i * 0.5) * 0.1;
        node.scale.setScalar(scale);
        node.rotation.y = elapsedTime * 0.2;
      });
      
      // Camera orbit
      camera.position.x = Math.sin(elapsedTime * 0.1) * 20;
      camera.position.z = Math.cos(elapsedTime * 0.1) * 20;
      camera.lookAt(0, 0, 0);
      
      renderer.render(scene, camera);
    };
    
    // Start animation after a delay
    setTimeout(() => {
      setIsLoading(false);
      animate();
    }, 1000);
    
    // Handle resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
      scene.clear();
    };
  }, []);
  
  return (
    <div ref={mountRef} className="fixed inset-0 w-full h-full">
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="absolute top-8 left-8 px-6 py-3 bg-black/50 border border-green-500 text-green-500 
                     hover:bg-green-500/20 transition-all duration-300 pointer-events-auto
                     font-mono text-sm tracking-wider"
        >
          ← EXIT MATRIX
        </button>
        
        {/* Title */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
          <h1 className="text-4xl font-bold text-green-500 font-mono tracking-wider 
                         animate-pulse drop-shadow-[0_0_10px_rgba(0,255,0,0.5)]">
            MATRIX SKYNET
          </h1>
          <p className="text-green-400 font-mono text-sm mt-2">
            SUPER ADMIN COMMAND CENTER
          </p>
        </div>
        
        {/* Status Panel */}
        <div className="absolute bottom-8 left-8 bg-black/80 border border-green-500/30 rounded p-4 pointer-events-auto">
          <div className="text-green-400 font-mono text-sm space-y-2">
            <div>STATUS: <span className="text-green-500">ONLINE</span></div>
            <div>NODES: <span className="text-green-500">6 ACTIVE</span></div>
            <div>STREAMS: <span className="text-green-500">CONNECTED</span></div>
            <div>USER: <span className="text-green-500">{user?.username?.toUpperCase() || 'UNKNOWN'}</span></div>
          </div>
        </div>
        
        {/* Loading Screen */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto">
            <div className="text-center">
              <div className="text-green-500 text-6xl mb-8 animate-pulse">⟨⟩</div>
              <div className="text-green-400 font-mono text-xl mb-4">INITIALIZING MATRIX...</div>
              <div className="text-green-300 font-mono text-sm">
                <span className="inline-block animate-pulse">LOADING NEURAL NETWORK</span>
                <span className="inline-block ml-2">
                  <span className="animate-pulse delay-100">.</span>
                  <span className="animate-pulse delay-200">.</span>
                  <span className="animate-pulse delay-300">.</span>
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Access Denied */}
        {!isSuperAdmin && !isLoading && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center pointer-events-auto">
            <div className="text-center p-8 border-2 border-red-500 bg-black/50">
              <div className="text-red-500 text-6xl mb-4">⚠</div>
              <h2 className="text-red-500 font-mono text-2xl mb-4">ACCESS DENIED</h2>
              <p className="text-red-400 font-mono mb-2">INSUFFICIENT CLEARANCE</p>
              <p className="text-red-300 font-mono text-sm">
                Required: SUPER_ADMIN | Current: {user?.role?.toUpperCase() || 'NONE'}
              </p>
            </div>
          </div>
        )}
        
        {/* Data Flow Info */}
        <div className="absolute top-24 right-8 bg-black/80 border border-green-500/30 rounded p-4 max-w-xs pointer-events-auto">
          <h3 className="text-green-400 font-mono text-lg mb-3">NEURAL NODES</h3>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500"></div>
              <span className="text-green-400">Wallet Tracker</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500"></div>
              <span className="text-green-400">Token Monitor</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500"></div>
              <span className="text-green-400">Transaction Flow</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-white"></div>
              <span className="text-green-400">Analytics Core</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500"></div>
              <span className="text-green-400">Alert System</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-700"></div>
              <span className="text-green-400">AI Processor</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
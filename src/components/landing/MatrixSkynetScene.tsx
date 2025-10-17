/**
 * Matrix Skynet Dashboard - Super Admin Data Command Center
 * A standalone 3D command center for super admins
 */

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { useAuth } from '../../contexts/AuthContext';
import { gsap } from 'gsap';

export function MatrixSkynetScene({ onBack }: { onBack: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<OrbitControls>();
  const animationIdRef = useRef<number>();
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const singularityRef = useRef<THREE.Group>();
  const nodesRef = useRef<THREE.Mesh[]>([]);
  const dataStreamsRef = useRef<THREE.Line[]>([]);
  const composerRef = useRef<EffectComposer>();
  const whiteHoleRef = useRef<THREE.Group>();
  const currentNodeRef = useRef<number>(0); // Track current focused node
  
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);
  
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  
  // Initialize Matrix scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000511); // Very dark blue-green
    scene.fog = new THREE.FogExp2(0x000511, 0.008); // Lighter fog for better visibility
    sceneRef.current = scene;
    
    // Camera - Start near the white hole boundary (just entered the universe)
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200 // Increased far plane to see the distant horizon
    );
    // Start near the boundary, looking inward toward the center
    camera.position.set(0, 5, 45); // Close to max distance (50)
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);
    
    // Post-processing for bloom effect
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Subtle bloom for UI elements
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,  // strength - reduced for comfort
      0.4,  // radius
      0.9   // threshold - higher to only bloom bright elements
    );
    composer.addPass(bloomPass);
    composerRef.current = composer;
    
    // OrbitControls - locked to nodes, no free movement
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 8;  // Can't get too close to a node
    controls.maxDistance = 25; // Limited zoom out for focused view
    controls.enablePan = false; // No panning - only rotation around node
    controls.enabled = false; // Disabled during entry animation
    controlsRef.current = controls;
    
    /**
     * NODE-BASED NAVIGATION SYSTEM:
     * - Camera locked to orbit around selected nodes
     * - No free movement - structured navigation only
     * - Each node represents a different data system
     * - Navigate between nodes with keyboard or UI controls
     * - Zoom and rotate around the focused node
     * - Clean, focused interface for data exploration
     **/
    
    // Create COSMIC BACKGROUND RADIATION FIELD - The infinite Matrix universe
    // Inspired by CMB (Cosmic Microwave Background) - omnidirectional ancient energy
    const createCosmicBackground = () => {
      const group = new THREE.Group();
      
      // Custom shader for subtle cosmic radiation glow
      const whiteHoleShader = {
        uniforms: {
          time: { value: 0 },
          color: { value: new THREE.Color(0xffffff) },
          glowColor: { value: new THREE.Color(0x00ffff) }
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vPosition;
          uniform float time;
          
          void main() {
            vUv = uv;
            vPosition = position;
            
            // Pulsating effect
            vec3 pos = position;
            float pulse = sin(time * 2.0) * 0.1 + 1.0;
            pos *= pulse;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform vec3 color;
          uniform vec3 glowColor;
          varying vec2 vUv;
          varying vec3 vPosition;
          
          // Simplex noise for organic fluctuations
          float noise(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(mix(0.0, 1.0, f.x), mix(1.0, 0.0, f.x), f.y),
              mix(mix(1.0, 0.0, f.x), mix(0.0, 1.0, f.x), f.y),
              f.z
            );
          }
          
          void main() {
            // Cosmic noise pattern
            vec3 noisePos = vPosition * 0.05 + vec3(time * 0.1);
            float n1 = noise(noisePos);
            float n2 = noise(noisePos * 2.0 + 100.0);
            float n3 = noise(noisePos * 4.0 + 200.0);
            
            // Layered cosmic radiation
            float cosmic = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
            
            // Very subtle pulsing
            float pulse = sin(time * 0.5) * 0.05 + 0.95;
            
            // Final color - very subtle green tint on dark background
            vec3 bgColor = vec3(0.0, 0.01, 0.005); // Near black with hint of green
            vec3 radiationColor = vec3(0.0, 0.15, 0.1) * cosmic * pulse;
            vec3 finalColor = bgColor + radiationColor;
            
            // Very low alpha for subtlety
            float alpha = 0.15 + cosmic * 0.1;
            
            gl_FragColor = vec4(finalColor, alpha);
          }
        `
      };
      
      // Large sphere for cosmic background - very subtle, almost invisible
      const bgGeometry = new THREE.SphereGeometry(150, 32, 32);
      const bgMaterial = new THREE.ShaderMaterial({
        uniforms: whiteHoleShader.uniforms,
        vertexShader: whiteHoleShader.vertexShader,
        fragmentShader: whiteHoleShader.fragmentShader,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const cosmicBg = new THREE.Mesh(bgGeometry, bgMaterial);
      group.add(cosmicBg);
      
      // Sparse cosmic dust particles throughout space
      const particleCount = 2000; // Reduced for subtlety
      const particleGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);
      
      for (let i = 0; i < particleCount; i++) {
        // Distribute particles throughout the entire space volume
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const radius = Math.random() * 120 + 10; // Random distances from 10 to 130
        
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);
        
        // Very dim particles - just hints of light
        const brightness = Math.random() * 0.3 + 0.1; // 0.1 to 0.4
        colors[i * 3] = brightness * 0.5; // Slightly less red
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness * 0.8; // Slightly less blue
        
        sizes[i] = Math.random() * 2 + 0.5; // Smaller particles
      }
      
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      
      const particleMaterial = new THREE.PointsMaterial({
        size: 0.05, // Smaller for distant stars effect
        vertexColors: true,
        transparent: true,
        opacity: 0.4, // Much dimmer for comfort
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      group.add(particles);
      
      return group;
    };
    
    const cosmicBackground = createCosmicBackground();
    cosmicBackground.position.set(0, 0, 0);
    whiteHoleRef.current = cosmicBackground;
    scene.add(cosmicBackground);
    
    // Softer lighting for better user experience
    const ambientLight = new THREE.AmbientLight(0x001122, 0.3); // Reduced intensity
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x00ffff, 1, 40); // Softer glow
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);
    
    // Add subtle fill light to prevent harsh shadows
    const fillLight = new THREE.PointLight(0x002244, 0.5, 30);
    fillLight.position.set(-10, -5, 10);
    scene.add(fillLight);
    
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
    singularityRef.current = singularity;
    singularity.scale.set(0, 0, 0); // Start hidden
    singularity.position.set(0, 0, 0); // At white hole center
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
      node.position.set(0, 0, 0); // Start at center
      node.scale.set(0, 0, 0); // Start hidden
      node.userData.targetPosition = nodePositions[index]; // Store target position
      scene.add(node);
      nodes.push(node);
    });
    nodesRef.current = nodes; // Store reference
    
    // Data streams will be created after nodes are positioned
    const dataStreams: THREE.Line[] = [];
    dataStreamsRef.current = dataStreams;
    
    // NODE NAVIGATION FUNCTIONS
    const focusOnNode = (nodeIndex: number, duration: number = 1) => {
      if (!nodesRef.current[nodeIndex] || !controlsRef.current) return;
      
      const node = nodesRef.current[nodeIndex];
      currentNodeRef.current = nodeIndex;
      
      // Update OrbitControls target to the node position
      gsap.to(controlsRef.current.target, {
        x: node.position.x,
        y: node.position.y,
        z: node.position.z,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => { controlsRef.current?.update(); }
      });
      
      // Move camera to a good viewing position relative to the node
      const cameraOffset = new THREE.Vector3(10, 5, 10);
      const targetCameraPos = node.position.clone().add(cameraOffset);
      
      gsap.to(camera.position, {
        x: targetCameraPos.x,
        y: targetCameraPos.y,
        z: targetCameraPos.z,
        duration,
        ease: 'power2.inOut'
      });
      
      // Highlight the focused node
      nodesRef.current.forEach((n, i) => {
        const material = n.material as THREE.MeshPhongMaterial;
        gsap.to(material, {
          emissiveIntensity: i === nodeIndex ? 0.6 : 0.3,
          duration: 0.5
        });
      });
    };
    
    // Navigate to next/previous node
    const navigateNode = (direction: 'next' | 'prev') => {
      let newIndex = currentNodeRef.current;
      if (direction === 'next') {
        newIndex = (newIndex + 1) % nodesRef.current.length;
      } else {
        newIndex = (newIndex - 1 + nodesRef.current.length) % nodesRef.current.length;
      }
      setCurrentNodeIndex(newIndex);
      focusOnNode(newIndex);
    };
    
    // ENTRY ANIMATION - Dashboard initialization sequence
    const runEmergenceAnimation = () => {
      console.log('📊 Initializing 3D dashboard...');
      
      const tl = gsap.timeline({
        onComplete: () => {
          console.log('✨ Dashboard ready!');
          setIsTransitioning(false);
          
          // Enable controls and focus on first node
          if (controlsRef.current) {
            controlsRef.current.enabled = true;
            console.log('🎮 Node navigation enabled!');
            // Focus on the first node after transition
            setTimeout(() => focusOnNode(0, 1.5), 500);
          }
          
          // Create data streams after nodes are in position
          nodes.forEach((node1, i) => {
            nodes.forEach((node2, j) => {
              if (i < j && Math.random() > 0.6) {
                const points = [];
                points.push(node1.userData.targetPosition);
                points.push(node2.userData.targetPosition);
                
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({
                  color: 0x00ffff,
                  transparent: true,
                  opacity: 0
                });
                
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                dataStreams.push(line);
                
                // Fade in data streams
                gsap.to(material, {
                  opacity: 0.3,
                  duration: 1,
                  delay: Math.random() * 0.5
                });
              }
            });
          });
        }
      });
      
      // Phase 1: Disoriented entry - spin slightly while stabilizing
      tl.to(camera.position, {
        x: 2,
        y: 8,
        z: 40,
        duration: 2,
        ease: 'power2.out',
        onUpdate: () => camera.lookAt(0, 0, 0)
      })
      
      // Phase 2: Singularity core materializes
      .to(singularity.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 1.5,
        ease: 'back.out(1.7)'
      }, '-=0.5')
      
      // Phase 3: Move camera to observation position
      .to(camera.position, {
        x: 15,
        y: 10,
        z: 15,
        duration: 3,
        ease: 'power2.inOut',
        onUpdate: () => camera.lookAt(0, 0, 0)
      }, '-=0.5')
      
      // Phase 4: Neural nodes shoot out from white hole
      .add(() => {
        nodes.forEach((node, i) => {
          // Scale up
          gsap.to(node.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.5,
            delay: i * 0.1,
            ease: 'back.out(2)'
          });
          
          // Move to target position
          gsap.to(node.position, {
            x: node.userData.targetPosition.x,
            y: node.userData.targetPosition.y,
            z: node.userData.targetPosition.z,
            duration: 1.5,
            delay: i * 0.1,
            ease: 'power2.out'
          });
        });
      }, '-=2')
      
      // Phase 5: Dashboard fully operational
      .to({}, {
        duration: 1,
        onStart: () => {
          console.log('🟢 All systems operational - dashboard active');
        }
      }, '-=1');
    };
    
    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      const elapsedTime = clockRef.current.getElapsedTime();
      
      // Update controls
      if (controls.enabled) {
        controls.update();
      }
      
      // Animate COSMIC BACKGROUND - subtle ambient effects
      if (whiteHoleRef.current) {
        // Update shader time for subtle fluctuations
        const cosmicSphere = whiteHoleRef.current.children[0] as THREE.Mesh;
        if (cosmicSphere && cosmicSphere.material && 'uniforms' in cosmicSphere.material) {
          (cosmicSphere.material as THREE.ShaderMaterial).uniforms.time.value = elapsedTime;
        }
        
        // Very slow rotation for cosmic dust
        const particles = whiteHoleRef.current.children[1] as THREE.Points;
        if (particles) {
          particles.rotation.y = elapsedTime * 0.01; // Very slow drift
          particles.rotation.x = elapsedTime * 0.005;
        }
      }
      
      // Update focused node glow effect
      if (nodesRef.current[currentNodeRef.current]) {
        const focusedNode = nodesRef.current[currentNodeRef.current];
        const glowIntensity = 0.5 + Math.sin(elapsedTime * 2) * 0.1;
        const material = focusedNode.material as THREE.MeshPhongMaterial;
        material.emissiveIntensity = glowIntensity;
      }
      
      // Rotate singularity
      if (singularityRef.current) {
        singularityRef.current.rotation.y = elapsedTime * 0.1;
        singularityRef.current.children.forEach((child, i) => {
          if (child instanceof THREE.Mesh) {
            child.rotation.x = elapsedTime * (0.1 + i * 0.02);
            child.rotation.y = elapsedTime * (0.15 - i * 0.01);
          }
        });
      }
      
      // Pulse nodes only after transition
      if (!isTransitioning && nodesRef.current) {
        nodesRef.current.forEach((node, i) => {
          if (node.scale.x > 0) {
            const baseScale = node.scale.x;
            const scale = baseScale * (1 + Math.sin(elapsedTime * 3 + i * 0.5) * 0.1);
            node.scale.setScalar(scale);
            node.rotation.y = elapsedTime * 0.2;
          }
        });
      }
      
      // Render with post-processing
      if (composerRef.current) {
        composerRef.current.render();
      }
    };
    
    // Start emergence animation after a short delay
    setTimeout(() => {
      setIsLoading(false);
      animate();
      setTimeout(() => {
        runEmergenceAnimation();
      }, 500);
    }, 1000);
    
    // Handle resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
      
      // Update composer size
      if (composerRef.current) {
        composerRef.current.setSize(width, height);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!controlsRef.current?.enabled || isTransitioning) return;
      
      switch(e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          navigateNode('next');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          navigateNode('prev');
          break;
        case ' ': // Spacebar to reset camera position for current node
          focusOnNode(currentNodeRef.current, 1);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      
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
      {/* Matrix CRT Scan Line Effect */}
      <div className="absolute inset-0 pointer-events-none z-[60]">
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.03) 2px, rgba(0, 255, 0, 0.03) 4px)',
            animation: 'scan 8s linear infinite'
          }}
        />
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)',
          }}
        />
      </div>
      
      {/* Glitch Effect Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none z-[61] mix-blend-screen opacity-20"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(0, 255, 0, 0.1), transparent)',
          animation: 'glitch 5s steps(2, end) infinite'
        }}
      />
      
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        {/* Back Button - Only show after transition */}
        {!isTransitioning && (
          <button
            onClick={onBack}
            className="absolute top-8 left-8 px-6 py-3 bg-black/50 border border-green-500 text-green-500 
                       hover:bg-green-500/20 transition-all duration-300 pointer-events-auto
                       font-mono text-sm tracking-wider animate-in fade-in slide-in-from-left duration-500"
          >
            ← EXIT MATRIX
          </button>
        )}
        
        {/* Title with Matrix Glitch Effect */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
          <div className="relative">
            <h1 className="text-5xl font-bold text-green-500 font-mono tracking-[0.3em] 
                           drop-shadow-[0_0_20px_rgba(0,255,0,0.8)]"
                style={{ animation: 'flicker 3s infinite' }}>
              MATRIX SKYNET
            </h1>
            {/* Glitch shadow layers */}
            <h1 className="absolute top-0 left-0 text-5xl font-bold text-cyan-400 font-mono tracking-[0.3em] opacity-30"
                style={{ 
                  animation: 'glitch 2s infinite',
                  clipPath: 'polygon(0 0, 100% 0, 100% 45%, 0 45%)'
                }}>
              MATRIX SKYNET
            </h1>
            <h1 className="absolute top-0 left-0 text-5xl font-bold text-red-400 font-mono tracking-[0.3em] opacity-30"
                style={{ 
                  animation: 'glitch 1.5s infinite reverse',
                  clipPath: 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)'
                }}>
              MATRIX SKYNET
            </h1>
          </div>
          <p className="text-green-400 font-mono text-xs mt-3 tracking-widest opacity-80">
            ⟨ SUPER ADMIN COMMAND CENTER ⟩
          </p>
          <div className="text-green-500 font-mono text-xs mt-1 opacity-60">
            [ NEURAL NETWORK ACTIVE ]<br/>
            <span className="text-green-400/40 text-[10px]">• 3D DATA VISUALIZATION DASHBOARD •</span>
          </div>
        </div>
        
        {/* Status Panel - Show after transition */}
        {!isTransitioning && (
          <div className="absolute bottom-8 left-8 bg-black/80 border border-green-500/30 rounded p-4 pointer-events-auto
                          animate-in fade-in slide-in-from-bottom duration-500">
            <div className="text-green-400 font-mono text-sm space-y-2">
              <div>STATUS: <span className="text-green-500">ONLINE</span></div>
              <div>NODES: <span className="text-green-500">6 ACTIVE</span></div>
              <div>STREAMS: <span className="text-green-500">CONNECTED</span></div>
              <div>USER: <span className="text-green-500">{user?.username?.toUpperCase() || 'UNKNOWN'}</span></div>
            </div>
          </div>
        )}
        
        {/* Navigation Controls Info - Show after transition */}
        {!isTransitioning && (
          <div className="absolute bottom-8 right-8 bg-black/80 border border-green-500/30 rounded p-4
                          animate-in fade-in slide-in-from-bottom duration-500 delay-300">
            <div className="text-green-400 font-mono text-sm space-y-1">
              <div className="text-green-500 mb-2">🎮 NODE NAVIGATION</div>
              <div>• A/←: Previous Node</div>
              <div>• D/→: Next Node</div>
              <div>• SPACE: Reset View</div>
              <div className="mt-2 pt-2 border-t border-green-500/20">
                <div className="text-green-500 mb-1">🔄 ORBIT CONTROLS</div>
                <div>• DRAG: Rotate around node</div>
                <div>• SCROLL: Zoom in/out</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Current Node Display */}
        {!isTransitioning && (
          <div className="absolute top-24 left-8 bg-black/80 border border-green-500/30 rounded p-4 pointer-events-auto
                          animate-in fade-in slide-in-from-left duration-500">
            <div className="text-green-400 font-mono">
              <div className="text-green-500 text-lg mb-2">FOCUSED NODE</div>
              <div className="text-2xl font-bold text-green-300">
                {['WALLET TRACKER', 'TOKEN MONITOR', 'TRANSACTION FLOW', 
                  'ANALYTICS CORE', 'ALERT SYSTEM', 'AI PROCESSOR'][currentNodeIndex]}
              </div>
              <div className="text-xs text-green-500/60 mt-2">
                Node {currentNodeIndex + 1} of 6
              </div>
            </div>
          </div>
        )}
        
        {/* Entry Transition Screen */}
        {isTransitioning && !isLoading && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-green-400 font-mono text-2xl mb-4 animate-pulse">
                INITIALIZING DASHBOARD
              </div>
              <div className="text-green-300 font-mono text-sm mb-2">
                <span className="inline-block animate-pulse">LOADING DATA VISUALIZATION</span>
                <span className="inline-block ml-2">
                  <span className="animate-pulse delay-100">.</span>
                  <span className="animate-pulse delay-200">.</span>
                  <span className="animate-pulse delay-300">.</span>
                </span>
              </div>
              <div className="text-green-500/60 font-mono text-xs">
                [ SYSTEMS: ONLINE ]<br/>
                [ NODES: CONFIGURING ]<br/>
                [ STATUS: ENTERING COMMAND CENTER ]
              </div>
            </div>
          </div>
        )}
        
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
        
        {/* Node List - Show all nodes with current highlighted */}
        {!isTransitioning && (
          <div className="absolute top-24 right-8 bg-black/80 border border-green-500/30 rounded p-4 max-w-xs pointer-events-auto
                          animate-in fade-in slide-in-from-right duration-500">
            <h3 className="text-green-400 font-mono text-lg mb-3">NEURAL NODES</h3>
            <div className="space-y-2 text-sm font-mono">
              {[
                { color: 'bg-green-500', name: 'Wallet Tracker' },
                { color: 'bg-blue-500', name: 'Token Monitor' },
                { color: 'bg-purple-500', name: 'Transaction Flow' },
                { color: 'bg-white', name: 'Analytics Core' },
                { color: 'bg-red-500', name: 'Alert System' },
                { color: 'bg-purple-700', name: 'AI Processor' }
              ].map((node, index) => (
                <div 
                  key={index}
                  className={`flex items-center gap-2 transition-all ${
                    index === currentNodeIndex ? 'scale-110 ml-2' : ''
                  }`}
                >
                  <div className={`w-3 h-3 ${node.color} ${
                    index === currentNodeIndex ? 'animate-pulse' : ''
                  }`}></div>
                  <span className={`${
                    index === currentNodeIndex 
                      ? 'text-green-300 font-bold' 
                      : 'text-green-400'
                  }`}>
                    {node.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Matrix Animation Styles */}
      <style>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        
        @keyframes glitch {
          0%, 90%, 100% { transform: translateX(0); }
          92% { transform: translateX(-2px); }
          94% { transform: translateX(2px); }
          96% { transform: translateX(-1px); }
        }
        
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
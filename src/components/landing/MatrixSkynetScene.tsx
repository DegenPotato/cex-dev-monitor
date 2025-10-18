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
import { useExperienceSettings } from '../../contexts/ExperienceSettingsContext';
import { useYouTubeAudio } from '../../contexts/YouTubeAudioContext';
import { useAudio } from '../../contexts/AudioContext';
import { HudContainer, ExperienceModeToggle } from '../hud';
import { ComprehensiveMusicPlayer } from '../music/ComprehensiveMusicPlayer';
import { getAdaptiveQualitySettings, getOptimalParticleCount } from '../../utils/performance';
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
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [showNexusInterface, setShowNexusInterface] = useState(false);
  
  // Node navigation functions (moved outside useEffect for accessibility)
  const focusOnNodeRef = useRef<(nodeIndex: number, duration?: number) => void>();
  const navigateNodeRef = useRef<(direction: 'next' | 'prev') => void>();
  
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const { isAuthenticated: isYouTubeConnected, userEmail: youtubeEmail, signIn: connectGoogle } = useYouTubeAudio();
  const {
    // Source
    audioSource,
    setAudioSource,
    // Playback state
    isPlaying,
    volume,
    distortionEnabled,
    currentTrack,
    currentTime,
    duration,
    // Playlist
    playlist,
    currentTrackIndex,
    // Effects
    bassLevel,
    trebleLevel,
    distortionAmount,
    // Modes
    shuffleEnabled,
    repeatMode,
    // Controls
    togglePlayPause,
    setVolume,
    toggleDistortion,
    setBassLevel,
    setTrebleLevel,
    setDistortionAmount,
    nextTrack,
    previousTrack,
    seekTo,
    toggleShuffle,
    setRepeatMode,
    selectTrack
  } = useAudio();
  
  // Debug logging
  useEffect(() => {
    console.log('🔮 Matrix Scene - User:', user);
    console.log('🔮 Matrix Scene - User wallet:', user?.wallet_address);
    console.log('🔮 Matrix Scene - User username:', user?.username);
    console.log('🔮 Matrix Scene - Is Super Admin:', isSuperAdmin);
  }, [user, isSuperAdmin]);
  
  // Experience Settings Integration
  const { settings, getQualityMultiplier, shouldReduceEffects } = useExperienceSettings();
  const qualityMultiplier = getQualityMultiplier();
  const reduceEffects = shouldReduceEffects();
  
  // Initialize Matrix scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Get adaptive quality settings
    const qualitySettings = getAdaptiveQualitySettings(
      qualityMultiplier,
      settings.reducedMotion,
      settings.performanceMode
    );
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000208); // Almost black for digital contrast
    scene.fog = new THREE.FogExp2(0x000511, 0.005); // Very light fog to preserve digital effects
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
    
    // Bloom pass - adaptive based on quality settings
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      qualitySettings.bloomStrength,  // Strength
      0.4,  // Radius
      0.85  // Threshold
    );
    composer.addPass(bloomPass);
    composerRef.current = composer;
    
    // OrbitControls - enhanced navigation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;   // Allow closer zoom
    controls.maxDistance = 40;  // Allow more zoom out
    controls.enablePan = true;  // Enable panning
    controls.enableRotate = true; // Enable rotation
    controls.enableZoom = true;  // Enable zoom
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
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
    
    // Create DIGITAL UNIVERSE SHELL - The cyberspace environment
    // A vibrant digital world with grid patterns, data streams, and energy flows
    const createDigitalUniverse = () => {
      const group = new THREE.Group();
      
      // Custom shader for digital universe with grid and data flows - DISABLED (shell removed)
      // Keeping commented for potential future use
      /*
      const digitalUniverseShader = {
        uniforms: {
          time: { value: 0 },
          color: { value: new THREE.Color(0xffffff) },
          glowColor: { value: new THREE.Color(0x00ffff) }
        },
        vertexShader: `...`,
        fragmentShader: `...`
      };
      */
      
      // Large sphere for digital universe shell - DISABLED (too noisy/distracting)
      // const bgGeometry = new THREE.SphereGeometry(150, 64, 64);
      // const bgMaterial = new THREE.ShaderMaterial({
      //   uniforms: digitalUniverseShader.uniforms,
      //   vertexShader: digitalUniverseShader.vertexShader,
      //   fragmentShader: digitalUniverseShader.fragmentShader,
      //   transparent: true,
      //   side: THREE.BackSide,
      //   blending: THREE.AdditiveBlending,
      //   depthWrite: false
      // });
      // const digitalShell = new THREE.Mesh(bgGeometry, bgMaterial);
      // group.add(digitalShell);
      
      // DATA NODES - floating data points throughout cyberspace
      const particleCount = getOptimalParticleCount(3000, qualityMultiplier); // Adaptive particles
      const particleGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);
      
      for (let i = 0; i < particleCount; i++) {
        // Distribute data nodes throughout cyberspace
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const radius = Math.random() * 120 + 10;
        
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);
        
        // Bright cyan/green data points
        const colorType = Math.random();
        if (colorType < 0.5) {
          // Cyan
          colors[i * 3] = 0.0;
          colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
          colors[i * 3 + 2] = 0.6 + Math.random() * 0.4;
        } else {
          // Green
          colors[i * 3] = 0.0;
          colors[i * 3 + 1] = 0.6 + Math.random() * 0.4;
          colors[i * 3 + 2] = 0.2 + Math.random() * 0.3;
        }
        
        sizes[i] = Math.random() * 3 + 1;
      }
      
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      
      const particleMaterial = new THREE.PointsMaterial({
        size: 0.15, // Larger for visibility
        vertexColors: true,
        transparent: true,
        opacity: 0.8, // Bright data nodes
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      group.add(particles);
      
      return group;
    };
    
    const digitalUniverse = createDigitalUniverse();
    digitalUniverse.position.set(0, 0, 0);
    whiteHoleRef.current = digitalUniverse;
    scene.add(digitalUniverse);
    
    // Dynamic lighting for digital environment
    const ambientLight = new THREE.AmbientLight(0x002233, 0.4);
    scene.add(ambientLight);
    
    // Primary cyan light from above
    const primaryLight = new THREE.PointLight(0x00ffff, 2, 50);
    primaryLight.position.set(0, 15, 0);
    scene.add(primaryLight);
    
    // Secondary green accent light
    const accentLight = new THREE.PointLight(0x00ff66, 1.5, 40);
    accentLight.position.set(-15, 5, 15);
    scene.add(accentLight);
    
    // Fill light for depth
    const fillLight = new THREE.PointLight(0x0066ff, 1, 35);
    fillLight.position.set(10, -8, -10);
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
      
      // Particle field - adaptive based on quality settings
      const particleCount = getOptimalParticleCount(5000, qualityMultiplier);
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
    scene.add(singularity);
    
    // Create NEURAL NETWORK NODES
    const nodeConfigs = [
      { name: 'The Nexus', color: 0x00ff00, position: new THREE.Vector3(0, 0, 0), isSource: true }, // Central data source
      { name: 'Token Monitor', color: 0x00ffff, position: new THREE.Vector3(10, 5, -5) },
      { name: 'Transaction Flow', color: 0xff00ff, position: new THREE.Vector3(-10, 3, 5) },
      { name: 'Analytics Core', color: 0xffffff, position: new THREE.Vector3(5, -5, 10) },
      { name: 'Alert System', color: 0xff0000, position: new THREE.Vector3(-5, 8, -10) },
      { name: 'AI Processor', color: 0x9900ff, position: new THREE.Vector3(0, -8, 0) },
      { name: 'Account Manager', color: 0x00ff99, position: new THREE.Vector3(12, 0, 8) }, // Secure node
      { name: 'Music Player', color: 0xff1493, position: new THREE.Vector3(-8, -6, 12), isMusic: true } // Music node - deep pink
    ];
    
    const nodes: THREE.Mesh[] = [];
    
    nodeConfigs.forEach((config) => {
      // Enhanced design for special nodes
      const isNexus = config.isSource;
      const isMusic = (config as any).isMusic;
      const geometry = isNexus 
        ? new THREE.IcosahedronGeometry(2.5, 2) // Larger, more complex geometry
        : isMusic
        ? new THREE.SphereGeometry(1.8, 32, 16) // Smooth sphere for music
        : new THREE.OctahedronGeometry(1.5);
      
      const material = new THREE.MeshPhongMaterial({
        color: config.color,
        emissive: config.color,
        emissiveIntensity: isNexus ? 0.6 : isMusic ? 0.5 : 0.3,
        wireframe: !isMusic, // Music node is solid
        opacity: isNexus || isMusic ? 1.0 : 0.8,
        transparent: !isNexus && !isMusic
      });
      
      const node = new THREE.Mesh(geometry, material);
      node.position.set(0, 0, 0); // Start at center
      node.scale.set(0, 0, 0); // Start hidden
      node.userData.targetPosition = config.position; // Store target position
      node.userData.name = config.name;
      node.userData.isNexus = isNexus;
      node.userData.isMusic = isMusic;
      
      // Add special effects for unique nodes
      if (isNexus) {
        const ringGeometry = new THREE.TorusGeometry(3.5, 0.2, 16, 100);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        node.add(ring);
        node.userData.energyRing = ring;
      } else if (isMusic) {
        // Add sound wave rings for music node
        for (let i = 0; i < 3; i++) {
          const waveGeometry = new THREE.TorusGeometry(2.5 + i * 0.5, 0.1, 8, 32);
          const waveMaterial = new THREE.MeshBasicMaterial({
            color: 0xff1493,
            transparent: true,
            opacity: 0.3 - i * 0.1,
            blending: THREE.AdditiveBlending
          });
          const wave = new THREE.Mesh(waveGeometry, waveMaterial);
          wave.rotation.x = Math.PI / 2;
          wave.userData.waveIndex = i;
          node.add(wave);
        }
      }
      
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
      setCurrentNodeIndex(nodeIndex);
      
      // Show appropriate interface based on selected node
      setShowNexusInterface(nodeIndex === 0);  // The Nexus
      setShowAccountManager(nodeIndex === 6);  // Account Manager
      setShowMusicPlayer(nodeIndex === 7);     // Music Player
      
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
      focusOnNode(newIndex);
    };
    
    // Store functions in refs for keyboard handler access
    focusOnNodeRef.current = focusOnNode;
    navigateNodeRef.current = navigateNode;
    
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
            console.log('📷 Controls state:', {
              enabled: controlsRef.current.enabled,
              enableRotate: controlsRef.current.enableRotate,
              enableZoom: controlsRef.current.enableZoom,
              enablePan: controlsRef.current.enablePan,
              enableDamping: controlsRef.current.enableDamping
            });
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
      
      // Always update controls for damping to work
      controls.update();
      
      // Animate DIGITAL UNIVERSE SHELL - DISABLED (shell removed)
      if (whiteHoleRef.current) {
        // Digital shell animation disabled
        // const digitalShell = whiteHoleRef.current.children[0] as THREE.Mesh;
        // if (digitalShell && digitalShell.material && 'uniforms' in digitalShell.material) {
        //   (digitalShell.material as THREE.ShaderMaterial).uniforms.time.value = elapsedTime;
        // }
        
        // Slow rotation still applied to the group
        whiteHoleRef.current.rotation.y = elapsedTime * 0.02;
        
        // Animate data nodes - twinkling effect (now children[0] since shell removed)
        const dataNodes = whiteHoleRef.current.children[0] as THREE.Points;
        if (dataNodes) {
          dataNodes.rotation.y = elapsedTime * 0.03;
          dataNodes.rotation.x = Math.sin(elapsedTime * 0.5) * 0.1;
          
          // Pulse effect on particle sizes
          const material = dataNodes.material as THREE.PointsMaterial;
          material.size = 0.15 + Math.sin(elapsedTime * 2) * 0.05;
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
      
      // Animate The Nexus energy ring (data source)
      if (nodesRef.current[0] && nodesRef.current[0].userData.isNexus) {
        const nexusNode = nodesRef.current[0];
        const energyRing = nexusNode.userData.energyRing;
        
        if (energyRing) {
          // Rotate the energy ring
          energyRing.rotation.z = elapsedTime * 0.5;
          // Pulse the opacity
          const ringMaterial = energyRing.material as THREE.MeshBasicMaterial;
          ringMaterial.opacity = 0.3 + Math.sin(elapsedTime * 3) * 0.2;
        }
        
        // Extra glow pulse for The Nexus
        const material = nexusNode.material as THREE.MeshPhongMaterial;
        material.emissiveIntensity = 0.6 + Math.sin(elapsedTime * 1.5) * 0.3;
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
      console.log('🎮 Key pressed:', e.key, {
        controlsEnabled: controlsRef.current?.enabled,
        isTransitioning,
        navigateNodeRef: !!navigateNodeRef.current,
        focusOnNodeRef: !!focusOnNodeRef.current
      });
      
      if (!controlsRef.current?.enabled || isTransitioning) {
        console.log('⚠️ Controls disabled or transitioning, ignoring key');
        return;
      }
      
      switch(e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          console.log('➡️ Navigating to next node');
          navigateNodeRef.current?.('next');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          console.log('⬅️ Navigating to previous node');
          navigateNodeRef.current?.('prev');
          break;
        case ' ': // Spacebar to reset camera position for current node
          e.preventDefault();
          console.log('🎯 Resetting camera to current node');
          focusOnNodeRef.current?.(currentNodeRef.current, 1);
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
    <HudContainer>
      <div ref={mountRef} className="fixed inset-0 w-full h-full pointer-events-auto">
        {/* Matrix CRT Scan Line Effect - Respect reduced motion */}
        {!reduceEffects && (
          <div className="absolute inset-0 pointer-events-none z-[60]">
            <div 
              className="absolute inset-0 opacity-10 bg-cyber-lines animate-scan"
              aria-hidden="true"
            />
            <div 
              className="absolute inset-0 opacity-5 bg-gradient-radial from-transparent to-black/30"
              aria-hidden="true"
            />
          </div>
        )}
        
        {/* Glitch Effect Overlay - Disabled in reduced motion */}
        {!reduceEffects && (
          <div 
            className="absolute inset-0 pointer-events-none z-[61] mix-blend-screen opacity-20 bg-gradient-to-r from-transparent via-matrix-green/10 to-transparent animate-glitch"
            aria-hidden="true"
          />
        )}
      </div>
      
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
            <h1 className="font-display text-display-xl text-matrix-green text-glow-lg animate-flicker">
              MATRIX SKYNET
            </h1>
            {/* Glitch shadow layers */}
            <h1 className="absolute top-0 left-0 font-display text-display-xl text-cyber-cyan opacity-30 animate-glitch"
                style={{ 
                  clipPath: 'polygon(0 0, 100% 0, 100% 45%, 0 45%)'
                }}
                aria-hidden="true">
              MATRIX SKYNET
            </h1>
            <h1 className="absolute top-0 left-0 font-display text-display-xl text-alert-red opacity-30 animate-glitch-alt"
                style={{ 
                  clipPath: 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)'
                }}
                aria-hidden="true">
              MATRIX SKYNET
            </h1>
          </div>
          <p className="text-green-400 font-mono text-xs mt-3 tracking-widest opacity-80 text-center">
            ⟨ SUPER ADMIN COMMAND CENTER ⟩
          </p>
          <div className="text-green-500 font-mono text-xs mt-1 opacity-60">
            [ NEURAL NETWORK ACTIVE ]<br/>
            <span className="text-green-400/40 text-[10px]">• 3D DATA VISUALIZATION DASHBOARD •</span>
          </div>
        </div>
        
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
        
        {/* Current Node Display + Neural Nodes Navigation - LEFT SIDE */}
        {!isTransitioning && (
          <div className="absolute top-24 left-8 space-y-4 pointer-events-auto">
            {/* Focused Node */}
            <div className="bg-black/80 border border-green-500/30 rounded p-4
                            animate-in fade-in slide-in-from-left duration-500">
              <div className="text-green-400 font-mono">
                <div className="text-green-500 text-lg mb-2">FOCUSED NODE</div>
                <div className="text-2xl font-bold text-green-300">
                  {['The Nexus', 'Token Monitor', 'Transaction Flow', 
                    'Analytics Core', 'Alert System', 'AI Processor', 'Account Manager', 'Music Player'][currentNodeIndex]}
                </div>
                <div className="text-xs text-green-500/60 mt-2">
                  Node {currentNodeIndex + 1} of 8
                </div>
              </div>
            </div>
            
            {/* Neural Nodes Navigation */}
            <div className="bg-black/80 border border-green-500/30 rounded p-4 max-w-xs
                            animate-in fade-in slide-in-from-left duration-500 delay-150">
              <h3 className="text-green-400 font-mono text-lg mb-3">NEURAL NODES</h3>
              <ul className="space-y-2 text-sm font-mono" role="list">
                {
                  [
                    { color: 'bg-matrix-green', name: 'The Nexus', icon: '⬢' }, // Data source
                    { color: 'bg-quantum-blue', name: 'Token Monitor' },
                    { color: 'bg-accent-purple', name: 'Transaction Flow' },
                    { color: 'bg-white', name: 'Analytics Core' },
                    { color: 'bg-alert-red', name: 'Alert System' },
                    { color: 'bg-purple-700', name: 'AI Processor' },
                    { color: 'bg-cyber-cyan', name: 'Account Manager', secure: true },
                    { color: 'bg-pink-500', name: 'Music Player', icon: '🎵' }
                  ].map((node, index) => (
                    <li key={index}>
                      <button
                        onClick={() => focusOnNodeRef.current?.(index, 1)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            focusOnNodeRef.current?.(index, 1);
                          }
                        }}
                        className={`w-full flex items-center gap-2 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyber-cyan rounded px-2 py-1 ${
                          index === currentNodeIndex ? 'scale-110 ml-2 bg-cyber-cyan/10' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Navigate to ${node.name} node${node.secure ? ' (secure)' : ''}`}
                        aria-pressed={index === currentNodeIndex}
                      >
                        <div className={`w-3 h-3 ${node.color} rounded-sm ${
                          index === currentNodeIndex ? 'animate-pulse-glow' : ''
                        }`}></div>
                        <span className={`${
                          index === currentNodeIndex 
                            ? 'text-matrix-300 font-bold' 
                            : 'text-matrix-400 hover:text-matrix-300'
                        }`}>
                          {node.name}
                        </span>
                        {node.secure && (
                          <span className="text-plasma-yellow text-xs ml-1" aria-label="Secure node">🔒</span>
                        )}
                      </button>
                    </li>
                  ))
                }
              </ul>
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
        
        {/* Access Denied - Only show if explicitly not super admin AND user is loaded */}
        {!isSuperAdmin && !isLoading && user && (
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
        
        
        {/* System Status & Experience Settings - Always visible, top-right */}
        <ExperienceModeToggle 
          position="top-right"
          showSystemStatus={true}
          statusData={{
            online: true,
            latency: Math.floor(Math.random() * 50 + 10),
            nodes: nodesRef.current.length,
            totalNodes: nodesRef.current.length
          }}
          walletData={user ? {
            address: user.wallet_address || user.username || 'GENESIS-001',
            onDisconnect: onBack
          } : undefined}
        />
        
        {/* Access Denied - Only show if explicitly not super admin AND user is loaded */}
        {!isSuperAdmin && !isLoading && user && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center pointer-events-auto">
            <div className="text-center p-8 border-2 border-red-500 bg-black/50">
              <div className="text-red-500 text-6xl mb-4">⚠</div>
              <h2 className="text-red-500 font-mono text-2xl mb-4">ACCESS DENIED</h2>
              <p className="text-gray-400 font-mono mb-4">SUPER_ADMIN clearance required</p>
              <button onClick={onBack} className="px-6 py-2 bg-red-500/20 border border-red-500 text-red-400 font-mono hover:bg-red-500/30 transition-all">
                EXIT
              </button>
            </div>
          </div>
        )}
        
        {/* THE NEXUS 3D INTERFACE - Central Command & Control */}
        {showNexusInterface && !isTransitioning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
            <div className="bg-black/95 border-2 border-green-500 rounded-lg p-8 max-w-6xl w-full mx-8 pointer-events-auto
                            animate-in fade-in zoom-in duration-300 shadow-[0_0_100px_rgba(0,255,0,0.3)]">
              {/* Header with Matrix-style animation */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-green-400 font-mono text-3xl mb-1 flex items-center gap-3">
                    ⬢ THE NEXUS
                    <span className="text-xs text-yellow-400 border border-yellow-400 px-2 py-0.5 rounded animate-pulse">
                      CORE SYSTEM
                    </span>
                  </h2>
                  <p className="text-green-400/60 text-sm font-mono">
                    Central Data Hub | Real-time Analytics | System Control
                  </p>
                </div>
                <button
                  onClick={() => setShowNexusInterface(false)}
                  className="text-red-400 hover:text-red-300 transition-colors text-2xl"
                >
                  ×
                </button>
              </div>
              
              {/* Main Dashboard Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* System Health */}
                <div className="bg-black/50 border border-green-500/30 rounded-lg p-4">
                  <h3 className="text-green-400 font-mono text-lg mb-3">📊 SYSTEM HEALTH</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">CPU Usage</span>
                      <span className="text-green-300 font-mono">32%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded h-2">
                      <div className="bg-green-400 h-2 rounded" style={{ width: '32%' }}></div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Memory</span>
                      <span className="text-yellow-300 font-mono">67%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded h-2">
                      <div className="bg-yellow-400 h-2 rounded" style={{ width: '67%' }}></div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Network</span>
                      <span className="text-cyan-300 font-mono">1.2GB/s</span>
                    </div>
                  </div>
                </div>
                
                {/* Real-time Metrics */}
                <div className="bg-black/50 border border-green-500/30 rounded-lg p-4">
                  <h3 className="text-green-400 font-mono text-lg mb-3">⚡ REAL-TIME METRICS</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Transactions/sec</div>
                      <div className="text-2xl font-mono text-cyan-300">1,247</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Active Nodes</div>
                      <div className="text-2xl font-mono text-green-300">8/8</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Data Throughput</div>
                      <div className="text-2xl font-mono text-yellow-300">42.7TB</div>
                    </div>
                  </div>
                </div>
                
                {/* Quick Actions */}
                <div className="bg-black/50 border border-green-500/30 rounded-lg p-4">
                  <h3 className="text-green-400 font-mono text-lg mb-3">🎮 QUICK ACTIONS</h3>
                  <div className="space-y-2">
                    <button className="w-full text-left px-3 py-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors text-sm font-mono">
                      🔄 Sync All Nodes
                    </button>
                    <button className="w-full text-left px-3 py-2 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 transition-colors text-sm font-mono">
                      📥 Import Data
                    </button>
                    <button className="w-full text-left px-3 py-2 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors text-sm font-mono">
                      📊 Generate Report
                    </button>
                    <button className="w-full text-left px-3 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors text-sm font-mono">
                      🚨 Emergency Stop
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Live Data Stream */}
              <div className="bg-black/50 border border-green-500/30 rounded-lg p-4">
                <h3 className="text-green-400 font-mono text-lg mb-3">📡 LIVE DATA STREAM</h3>
                <div className="font-mono text-xs text-green-300 space-y-1 h-32 overflow-y-auto">
                  <div className="opacity-100">[{new Date().toLocaleTimeString()}] Node 2 processed 127 transactions</div>
                  <div className="opacity-90">[{new Date().toLocaleTimeString()}] Alert System triggered: High volume detected</div>
                  <div className="opacity-80">[{new Date().toLocaleTimeString()}] AI Processor analyzing patterns...</div>
                  <div className="opacity-70">[{new Date().toLocaleTimeString()}] Analytics Core updated dashboard</div>
                  <div className="opacity-60">[{new Date().toLocaleTimeString()}] Token Monitor scanning new contracts</div>
                  <div className="opacity-50">[{new Date().toLocaleTimeString()}] Transaction Flow optimized</div>
                  <div className="opacity-40">[{new Date().toLocaleTimeString()}] Account Manager sync complete</div>
                  <div className="opacity-30">[{new Date().toLocaleTimeString()}] Music Player loaded playlist</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPREHENSIVE MUSIC PLAYER - Full Audio Suite */}
        {showMusicPlayer && !isTransitioning && (
          <ComprehensiveMusicPlayer onClose={() => setShowMusicPlayer(false)} />
        )}
        
        {/* OLD MUSIC PLAYER - BACKUP (Hidden) */}
        {false && showMusicPlayer && !isTransitioning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
            <div className="bg-black/95 border-2 border-pink-500 rounded-lg p-8 max-w-4xl w-full mx-8 pointer-events-auto
                            animate-in fade-in zoom-in duration-300 shadow-[0_0_80px_rgba(255,20,147,0.3)]">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-pink-400 font-mono text-3xl mb-1 flex items-center gap-3">
                    🎵 MUSIC PLAYER
                    <span className="text-xs text-cyan-400 border border-cyan-400 px-2 py-0.5 rounded">
                      AUDIO ENGINE
                    </span>
                  </h2>
                  <p className="text-pink-400/60 text-sm font-mono">
                    Immersive Audio Experience | Local & Streaming
                  </p>
                </div>
                <button
                  onClick={() => setShowMusicPlayer(false)}
                  className="text-red-400 hover:text-red-300 transition-colors text-2xl"
                >
                  ×
                </button>
              </div>
              
              {/* Now Playing */}
              <div className="bg-gradient-to-r from-pink-900/20 to-purple-900/20 border border-pink-500/30 rounded-lg p-6 mb-6">
                <div className="flex items-center gap-6">
                  {/* Album Art */}
                  <div className="w-32 h-32 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-6xl">🎵</span>
                  </div>
                  
                  {/* Track Info */}
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-pink-300 mb-1">
                      {currentTrack?.name || 'No Track Playing'}
                    </h3>
                    <p className="text-pink-400/60 mb-4">
                      {currentTrack?.artist || (audioSource === 'youtube' ? 'YouTube Music' : 'Local Collection')}
                    </p>
                    
                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}</span>
                        <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2 cursor-pointer"
                           onClick={(e) => {
                             const rect = e.currentTarget.getBoundingClientRect();
                             const percent = (e.clientX - rect.left) / rect.width;
                             seekTo(duration * percent);
                           }}>
                        <div className="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full pointer-events-none" 
                             style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}></div>
                      </div>
                    </div>
                    
                    {/* Playback Controls */}
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={previousTrack}
                        className="text-pink-400 hover:text-pink-300 transition-colors"
                      >
                        ⏮️
                      </button>
                      <button 
                        onClick={togglePlayPause}
                        className="text-pink-400 hover:text-pink-300 transition-colors text-3xl"
                      >
                        {isPlaying ? '⏸️' : '▶️'}
                      </button>
                      <button 
                        onClick={nextTrack}
                        className="text-pink-400 hover:text-pink-300 transition-colors"
                      >
                        ⏭️
                      </button>
                      <button 
                        onClick={toggleShuffle}
                        className={`transition-colors ml-4 ${
                          shuffleEnabled ? 'text-pink-300' : 'text-pink-400 hover:text-pink-300'
                        }`}
                      >
                        🔀
                      </button>
                      <button 
                        onClick={() => {
                          const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
                          const currentIndex = modes.indexOf(repeatMode);
                          setRepeatMode(modes[(currentIndex + 1) % 3]);
                        }}
                        className="text-pink-400 hover:text-pink-300 transition-colors"
                        title={`Repeat: ${repeatMode}`}
                      >
                        {repeatMode === 'one' ? '🔂' : repeatMode === 'all' ? '🔁' : '↻'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Volume & Effects */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-pink-400 text-xs font-mono">VOLUME ({Math.round(volume * 100)}%)</label>
                      <input type="range" min="0" max="100" 
                             value={volume * 100}
                             onChange={(e) => setVolume(Number(e.target.value) / 100)}
                             className="w-full accent-pink-500" />
                    </div>
                    <div>
                      <label className="text-pink-400 text-xs font-mono">BASS ({bassLevel}%)</label>
                      <input type="range" min="0" max="100" 
                             value={bassLevel}
                             onChange={(e) => setBassLevel(Number(e.target.value))}
                             className="w-full accent-purple-500" />
                    </div>
                    <div>
                      <label className="text-pink-400 text-xs font-mono">TREBLE ({trebleLevel}%)</label>
                      <input type="range" min="0" max="100" 
                             value={trebleLevel}
                             onChange={(e) => setTrebleLevel(Number(e.target.value))}
                             className="w-full accent-cyan-500" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Audio Source & Playlist */}
              <div className="grid grid-cols-2 gap-4">
                {/* Source Selection */}
                <div className="bg-black/50 border border-pink-500/30 rounded-lg p-4">
                  <h3 className="text-pink-400 font-mono text-lg mb-3">🎶 AUDIO SOURCE</h3>
                  <div className="space-y-2">
                    <button 
                      onClick={() => setAudioSource?.('local')}
                      className={`w-full px-4 py-3 rounded-lg font-mono text-sm transition-all ${
                        audioSource === 'local' 
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' 
                          : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                      }`}
                    >
                      💿 Local MP3 Collection
                    </button>
                    <button 
                      onClick={() => setAudioSource?.('youtube')}
                      className={`w-full px-4 py-3 rounded-lg font-mono text-sm transition-all ${
                        audioSource === 'youtube' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
                          : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                      }`}
                    >
                      📺 YouTube Music {!isYouTubeConnected && '(Not Connected)'}
                    </button>
                  </div>
                  
                  {/* YouTube Controls if selected */}
                  {audioSource === 'youtube' && (
                    <div className="mt-4 pt-4 border-t border-pink-500/20">
                      {isYouTubeConnected ? (
                        <div className="text-green-400 text-sm">
                          ✅ Connected: {youtubeEmail}
                        </div>
                      ) : (
                        <button onClick={connectGoogle} className="w-full px-3 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-sm font-mono">
                          Connect Google Account
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Playlist */}
                <div className="bg-black/50 border border-pink-500/30 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-pink-400 font-mono text-lg">📝 PLAYLIST</h3>
                    {shuffleEnabled && <span className="text-xs text-pink-400 font-mono">🔀 SHUFFLED</span>}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {playlist.map((track, index) => (
                      <div key={track.id}
                           onClick={() => selectTrack(index)}
                           className={`px-3 py-2 rounded cursor-pointer transition-colors ${
                             index === currentTrackIndex 
                               ? 'bg-pink-500/20 border border-pink-500/30' 
                               : 'hover:bg-pink-500/10'
                           }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`font-mono text-sm ${
                              index === currentTrackIndex ? 'text-pink-300' : 'text-gray-400'
                            }`}>
                              {index === currentTrackIndex && isPlaying && '▶ '}
                              {track.name}
                            </div>
                            <div className="text-xs text-gray-500">{track.artist}</div>
                          </div>
                          <div className={`text-xs ${
                            index === currentTrackIndex ? 'text-pink-400/70' : 'text-gray-500'
                          }`}>{track.duration}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Visualizer & Effects Settings */}
              <div className="bg-black/50 border border-pink-500/30 rounded-lg p-4 mt-4">
                <h3 className="text-pink-400 font-mono text-lg mb-3">🌈 EFFECTS & VISUALIZER</h3>
                <div className="space-y-4">
                  {/* Distortion Controls */}
                  <div className="border-b border-pink-500/20 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 text-pink-300 text-sm">
                        <input type="checkbox" 
                               checked={distortionEnabled}
                               onChange={toggleDistortion}
                               className="accent-pink-500" />
                        <span>🎸 Space Distortion</span>
                      </label>
                      {distortionEnabled && (
                        <span className="text-xs text-pink-400">Amount: {distortionAmount}%</span>
                      )}
                    </div>
                    {distortionEnabled && (
                      <input type="range" min="0" max="100"
                             value={distortionAmount}
                             onChange={(e) => setDistortionAmount(Number(e.target.value))}
                             className="w-full accent-pink-500" />
                    )}
                  </div>
                  
                  {/* Visualizer Options */}
                  <div className="grid grid-cols-3 gap-4">
                    <label className="flex items-center gap-2 text-pink-300 text-sm">
                      <input type="checkbox" defaultChecked className="accent-pink-500" />
                      <span>Black Hole Reactivity</span>
                    </label>
                    <label className="flex items-center gap-2 text-pink-300 text-sm">
                      <input type="checkbox" defaultChecked className="accent-pink-500" />
                      <span>Particle Effects</span>
                    </label>
                    <label className="flex items-center gap-2 text-pink-300 text-sm">
                      <input type="checkbox" className="accent-pink-500" />
                      <span>Spectrum Analyzer</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ACCOUNT MANAGER 3D INTERFACE - Secure user-specific panel */}
        {showAccountManager && !isTransitioning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
            <div className="bg-black/90 border-2 border-cyan-400 rounded-lg p-8 max-w-2xl w-full mx-8 pointer-events-auto
                            animate-in fade-in zoom-in duration-300 shadow-[0_0_50px_rgba(0,255,153,0.3)]">
              {/* Header with security badge */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-cyan-400 font-mono text-2xl mb-1 flex items-center gap-2">
                    🔒 ACCOUNT MANAGER
                    <span className="text-xs text-yellow-400 border border-yellow-400 px-2 py-0.5 rounded">
                      SECURE
                    </span>
                  </h2>
                  <p className="text-green-400/60 text-sm font-mono">
                    USER: {user?.username?.toUpperCase() || 'GENESIS'} | ID: {user?.id || 'GEN-001'}
                  </p>
                </div>
                <button
                  onClick={() => setShowAccountManager(false)}
                  className="text-red-400 hover:text-red-300 transition-colors text-2xl"
                >
                  ×
                </button>
              </div>
              
              {/* Connected Accounts Grid */}
              <div className="space-y-6">
                <div className="border border-green-500/30 rounded-lg p-4">
                  <h3 className="text-green-400 font-mono text-lg mb-4">CONNECTED ACCOUNTS</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Telegram Connection */}
                    <div className="bg-black/50 border border-cyan-500/30 rounded-lg p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse"></div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">📨</span>
                          <span className="text-cyan-300 font-mono font-bold">TELEGRAM</span>
                        </div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="text-green-400 font-mono">STATUS: <span className="text-green-300">CONNECTED</span></div>
                        <div className="text-gray-400 font-mono">@your_username</div>
                        <button className="mt-2 text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded hover:bg-red-500/30 transition-colors">
                          DISCONNECT
                        </button>
                      </div>
                    </div>
                    
                    {/* X (Twitter) Connection */}
                    <div className="bg-black/50 border border-gray-500/30 rounded-lg p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gray-400 to-transparent"></div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">𝕏</span>
                          <span className="text-gray-300 font-mono font-bold">X (TWITTER)</span>
                        </div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="text-gray-400 font-mono">STATUS: <span className="text-gray-300">NOT CONNECTED</span></div>
                        <button className="mt-2 text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded hover:bg-cyan-500/30 transition-colors">
                          CONNECT
                        </button>
                      </div>
                    </div>
                    
                    {/* Discord Connection */}
                    <div className="bg-black/50 border border-indigo-500/30 rounded-lg p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"></div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">🎮</span>
                          <span className="text-indigo-300 font-mono font-bold">DISCORD</span>
                        </div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="text-gray-400 font-mono">STATUS: <span className="text-gray-300">NOT CONNECTED</span></div>
                        <button className="mt-2 text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded hover:bg-cyan-500/30 transition-colors">
                          CONNECT
                        </button>
                      </div>
                    </div>
                    
                    {/* GitHub Connection */}
                    <div className="bg-black/50 border border-gray-500/30 rounded-lg p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gray-400 to-transparent"></div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">🐱</span>
                          <span className="text-gray-300 font-mono font-bold">GITHUB</span>
                        </div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="text-gray-400 font-mono">STATUS: <span className="text-gray-300">NOT CONNECTED</span></div>
                        <button className="mt-2 text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded hover:bg-cyan-500/30 transition-colors">
                          CONNECT
                        </button>
                      </div>
                    </div>
                    
                    {/* YouTube/Google Connection - PROPER OAUTH */}
                    <div className={`bg-black/50 border rounded-lg p-4 relative overflow-hidden col-span-2 ${
                      isYouTubeConnected ? 'border-green-500/30' : 'border-red-500/30'
                    }`}>
                      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent to-transparent ${
                        isYouTubeConnected ? 'via-green-400 animate-pulse' : 'via-red-400'
                      }`}></div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">🔐</span>
                          <span className={`font-mono font-bold ${
                            isYouTubeConnected ? 'text-green-300' : 'text-red-300'
                          }`}>GOOGLE ACCOUNT</span>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          isYouTubeConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
                        }`}></div>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div className="text-gray-400 font-mono">
                          STATUS: <span className={isYouTubeConnected ? 'text-green-300' : 'text-red-300'}>
                            {isYouTubeConnected ? 'AUTHENTICATED' : 'NOT CONNECTED'}
                          </span>
                        </div>
                        {isYouTubeConnected && youtubeEmail && (
                          <>
                            <div className="text-green-400 font-mono text-xs">Account: {youtubeEmail}</div>
                            <div className="text-gray-500 font-mono text-xs">
                              ✅ YouTube Music Access
                              <br />✅ Playlists & Search
                              <br />✅ Full API Access
                            </div>
                          </>
                        )}
                        {!isYouTubeConnected && (
                          <div className="text-yellow-400 font-mono text-xs">
                            🔓 Connect your Google account to:
                            <br />• Access YouTube Music library
                            <br />• Search and play any song
                            <br />• Sync your playlists
                          </div>
                        )}
                        {isYouTubeConnected ? (
                          <button 
                            onClick={() => {
                              youtubeAudio.signOut();
                              setIsYouTubeConnected(false);
                            }}
                            className="mt-2 text-xs px-3 py-1 rounded transition-colors bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          >
                            DISCONNECT ACCOUNT
                          </button>
                        ) : (
                          <button 
                            onClick={async () => {
                              await youtubeAudio.signIn();
                              setIsYouTubeConnected(youtubeAudio.isAuthenticated);
                            }}
                            className="mt-2 text-xs px-4 py-2 rounded transition-colors bg-gradient-to-r from-blue-500/20 to-red-500/20 text-white hover:from-blue-500/30 hover:to-red-500/30 border border-blue-500/30"
                          >
                            🔗 CONNECT WITH GOOGLE
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Security Settings */}
                <div className="border border-yellow-500/30 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-mono text-lg mb-4 flex items-center gap-2">
                    🔐 SECURITY SETTINGS
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-green-400 font-mono">2FA Enabled</span>
                      <input type="checkbox" checked className="accent-green-400" readOnly />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-green-400 font-mono">API Key Encryption</span>
                      <input type="checkbox" checked className="accent-green-400" readOnly />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-green-400 font-mono">Session Timeout</span>
                      <span className="text-green-300 font-mono">30 MIN</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-green-400 font-mono">Last Login</span>
                      <span className="text-green-300 font-mono">TODAY 13:45</span>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-between mt-6">
                  <button className="px-4 py-2 bg-red-500/20 text-red-400 rounded font-mono hover:bg-red-500/30 transition-colors">
                    REVOKE ALL ACCESS
                  </button>
                  <button className="px-4 py-2 bg-green-500/20 text-green-400 rounded font-mono hover:bg-green-500/30 transition-colors">
                    SAVE CONFIGURATION
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
    </HudContainer>
  );
}
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
  const matrixRainRef = useRef<THREE.Points>();
  const whiteHoleRef = useRef<THREE.Group>();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(true);
  
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
    
    // Camera - Start at white hole exit point
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Start emerging from white hole (0, 0, 0)
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 10);
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
    
    // Bloom for glowing effects
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,  // strength
      0.4,  // radius
      0.85  // threshold
    );
    composer.addPass(bloomPass);
    composerRef.current = composer;
    
    // OrbitControls for free navigation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controls.enabled = false; // Disabled during entry animation
    controlsRef.current = controls;
    
    // Create ENHANCED WHITE HOLE with custom shader
    const createWhiteHole = () => {
      const group = new THREE.Group();
      
      // Custom shader for white hole with energy distortion
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
          
          void main() {
            // Distance from center
            float dist = length(vUv - 0.5);
            
            // Create energy rings
            float rings = sin(dist * 20.0 - time * 3.0) * 0.5 + 0.5;
            
            // Radial gradient
            float radial = 1.0 - dist * 2.0;
            radial = pow(radial, 2.0);
            
            // Swirling effect
            float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
            float swirl = sin(angle * 8.0 + time * 2.0) * 0.5 + 0.5;
            
            // Combine effects
            vec3 finalColor = mix(color, glowColor, swirl * 0.3);
            float alpha = radial * (0.8 + rings * 0.2);
            
            gl_FragColor = vec4(finalColor, alpha);
          }
        `
      };
      
      // White hole core with shader
      const coreGeometry = new THREE.SphereGeometry(2, 64, 64);
      const coreMaterial = new THREE.ShaderMaterial({
        uniforms: whiteHoleShader.uniforms,
        vertexShader: whiteHoleShader.vertexShader,
        fragmentShader: whiteHoleShader.fragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      group.add(core);
      
      // Particle vortex around white hole
      const particleCount = 3000;
      const particleGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);
      
      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 2 + Math.random() * 3;
        const height = (Math.random() - 0.5) * 2;
        
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
        
        // White to cyan gradient
        const colorMix = Math.random();
        colors[i * 3] = colorMix;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
        
        sizes[i] = Math.random() * 3 + 1;
      }
      
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      
      const particleMaterial = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      group.add(particles);
      
      // Energy rings
      for (let i = 0; i < 3; i++) {
        const ringGeometry = new THREE.TorusGeometry(2.5 + i * 0.5, 0.05, 16, 100);
        const ringMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x00ffff).lerp(new THREE.Color(0xffffff), i * 0.3),
          transparent: true,
          opacity: 0.6 - i * 0.15,
          emissive: 0x00ffff,
          emissiveIntensity: 0.5
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        ring.rotation.y = Math.random() * Math.PI;
        ring.userData.rotationSpeed = 0.5 + Math.random() * 0.5;
        group.add(ring);
      }
      
      return group;
    };
    
    const whiteHole = createWhiteHole();
    whiteHole.position.set(0, 0, 0);
    whiteHoleRef.current = whiteHole;
    scene.add(whiteHole);
    
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
    
    // MATRIX DIGITAL RAIN - Falling code effect
    const createMatrixRain = () => {
      const rainCount = 1000;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(rainCount * 3);
      const velocities = new Float32Array(rainCount);
      const sizes = new Float32Array(rainCount);
      
      for (let i = 0; i < rainCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = Math.random() * 100 - 50;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
        
        velocities[i] = Math.random() * 0.3 + 0.1;
        sizes[i] = Math.random() * 2 + 1;
      }
      
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      
      const material = new THREE.PointsMaterial({
        color: 0x00ff00,
        size: 0.3,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      
      const rain = new THREE.Points(geometry, material);
      return rain;
    };
    
    const matrixRain = createMatrixRain();
    matrixRain.visible = false; // Start hidden
    matrixRainRef.current = matrixRain;
    scene.add(matrixRain);
    
    // EMERGENCE ANIMATION - User emerges from white hole
    const runEmergenceAnimation = () => {
      console.log('🌌 Starting Matrix emergence animation...');
      
      const tl = gsap.timeline({
        onComplete: () => {
          console.log('✨ Emergence complete!');
          setIsTransitioning(false);
          
          // Enable controls for free navigation
          if (controlsRef.current) {
            controlsRef.current.enabled = true;
            console.log('🎮 Free navigation enabled!');
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
      
      // Phase 1: Camera emerges from white hole
      tl.to(camera.position, {
        z: 8,
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
      
      // Phase 5: Fade in matrix rain
      .to(matrixRain, {
        visible: true,
        duration: 0.1
      }, '-=0.5')
      .to(matrixRain.material, {
        opacity: 0.1,
        duration: 2
      }, '-=0.5')
      
      // Phase 6: Fade out white hole
      .to(whiteHole.scale, {
        x: 0.2,
        y: 0.2,
        z: 0.2,
        duration: 2,
        ease: 'power2.in'
      }, '-=1');
    };
    
    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      const elapsedTime = clockRef.current.getElapsedTime();
      const delta = clockRef.current.getDelta();
      
      // Update controls
      if (controls.enabled) {
        controls.update();
      }
      
      // Animate WHITE HOLE shader and effects
      if (whiteHoleRef.current) {
        // Update shader time uniform
        const core = whiteHoleRef.current.children[0] as THREE.Mesh;
        if (core && core.material && 'uniforms' in core.material) {
          (core.material as THREE.ShaderMaterial).uniforms.time.value = elapsedTime;
        }
        
        // Rotate particle vortex
        const particles = whiteHoleRef.current.children[1] as THREE.Points;
        if (particles) {
          particles.rotation.y = elapsedTime * 0.3;
          
          // Animate particle positions in spiral
          const positions = particles.geometry.attributes.position.array as Float32Array;
          for (let i = 0; i < positions.length; i += 3) {
            const angle = (i / positions.length) * Math.PI * 2 + elapsedTime * 0.5;
            const radius = 2 + Math.sin(elapsedTime + i * 0.1) * 0.5;
            positions[i] = Math.cos(angle) * radius;
            positions[i + 2] = Math.sin(angle) * radius;
          }
          particles.geometry.attributes.position.needsUpdate = true;
        }
        
        // Rotate energy rings
        for (let i = 2; i < whiteHoleRef.current.children.length; i++) {
          const ring = whiteHoleRef.current.children[i] as THREE.Mesh;
          if (ring) {
            ring.rotation.z += delta * ring.userData.rotationSpeed;
          }
        }
      }
      
      // Animate MATRIX DIGITAL RAIN
      if (matrixRainRef.current && matrixRainRef.current.visible) {
        const positions = matrixRainRef.current.geometry.attributes.position.array as Float32Array;
        const velocities = matrixRainRef.current.geometry.attributes.velocity.array as Float32Array;
        
        for (let i = 0; i < positions.length; i += 3) {
          // Move particles down
          positions[i + 1] -= velocities[i / 3] * 2;
          
          // Reset to top when reaching bottom
          if (positions[i + 1] < -50) {
            positions[i + 1] = 50;
            positions[i] = (Math.random() - 0.5) * 100;
            positions[i + 2] = (Math.random() - 0.5) * 100;
          }
        }
        matrixRainRef.current.geometry.attributes.position.needsUpdate = true;
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
            [ NEURAL NETWORK ACTIVE ]
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
              <div className="text-green-500 mb-2">🎮 NAVIGATION</div>
              <div>• LEFT CLICK + DRAG: Rotate</div>
              <div>• RIGHT CLICK + DRAG: Pan</div>
              <div>• SCROLL: Zoom in/out</div>
            </div>
          </div>
        )}
        
        {/* Emergence Transition Screen */}
        {isTransitioning && !isLoading && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-green-400 font-mono text-2xl mb-4 animate-pulse">
                EMERGING FROM WHITE HOLE
              </div>
              <div className="text-green-300 font-mono text-sm">
                <span className="inline-block animate-pulse">MATERIALIZING NEURAL NETWORK</span>
                <span className="inline-block ml-2">
                  <span className="animate-pulse delay-100">.</span>
                  <span className="animate-pulse delay-200">.</span>
                  <span className="animate-pulse delay-300">.</span>
                </span>
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
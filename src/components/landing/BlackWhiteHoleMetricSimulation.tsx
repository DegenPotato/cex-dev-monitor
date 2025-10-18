/**
 * BLACK-WHITE HOLE METRIC SIMULATION
 * 
 * Interactive 3D visualization of the Advorce black-to-white hole metric
 * 
 * MATHEMATICAL MODEL:
 * A(r) = 1 + (2GM)/(c² r²) - (r_min/r) * exp(-r_min/r)
 * 
 * This metric describes a non-singular spacetime where:
 * - Particles fall toward the center
 * - Experience a bounce at r_min
 * - Re-expand outward (white hole behavior)
 * - No singularity exists at the center
 * 
 * VISUALIZATION:
 * - Central object represents the black/white hole
 * - Geodesic paths show particle trajectories
 * - Color coding: Blue (infall) -> Red (bounce) -> Green (expansion)
 * - Real-time parameter adjustment
 * - Multiple test particles with different initial conditions
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'dat.gui';

interface SimulationParams {
  G: number;           // Gravitational constant
  M: number;           // Mass of central object
  c: number;           // Speed of light
  r_min: number;       // Bounce radius
  particleCount: number;
  timeStep: number;
  showTrails: boolean;
  showGrid: boolean;
  showVectorField: boolean;
}

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  trail: THREE.Vector3[];
  color: THREE.Color;
  phase: 'infall' | 'bounce' | 'expansion';
  age: number;
}

export const BlackWhiteHoleMetricSimulation: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const composerRef = useRef<EffectComposer>();
  const particlesRef = useRef<Particle[]>([]);
  const animationIdRef = useRef<number>();
  const guiRef = useRef<GUI>();
  
  const [params] = useState<SimulationParams>({
    G: 1,
    M: 1,
    c: 1,
    r_min: 1,
    particleCount: 10,
    timeStep: 0.01,
    showTrails: true,
    showGrid: true,
    showVectorField: false
  });

  // Calculate the metric function A(r)
  const calculateMetric = (r: number): number => {
    const { G, M, c, r_min } = params;
    if (r < 0.01) r = 0.01; // Prevent division by zero
    
    const schwarzschild = 1 + (2 * G * M) / (c * c * r * r);
    const bounce = (r_min / r) * Math.exp(-r_min / r);
    
    return schwarzschild - bounce;
  };

  // Calculate geodesic acceleration
  const calculateGeodesicAcceleration = (position: THREE.Vector3): THREE.Vector3 => {
    const r = position.length();
    if (r < 0.01) return new THREE.Vector3(); // Too close to center
    
    const A = calculateMetric(r);
    const dr = 0.001; // Small increment for derivative
    const dA_dr = (calculateMetric(r + dr) - calculateMetric(r)) / dr;
    
    // Radial geodesic equation (simplified for visualization)
    const radialAccel = -0.5 * dA_dr / A;
    
    // Create acceleration vector
    const direction = position.clone().normalize();
    return direction.multiplyScalar(radialAccel);
  };

  // Initialize a test particle
  const initializeParticle = (index: number): Particle => {
    // Create particles at different angles and distances
    const angle = (index / params.particleCount) * Math.PI * 2;
    const distance = 5 + Math.random() * 10;
    
    return {
      position: new THREE.Vector3(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        (Math.random() - 0.5) * 2
      ),
      velocity: new THREE.Vector3(
        -Math.cos(angle) * 0.5,
        -Math.sin(angle) * 0.5,
        0
      ),
      trail: [],
      color: new THREE.Color(0x00ffff),
      phase: 'infall',
      age: 0
    };
  };

  // Update particle physics
  const updateParticle = (particle: Particle, dt: number): void => {
    // Get geodesic acceleration
    const acceleration = calculateGeodesicAcceleration(particle.position);
    
    // Update velocity and position
    particle.velocity.add(acceleration.clone().multiplyScalar(dt));
    particle.position.add(particle.velocity.clone().multiplyScalar(dt));
    
    // Track trail
    if (particle.trail.length > 100) {
      particle.trail.shift();
    }
    particle.trail.push(particle.position.clone());
    
    // Determine phase based on distance and velocity
    const r = particle.position.length();
    const radialVelocity = particle.velocity.dot(particle.position.clone().normalize());
    
    if (r < params.r_min * 1.5 && radialVelocity < 0) {
      particle.phase = 'bounce';
      particle.color = new THREE.Color(0xff0000);
    } else if (r > params.r_min * 1.5 && radialVelocity > 0) {
      particle.phase = 'expansion';
      particle.color = new THREE.Color(0x00ff00);
    } else if (radialVelocity < 0) {
      particle.phase = 'infall';
      particle.color = new THREE.Color(0x0088ff);
    }
    
    particle.age += dt;
    
    // Reset particle if it goes too far
    if (r > 30 || r < 0.1) {
      Object.assign(particle, initializeParticle(particlesRef.current.indexOf(particle)));
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000511);
    scene.fog = new THREE.Fog(0x000511, 50, 200);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(20, 15, 20);
    camera.lookAt(0, 0, 0);

    // Renderer setup
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
    bloomPass.strength = 1.5;
    bloomPass.radius = 0.5;
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 100;
    controls.minDistance = 5;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Create central black/white hole object
    const createCentralObject = () => {
      // Core sphere representing the bounce radius
      const coreGeometry = new THREE.SphereGeometry(params.r_min, 32, 32);
      const coreMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          r_min: { value: params.r_min }
        },
        vertexShader: `
          varying vec3 vPosition;
          varying vec3 vNormal;
          uniform float time;
          
          void main() {
            vPosition = position;
            vNormal = normal;
            
            // Pulsating effect
            vec3 pos = position * (1.0 + 0.1 * sin(time * 2.0));
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPosition;
          varying vec3 vNormal;
          uniform float time;
          uniform float r_min;
          
          void main() {
            float r = length(vPosition);
            
            // Color gradient from black hole (blue) to white hole (white)
            vec3 blackHoleColor = vec3(0.0, 0.3, 1.0);
            vec3 whiteHoleColor = vec3(1.0, 1.0, 1.0);
            
            float mixFactor = 0.5 + 0.5 * sin(time);
            vec3 color = mix(blackHoleColor, whiteHoleColor, mixFactor);
            
            // Edge glow
            float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            color += fresnel * vec3(0.5, 0.5, 1.0);
            
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide
      });
      
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      scene.add(core);
      
      // Event horizon representation (if applicable)
      const horizonRadius = Math.sqrt(2 * params.G * params.M / (params.c * params.c));
      const horizonGeometry = new THREE.SphereGeometry(horizonRadius, 32, 32);
      const horizonMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0.8,
        transparent: true,
        wireframe: true
      });
      const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
      scene.add(horizon);
      
      return { coreMaterial };
    };
    
    const { coreMaterial } = createCentralObject();

    // Create grid for spatial reference
    const createGrid = () => {
      const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
      scene.add(gridHelper);
      return gridHelper;
    };
    
    const grid = createGrid();

    // Initialize particles
    particlesRef.current = [];
    for (let i = 0; i < params.particleCount; i++) {
      particlesRef.current.push(initializeParticle(i));
    }

    // Create particle mesh group
    const particleGroup = new THREE.Group();
    const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    
    const particleMeshes = particlesRef.current.map(particle => {
      const material = new THREE.MeshPhongMaterial({
        color: particle.color,
        emissive: particle.color,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(particleGeometry, material);
      mesh.position.copy(particle.position);
      particleGroup.add(mesh);
      return mesh;
    });
    
    scene.add(particleGroup);

    // Create trail lines
    const trailGroup = new THREE.Group();
    const trailLines = particlesRef.current.map(() => {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineBasicMaterial({ 
        color: 0xffffff,
        opacity: 0.3,
        transparent: true
      });
      const line = new THREE.Line(geometry, material);
      trailGroup.add(line);
      return line;
    });
    
    scene.add(trailGroup);

    // GUI for parameter control
    const gui = new GUI();
    guiRef.current = gui;
    
    const physicsFolder = gui.addFolder('Physics Parameters');
    physicsFolder.add(params, 'G', 0.1, 5).name('Gravitational Constant');
    physicsFolder.add(params, 'M', 0.1, 5).name('Central Mass');
    physicsFolder.add(params, 'c', 0.1, 5).name('Speed of Light');
    physicsFolder.add(params, 'r_min', 0.5, 5).name('Bounce Radius');
    physicsFolder.add(params, 'timeStep', 0.001, 0.1).name('Time Step');
    physicsFolder.open();
    
    const visualsFolder = gui.addFolder('Visualization');
    visualsFolder.add(params, 'particleCount', 1, 50, 1).name('Particle Count').onChange(() => {
      // Reinitialize particles
      particlesRef.current = [];
      for (let i = 0; i < params.particleCount; i++) {
        particlesRef.current.push(initializeParticle(i));
      }
    });
    visualsFolder.add(params, 'showTrails').name('Show Trails');
    visualsFolder.add(params, 'showGrid').name('Show Grid').onChange((value: boolean) => {
      grid.visible = value;
    });
    visualsFolder.add(params, 'showVectorField').name('Show Vector Field');
    visualsFolder.open();

    // Animation loop
    const clock = new THREE.Clock();
    
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      const elapsedTime = clock.getElapsedTime();
      
      // Update shader uniforms
      coreMaterial.uniforms.time.value = elapsedTime;
      
      // Update particles
      particlesRef.current.forEach((particle, index) => {
        updateParticle(particle, params.timeStep);
        
        // Update mesh position and color
        if (particleMeshes[index]) {
          particleMeshes[index].position.copy(particle.position);
          (particleMeshes[index].material as THREE.MeshPhongMaterial).color = particle.color;
          (particleMeshes[index].material as THREE.MeshPhongMaterial).emissive = particle.color;
        }
        
        // Update trail
        if (params.showTrails && trailLines[index]) {
          const positions = new Float32Array(particle.trail.length * 3);
          particle.trail.forEach((point, i) => {
            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y;
            positions[i * 3 + 2] = point.z;
          });
          
          trailLines[index].geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3)
          );
          (trailLines[index].material as THREE.LineBasicMaterial).color = particle.color;
        }
      });
      
      // Update trail visibility
      trailGroup.visible = params.showTrails;
      
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
  }, []);

  return (
    <div ref={mountRef} className="w-full h-screen relative">
      <div className="absolute top-4 left-4 text-white bg-black/50 p-4 rounded-lg backdrop-blur-sm">
        <h2 className="text-2xl font-bold mb-2">Black-White Hole Metric Simulation</h2>
        <div className="text-sm space-y-1">
          <p>A(r) = 1 + (2GM)/(c²r²) - (r_min/r) * exp(-r_min/r)</p>
          <p className="text-blue-400">Blue: Infall phase</p>
          <p className="text-red-400">Red: Bounce at r_min</p>
          <p className="text-green-400">Green: Expansion (white hole)</p>
        </div>
      </div>
    </div>
  );
};

export default BlackWhiteHoleMetricSimulation;

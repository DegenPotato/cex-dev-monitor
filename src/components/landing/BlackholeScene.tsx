import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { gsap } from 'gsap';

interface BlackholeSceneProps {
  onEnter: () => void;
}

// Gravitational Lensing Shader
const LensingShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'uCenter': { value: new THREE.Vector2(0.5, 0.5) },
    'uStrength': { value: 0.05 },
    'uRadius': { value: 0.25 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uStrength;
    uniform float uRadius;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 direction = uv - uCenter;
      float distance = length(direction);
      if (distance < uRadius) {
        float distortion = pow(distance / uRadius, 2.0);
        uv = uCenter + direction * distortion;
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

// Function to create a soft, circular texture for particles
const createParticleTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const data = new Uint8Array(64 * 64 * 4);
    const texture = new THREE.DataTexture(data, 64, 64);
    texture.needsUpdate = true;
    return texture as unknown as THREE.CanvasTexture;
  }
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(200,220,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

export function BlackholeScene({ onEnter }: BlackholeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const soundRef = useRef<THREE.PositionalAudio | null>(null);
  const velocities = useRef<THREE.Vector3[]>([]);

  const handleEnterClick = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
  }, [isTransitioning]);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 15;

    const listener = new THREE.AudioListener();
    camera.add(listener);
    const sound = new THREE.PositionalAudio(listener);
    soundRef.current = sound;
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('https://assets.codepen.io/217233/blackHole.mp3', function(buffer) {
      sound.setBuffer(buffer);
      sound.setLoop(true);
      sound.setVolume(1.0);
      sound.setRefDistance(10);
      sound.setRolloffFactor(2.0);
    });

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    currentMount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.03;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enablePan = false;

    const ambientLight = new THREE.AmbientLight(0x4c00ff, 0.2);
    scene.add(ambientLight);

    // Black Hole Core - a perfect, non-reflective black sphere
    const blackHoleGeometry = new THREE.SphereGeometry(1.5, 64, 64);
    const blackHoleMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const blackHole = new THREE.Mesh(blackHoleGeometry, blackHoleMaterial);
    blackHole.add(sound);
    scene.add(blackHole);
    
    const diskVertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const diskFragmentShader = `varying vec2 vUv; uniform float uTime; float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); } float noise(vec2 p){ vec2 ip = floor(p); vec2 u = fract(p); u = u*u*(3.0-2.0*u); float res = mix(mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x), mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y); return res*res; } float fbm(vec2 p) { float total = 0.0; float amplitude = 0.5; for (int i = 0; i < 4; i++) { total += noise(p) * amplitude; p *= 2.0; amplitude *= 0.5; } return total; } void main() { vec2 uv = vUv - 0.5; float distortion = fbm(uv * 4.0 + uTime * 0.1) * 0.1; vec2 distortedUv = uv + distortion; float dist = length(distortedUv); if (dist < 0.2 || dist > 0.5) { discard; } float angle = atan(distortedUv.y, distortedUv.x); float radialNoise = fbm(vec2(dist * 10.0, uTime * 0.3)); float wave = sin(dist * 40.0 - uTime * 2.0 + angle * 5.0 + radialNoise * 2.0); float intensity = pow(1.0 - smoothstep(0.2, 0.5, dist), 1.5); float innerGlow = pow(1.0 - smoothstep(0.2, 0.25, dist), 2.0); vec3 hot = vec3(1.0, 1.0, 0.8); vec3 cyan = vec3(0.0, 1.0, 1.0); vec3 magenta = vec3(1.0, 0.0, 1.0); vec3 color = mix(cyan, magenta, wave * 0.5 + 0.5); color = mix(color, hot, innerGlow); float pulse = 0.8 + 0.2 * sin(uTime * 5.0 + dist * 10.0); float finalAlpha = (intensity * (radialNoise * 0.5 + 0.5) + innerGlow * 0.8) * pulse; gl_FragColor = vec4(color, finalAlpha); }`;
    const diskGeometry = new THREE.TorusGeometry(3.5, 0.7, 16, 128);
    const diskMaterial = new THREE.ShaderMaterial({ vertexShader: diskVertexShader, fragmentShader: diskFragmentShader, uniforms: { uTime: { value: 0 }, }, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const accretionDisk = new THREE.Mesh(diskGeometry, diskMaterial);
    accretionDisk.rotation.x = Math.PI * 0.55;
    scene.add(accretionDisk);

    const flareLight = new THREE.PointLight(0xffffff, 0.5, 200);
    scene.add(flareLight);
    const textureLoader = new THREE.TextureLoader();
    const textureFlare0 = textureLoader.load("https://unpkg.com/three@0.164.1/examples/textures/lensflare/lensflare0.png");
    const textureFlare3 = textureLoader.load("https://unpkg.com/three@0.164.1/examples/textures/lensflare/lensflare3.png");
    const lensflare = new Lensflare();
    lensflare.addElement(new LensflareElement(textureFlare0, 512, 0, new THREE.Color(0x3399ff)));
    lensflare.addElement(new LensflareElement(textureFlare3, 60, 0.6));
    lensflare.addElement(new LensflareElement(textureFlare3, 70, 0.7));
    lensflare.addElement(new LensflareElement(textureFlare3, 120, 0.9));
    lensflare.addElement(new LensflareElement(textureFlare3, 70, 1.0));
    flareLight.add(lensflare);

    // Particle System
    const particleCount = 20000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const baseColor = new THREE.Color(0x88ddff);
    const whiteColor = new THREE.Color(0xffffff);

    const GRAVITATIONAL_CONSTANT = 0.8;
    const EVENT_HORIZON_RADIUS = 2.0;
    velocities.current = [];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const r = 5 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const p = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      positions[i3] = p.x;
      positions[i3 + 1] = p.y;
      positions[i3 + 2] = p.z;
      
      const mixedColor = baseColor.clone().lerp(whiteColor, Math.random() * 0.5);
      colors[i3] = mixedColor.r; colors[i3 + 1] = mixedColor.g; colors[i3 + 2] = mixedColor.b;

      // Initial velocity for a structured, decaying orbit
      const orbitAxis = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        1,
        (Math.random() - 0.5) * 0.4
      ).normalize();
      const perpendicular = p.clone().cross(orbitAxis).normalize();
      const initialSpeed = Math.sqrt(GRAVITATIONAL_CONSTANT * 1.5 / p.length()) * (0.8 + Math.random() * 0.1);
      const velocity = perpendicular.multiplyScalar(initialSpeed);
      velocities.current.push(velocity);
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particleTexture = createParticleTexture();
    const particleMaterial = new THREE.PointsMaterial({ size: 0.15, map: particleTexture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, vertexColors: true });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const lensingPass = new ShaderPass(LensingShader);
    lensingPass.uniforms.uStrength.value = 0.05;
    composer.addPass(lensingPass);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;
    composer.addPass(bloomPass);

    const clock = new THREE.Clock();
    let animationFrameId: number;

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsedTime = clock.getElapsedTime();
      diskMaterial.uniforms.uTime.value = elapsedTime;

      flareLight.intensity = 0.5 + Math.sin(elapsedTime * 2.5) * 0.15;

      const screenPosition = blackHole.position.clone().project(camera);
      lensingPass.uniforms.uCenter.value.set((screenPosition.x + 1) / 2, (screenPosition.y + 1) / 2);
      accretionDisk.rotation.z += 0.005;

      const posAttr = particles.geometry.getAttribute('position');
      const colorAttr = particles.geometry.getAttribute('color');
      const cyanColor = new THREE.Color(0x00ffff);
      const magentaColor = new THREE.Color(0xff00ff);

      for (let i = 0; i < particleCount; i++) {
        const p = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        
        if (isTransitioning) {
          const speed = 1 + p.length() * 0.05;
          p.z -= speed;
          p.x *= 0.99;
          p.y *= 0.99;
          const currentColor = new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
          const progress = Math.max(0, Math.min(1, 1.0 - (p.length() - 2.0) / 18.0));
          const hotTargetColor = ((i % 2) > 0) ? cyanColor : magentaColor;
          const hotMixFactor = Math.sin(progress * Math.PI) * 0.7;
          const colorWithHot = currentColor.clone().lerp(hotTargetColor, hotMixFactor);
          const whiteMixFactor = progress * progress;
          const finalColor = colorWithHot.lerp(whiteColor, whiteMixFactor);
          colorAttr.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
        } else {
          const v = velocities.current[i];
          const distSq = p.lengthSq();
          const eventHorizonRadiusSq = EVENT_HORIZON_RADIUS * EVENT_HORIZON_RADIUS;

          if (distSq < eventHorizonRadiusSq) {
            // Reset particle to outer edge
            const r_reset = 20 + Math.random() * 10;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            p.set(r_reset * Math.sin(phi) * Math.cos(theta), r_reset * Math.sin(phi) * Math.sin(theta), r_reset * Math.cos(phi));
            
            const mixedColor = baseColor.clone().lerp(whiteColor, Math.random() * 0.5);
            colorAttr.setXYZ(i, mixedColor.r, mixedColor.g, mixedColor.b);

            const orbitAxis = new THREE.Vector3((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4).normalize();
            const perpendicular = p.clone().cross(orbitAxis).normalize();
            const initialSpeed = Math.sqrt(GRAVITATIONAL_CONSTANT * 1.5 / p.length()) * (0.8 + Math.random() * 0.1);
            v.copy(perpendicular.multiplyScalar(initialSpeed));
          } else {
            const force = GRAVITATIONAL_CONSTANT / (distSq || 1);
            const acceleration = p.clone().negate().normalize().multiplyScalar(force);
            
            v.add(acceleration.multiplyScalar(delta));

            const dragFactor = 0.1;
            v.multiplyScalar(1.0 - (dragFactor * delta));
            
            p.add(v.clone().multiplyScalar(delta));
          }
        }
        posAttr.setXYZ(i, p.x, p.y, p.z);
      }
      posAttr.needsUpdate = true;
      if (isTransitioning) {
        colorAttr.needsUpdate = true;
      }

      if (!isTransitioning) {
        controls.update();
      }

      composer.render();
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      lensingPass.uniforms.uRadius.value = 0.25 * (window.innerHeight / window.innerWidth);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    if (isTransitioning) {
      controls.enabled = false;
      gsap.timeline({ onComplete: onEnter })
        .to(camera.position, { z: 1.5, duration: 2, ease: 'power3.in' })
        .to(bloomPass, { strength: 10, duration: 1 }, "-=1.0")
        .to(lensingPass.uniforms.uStrength, { value: 0.5, duration: 2, ease: 'power3.in' }, "<")
        .to(camera, { fov: 120, duration: 1, onUpdate: () => camera.updateProjectionMatrix() }, "-=1.5");
    }
    
    const playAudio = () => {
      if (soundRef.current && !soundRef.current.isPlaying && listener.context.state === 'suspended') {
        listener.context.resume();
      }
      if (soundRef.current && !soundRef.current.isPlaying) {
        soundRef.current.play();
      }
      window.removeEventListener('pointerdown', playAudio);
    };
    window.addEventListener('pointerdown', playAudio);

    setIsLoaded(true);

    return () => {
      window.removeEventListener('pointerdown', playAudio);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (soundRef.current?.isPlaying) soundRef.current.stop();
      controls.dispose();
      if(currentMount && renderer.domElement) currentMount.removeChild(renderer.domElement);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
          else object.material.dispose();
        }
      });
    };
  }, [isTransitioning, onEnter]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />
      <div className={`absolute inset-0 flex flex-col items-center justify-between p-8 md:p-12 transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${isTransitioning ? '!opacity-0' : ''} pointer-events-none`}>
        <div className="text-center pointer-events-auto w-full">
          <h1 className="text-5xl md:text-7xl font-bold uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif", textShadow: '0 0 10px #fff, 0 0 20px #0ff, 0 0 30px #0ff' }}>
            Sniff Agency
          </h1>
        </div>

        <div className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <button
            onClick={handleEnterClick}
            className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 rounded-full text-lg font-bold uppercase tracking-widest
                       transform hover:scale-105 hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_25px_#0ff] transition-all duration-300"
          >
            Enter the Dashboard
          </button>
        </div>

        <div className="text-center pointer-events-auto w-full">
          <p className="text-xl md:text-2xl mb-2 text-cyan-300" style={{ fontFamily: "'Space Grotesk', sans-serif", textShadow: '0 0 5px #0ff' }}>
            Follow the Money
          </p>
          <div className="text-gray-400 text-sm">
            <p>Click & drag to orbit. Scroll to zoom.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

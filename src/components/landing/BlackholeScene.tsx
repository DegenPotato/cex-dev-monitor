
import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
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

// Chromatic Aberration Shader for transition effect
const ChromaticAberrationShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'uAberrationAmount': { value: 0.0 },
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
        uniform float uAberrationAmount;
        varying vec2 vUv;
        void main() {
            vec2 center = vec2(0.5, 0.5);
            vec2 dir = vUv - center;
            float dist = length(dir);
            
            vec4 color = vec4(0.0);
            // Sample channels with radial offset
            color.r = texture2D(tDiffuse, vUv - dir * uAberrationAmount * dist).r;
            color.g = texture2D(tDiffuse, vUv).g;
            color.b = texture2D(tDiffuse, vUv + dir * uAberrationAmount * dist).b;
            color.a = texture2D(tDiffuse, vUv).a;

            gl_FragColor = color;
        }
    `,
};


// Particle Shaders for Trail Effect
const particleVertexShader = `
    attribute vec3 prevPosition;
    // 'attribute vec3 color;' is removed from here. 
    // Three.js automatically adds it when vertexColors is true.
    uniform float uSize;
    uniform float uIsTransitioning;

    varying vec3 vColor;
    varying vec2 vScreenDelta;
    varying float vSpeed;

    void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

        // Project current and previous positions to screen space (clip space)
        vec4 prevMvPosition = modelViewMatrix * vec4(prevPosition, 1.0);
        vec4 currentScreenPos = projectionMatrix * mvPosition;
        vec4 prevScreenPos = projectionMatrix * prevMvPosition;

        // Convert from clip space to normalized device coordinates (NDC)
        vec2 currentNDC = currentScreenPos.xy / currentScreenPos.w;
        vec2 prevNDC = prevScreenPos.xy / prevScreenPos.w;

        vScreenDelta = currentNDC - prevNDC;
        
        vSpeed = length(position - prevPosition);

        // Calculate point size, making it larger for faster particles
        float pointSize = uSize * (1.0 + vSpeed * 150.0 + uIsTransitioning * 2.0);
        gl_PointSize = pointSize * (1.0 / -mvPosition.z);
        gl_Position = currentScreenPos;
    }
`;

const particleFragmentShader = `
    uniform sampler2D uMap;
    uniform vec2 uResolution;
    uniform float uIsTransitioning;

    varying vec3 vColor;
    varying vec2 vScreenDelta;
    varying float vSpeed;

    void main() {
        // For the static scene, draw a simple, consistently visible particle.
        if (uIsTransitioning < 0.1) {
            float alpha = texture2D(uMap, gl_PointCoord).a;
            if (alpha < 0.05) discard; // Discard fully transparent edges
            gl_FragColor = vec4(vColor, alpha);
            return;
        }

        // --- Trail logic for transition ---

        // Correct aspect ratio of the screen delta
        vec2 screenDeltaCorrected = vScreenDelta * uResolution;
        float trailLength = length(screenDeltaCorrected);

        // If particle is not moving much (even during transition), draw a circle
        if (trailLength < 0.5) {
            gl_FragColor = texture2D(uMap, gl_PointCoord) * vec4(vColor, 1.0);
            return;
        }

        vec2 trailDir = normalize(screenDeltaCorrected);
        
        // Remap gl_PointCoord from [0, 1] to [-0.5, 0.5]
        vec2 coord = gl_PointCoord - 0.5;

        // Project the coordinate onto the trail direction vector
        float trailCoord = dot(coord, trailDir);
        
        // Calculate distance from the trail's centerline
        float sideDist = length(coord - trailDir * trailCoord);

        // Discard fragments outside the trail shape
        if (abs(trailCoord) > 0.5 || sideDist > 0.5) discard;

        // Fade the trail along its length and at the edges
        float alpha = (0.5 - abs(trailCoord)) * 2.0;
        alpha *= (0.5 - sideDist) * 2.0;

        // Use a combination of speed and transition progress for trail visibility
        float speedFactor = smoothstep(0.0, 0.05, vSpeed);
        float transitionFactor = smoothstep(0.0, 0.5, uIsTransitioning);
        alpha *= (speedFactor + transitionFactor);
        alpha = clamp(alpha, 0.0, 1.0);

        // Use the original texture for a soft edge
        alpha *= texture2D(uMap, gl_PointCoord).a;

        // Make particles brighter during transition
        float intensity = 1.0 + uIsTransitioning * 2.0;

        gl_FragColor = vec4(vColor * intensity, alpha);
    }
`;


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
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.8, 'rgba(200,220,255,0.5)');
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
    const [isReversing, setIsReversing] = useState(false);
    const [showAuthBillboard, setShowAuthBillboard] = useState(false);
    const soundRef = useRef<THREE.PositionalAudio | null>(null);
    const velocities = useRef<THREE.Vector3[]>([]);
    
    // Refs to store Three.js objects for reverse animation
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<any>(null);
    const billboardMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const borderGlowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const vortexMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
    const bloomPassRef = useRef<any>(null);
    const lensingPassRef = useRef<any>(null);
    const chromaticAberrationPassRef = useRef<any>(null);


    const handleEnterClick = useCallback(() => {
        if(isTransitioning || isReversing) return;
        setIsTransitioning(true);
    }, [isTransitioning, isReversing]);
    
    const handleBackClick = useCallback(() => {
        if(isReversing) return;
        console.log('🔙 Back button clicked - starting reverse animation');
        setIsReversing(true);
        setShowAuthBillboard(false); // Hide auth billboard immediately
    }, [isReversing]);

    useEffect(() => {
        if (!mountRef.current) return;

        const currentMount = mountRef.current;

        // Scene setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 15; // Start at landing page position
        cameraRef.current = camera; // Store for reverse animation
        console.log('📷 Camera initialized at:', camera.position, 'FOV:', camera.fov);

        // Load Space HDRI Environment (optional - enhances lighting and reflections)
        // HDRIs are too large for GitHub (50-90MB each), so they should be hosted on your server
        // TODO: Upload HDRI files to your WebSocket server and update URL below
        const rgbeLoader = new RGBELoader();
        
        // HDRI Configuration
        // Option 1: Host on your backend server (recommended)
        //   - Upload HDR files to your server's static assets folder
        //   - Update URL: 'https://your-server.com/assets/hdri/nebula.hdr'
        // Option 2: Use CDN (Cloudflare R2, AWS S3, etc)
        // Option 3: Disable for now (will use black background)
        
        const hdriEnabled = false; // Disabled temporarily - file format issue
        const hdriUrl = 'https://alpha.sniff.agency/assets/hdri/nebula.hdr'; // Server static assets
        
        if (hdriEnabled) {
            rgbeLoader.load(
                hdriUrl,
                (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    scene.environment = texture; // For reflections/lighting
                    scene.background = texture; // For visible background
                    scene.backgroundIntensity = 0.10; // Dimmed for subtle effect
                    console.log('🌌 Space HDRI environment loaded');
                },
                undefined,
                (error) => {
                    console.warn('⚠️ HDRI failed to load, using black background:', error);
                    scene.background = new THREE.Color(0x000000);
                }
            );
        } else {
            // Use black background with particle starfield
            scene.background = new THREE.Color(0x000000);
            console.log('🌌 HDRI disabled - using black background with particle stars');
        }

        const listener = new THREE.AudioListener();
        camera.add(listener);
        const sound = new THREE.PositionalAudio(listener);
        soundRef.current = sound;
        
        // Create audio analyzer for frequency data
        const audioAnalyzer = new THREE.AudioAnalyser(sound, 256);
        
        const audioLoader = new THREE.AudioLoader();
        let audioLoaded = false;
        audioLoader.load('/blackHole.mp3', function(buffer) {
            sound.setBuffer(buffer);
            sound.setLoop(true);
            sound.setVolume(1.0);
            sound.setRefDistance(10);
            sound.setRolloffFactor(2.0);
            
            // Apply lowpass filter for space/underwater effect (same as billboard scene)
            if (sound.context.state === 'running' || sound.context.state === 'suspended') {
                const filter = sound.context.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 100; // Same muffled effect as billboard
                sound.setFilter(filter);
                console.log('🎛️ Lowpass filter applied: 100 Hz (space effect)');
            }
            
            audioLoaded = true;
            console.log('🎵 Audio loaded successfully - click anywhere to start');
        }, undefined, function(error) {
            console.error('❌ Error loading audio:', error);
        });

        // Mascot loading removed - will be re-added later with proper model

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        currentMount.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controlsRef.current = controls; // Store for reverse animation
        controls.enabled = true; // Start with controls enabled
        controls.enableDamping = true;
        controls.dampingFactor = 0.03;
        controls.enableZoom = false; // Disable scroll zoom
        controls.minDistance = 5;
        controls.maxDistance = 40;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.4;
        controls.enablePan = false;

        const ambientLight = new THREE.AmbientLight(0x4c00ff, 0.2);
        scene.add(ambientLight);
        
        // Point light for lens flare effects
        const flareLight = new THREE.PointLight(0xffffff, 1.5, 100);
        flareLight.position.set(0, 0, 0); // At black hole center
        scene.add(flareLight);

        // Black Hole Core - a perfect, non-reflective black sphere
        const blackHoleGeometry = new THREE.SphereGeometry(1.5, 64, 64);
        const blackHoleMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const blackHole = new THREE.Mesh(blackHoleGeometry, blackHoleMaterial);
        blackHole.add(sound);
        scene.add(blackHole);
        
        const diskVertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
        const diskFragmentShader = `
            varying vec2 vUv;
            uniform float uTime;

            float rand(vec2 n) { 
                return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); 
            }

            float noise(vec2 p) {
                vec2 ip = floor(p);
                vec2 u = fract(p);
                u = u*u*(3.0-2.0*u);
                float res = mix(
                    mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
                    mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x),
                    u.y);
                return res*res;
            }

            float fbm(vec2 p) {
                float total = 0.0;
                float amplitude = 0.5;
                for (int i = 0; i < 4; i++) {
                    total += noise(p) * amplitude;
                    p *= 2.0;
                    amplitude *= 0.5;
                }
                return total;
            }

            void main() {
                vec2 uv = vUv - 0.5;
                float distortion = fbm(uv * 4.0 + uTime * 0.1) * 0.1;
                vec2 distortedUv = uv + distortion;
                float dist = length(distortedUv);

                if (dist < 0.2 || dist > 0.5) {
                    discard;
                }
                
                float angle = atan(distortedUv.y, distortedUv.x);
                float radialNoise = fbm(vec2(dist * 10.0, uTime * 0.3));
                float wave = sin(dist * 40.0 - uTime * 2.0 + angle * 5.0 + radialNoise * 2.0);
                float waveMix = wave * 0.5 + 0.5;

                float pulseFactor = 0.5 + 0.5 * sin(uTime * 2.5);

                vec3 cyan = vec3(0.0, 1.0, 1.0);
                vec3 magenta = vec3(1.0, 0.0, 1.0);
                
                vec3 color1 = mix(cyan, magenta, pulseFactor);
                vec3 color2 = mix(magenta, cyan, pulseFactor);

                vec3 color = mix(color1, color2, waveMix);

                float intensity = pow(1.0 - smoothstep(0.2, 0.5, dist), 1.5);
                float innerGlow = pow(1.0 - smoothstep(0.2, 0.25, dist), 2.0);
                vec3 hot = vec3(1.0, 1.0, 0.8);
                color = mix(color, hot, innerGlow);
                
                float intensityPulse = 0.7 + 0.3 * sin(uTime * 3.0 - dist * 10.0);
                
                float baseAlpha = (intensity * (radialNoise * 0.5 + 0.5) + innerGlow * 0.8);
                float finalAlpha = baseAlpha * intensityPulse;

                gl_FragColor = vec4(color, finalAlpha);
            }
        `;
        const diskGeometry = new THREE.TorusGeometry(3.5, 0.7, 16, 128);
        const diskMaterial = new THREE.ShaderMaterial({ vertexShader: diskVertexShader, fragmentShader: diskFragmentShader, uniforms: { uTime: { value: 0 }, }, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
        const accretionDisk = new THREE.Mesh(diskGeometry, diskMaterial);
        accretionDisk.rotation.x = Math.PI * 0.55;
        scene.add(accretionDisk);

        // SINGULARITY VORTEX - Swirling whirlpool effect
        const vortexVertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        const vortexFragmentShader = `
            uniform float uTime;
            uniform float uIntensity;
            varying vec2 vUv;
            
            // Noise function for organic variation
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            
            void main() {
                vec2 center = vec2(0.5, 0.5);
                vec2 pos = vUv - center;
                float dist = length(pos);
                float angle = atan(pos.y, pos.x);
                
                // Create spiral pattern
                float spiral = angle + dist * 20.0 - uTime * 2.0;
                float spiralPattern = sin(spiral * 8.0) * 0.5 + 0.5;
                
                // Create inward swirl motion
                float swirl = angle - dist * 15.0 + uTime * 3.0;
                float swirlPattern = sin(swirl * 12.0) * 0.5 + 0.5;
                
                // Combine patterns
                float pattern = mix(spiralPattern, swirlPattern, 0.5);
                
                // Add noise for organic feel
                float n = noise(vec2(angle * 8.0, dist * 10.0 - uTime * 0.5));
                pattern = mix(pattern, n, 0.3);
                
                // Radial gradient (darker at edges, brighter at center)
                float radial = 1.0 - smoothstep(0.0, 0.5, dist);
                
                // Center singularity glow
                float centerGlow = exp(-dist * 25.0) * (1.0 + sin(uTime * 4.0) * 0.3);
                
                // Colors: deep purple to cyan to white at center
                vec3 color1 = vec3(0.2, 0.0, 0.4); // Deep purple
                vec3 color2 = vec3(0.0, 0.8, 1.0); // Cyan
                vec3 color3 = vec3(1.0, 1.0, 1.0); // White
                
                vec3 color = mix(color1, color2, pattern * radial);
                color = mix(color, color3, centerGlow);
                
                // Pulsing intensity
                float pulse = 0.7 + 0.3 * sin(uTime * 2.5);
                float alpha = (pattern * radial * 0.6 + centerGlow * 0.8) * pulse * uIntensity;
                
                // Discard outer areas
                if (dist > 0.5) discard;
                
                gl_FragColor = vec4(color, alpha);
            }
        `;
        
        const vortexGeometry = new THREE.PlaneGeometry(10, 10, 1, 1); // Larger vortex (was 6x6)
        const vortexMaterial = new THREE.ShaderMaterial({
            vertexShader: vortexVertexShader,
            fragmentShader: vortexFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 0.0 }, // Start invisible
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        vortexMaterialRef.current = vortexMaterial; // Store for reverse animation
        const singularityVortex = new THREE.Mesh(vortexGeometry, vortexMaterial);
        singularityVortex.rotation.x = 0; // Face camera directly (not tilted)
        singularityVortex.position.set(-1.5, 0, -3); // Left side, behind billboard
        scene.add(singularityVortex);

        // AUTH BILLBOARD - Line-traced frame that emerges from vortex
        // Create tracing line (will animate from center outward)
        const linePoints: THREE.Vector3[] = [];
        const billboardWidth = 5; // Wider (was 4)
        const billboardHeight = 3; // Taller (was 2.5)
        const billboardZ = 2; // Closer to camera (was 1.5, camera at z=5)
        
        // Start all points at vortex center (0, 0, 0)
        for (let i = 0; i < 50; i++) {
            linePoints.push(new THREE.Vector3(0, 0, 0));
        }
        
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff, // Cyan
            linewidth: 5, // Thicker line for visibility
            transparent: true,
            opacity: 0,
            visible: false, // Hidden by default to prevent visual bugs
        });
        const tracingLine = new THREE.Line(lineGeometry, lineMaterial);
        tracingLine.visible = false; // Double ensure it's hidden
        scene.add(tracingLine);
        
        // Add a glowing particle trail effect for the line
        const trailMaterial = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.1,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            visible: false, // Hidden by default
        });
        const trailParticles = new THREE.Points(lineGeometry, trailMaterial);
        trailParticles.visible = false; // Double ensure it's hidden
        scene.add(trailParticles);
        
        // Billboard panel (starts invisible)
        const billboardGeometry = new THREE.PlaneGeometry(billboardWidth, billboardHeight);
        const billboardMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
        });
        billboardMaterialRef.current = billboardMaterial; // Store for reverse animation
        const billboard = new THREE.Mesh(billboardGeometry, billboardMaterial);
        billboard.position.set(0, 0, billboardZ);
        scene.add(billboard);
        
        // Border glow for billboard
        const borderGlowGeometry = new THREE.PlaneGeometry(billboardWidth + 0.1, billboardHeight + 0.1);
        const borderGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff, // Cyan glow
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
        });
        borderGlowMaterialRef.current = borderGlowMaterial; // Store for reverse animation
        const borderGlow = new THREE.Mesh(borderGlowGeometry, borderGlowMaterial);
        borderGlow.position.set(0, 0, billboardZ - 0.01); // Slightly behind billboard
        scene.add(borderGlow);
        
        // Create lensflare textures programmatically (avoids CORS issues)
        const createLensflareTexture0 = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d')!;
            const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.1, 'rgba(255,255,255,0.8)');
            gradient.addColorStop(0.5, 'rgba(100,150,255,0.3)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 512, 512);
            return new THREE.CanvasTexture(canvas);
        };
        
        const createLensflareTexture3 = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d')!;
            const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            gradient.addColorStop(0, 'rgba(200,220,255,0.8)');
            gradient.addColorStop(0.5, 'rgba(100,150,255,0.3)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 128, 128);
            return new THREE.CanvasTexture(canvas);
        };
        
        const textureFlare0 = createLensflareTexture0();
        const textureFlare3 = createLensflareTexture3();
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
        const prevPositions = new Float32Array(particleCount * 3);
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
            
            // Make most particles dim to appear as sharp points, with a few bright "hero" stars that will bloom.
            if (Math.random() > 0.995) { // 0.5% of stars are very bright
                // Use HDR values (greater than 1.0) to make these stars pop with the bloom effect.
                const brightColor = baseColor.clone().lerp(whiteColor, 0.5);
                colors[i3] = brightColor.r * 1.5;
                colors[i3 + 1] = brightColor.g * 1.5;
                colors[i3 + 2] = brightColor.b * 1.5;
            } else {
                // The vast majority of stars will be dimmer and fall below the bloom threshold.
                const brightness = Math.random() * 0.8 + 0.6; // Range from 0.6 to 1.4
                const mixedColor = baseColor.clone().lerp(whiteColor, Math.random() * 0.3);
                colors[i3] = mixedColor.r * brightness;
                colors[i3 + 1] = mixedColor.g * brightness;
                colors[i3 + 2] = mixedColor.b * brightness;
            }


            // Initial velocity for a structured, decaying orbit
            const orbitAxis = new THREE.Vector3(
                (Math.random() - 0.5) * 0.4, // Small randomness for X
                1, // Strong bias towards Y-axis orbit (like the disk)
                (Math.random() - 0.5) * 0.4  // Small randomness for Z
            ).normalize();
            const perpendicular = p.clone().cross(orbitAxis).normalize();
            const initialSpeed = Math.sqrt(GRAVITATIONAL_CONSTANT * 1.5 / p.length()) * (0.8 + Math.random() * 0.1);
            const velocity = perpendicular.multiplyScalar(initialSpeed);
            velocities.current.push(velocity);
        }
        prevPositions.set(positions);

        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('prevPosition', new THREE.BufferAttribute(prevPositions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: createParticleTexture() },
                uSize: { value: 0.2 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                uIsTransitioning: { value: 0.0 },
            },
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            vertexColors: true,
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(particles);
        
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const lensingPass = new ShaderPass(LensingShader);
        lensingPass.uniforms.uStrength.value = 0.05; // Start with subtle lensing
        lensingPassRef.current = lensingPass; // Store for reverse animation
        composer.addPass(lensingPass);
        
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        // A high threshold ensures only the brightest parts of the scene (accretion disk, hero stars) will glow,
        // preventing the entire starfield from becoming a blurry haze.
        bloomPass.threshold = 0.85; 
        bloomPass.strength = 1.0; // Reduced strength for a more subtle, less overwhelming glow.
        bloomPass.radius = 0.3; // A smaller radius creates a tighter, more defined glow.
        bloomPassRef.current = bloomPass; // Store for reverse animation
        composer.addPass(bloomPass);
        
        const chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
        chromaticAberrationPassRef.current = chromaticAberrationPass; // Store for reverse animation
        composer.addPass(chromaticAberrationPass);

        const clock = new THREE.Clock();
        let animationFrameId: number;

        const animate = () => {
            const delta = Math.min(clock.getDelta(), 0.05); // Cap delta to prevent large jumps on lag
            const elapsedTime = clock.getElapsedTime();
            diskMaterial.uniforms.uTime.value = elapsedTime;
            vortexMaterial.uniforms.uTime.value = elapsedTime;

            // Mascot animations removed (mascot temporarily disabled)

            // Audio reactivity - Enhanced responsiveness
            let bass = 0, mid = 0, treble = 0;
            if (soundRef.current?.isPlaying) {
                const frequencyData = audioAnalyzer.getFrequencyData();
                
                // Extract frequency ranges (0-255 values)
                // Bass: 20-250 Hz (roughly indices 0-32)
                bass = frequencyData.slice(0, 32).reduce((a, b) => a + b, 0) / (32 * 255);
                
                // Mid: 250-2000 Hz (indices 32-128)
                mid = frequencyData.slice(32, 128).reduce((a, b) => a + b, 0) / (96 * 255);
                
                // Treble: 2000+ Hz (indices 128-256)
                treble = frequencyData.slice(128, 256).reduce((a, b) => a + b, 0) / (128 * 255);
            }

            // ENHANCED DISK RESPONSIVENESS
            
            // 1. Bass -> Lens flare intensity (more dramatic)
            const bassPulse = 1.0 + bass * 3.5; // 1.0 to 4.5 multiplier (was 1.5)
            flareLight.intensity = (1.5 + Math.sin(elapsedTime * 2.5) * 0.5) * bassPulse;
            
            // 2. Bass -> Disk scale pulsing (physical growth)
            const scaleBoost = 1.0 + bass * 0.35; // Grows up to 35% larger with bass
            accretionDisk.scale.setScalar(scaleBoost);
            
            // 3. Mid -> Disk rotation speed (more dramatic)
            const rotationSpeed = 0.008 + mid * 0.025; // Much faster with music (was 0.01)
            accretionDisk.rotation.z += rotationSpeed;
            
            // 4. Treble -> Disk glow/brightness via material opacity modulation
            diskMaterial.opacity = 0.8 + treble * 0.2; // Brighter with treble
            
            // 5. Mid + Treble -> Color temperature shift (warmer with energy)
            const colorShift = (mid + treble) / 2;
            ambientLight.color.setHSL(0.55 - colorShift * 0.15, 1.0, 0.5); // Shifts from cyan to magenta

            const screenPosition = blackHole.position.clone().project(camera);
            lensingPass.uniforms.uCenter.value.set((screenPosition.x + 1) / 2, (screenPosition.y + 1) / 2);

            const posAttr = particles.geometry.getAttribute('position') as THREE.BufferAttribute;
            const prevPosAttr = particles.geometry.getAttribute('prevPosition') as THREE.BufferAttribute;
            const colorAttr = particles.geometry.getAttribute('color') as THREE.BufferAttribute;
            const cyanColor = new THREE.Color(0x00ffff);
            const magentaColor = new THREE.Color(0xff00ff);
            
            // Before updating positions, copy current to previous
            prevPosAttr.copy(posAttr);

            for (let i = 0; i < particleCount; i++) {
                const p = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                
                if(isReversing) {
                    const speed = 0.2 + p.length() * 0.02;
                    p.z += speed;
                    p.x *= 1.03;
                    p.y *= 1.03;

                    const r = colorAttr.getX(i), g = colorAttr.getY(i), b = colorAttr.getZ(i);
                    colorAttr.setXYZ(i, r + (baseColor.r - r) * 0.01, g + (baseColor.g - g) * 0.01, b + (baseColor.b - b) * 0.01);
                    
                    if (p.length() > 35) {
                        const r_reset = 20 + Math.random() * 10;
                        const theta = Math.random() * Math.PI * 2;
                        const phi = Math.acos((Math.random() * 2) - 1);
                        p.set(r_reset * Math.sin(phi) * Math.cos(theta), r_reset * Math.sin(phi) * Math.sin(theta), r_reset * Math.cos(phi));
                        const mixedColor = baseColor.clone().lerp(whiteColor, Math.random() * 0.5);
                        colorAttr.setXYZ(i, mixedColor.r, mixedColor.g, mixedColor.b);
                    }

                } else if(isTransitioning) {
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
                        
                        if (Math.random() > 0.995) {
                            const brightColor = baseColor.clone().lerp(whiteColor, 0.5);
                            colorAttr.setXYZ(i, brightColor.r * 1.5, brightColor.g * 1.5, brightColor.b * 1.5);
                        } else {
                            const brightness = Math.random() * 0.8 + 0.6; // Range from 0.6 to 1.4
                            const mixedColor = baseColor.clone().lerp(whiteColor, Math.random() * 0.3);
                            colorAttr.setXYZ(i, mixedColor.r * brightness, mixedColor.g * brightness, mixedColor.b * brightness);
                        }


                        const orbitAxis = new THREE.Vector3((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4).normalize();
                        const perpendicular = p.clone().cross(orbitAxis).normalize();
                        const initialSpeed = Math.sqrt(GRAVITATIONAL_CONSTANT * 1.5 / p.length()) * (0.8 + Math.random() * 0.1);
                        v.copy(perpendicular.multiplyScalar(initialSpeed));

                    } else {
                        const force = GRAVITATIONAL_CONSTANT / (distSq || 1);
                        const acceleration = p.clone().negate().normalize().multiplyScalar(force);
                        
                        // Update velocity (v = v + a * dt)
                        v.add(acceleration.multiplyScalar(delta));

                        // Add drag for orbital decay
                        const dragFactor = 0.1;
                        v.multiplyScalar(1.0 - (dragFactor * delta));
                        
                        // Update position (p = p + v * dt)
                        p.add(v.clone().multiplyScalar(delta));
                    }
                }
                posAttr.setXYZ(i, p.x, p.y, p.z);
            }
            posAttr.needsUpdate = true;
            prevPosAttr.needsUpdate = true;
            if (isTransitioning || isReversing || elapsedTime < 2) {
                colorAttr.needsUpdate = true;
            }

            if (!isTransitioning && !isReversing) {
                controls.update();
            }

            // Bloom responds to overall audio energy (more dramatic)
            if (soundRef.current?.isPlaying) {
                const avgEnergy = (bass + mid + treble) / 3;
                bloomPass.strength = 1.0 + avgEnergy * 4.0; // Strong bloom boost: 1.0-5.0 (was 2.0)
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
            particleMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        };
        handleResize();
        window.addEventListener('resize', handleResize);

        if (isTransitioning) {
            controls.enabled = false; // Disable orbit controls during transition
            
            // Animate the particle trail uniform for dramatic stretching
            gsap.to(particleMaterial.uniforms.uIsTransitioning, { value: 3.5, duration: 2.5, ease: 'power4.in' });
            
            if (soundRef.current && soundRef.current.context.state === 'running') {
                // Create and connect filter for sound distortion
                const filter = soundRef.current.context.createBiquadFilter();
                soundRef.current.setFilter(filter);
                filter.type = 'lowpass';
                filter.frequency.value = 4000; // Start with a high frequency (little effect)
                gsap.to(filter.frequency, { value: 100, duration: 2.8, ease: 'power4.in' });
            }

            const targetColor = new THREE.Color(0xff00ff); // Aggressive magenta for the flash
            const whiteColor = new THREE.Color(0xffffff);

            // Billboard animation - line traces from vortex to form frame
            const animateBillboardTrace = () => {
                console.log('🖼️ Animating billboard trace...');
                
                // Hide the line for now - it's causing visual issues
                // We'll just fade in the billboard directly
                
                // Skip the line tracing animation for now
                // Just show the billboard with a nice fade-in effect
                
                gsap.to(billboardMaterial, { 
                    opacity: 0.85, 
                    duration: 0.8,
                    ease: 'power2.out'
                });
                
                gsap.to(borderGlowMaterial, { 
                    opacity: 0.4, 
                    duration: 0.8,
                    ease: 'power2.out',
                    onComplete: () => {
                        // Re-enable controls so user can rotate around the vortex
                        controls.enabled = true;
                        console.log('🎮 Controls enabled - you can now rotate around the vortex!');
                        
                        // Show React auth UI overlay after billboard fades in
                        setShowAuthBillboard(true);
                        console.log('✨ Billboard ready! Auth UI should appear.');
                        
                        // IMPORTANT: Do NOT call onEnter here! 
                        // User must click "Connect Wallet" button
                    }
                });
            };

            // Changed: No longer auto-calls onEnter after transition
            const tl = gsap.timeline({ 
                onComplete: () => {
                    console.log('🌀 Singularity transition complete. Starting billboard animation...');
                    animateBillboardTrace();
                }
            });
            
            tl
              // Camera position: center on the scene
              .to(camera.position, { 
                  x: 0,
                  y: 0, // Centered vertically
                  z: 5.0, // Further back to see both vortex and billboard
                  duration: 3.5, 
                  ease: 'power3.inOut' 
              }, 0)
              
              // Multi-axis rotation: tumbling then stabilize to observe
              .to(camera.rotation, { 
                  z: Math.PI * 2, // 2 barrel rolls 
                  duration: 2.5, 
                  ease: 'power2.inOut' 
              }, 0)
              .to(camera.rotation, { 
                  x: 0, // Face straight ahead (not tilted)
                  y: 0, // Face forward
                  z: 0, // No roll at end
                  duration: 1.5, 
                  ease: 'power3.out' 
              }, 2.0) // Stabilize at end
              
              // Camera shake: brief vibration during approach
              .to(camera.position, {
                  x: "+=0.2",
                  y: "+=0.15",
                  duration: 0.08,
                  repeat: 8, // Reduced from 15
                  yoyo: true,
                  ease: 'none'
              }, 1.0)
              
              // SINGULARITY VORTEX: Fade in the whirlpool
              .to(vortexMaterial.uniforms.uIntensity, {
                  value: 1.5, // Full intensity
                  duration: 2.5,
                  ease: 'power2.in'
              }, 1.0)
              
              // --- DYNAMIC LIGHTING: Color shift through dimensions ---
              .to(ambientLight, {
                  intensity: 4.0, // Reduced from 6.0 for visibility
                  duration: 1.0,
                  ease: 'power2.in'
              }, 0.5)
              .to(ambientLight.color, {
                  r: targetColor.r,
                  g: targetColor.g,
                  b: targetColor.b,
                  duration: 0.8,
                  ease: 'power2.in'
              }, 0.5)
              .to(ambientLight.color, {
                  r: whiteColor.r,
                  g: whiteColor.g,
                  b: whiteColor.b,
                  duration: 0.7,
                  ease: 'power3.in'
              }, 1.5)
              .to(ambientLight, {
                  intensity: 0.8, // Dim but visible (not complete darkness)
                  duration: 1.2,
                  ease: 'power3.out'
              }, 2.5)
              
              // Bloom: Moderate glow to highlight singularity
              .to(bloomPass, { 
                  strength: 6, // Dramatic but not blinding
                  duration: 2.0, 
                  ease: 'power2.in' 
              }, 0.5)
              .to(bloomPass, { 
                  strength: 8, // Peak glow - singularity visible
                  duration: 1.5, 
                  ease: 'power2.out' 
              }, 2.0)
              
              // Gravitational lensing: Noticeable but not overwhelming
              .to(lensingPass.uniforms.uStrength, { 
                  value: 0.4, // Moderate distortion
                  duration: 3.5, 
                  ease: 'power3.inOut' 
              }, 0)
              .to(lensingPass.uniforms.uRadius, { 
                  value: 0.6, // Centered on singularity
                  duration: 3.5, 
                  ease: 'power2.inOut' 
              }, 0)
              
              // Chromatic aberration: Subtle reality warping
              .to(chromaticAberrationPass.uniforms.uAberrationAmount, {
                  value: 0.015, // Noticeable but not extreme
                  duration: 2.5,
                  ease: 'power3.in'
              }, 0.5)
              
              // FOV: Moderate fish-eye for immersion
              .to(camera, { 
                  fov: 95, // Wider view but not distorted
                  duration: 2.5, 
                  ease: 'power2.inOut', 
                  onUpdate: () => camera.updateProjectionMatrix() 
              }, 0.5);

        } else if (isReversing) {
            // Reverse animation - return to landing page
            console.log('🔄 Executing reverse animation to return to landing page');
            controls.enabled = false;
            
            gsap.timeline({ 
                onComplete: () => { 
                    controls.enabled = true; 
                    setIsReversing(false);
                    setIsTransitioning(false);
                }
            })
              // Hide billboard and vortex
              .to(billboardMaterial, { opacity: 0, duration: 0.3 }, 0)
              .to(borderGlowMaterial, { opacity: 0, duration: 0.3 }, 0)
              .to(vortexMaterial.uniforms.uIntensity, { value: 0, duration: 0.5 }, 0)
              
              // Camera returns to starting position
              .to(camera.position, { 
                  x: 0,
                  y: 0,
                  z: 15, 
                  duration: 2.5, 
                  ease: 'power3.out' 
              }, 0.3)
              
              // Reset camera rotation
              .to(camera.rotation, {
                  x: 0,
                  y: 0,
                  z: 0,
                  duration: 2.0,
                  ease: 'power2.out'
              }, 0.3)
              
              // Reset post-processing
              .to(bloomPass, { strength: 1.0, duration: 2 }, 0.3)
              .to(lensingPass.uniforms.uStrength, { value: 0.05, duration: 2.5, ease: 'power3.out' }, 0.3)
              .to(lensingPass.uniforms.uRadius, { value: 0.25, duration: 2.5, ease: 'power3.out' }, 0.3)
              .to(chromaticAberrationPass.uniforms.uAberrationAmount, { value: 0.002, duration: 2.0, ease: 'power2.out' }, 0.3)
              .to(camera, { fov: 75, duration: 2, ease: 'power2.out', onUpdate: () => camera.updateProjectionMatrix() }, 0.3);
        }
        
        let audioStarted = false;
        const playAudio = () => {
            if (audioStarted) return; // Only play once
            
            // Resume audio context if suspended (browser autoplay policy)
            if (listener.context.state === 'suspended') {
                listener.context.resume().then(() => {
                    console.log('🔊 Audio context resumed');
                });
            }
            
            // Play audio if loaded and not already playing
            if (soundRef.current && audioLoaded && !soundRef.current.isPlaying) {
                soundRef.current.play();
                audioStarted = true;
                console.log('▶️ Audio playback started');
                window.removeEventListener('pointerdown', playAudio);
            } else if (!audioLoaded) {
                console.log('⏳ Audio still loading, please wait...');
            }
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
    }, [isTransitioning, onEnter]); // Removed isReversing - it shouldn't recreate the scene
    
    // Separate effect to handle reverse animation without recreating the scene
    useEffect(() => {
        if (!isReversing || !cameraRef.current || !controlsRef.current) return;
        
        console.log('🔄 Executing reverse animation back to landing page');
        
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const billboardMaterial = billboardMaterialRef.current;
        const borderGlowMaterial = borderGlowMaterialRef.current;
        const vortexMaterial = vortexMaterialRef.current;
        const bloomPass = bloomPassRef.current;
        const lensingPass = lensingPassRef.current;
        const chromaticAberrationPass = chromaticAberrationPassRef.current;
        
        controls.enabled = false;
        
        const tl = gsap.timeline({ 
            onComplete: () => { 
                controls.enabled = true; 
                setIsReversing(false);
                setIsTransitioning(false);
                console.log('✅ Reverse animation complete - back at landing page');
            }
        });
        
        // Hide billboard and vortex if they exist
        if (billboardMaterial) {
            tl.to(billboardMaterial, { opacity: 0, duration: 0.3 }, 0);
        }
        if (borderGlowMaterial) {
            tl.to(borderGlowMaterial, { opacity: 0, duration: 0.3 }, 0);
        }
        if (vortexMaterial) {
            tl.to(vortexMaterial.uniforms.uIntensity, { value: 0, duration: 0.5 }, 0);
        }
        
        // Camera returns to starting position
        tl.to(camera.position, { 
            x: 0,
            y: 0,
            z: 15, 
            duration: 2.5, 
            ease: 'power3.out' 
        }, 0.3);
        
        // Reset camera rotation
        tl.to(camera.rotation, {
            x: 0,
            y: 0,
            z: 0,
            duration: 2.0,
            ease: 'power2.out'
        }, 0.3);
        
        // Reset post-processing if they exist
        if (bloomPass) {
            tl.to(bloomPass, { strength: 1.0, duration: 2 }, 0.3);
        }
        if (lensingPass) {
            tl.to(lensingPass.uniforms.uStrength, { value: 0.05, duration: 2.5, ease: 'power3.out' }, 0.3);
            tl.to(lensingPass.uniforms.uRadius, { value: 0.25, duration: 2.5, ease: 'power3.out' }, 0.3);
        }
        if (chromaticAberrationPass) {
            tl.to(chromaticAberrationPass.uniforms.uAberrationAmount, { value: 0.002, duration: 2.0, ease: 'power2.out' }, 0.3);
        }
        
        tl.to(camera, { fov: 75, duration: 2, ease: 'power2.out', onUpdate: () => camera.updateProjectionMatrix() }, 0.3);
        
        return () => {
            tl.kill(); // Clean up timeline if component unmounts
        };
    }, [isReversing]);

    return (
        <div className="relative w-full h-full">
            <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />
            <div className={`absolute inset-0 flex flex-col items-center justify-between p-8 md:p-12 transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${isTransitioning || isReversing ? '!opacity-0' : ''} pointer-events-none`}>
                {/* Top: Title */}
                <div className="text-center pointer-events-auto w-full">
                    <h1 className="text-5xl md:text-7xl font-bold uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif", textShadow: '0 0 10px #fff, 0 0 20px #0ff, 0 0 30px #0ff' }}>
                        SNIFF AGENCY
                    </h1>
                </div>

                {/* Center: Button */}
                <div className="pointer-events-auto">
                    <button
                        onClick={handleEnterClick}
                        className="px-10 py-4 border-2 border-cyan-300 text-cyan-300 rounded-full text-xl font-bold uppercase tracking-widest
                                   transform hover:scale-105 hover:bg-cyan-300 hover:text-black hover:shadow-[0_0_25px_#0ff] transition-all duration-300"
                    >
                        ENTER
                    </button>
                </div>

                {/* Bottom: Tagline + Instructions */}
                <div className="text-center pointer-events-auto w-full">
                    <p className="text-xl md:text-2xl mb-2 text-cyan-300" style={{ fontFamily: "'Space Grotesk', sans-serif", textShadow: '0 0 5px #0ff' }}>
                        Follow the Money.
                    </p>
                    <div className="text-gray-400 text-sm">
                        <p>Click & drag to orbit. Scroll to zoom.</p>
                    </div>
                </div>
            </div>
            
            {/* AUTH BILLBOARD UI - Appears after line trace animation */}
            {showAuthBillboard && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none auth-billboard-container">
                    <div 
                        className="pointer-events-auto bg-black/90 border-2 border-cyan-400 rounded-lg p-8 w-[500px] max-w-[90vw] auth-billboard"
                        style={{
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 0 30px rgba(0, 255, 255, 0.5)',
                        }}
                    >
                        <div className="text-center space-y-6">
                            {/* Back Button */}
                            <button
                                onClick={handleBackClick}
                                className="absolute top-4 left-4 text-cyan-400 hover:text-cyan-300 transition-colors duration-200"
                                title="Go back"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>
                            
                            {/* Title */}
                            <div>
                                <h2 className="text-3xl font-bold text-cyan-300 mb-2" style={{ textShadow: '0 0 10px #0ff' }}>
                                    AUTHENTICATION REQUIRED
                                </h2>
                                <div className="h-1 w-20 bg-gradient-to-r from-cyan-500 to-transparent mx-auto" />
                            </div>
                            
                            {/* Message */}
                            <p className="text-gray-300 text-lg">
                                The singularity has granted access.<br />
                                Connect your wallet to proceed.
                            </p>
                            
                            {/* Connect Wallet Button - DISABLED for now */}
                            <button
                                disabled
                                className="w-full px-8 py-4 bg-gradient-to-r from-gray-600 to-gray-700 
                                           text-gray-400 font-bold rounded-lg cursor-not-allowed opacity-60"
                            >
                                CONNECT WALLET (Coming Soon)
                            </button>
                            
                            {/* Supported Wallets */}
                            <div className="flex justify-center gap-4 pt-4 opacity-70">
                                <div className="text-xs text-gray-400">
                                    Phantom • MetaMask • WalletConnect
                                </div>
                            </div>
                            
                            {/* Interaction hint */}
                            <div className="text-center pt-2 opacity-50">
                                <p className="text-xs text-gray-500">
                                    💡 Drag outside this panel to rotate the view
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.9); }
                    to { transform: scale(1); }
                }
                .auth-billboard {
                    animation: fadeIn 0.5s ease-out, scaleIn 0.5s ease-out;
                }
            `}} />
        </div>
    );
};


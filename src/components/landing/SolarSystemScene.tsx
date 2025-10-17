/**
 * SOLAR SYSTEM SPACES MANAGER
 * 
 * A 3D interactive universe for managing livestream spaces as a solar system
 * 
 * CONCEPT:
 * - Sun = Main broadcast/stage
 * - Planets = Different channels/topics/rooms  
 * - Moons = Sub-streams or breakout rooms
 * - Asteroids = Users/viewers floating in space
 * - Comets = Super chats/donations/rewards
 * - Satellites = Moderators/bots
 * - Rings = Featured/promoted streams
 * 
 * USER INTERACTIONS:
 * - Click on planet = Join that stream/channel
 * - Asteroid (you) flies to planet and enters orbit
 * - Chat activity = Planet glows brighter
 * - Viewer count = Planet size
 * - Send donation = Launch comet animation
 * - Level up = Asteroid grows bigger
 * 
 * REWARD MECHANICS:
 * - Watch time = XP (asteroid size)
 * - Chat participation = Glow effect
 * - Donations = Comet trail
 * - Streaks = Longer trails
 * - Achievements = Orbital rings
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// Planet Data Structure
interface Planet {
    id: string;
    name: string;
    size: number;
    orbitRadius: number;
    orbitSpeed: number;
    color: number;
    viewerCount: number;
    chatActivity: number;
    isFeatured: boolean;
    mesh?: THREE.Mesh;
    orbitLine?: THREE.Line;
    moons: Moon[];
}

interface Moon {
    id: string;
    name: string;
    size: number;
    orbitRadius: number;
    mesh?: THREE.Mesh;
}

// User/Asteroid Data
interface UserAsteroid {
    id: string;
    name: string;
    level: number;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    targetPlanet?: string;
    mesh?: THREE.Mesh;
    trail?: THREE.Points;
}

// Sun Corona Shader
const SunShader = {
    uniforms: {
        uTime: { value: 0 },
        uColorCore: { value: new THREE.Color(0xffff00) },
        uColorCorona: { value: new THREE.Color(0xff6600) },
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        uniform float uTime;
        
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            
            vec3 pos = position;
            
            // Pulsating effect
            float pulse = sin(uTime * 2.0) * 0.05 + 1.0;
            pos *= pulse;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        uniform float uTime;
        uniform vec3 uColorCore;
        uniform vec3 uColorCorona;
        
        void main() {
            vec3 viewDir = normalize(cameraPosition - vPosition);
            float fresnel = pow(1.0 - dot(viewDir, vNormal), 2.0);
            
            // Solar flares
            float flare = sin(vPosition.x * 10.0 + uTime) * 
                         cos(vPosition.y * 10.0 - uTime) * 
                         sin(vPosition.z * 10.0 + uTime * 2.0);
            flare = smoothstep(0.3, 0.7, flare);
            
            vec3 color = mix(uColorCore, uColorCorona, fresnel + flare * 0.3);
            
            gl_FragColor = vec4(color, 1.0);
        }
    `,
};

// Comet Trail Shader  
const CometShader = {
    uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x00ffff) },
        uOpacity: { value: 1.0 },
    },
    vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        
        void main() {
            vAlpha = alpha;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        
        void main() {
            vec2 center = gl_PointCoord - 0.5;
            float dist = length(center);
            float alpha = smoothstep(0.5, 0.0, dist) * vAlpha * uOpacity;
            
            gl_FragColor = vec4(uColor, alpha);
        }
    `,
};

// Main Component
export function SolarSystemScene() {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [_selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
    const [userLevel, _setUserLevel] = useState(1);
    const [viewMode, setViewMode] = useState<'overview' | 'planet' | 'first-person'>('overview');
    
    // Sample Data
    const [planets] = useState<Planet[]>([
        {
            id: 'earth',
            name: 'Main Stage',
            size: 1.5,
            orbitRadius: 8,
            orbitSpeed: 0.001,
            color: 0x4444ff,
            viewerCount: 1250,
            chatActivity: 0.8,
            isFeatured: true,
            moons: [
                { id: 'moon1', name: 'VIP Lounge', size: 0.3, orbitRadius: 2 }
            ]
        },
        {
            id: 'mars',
            name: 'Gaming Room',
            size: 1.0,
            orbitRadius: 12,
            orbitSpeed: 0.0008,
            color: 0xff4444,
            viewerCount: 420,
            chatActivity: 0.6,
            isFeatured: false,
            moons: []
        },
        {
            id: 'jupiter',
            name: 'Music Stage',
            size: 2.0,
            orbitRadius: 20,
            orbitSpeed: 0.0005,
            color: 0xffaa44,
            viewerCount: 3200,
            chatActivity: 0.9,
            isFeatured: true,
            moons: [
                { id: 'io', name: 'Backstage', size: 0.25, orbitRadius: 2.5 },
                { id: 'europa', name: 'Requests', size: 0.2, orbitRadius: 3 }
            ]
        },
        {
            id: 'saturn',
            name: 'Talk Show',
            size: 1.8,
            orbitRadius: 28,
            orbitSpeed: 0.0003,
            color: 0xffffaa,
            viewerCount: 890,
            chatActivity: 0.7,
            isFeatured: false,
            moons: []
        }
    ]);
    
    const [userAsteroids] = useState<UserAsteroid[]>([]);
    
    // Launch comet effect
    const launchComet = (fromPos: THREE.Vector3, toPos: THREE.Vector3) => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;
        
        const cometGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const cometMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 1
        });
        const comet = new THREE.Mesh(cometGeometry, cometMaterial);
        comet.position.copy(fromPos);
        scene.add(comet);
        
        // Create trail
        const trailGeometry = new THREE.BufferGeometry();
        const trailPositions = new Float32Array(100 * 3);
        const trailSizes = new Float32Array(100);
        const trailAlphas = new Float32Array(100);
        
        for (let i = 0; i < 100; i++) {
            trailPositions[i * 3] = fromPos.x;
            trailPositions[i * 3 + 1] = fromPos.y;
            trailPositions[i * 3 + 2] = fromPos.z;
            trailSizes[i] = (100 - i) / 100 * 10;
            trailAlphas[i] = (100 - i) / 100;
        }
        
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        trailGeometry.setAttribute('size', new THREE.BufferAttribute(trailSizes, 1));
        trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(trailAlphas, 1));
        
        const trailMaterial = new THREE.ShaderMaterial({
            ...CometShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const trail = new THREE.Points(trailGeometry, trailMaterial);
        scene.add(trail);
        
        // Animate comet
        gsap.to(comet.position, {
            x: toPos.x,
            y: toPos.y,
            z: toPos.z,
            duration: 2,
            ease: 'power2.inOut',
            onUpdate: () => {
                // Update trail
                const positions = trail.geometry.attributes.position.array as Float32Array;
                
                // Shift positions back
                for (let i = 99; i > 0; i--) {
                    positions[i * 3] = positions[(i - 1) * 3];
                    positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
                    positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
                }
                
                // Add new position
                positions[0] = comet.position.x;
                positions[1] = comet.position.y;
                positions[2] = comet.position.z;
                
                trail.geometry.attributes.position.needsUpdate = true;
            },
            onComplete: () => {
                scene.remove(comet);
                scene.remove(trail);
            }
        });
    };
    
    useEffect(() => {
        if (!mountRef.current) return;
        
        const currentMount = mountRef.current;
        
        // Scene Setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        const camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        camera.position.set(30, 20, 30);
        camera.lookAt(0, 0, 0);
        
        const renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.6;
        currentMount.appendChild(renderer.domElement);
        
        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 5;
        controls.maxDistance = 100;
        
        // Starfield Background
        const starsGeometry = new THREE.BufferGeometry();
        const starsCount = 10000;
        const starsPositions = new Float32Array(starsCount * 3);
        
        for (let i = 0; i < starsCount * 3; i += 3) {
            const radius = 200 + Math.random() * 300;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            
            starsPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
            starsPositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
            starsPositions[i + 2] = radius * Math.cos(phi);
        }
        
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.5,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: false
        });
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(stars);
        
        // SUN - Main Broadcast
        const sunGeometry = new THREE.SphereGeometry(3, 32, 32);
        const sunMaterial = new THREE.ShaderMaterial({
            ...SunShader,
            side: THREE.FrontSide,
        });
        const sun = new THREE.Mesh(sunGeometry, sunMaterial);
        sun.position.set(0, 0, 0);
        scene.add(sun);
        
        // Sun Light
        const sunLight = new THREE.PointLight(0xffffff, 2, 100);
        sunLight.position.set(0, 0, 0);
        scene.add(sunLight);
        
        // Ambient Light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        scene.add(ambientLight);
        
        // Create Planets
        const planetMeshes: THREE.Mesh[] = [];
        
        planets.forEach(planet => {
            // Planet Mesh
            const geometry = new THREE.SphereGeometry(planet.size, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color: planet.color,
                emissive: planet.color,
                emissiveIntensity: planet.chatActivity * 0.3,
                shininess: 100
            });
            const mesh = new THREE.Mesh(geometry, material);
            
            // Set initial position
            mesh.position.x = planet.orbitRadius;
            mesh.position.y = 0;
            mesh.position.z = 0;
            
            scene.add(mesh);
            planetMeshes.push(mesh);
            planet.mesh = mesh;
            
            // Orbit Line
            const orbitPoints = [];
            for (let i = 0; i <= 64; i++) {
                const angle = (i / 64) * Math.PI * 2;
                orbitPoints.push(new THREE.Vector3(
                    Math.cos(angle) * planet.orbitRadius,
                    0,
                    Math.sin(angle) * planet.orbitRadius
                ));
            }
            const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
            const orbitMaterial = new THREE.LineBasicMaterial({
                color: 0x444444,
                transparent: true,
                opacity: 0.3
            });
            const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
            scene.add(orbitLine);
            planet.orbitLine = orbitLine;
            
            // Featured Ring (like Saturn)
            if (planet.isFeatured) {
                const ringGeometry = new THREE.RingGeometry(
                    planet.size * 1.5, 
                    planet.size * 2.5, 
                    64
                );
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffff00,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.3
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.rotation.x = Math.PI / 2;
                mesh.add(ring);
            }
            
            // Create Moons
            planet.moons.forEach(moon => {
                const moonGeometry = new THREE.SphereGeometry(moon.size, 16, 16);
                const moonMaterial = new THREE.MeshPhongMaterial({
                    color: 0xaaaaaa,
                    emissive: 0x444444,
                    emissiveIntensity: 0.2
                });
                const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
                moonMesh.position.x = moon.orbitRadius;
                mesh.add(moonMesh);
                moon.mesh = moonMesh;
            });
            
            // Viewer Count Label
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = 'white';
            ctx.font = '32px Arial';
            ctx.fillText(`👁 ${planet.viewerCount}`, 10, 40);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ 
                map: texture,
                transparent: true 
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(2, 0.5, 1);
            sprite.position.y = planet.size + 1;
            mesh.add(sprite);
        });
        
        // Create User Asteroids
        for (let i = 0; i < 50; i++) {
            const asteroidGeometry = new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.2);
            const asteroidMaterial = new THREE.MeshPhongMaterial({
                color: Math.random() > 0.7 ? 0xffaa00 : 0x8888ff,
                emissive: 0x444444
            });
            const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
            
            // Random position in space
            const radius = 15 + Math.random() * 30;
            const theta = Math.random() * Math.PI * 2;
            asteroid.position.set(
                Math.cos(theta) * radius,
                (Math.random() - 0.5) * 5,
                Math.sin(theta) * radius
            );
            
            scene.add(asteroid);
            
            userAsteroids.push({
                id: `user_${i}`,
                name: `User ${i}`,
                level: Math.floor(Math.random() * 10) + 1,
                position: asteroid.position.clone(),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.01,
                    0,
                    (Math.random() - 0.5) * 0.01
                ),
                mesh: asteroid
            });
        }
        
        // Post-processing
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.8,
            0.4,
            0.85
        );
        composer.addPass(bloomPass);
        
        // Animation Loop
        const clock = new THREE.Clock();
        let animationId: number;
        
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            
            const elapsedTime = clock.getElapsedTime();
            
            // Update sun
            sunMaterial.uniforms.uTime.value = elapsedTime;
            
            // Rotate starfield slowly
            stars.rotation.y += 0.0001;
            
            // Orbit planets
            planets.forEach((planet) => {
                if (planet.mesh) {
                    const angle = elapsedTime * planet.orbitSpeed;
                    planet.mesh.position.x = Math.cos(angle) * planet.orbitRadius;
                    planet.mesh.position.z = Math.sin(angle) * planet.orbitRadius;
                    
                    // Rotate planet
                    planet.mesh.rotation.y += 0.01;
                    
                    // Orbit moons
                    planet.moons.forEach((moon, moonIndex) => {
                        if (moon.mesh) {
                            const moonAngle = elapsedTime * 0.002 * (moonIndex + 1);
                            moon.mesh.position.x = Math.cos(moonAngle) * moon.orbitRadius;
                            moon.mesh.position.z = Math.sin(moonAngle) * moon.orbitRadius;
                        }
                    });
                    
                    // Pulse based on chat activity
                    const pulse = 1 + Math.sin(elapsedTime * 5 * planet.chatActivity) * 0.05;
                    planet.mesh.scale.setScalar(pulse);
                }
            });
            
            // Move user asteroids
            userAsteroids.forEach(user => {
                if (user.mesh) {
                    user.mesh.position.add(user.velocity);
                    user.mesh.rotation.x += 0.01;
                    user.mesh.rotation.y += 0.01;
                    
                    // Bounce at boundaries
                    if (Math.abs(user.mesh.position.x) > 40) user.velocity.x *= -1;
                    if (Math.abs(user.mesh.position.z) > 40) user.velocity.z *= -1;
                }
            });
            
            // Launch random comet every few seconds (demo)
            if (Math.random() < 0.002) {
                const fromPlanet = planets[Math.floor(Math.random() * planets.length)];
                const toPlanet = planets[Math.floor(Math.random() * planets.length)];
                
                if (fromPlanet.mesh && toPlanet.mesh && fromPlanet.id !== toPlanet.id) {
                    launchComet(fromPlanet.mesh.position, toPlanet.mesh.position);
                }
            }
            
            controls.update();
            composer.render();
        };
        
        animate();
        setIsLoaded(true);
        
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
            cancelAnimationFrame(animationId);
            currentMount.removeChild(renderer.domElement);
            renderer.dispose();
        };
    }, [planets, userAsteroids]);
    
    // Send super chat test
    const sendSuperChat = () => {
        const fromPlanet = planets[0];
        const toPlanet = planets[2];
        if (fromPlanet.mesh && toPlanet.mesh) {
            launchComet(fromPlanet.mesh.position, toPlanet.mesh.position);
        }
    };
    
    return (
        <div className="relative w-full h-full bg-black">
            <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />
            
            {/* UI Overlay */}
            <div className={`absolute top-0 left-0 w-full h-full pointer-events-none ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000`}>
                {/* Title */}
                <div className="absolute top-8 left-8 text-white">
                    <h1 className="text-3xl font-bold mb-2">SOLAR SPACES MANAGER</h1>
                    <p className="text-sm text-gray-400">Live Streaming Universe • Demo Mode</p>
                </div>
                
                {/* Planet Info Panel */}
                <div className="absolute top-8 right-8 bg-black/80 backdrop-blur-md border border-yellow-500/30 rounded-lg p-4 max-w-xs pointer-events-auto">
                    <h2 className="text-lg font-bold text-yellow-400 mb-3">Active Channels</h2>
                    {planets.map(planet => (
                        <div 
                            key={planet.id} 
                            className="mb-2 p-2 rounded hover:bg-yellow-500/10 cursor-pointer transition-colors"
                            onClick={() => setSelectedPlanet(planet.id)}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-white font-medium">{planet.name}</span>
                                <span className="text-xs text-gray-400">👁 {planet.viewerCount}</span>
                            </div>
                            <div className="mt-1">
                                <div className="h-1 bg-gray-700 rounded overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-yellow-500 to-orange-500"
                                        style={{ width: `${planet.chatActivity * 100}%` }}
                                    />
                                </div>
                            </div>
                            {planet.isFeatured && (
                                <span className="text-xs text-yellow-400 mt-1 inline-block">⭐ Featured</span>
                            )}
                        </div>
                    ))}
                </div>
                
                {/* User Level & Stats */}
                <div className="absolute bottom-8 left-8 bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg p-4 pointer-events-auto">
                    <div className="flex items-center gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-cyan-400">LVL {userLevel}</div>
                            <div className="text-xs text-gray-400">Space Explorer</div>
                        </div>
                        <div className="w-32">
                            <div className="text-xs text-gray-400 mb-1">XP Progress</div>
                            <div className="h-2 bg-gray-700 rounded overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: '65%' }} />
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Send Super Chat Button (DEMO) */}
                <div className="absolute bottom-8 right-8 pointer-events-auto">
                    <button 
                        onClick={sendSuperChat}
                        className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold rounded-lg hover:scale-105 transition-transform"
                    >
                        💫 Send Super Chat (Demo)
                    </button>
                </div>
                
                {/* View Mode (Bottom Center) */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
                    {(['overview', 'planet', 'first-person'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                viewMode === mode 
                                    ? 'bg-purple-600 text-white' 
                                    : 'bg-black/50 text-gray-400 hover:bg-black/70'
                            }`}
                        >
                            {mode === 'overview' ? '🌌 Overview' : 
                             mode === 'planet' ? '🪐 Planet View' : 
                             '🚀 First Person'}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { Points, shaderMaterial, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Vector3 } from 'three';

// Vertex Shader for the vortex
const vortexVertexShader = `
  uniform float uTime;
  uniform vec2 uMouse;
  varying vec2 vUv;
  #define PI 3.14159265358979323846

  // Simplex noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    float dist = length(uv - vec2(0.5));
    float angle = atan(pos.y, pos.x);
    float T = uTime * 0.2;
    
    // Twisting and pulling effect
    float twist = sin(dist * 10.0 - T) * 0.5;
    pos.z += twist;
    float pull = smoothstep(0.6, 0.0, dist) * 2.0;
    pos.z -= pull;

    // Pulsing effect
    float pulse = snoise(vec3(dist * 5.0, uTime * 0.5, 0.0)) * 0.1;
    pos.z += pulse * smoothstep(0.5, 0.0, dist);

    // Mouse interaction
    float mouseDist = length(uv - uMouse);
    float mouseEffect = smoothstep(0.2, 0.0, mouseDist) * 0.5;
    pos.z += mouseEffect;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// Fragment Shader for the vortex
const vortexFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float dist = length(vUv - vec2(0.5));
    
    // Glowing edge
    float glow = smoothstep(0.4, 0.38, dist) - smoothstep(0.38, 0.36, dist);
    vec3 color = vec3(glow);

    // Add color to the glow
    float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
    vec3 cyan = vec3(0.0, 1.0, 1.0);
    vec3 magenta = vec3(1.0, 0.0, 1.0);
    float colorMix = 0.5 + 0.5 * sin(angle * 5.0 + uTime);
    color *= mix(cyan, magenta, colorMix);

    // Inner void
    float void_ = smoothstep(0.05, 0.0, dist);
    color = mix(color, vec3(0.0), void_);

    gl_FragColor = vec4(color, glow);
  }
`;

const VortexMaterial = shaderMaterial(
  { uTime: 0, uMouse: new THREE.Vector2(0, 0) },
  vortexVertexShader,
  vortexFragmentShader,
  (material) => {
    material.blending = THREE.AdditiveBlending;
    material.depthWrite = false;
    material.transparent = true;
  }
);
extend({ VortexMaterial });

const Vortex = () => {
  const ref = useRef<any>();
  useFrame((state) => {
    if (ref.current) {
      ref.current.uTime = state.clock.getElapsedTime();
      ref.current.uMouse.x = state.mouse.x * 0.5 + 0.5;
      ref.current.uMouse.y = state.mouse.y * 0.5 + 0.5;
    }
  });
  return (
    <mesh rotation-x={-Math.PI / 2}>
      <planeGeometry args={[10, 10, 128, 128]} />
      {/* @ts-ignore */}
      <vortexMaterial ref={ref} />
    </mesh>
  );
};

const Particles = () => {
    const count = 5000;
    const pointsRef = useRef<any>();

    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * 2 * Math.PI;
            const r = 3 + Math.random() * 7;
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            const z = (Math.random() - 0.5) * 15;
            pos.set([x, y, z], i * 3);
        }
        return pos;
    }, [count]);
    
    useFrame((state) => {
        if (!pointsRef.current) return;
        const positions = pointsRef.current.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3+2] -= 0.02; // Move towards the blackhole
            if(positions[i3+2] < -5) {
                positions[i3+2] = 5;
            }
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
            <pointsMaterial
                color="#00ffff"
                size={0.02}
                blending={THREE.AdditiveBlending}
                transparent
                depthWrite={false}
                opacity={0.7}
            />
        </Points>
    );
};

// Experience contains the scene and animation logic
const Experience: React.FC<{ isEntering: boolean }> = ({ isEntering }) => {
  const initialCamPos = useMemo(() => new Vector3(0, 0, 7), []);
  const enteringCamPos = useMemo(() => new Vector3(0, 0, 0.5), []);

  useFrame((state) => {
    const targetPos = isEntering ? enteringCamPos : initialCamPos;
    // Animate camera position
    state.camera.position.lerp(targetPos, 0.02);
    
    if(isEntering) {
      // Animate FOV for tunnel-vision effect
      state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, 100, 0.025);
      state.camera.updateProjectionMatrix();
    }
  });

  return (
    <>
      <color attach="background" args={['black']} />
      <ambientLight intensity={0.5} />
      <Vortex />
      <Particles/>
    </>
  );
};


const Scene: React.FC<{ isEntering: boolean }> = ({ isEntering }) => {
  return (
    <Canvas>
      <PerspectiveCamera makeDefault fov={75} position={[0, 0, 7]} />
      <Experience isEntering={isEntering} />
    </Canvas>
  );
};

export default Scene;

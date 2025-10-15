# Singularity Vortex Animation

## 🌀 Overview
Enhanced blackhole transition with dramatic singularity vortex effect. The camera approaches and stabilizes near the singularity (not inside it), creating the perfect setup for the authorization modal to appear as if emerging from the blackhole itself.

---

## ✨ New Features

### **1. Singularity Vortex Shader**
- **Swirling whirlpool visual** inspired by water vortex physics
- **Spiral patterns** that rotate inward toward the center
- **Color gradient**: Deep purple → Cyan → White at center
- **Pulsing center glow** simulating the singularity core
- **Organic noise** for realistic turbulence
- **Additive blending** for ethereal glow effect

**Technical Details:**
- 6x6 plane geometry
- Custom shader with time-based animation
- Fade-in during transition (uIntensity: 0 → 1.5)
- Positioned at y=-0.2 (below accretion disk)

---

## 🎬 Enhanced Transition Animation

### **Phase 1: Approach (0-2.5s)**
- Camera moves from `z=15` to `z=3` (observing distance)
- Camera rises to `y=2` (better viewing angle)
- **2 barrel rolls** for spacetime tumbling effect
- Brief camera shake (8 vibrations)

### **Phase 2: Vortex Reveal (1.0-3.5s)**
- Singularity vortex fades in (`uIntensity: 0 → 1.5`)
- Swirling spiral patterns become visible
- Purple/cyan colors pulse and rotate

### **Phase 3: Stabilization (2.0-3.5s)**
- Camera rotation stabilizes to zero
- Camera tilts down (`x: -Math.PI * 0.25`) to observe singularity
- FOV widens to `95°` for immersive view

### **Phase 4: Final State (3.5s+)**
- Camera positioned at `(0, 2, 3)` looking down
- Singularity vortex at full intensity
- Moderate bloom (`strength: 8`) - dramatic but visible
- Gravitational lensing (`0.4 strength`, `0.6 radius`)
- Subtle chromatic aberration (`0.015`)
- Ambient light at `0.8` intensity (dim but visible)

**Result:** User observes a mesmerizing swirling vortex from close range!

---

## 🎯 Authorization Modal Integration

The transition creates the **perfect visual context** for the auth modal:

```typescript
// Auth modal should appear at 3.5s (when transition completes)
// Position: Center of screen (over the singularity)
// Effect: Modal appears to emerge from the vortex center

Timeline:
0.0s  - User clicks "Enter"
0.0s  - Transition begins
3.5s  - Camera stabilized, observing singularity
3.5s  ← AUTH MODAL APPEARS HERE
      - Modal fades in with scaling animation
      - Appears over the glowing singularity center
      - Creates illusion of emerging from blackhole
```

---

## 🎨 Visual Design

### **Colors:**
- **Singularity Core**: White (pulsing)
- **Inner Vortex**: Cyan (`#00FFFF`)
- **Outer Vortex**: Deep Purple (`#330066`)
- **Accretion Disk**: Cyan/Magenta waves

### **Camera Position:**
```
Final Camera Transform:
- Position: (0, 2, 3)
- Rotation: (-45°, 0°, 0°) - Looking down
- FOV: 95°
```

### **Effects Stack:**
1. Singularity Vortex (full intensity)
2. Accretion Disk (pulsing with audio)
3. Bloom (strength: 8)
4. Gravitational Lensing (moderate)
5. Chromatic Aberration (subtle)
6. Particle Starfield (background)

---

## 💡 Design Intent

**"The authorization request emerges from inside the singularity"**

The vortex creates a visual "portal" effect:
- Swirling motion draws eye to center
- Pulsing glow suggests something is forming
- Auth modal appears exactly where the singularity core glows
- Creates narrative: "Access is granted from within the blackhole"

---

## 🎛️ Configuration

All values in `BlackholeScene.tsx`:

```typescript
// Singularity Vortex
vortexMaterial.uniforms.uIntensity.value = 1.5; // Full intensity

// Camera Final State
camera.position.set(0, 2, 3);
camera.rotation.set(-Math.PI * 0.25, 0, 0);
camera.fov = 95;

// Post-Processing
bloomPass.strength = 8;
lensingPass.uniforms.uStrength.value = 0.4;
lensingPass.uniforms.uRadius.value = 0.6;
chromaticAberrationPass.uniforms.uAberrationAmount.value = 0.015;
ambientLight.intensity = 0.8;
```

---

## 🚀 Next Steps

1. **Test the animation** - Deploy and verify visual effect
2. **Add auth modal trigger** - Show modal at 3.5s
3. **Modal entrance animation** - Scale from center with fade
4. **Optional**: Add particle trails spiraling into vortex
5. **Optional**: Pulsing ring around vortex on auth trigger

---

## 📊 Performance

- **Vortex Shader**: Minimal performance impact
- **Single 6x6 plane**: ~36 vertices
- **Additive blending**: GPU accelerated
- **No physics simulation**: Pure shader math

**Expected FPS**: Same as before (60fps+)

---

## 🎭 User Experience Flow

```
1. User on landing page
   ↓
2. "Enter Dashboard" click
   ↓
3. [0-2.5s] Dramatic dive toward blackhole
   ↓
4. [1.0-3.5s] Swirling vortex reveals itself
   ↓
5. [3.5s] Camera stabilizes, observing the vortex
   ↓
6. [3.5s] AUTH MODAL appears from vortex center
   ↓
7. User authorizes via Phantom/MetaMask
   ↓
8. Dashboard loads
```

**Total Time**: ~3.5 seconds of pure cinematic experience! 🎬

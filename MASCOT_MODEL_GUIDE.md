# Getting Your Astronaut Shiba/Pomeranian Mascot

## Current Status
- **Using**: Fox.glb placeholder (scaled to 0.03)
- **Need**: Astronaut Shiba Inu or Pomeranian in/on spaceship
- **Format**: GLB (binary glTF)

---

## Option 1: Commission a Custom Model (BEST QUALITY)

### Freelance Platforms
1. **Fiverr** - https://fiverr.com
   - Search: "3D character modeling glb"
   - Price: $50-300
   - Turnaround: 3-14 days

2. **Upwork** - https://upwork.com
   - More professional 3D artists
   - Price: $200-1000
   - Better for complex animations

3. **ArtStation Jobs** - https://artstation.com/jobs
   - High-quality game/film artists
   - Price: $300-1500

### What to Request
```
"3D model of a Shiba Inu/Pomeranian dog in an astronaut suit, 
sitting in/on a small spaceship. 

Requirements:
- GLB format (glTF 2.0 binary)
- Low-poly (5k-15k triangles for web performance)
- PBR materials (Metallic/Roughness workflow)
- Rigged skeleton for animation
- 2-3 idle animations (float, look around, tail wag)
- Optimize for Three.js web viewer
- Under 5MB file size

Style: Cute, cartoon-like, vibrant colors (cyan/magenta accents)
Reference: [attach screenshot of your blackhole scene]
"
```

---

## Option 2: AI-Generated 3D Models (FASTEST)

### 1. **Spline AI** - https://spline.design
   - Text-to-3D generation
   - Export as GLB
   - Free tier available
   - Prompt: "cute shiba inu astronaut in spaceship, cartoon style"

### 2. **Meshy.ai** - https://meshy.ai
   - AI 3D model generator
   - Text or image to 3D
   - $20/month (200 credits)
   - Better quality than Spline

### 3. **Luma AI Genie** - https://lumalabs.ai/genie
   - Very fast generation
   - Export GLB
   - Free tier: 10 generations/day

---

## Option 3: Modify Existing Models (CHEAP & FAST)

### Free Model Marketplaces
1. **Sketchfab** - https://sketchfab.com
   - Search: "dog astronaut" or "shiba" + downloadable
   - Filter: CC license, GLB/GLTF format
   - Many free models

2. **Mixamo** (Adobe) - https://mixamo.com
   - Free rigged characters
   - Auto-rigging for custom models
   - Pre-made animations
   - Note: No dogs, but can rig your own

3. **Poly Pizza** - https://poly.pizza
   - Low-poly free models
   - Search: "dog" "space"

### How to Customize
1. Download base dog model
2. Import to **Blender** (free)
3. Add astronaut helmet/suit using basic shapes
4. Export as GLB

---

## Option 4: Use Existing Space-Themed Mascots

### Quick Placeholder Options (Free CDN):
```typescript
const modelUrls = [
    // Robot (space theme, available now)
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/RobotExpressive/glTF-Binary/RobotExpressive.glb',
    
    // Damaged Helmet (astronaut vibes)
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
];
```

---

## DIY with Blender (FREE but time-consuming)

### Quick Tutorial
1. **Download Blender** - https://blender.org
2. **Find base dog model**:
   - Search Google: "free shiba inu 3d model blender"
   - Or use primitive shapes to build simple dog

3. **Add astronaut elements**:
   - Helmet: UV Sphere scaled + transparent material
   - Suit: Solidify modifier on body
   - Spaceship: Simple capsule shape

4. **Export as GLB**:
   - File → Export → glTF 2.0
   - Format: GLB (binary)
   - Check: Apply Modifiers, Export Animations
   - Uncheck: Cameras, Lights (we add those in Three.js)

5. **Test in viewer**: https://gltf-viewer.donmccurdy.com/

---

## Recommended Approach

### 🚀 Fast & Good Quality:
1. Try **Meshy.ai** ($20) - Generate in 5 minutes
2. If not satisfied → Commission on **Fiverr** ($100-200)
3. Timeline: 1-2 days total

### 💰 Budget Option:
1. Search **Sketchfab** for free dog models
2. Download closest match
3. Ask on **Reddit r/blenderhelp** for quick edits ($50-100)

### 🎨 Perfect Quality (Worth the wait):
1. Commission professional artist on **ArtStation**
2. Request multiple animation loops
3. Include spaceship as separate object (can position in Three.js)
4. Timeline: 1-2 weeks

---

## After You Get the Model

### 1. Test the Model
```bash
# Visit glTF Viewer
https://gltf-viewer.donmccurdy.com/

# Drag and drop your .glb file
# Check:
- Animations work
- File size < 5MB
- Materials look good
- No missing textures
```

### 2. Add to Project
```bash
# Place in public folder
mkdir public/models
cp astronaut-dog.glb public/models/

# Or host on CDN for faster loading
# Upload to: https://cdn.jsdelivr.net (free)
```

### 3. Update Code
```typescript
const modelUrls = [
    // Your custom model (local)
    '/models/astronaut-dog.glb',
    
    // Or from CDN
    'https://cdn.jsdelivr.net/gh/yourname/project@main/public/models/astronaut-dog.glb',
    
    // Fallbacks...
];
```

### 4. Adjust Scale
```typescript
if (modelName.includes('Dog') || modelName.includes('astronaut-dog')) {
    scale = 0.5; // Adjust this until it looks right
    posX = 6; posY = -1; posZ = 8;
}
```

---

## Animation Tips

### Good Idle Animations for Space Scene:
- **Float/Hover** - Gentle up-down bobbing
- **Look Around** - Head rotation, curious
- **Tail Wag** - Excited/happy
- **Wave** - Friendly greeting
- **Dashboard Check** - Looking at spaceship controls (if in ship)

### In Blender Timeline:
- Frame 0-60: Float loop
- Frame 60-120: Look around
- Frame 120-180: Tail wag

---

## My Recommendation

**Go with Meshy.ai for now:**
1. Sign up for $20/month trial
2. Generate 5-10 variations with these prompts:
   ```
   - "cute shiba inu astronaut floating in space, cartoon style"
   - "pomeranian dog in space suit inside capsule ship"
   - "fluffy dog astronaut waving, low poly, cute"
   ```
3. Download best one as GLB
4. Test in viewer
5. If perfect → Cancel subscription
6. If not → Get 1-2 more generations

**Total cost: $20, Total time: 30 minutes**

Then if you want perfection later, commission a pro artist.

---

## Questions?

- Check model orientation (might load upside down)
- Adjust lighting intensity if too dark/bright
- Scale and position in BlackholeScene.tsx lines 299-315
- Animation speed controlled by animationMixer.update(delta)

Good luck! 🚀🐕

# Quick Guide: Get Astronaut Doge/Pepe Model

## 🐕 Shiba Inu Astronaut (PERFECT MATCH!)

**Link**: https://sketchfab.com/3d-models/shiba-inu-astronaut-454d8419d60b47c897a99cf508ce0538

### Steps to Download:

1. **Visit the Sketchfab link** above
2. **Click "Download 3D Model"** button (right side)
3. **Login/Sign up** (free account required)
4. **Select "Autoconverted format (glTF)"** 
5. **Download** the ZIP file
6. **Extract** and find `scene.gltf` or `scene.glb`
7. **Rename** to `astronaut-doge.glb`

### Add to Project:

```bash
# Create models folder
mkdir public/models

# Move the file
move Downloads/astronaut-doge.glb public/models/

# Refresh browser - it will auto-load!
```

---

## Alternative Options

### 1. Generic Astronaut (Free, Clean)
- **Link**: https://sketchfab.com/3d-models/astronaut-glb-4d1f078f5461493ba066cf35278ae9e6
- 9.5k triangles (lightweight)
- CC Attribution license

### 2. Robot Astronaut (Currently loads as fallback)
- Already in code, loads if dog model fails
- Decent space theme

### 3. Pepe Models Search
- Visit: https://sketchfab.com/tags/pepe
- Search "pepe" + filter by "Downloadable"
- Most require login

---

## Quick Test Alternative

If you want to **skip Sketchfab signup**, try these free CDN models:

```typescript
const modelUrls = [
    // Space-themed robot (works now, no download)
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/RobotExpressive/glTF-Binary/RobotExpressive.glb',
    
    // Fallback
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb'
];
```

The robot is actually pretty cool for a space theme!

---

## AI Generate Astronaut Doge (5 minutes)

### Try Meshy.ai:
1. Go to https://meshy.ai
2. Sign up (free trial: 200 credits)
3. Text to 3D → Type:
   ```
   "Shiba Inu dog in astronaut suit, cute cartoon style, low poly"
   ```
4. Generate → Wait 2-3 mins
5. Download GLB
6. Move to `public/models/astronaut-doge.glb`

Cost: $0 (free trial) or $20/month

---

## After Adding Model

Check browser console, should see:
```
🔄 Attempt 1/3: astronaut-doge.glb
✅ Mascot model loaded successfully!
🐕 Dog model detected - scaling to 0.5
```

If scale is wrong, edit line 308 in `BlackholeScene.tsx`:
```typescript
scale = 0.5; // Make bigger: 1.0, smaller: 0.2
```

---

## Current Behavior

Right now:
1. Tries to load `/models/astronaut-doge.glb` (will fail if not there)
2. Falls back to Robot
3. Falls back to Fox

Once you add the doge model, it will appear instantly!

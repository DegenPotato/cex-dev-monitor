# Space HDRI Environment Guide

## ✅ Already Integrated!

Your scene now loads a **free space HDRI from Poly Haven** automatically!

### What You'll See:
- 🌌 **Nebula background** instead of black
- ✨ **Realistic reflections** on mascot/objects
- 🎨 **Natural space lighting** (stars, cosmic glow)
- 🌟 **Professional atmosphere**

---

## Current HDRI

**Using**: `moonless_golf_2k.hdr` from Poly Haven
- **Size**: ~5MB
- **Resolution**: 2K (2048x1024)
- **Theme**: Dark starfield with Milky Way
- **Free**: Public domain (CC0)

---

## Try Different Space HDRIs

### Option 1: Download from the Link You Found

Those **4 Free Space HDRIs** you found - if they're `.hdr` files:

1. **Download** the `.hdr` file
2. **Place** in `public/hdri/space.hdr`
3. **Update** code (line 244):
   ```typescript
   'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_2k.hdr',
   // Change to:
   '/hdri/space.hdr',
   ```

### Option 2: Browse Poly Haven (Best Free Source)

Visit: **https://polyhaven.com/hdris/space**

**Recommended Space HDRIs:**
1. **Kloppenheim 06** - Colorful nebula (purple/cyan)
   - `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_2k.hdr`
   
2. **Dikhololo Night** - Dark starfield
   - `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/dikhololo_night_2k.hdr`

3. **Moonless Golf** (current) - Milky Way view
   - `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/moonless_golf_2k.hdr`

### Option 3: Custom HDRI

If you have `.jpg` panoramas, convert to `.hdr`:
- Use **Photoshop** (Save as: Radiance HDR)
- Or online: https://convertio.co/jpg-hdr/

---

## Adjust HDRI Settings

In `BlackholeScene.tsx` (lines 245-250):

### Make Background Brighter
```typescript
scene.backgroundIntensity = 0.8; // Default: 0.3
```

### Make Background Darker (keep blackhole focus)
```typescript
scene.backgroundIntensity = 0.1; // Very dim
```

### Use HDRI for Lighting Only (no visible background)
```typescript
scene.environment = texture; // Reflections/lighting
// scene.background = texture; // Comment this out
scene.background = new THREE.Color(0x000000); // Keep black
```

### Blur/Soften Background
```typescript
texture.generateMipmaps = true;
texture.minFilter = THREE.LinearMipmapLinearFilter;
```

---

## File Size Considerations

### Resolutions:
- **1K** (1024x512): ~1-2MB - Fast, good for mobile
- **2K** (2048x1024): ~4-6MB - Balanced ⭐ (current)
- **4K** (4096x2048): ~15-25MB - High quality, slower
- **8K** (8192x4096): ~60-100MB - Overkill for web

**Recommendation**: Stick with **2K** for web performance.

---

## Add Local HDRI

### Step 1: Create HDRI Folder
```bash
mkdir public/hdri
```

### Step 2: Add Your File
```bash
# Example: Copy downloaded space HDRI
copy Downloads/nebula_space.hdr public/hdri/space.hdr
```

### Step 3: Update Code (Line 244)
```typescript
rgbeLoader.load(
    '/hdri/space.hdr', // Local file
    (texture) => {
        // ...
    }
);
```

---

## Best HDRIs for Your Blackhole Scene

### 1. **Kloppenheim 06** (My Recommendation!)
- **Why**: Purple/cyan nebula matches your color scheme
- **Vibe**: Sci-fi, vibrant, mysterious
- **URL**: `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_2k.hdr`

### 2. **Moonless Golf** (Current)
- **Why**: Dark, lets blackhole shine
- **Vibe**: Realistic, subtle Milky Way
- **Best for**: Minimalist, focus on center

### 3. **Dikhololo Night**
- **Why**: Very dark starfield
- **Vibe**: Deep space, distant stars
- **Best for**: If current too bright

---

## Test Multiple HDRIs

Add a switcher:

```typescript
const hdriUrls = [
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_2k.hdr',
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/moonless_golf_2k.hdr',
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/dikhololo_night_2k.hdr',
];

const selectedHDRI = 0; // Change 0-2 to test different HDRIs

rgbeLoader.load(hdriUrls[selectedHDRI], (texture) => {
    // ...
});
```

---

## Performance Tips

### Preload HDRI
Load HDRI in background while showing loader:
```typescript
const hdriTexture = await new Promise((resolve) => {
    rgbeLoader.load(url, resolve);
});
scene.environment = hdriTexture;
```

### Lazy Load
Only load HDRI after page interaction:
```typescript
window.addEventListener('click', () => {
    if (!hdriLoaded) {
        rgbeLoader.load(url, ...);
        hdriLoaded = true;
    }
}, { once: true });
```

---

## Troubleshooting

### HDRI not visible?
- Check console for errors
- Try URL in browser (should download)
- Verify file format is `.hdr` not `.jpg`

### Too bright/distracting?
```typescript
scene.backgroundIntensity = 0.1; // Very dim
```

### Want HDRI lighting without background?
```typescript
scene.environment = texture; // Keep
// scene.background = texture; // Remove
```

### File won't load?
- Check CORS (local files need server)
- Try different CDN URL
- Download and host locally

---

## My Recommendation

**Try Kloppenheim 06 first!**

```typescript
'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_2k.hdr'
```

It has:
- Purple/cyan colors (matches your theme!)
- Vibrant nebula clouds
- Good contrast with blackhole
- Perfect sci-fi vibe

If too bright, just lower:
```typescript
scene.backgroundIntensity = 0.2;
```

---

## Current Status

✅ HDRI system integrated
✅ Using Moonless Golf (dark, subtle)
✅ Fallback to black if load fails
✅ Ready to swap HDRIs anytime

**Refresh browser to see the space environment!** 🚀

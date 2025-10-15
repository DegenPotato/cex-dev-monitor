# HDRI Server Setup Guide

## ✅ Server Configuration Complete

**Server**: alpha.sniff.agency (139.59.237.215)  
**Directory**: `/var/www/alpha.sniff.agency/assets/hdri/`  
**URL**: `https://alpha.sniff.agency/assets/hdri/`

### Nginx Configuration
- Static assets served from `/var/www/alpha.sniff.agency/assets/`
- CORS enabled (`Access-Control-Allow-Origin: *`)
- 7-day cache (`expires 7d; Cache-Control: public, immutable`)
- Nginx tested and reloaded ✓

---

## 📦 Upload HDRI Files

### Option 1: Re-download from Poly Haven (Recommended)

1. **Visit**: https://polyhaven.com/hdris
2. **Search for**: "nebula" or "space"
3. **Download** 2K or 4K HDR files (smaller than original 8K)
4. **Recommended files**:
   - Any nebula/space HDRI (5-20MB each)
   - Pick 1-2 favorites

### Option 2: Use Smaller Compressed HDRIs

Download from these direct links:
```bash
# Example space HDRIs (much smaller)
wget https://polyhaven.com/download/nebula.hdr -O nebula.hdr
```

---

## 🚀 Upload to Server

Once you have HDRI files locally:

```powershell
# Upload from Windows (PowerShell)
scp -i C:\Users\User\.ssh\id_ed25519_new your-nebula-file.hdr root@139.59.237.215:/var/www/alpha.sniff.agency/assets/hdri/nebula.hdr
```

Or from Linux/Mac:
```bash
scp -i ~/.ssh/id_ed25519_new nebula.hdr root@139.59.237.215:/var/www/alpha.sniff.agency/assets/hdri/
```

---

## 🔧 Frontend Configuration

**File**: `src/components/landing/BlackholeScene.tsx`

Already configured:
```typescript
const hdriEnabled = true; // ✅ Enabled
const hdriUrl = 'https://alpha.sniff.agency/assets/hdri/nebula.hdr';
```

---

## ✅ Test After Upload

1. Upload HDRI file to server
2. Visit: https://alpha.sniff.agency/assets/hdri/nebula.hdr
3. Should download the file (or show in browser)
4. Deploy your app and check browser console for:
   ```
   🌌 Space HDRI environment loaded
   ```

---

## 📝 Current Status

- [x] Server directory created
- [x] Nginx configured
- [x] Frontend code updated
- [ ] **HDRI file uploaded** ← TODO: Download and upload HDRI
- [ ] Deploy frontend changes

---

## 🎯 Quick Setup

```powershell
# 1. Download HDRI (example)
# Visit polyhaven.com and download a space HDRI

# 2. Upload to server
scp -i C:\Users\User\.ssh\id_ed25519_new nebula.hdr root@139.59.237.215:/var/www/alpha.sniff.agency/assets/hdri/

# 3. Test URL
curl -I https://alpha.sniff.agency/assets/hdri/nebula.hdr

# 4. Deploy app
git add -A
git commit -m "feat: Enable server-hosted HDRI"
git push
```

---

## 🌟 Benefits

- ✅ No GitHub file size limits
- ✅ CDN-like caching (7 days)
- ✅ CORS enabled for browser access
- ✅ Can update HDRI without code changes
- ✅ Can add multiple HDRIs for variety

## 📊 File Size Recommendations

- **2K HDR**: 5-15 MB (Good for web)
- **4K HDR**: 20-50 MB (Better quality)
- **8K HDR**: 50-100 MB (Overkill for web)

**Recommended**: Use 2K or 4K HDRIs for fast loading

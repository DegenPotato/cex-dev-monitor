#!/bin/bash

# Build script optimized for low memory server

echo "Building backend on low-memory server..."

# Set Node memory limit to 512MB (half of 1GB)
export NODE_OPTIONS="--max-old-space-size=512"

# Clean old build
rm -rf dist

# Build backend only with optimizations
npx tsc --project tsconfig.backend.json --diagnostics

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed, attempting alternate method..."
    
    # If TypeScript fails, use esbuild as fallback (much faster, less memory)
    npm install esbuild --no-save
    npx esbuild src/backend/server.ts --bundle --platform=node --outfile=dist/backend/server.js --external:telegram --external:gramjs --external:@solana/web3.js --external:better-sqlite3 --external:canvas --external:bufferutil --external:utf-8-validate
fi

echo "Build complete!"

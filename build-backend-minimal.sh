#!/bin/bash
# Minimal backend build script with reduced memory usage

echo "Building backend with minimal memory..."

# Clean previous build
rm -rf dist

# Build with transpileOnly (no type checking) to save memory
npx tsc --project tsconfig.backend.json --transpileOnly

echo "Backend build complete (without type checking)"

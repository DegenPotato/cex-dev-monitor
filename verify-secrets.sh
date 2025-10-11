#!/bin/bash

# Security verification script
# Checks for sensitive files before committing

echo "🔒 Security Verification"
echo "======================="
echo ""

ERRORS=0

# Check for sensitive files
echo "📁 Checking for sensitive files..."

if [ -f "proxies.txt" ]; then
  echo "❌ FOUND: proxies.txt (should be gitignored)"
  ERRORS=$((ERRORS+1))
fi

if [ -f ".env" ]; then
  echo "⚠️  FOUND: .env (should be gitignored)"
  ERRORS=$((ERRORS+1))
fi

if ls id_rsa* 1> /dev/null 2>&1; then
  echo "❌ FOUND: SSH keys (id_rsa*)"
  ERRORS=$((ERRORS+1))
fi

if ls *.pem 1> /dev/null 2>&1; then
  echo "❌ FOUND: PEM files (*.pem)"
  ERRORS=$((ERRORS+1))
fi

if ls *.key 1> /dev/null 2>&1; then
  echo "❌ FOUND: Key files (*.key)"
  ERRORS=$((ERRORS+1))
fi

if [ -f "monitor.db" ]; then
  echo "⚠️  FOUND: monitor.db (should be gitignored)"
fi

# Check what would be committed
echo ""
echo "📋 Files to be committed:"
git status --short

echo ""
echo "🔍 Checking git status..."
if git status | grep -q "id_rsa\|\.pem\|\.key\|proxies\.txt"; then
  echo "❌ DANGER: Sensitive files about to be committed!"
  ERRORS=$((ERRORS+1))
fi

# Check .gitignore exists
if [ ! -f ".gitignore" ]; then
  echo "❌ MISSING: .gitignore file"
  ERRORS=$((ERRORS+1))
fi

# Summary
echo ""
echo "======================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ All checks passed!"
  echo "Safe to commit and push."
else
  echo "❌ Found $ERRORS issue(s)"
  echo "Fix these before committing!"
  exit 1
fi

#!/usr/bin/env node

/**
 * Generate a cryptographically secure encryption key for production use
 * Run: node scripts/generate-encryption-key.mjs
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔐 Generating Secure Encryption Key for Trading Wallets\n');

// Generate 32 bytes (256-bit) key for AES-256
const key = crypto.randomBytes(32);
const keyHex = key.toString('hex');
const keyBase64 = key.toString('base64');

console.log('═══════════════════════════════════════════════════════════════');
console.log('                    PRIVATE KEY ENCRYPTION KEY                  ');
console.log('═══════════════════════════════════════════════════════════════');
console.log();
console.log('📋 Hex format (recommended for .env):');
console.log(`   ${keyHex}`);
console.log();
console.log('📋 Base64 format (alternative):');
console.log(`   ${keyBase64}`);
console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log();
console.log('⚡ DEPLOYMENT INSTRUCTIONS:');
console.log();
console.log('1. LOCAL DEVELOPMENT (.env file):');
console.log('   PRIVATE_KEY_ENCRYPTION_KEY=' + keyHex);
console.log();
console.log('2. PRODUCTION SERVER (DigitalOcean):');
console.log('   ssh root@139.59.237.215');
console.log('   nano /var/www/cex-monitor/.env');
console.log('   # Add: PRIVATE_KEY_ENCRYPTION_KEY=' + keyHex);
console.log();
console.log('3. USING SECRET MANAGER (Recommended for production):');
console.log('   - AWS: aws secretsmanager create-secret --name trading-key --secret-string "' + keyHex + '"');
console.log('   - GCP: echo -n "' + keyHex + '" | gcloud secrets create trading-key --data-file=-');
console.log('   - Vault: vault kv put secret/trading-key value="' + keyHex + '"');
console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log();
console.log('⚠️  SECURITY NOTES:');
console.log('   • This key encrypts ALL user trading wallets');
console.log('   • NEVER commit this key to Git');
console.log('   • NEVER share this key publicly');
console.log('   • Store securely and backup safely');
console.log('   • Consider key rotation every 90 days');
console.log();
console.log('💡 KEY PROPERTIES:');
console.log('   • Algorithm: AES-256-GCM');
console.log('   • Key size: 256 bits (32 bytes)');
console.log('   • Entropy: Cryptographically secure random');
console.log('   • Format: Hexadecimal string (64 chars)');
console.log();

// Optionally save to .env.local for development
const envPath = path.join(__dirname, '..', '.env.local');
const envLine = `\n# Generated on ${new Date().toISOString()}\nPRIVATE_KEY_ENCRYPTION_KEY=${keyHex}\n`;

console.log('📁 Save to .env.local for development? (y/n): ');

process.stdin.once('data', (data) => {
  const answer = data.toString().trim().toLowerCase();
  if (answer === 'y' || answer === 'yes') {
    fs.appendFileSync(envPath, envLine);
    console.log('✅ Key saved to .env.local');
    console.log('   Remember to add .env.local to .gitignore!');
  } else {
    console.log('⚠️  Key not saved. Copy it manually from above.');
  }
  process.exit(0);
});

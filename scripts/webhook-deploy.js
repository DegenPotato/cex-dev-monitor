#!/usr/bin/env node

/**
 * GitHub Webhook Handler for Auto-Deployment
 * Listens for push events and automatically deploys updates
 */

const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.WEBHOOK_PORT || 9001;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret-here';

// Middleware to capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

// Verify GitHub webhook signature
function verifySignature(payload, signature) {
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload, 'utf8');
  const calculatedSignature = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(calculatedSignature)
  );
}

// Deployment function
function deploy(callback) {
  const deployScript = path.join(__dirname, 'deploy.sh');
  
  console.log('[Deploy] Starting deployment...');
  exec(`bash ${deployScript}`, (error, stdout, stderr) => {
    if (error) {
      console.error('[Deploy] Error:', error);
      return callback(error);
    }
    console.log('[Deploy] Output:', stdout);
    if (stderr) {
      console.error('[Deploy] Stderr:', stderr);
    }
    console.log('[Deploy] Deployment completed successfully!');
    callback(null);
  });
}

// GitHub webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  
  // Verify signature
  if (!signature || !verifySignature(req.rawBody, signature)) {
    console.error('[Webhook] Invalid signature');
    return res.status(401).send('Invalid signature');
  }
  
  const event = req.headers['x-github-event'];
  
  // Only process push events to main branch
  if (event === 'push' && req.body.ref === 'refs/heads/main') {
    console.log('[Webhook] Push to main branch detected');
    
    // Respond immediately to GitHub
    res.status(200).send('Deployment started');
    
    // Deploy asynchronously
    deploy((error) => {
      if (error) {
        console.error('[Webhook] Deployment failed:', error);
      } else {
        console.log('[Webhook] Deployment successful!');
      }
    });
  } else {
    console.log(`[Webhook] Ignoring event: ${event} for ref: ${req.body.ref}`);
    res.status(200).send('Event ignored');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'webhook-deploy' });
});

app.listen(PORT, () => {
  console.log(`[Webhook] Server listening on port ${PORT}`);
  console.log(`[Webhook] Webhook URL: http://your-server:${PORT}/webhook`);
  console.log(`[Webhook] Health check: http://your-server:${PORT}/health`);
});

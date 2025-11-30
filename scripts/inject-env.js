#!/usr/bin/env node
/**
 * Script to inject environment variables into index.html for GitHub Pages deployment
 * Usage: HARDCOVER_API_KEY=your-key HARDCOVER_USER_ID=your-id node scripts/inject-env.js
 */

const fs = require('fs');
const path = require('path');

const apiKey = process.env.HARDCOVER_API_KEY || '';
const userId = process.env.HARDCOVER_USER_ID || '';

if (!apiKey && !userId) {
  console.warn('⚠️  No Hardcover credentials set, skipping injection');
  console.log('   Set HARDCOVER_API_KEY and HARDCOVER_USER_ID environment variables');
  process.exit(0);
}

const htmlPath = path.join(__dirname, '..', 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('❌ index.html not found at:', htmlPath);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

// Build the script content
const scriptContent = `
window.HARDCOVER_API_KEY='${apiKey}';
window.HARDCOVER_USER_ID='${userId}';
`.trim();

// Check if already injected
if (html.includes('window.HARDCOVER_API_KEY')) {
  // Replace existing injection
  html = html.replace(
    /<script>\s*window\.HARDCOVER_API_KEY=[^<]*<\/script>/,
    `<script>${scriptContent}</script>`
  );
  console.log('✅ Updated existing Hardcover credentials in index.html');
} else {
  // Inject before closing </head> tag
  const script = `<script>${scriptContent}</script>`;
  html = html.replace('</head>', `    ${script}\n</head>`);
  console.log('✅ Injected Hardcover credentials into index.html');
}

fs.writeFileSync(htmlPath, html);

if (apiKey) console.log('   ✓ API Key injected');
if (userId) console.log('   ✓ User ID injected');


#!/usr/bin/env node

/**
 * Combines landing and scribe builds into a single dist folder
 * 
 * Structure:
 * dist/
 * ├── index.html, assets/, etc. (landing page)
 * └── scribe/
 *     └── app/
 *         ├── index.html
 *         ├── assets/
 *         └── manifest.webmanifest
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const LANDING_DIST = path.join(ROOT, 'landing', 'dist');
const SCRIBE_DIST = path.join(ROOT, 'scribe', 'dist');
const COMBINED_DIST = path.join(ROOT, 'dist');

console.log('🔧 Combining builds...');

// Create combined dist folder
if (fs.existsSync(COMBINED_DIST)) {
    console.log('📁 Removing existing dist folder...');
    fs.rmSync(COMBINED_DIST, { recursive: true, force: true });
}

fs.mkdirSync(COMBINED_DIST, { recursive: true });

// Copy landing page to root
console.log('📄 Copying landing page...');
fs.cpSync(LANDING_DIST, COMBINED_DIST, { recursive: true });

// Create scribe/app folder
const scribeAppDir = path.join(COMBINED_DIST, 'scribe', 'app');
fs.mkdirSync(scribeAppDir, { recursive: true });

// Copy scribe PWA to scribe/app
console.log('📄 Copying Scribe PWA...');
fs.cpSync(SCRIBE_DIST, scribeAppDir, { recursive: true });

// Update scribe index.html to fix asset paths
const scribeIndexHtml = path.join(scribeAppDir, 'index.html');
if (fs.existsSync(scribeIndexHtml)) {
    console.log('🔧 Fixing Scribe asset paths...');
    let content = fs.readFileSync(scribeIndexHtml, 'utf8');
    
    // Fix asset paths (remove leading /)
    content = content.replace(/src="\/assets\//g, 'src="assets/');
    content = content.replace(/href="\/assets\//g, 'href="assets/');
    content = content.replace(/href="\/icons\//g, 'href="icons/');
    content = content.replace(/href="\/scribe\/app\//g, 'href="/scribe/app/');
    
    fs.writeFileSync(scribeIndexHtml, content, 'utf8');
}

// Update vite.svg path if it exists
const viteSvg = path.join(scribeAppDir, 'vite.svg');
if (fs.existsSync(viteSvg)) {
    fs.copyFileSync(viteSvg, path.join(scribeAppDir, 'favicon.svg'));
}

console.log('✅ Build combined successfully!');
console.log(`📁 Output: ${COMBINED_DIST}`);

// List contents
console.log('\n📦 Build contents:');
const items = fs.readdirSync(COMBINED_DIST);
items.forEach(item => {
    const stat = fs.statSync(path.join(COMBINED_DIST, item));
    const type = stat.isDirectory() ? '📁' : '📄';
    console.log(`  ${type} ${item}`);
});

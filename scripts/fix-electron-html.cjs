// Vite adds a `crossorigin` attribute to <script> and <link> tags in the
// built index.html. This is harmless when serving over http(s), but breaks
// asset loading entirely when Electron loads the file via the file://
// protocol (Chromium treats file:// pages as having no origin, so any
// "cross-origin" fetch gets silently blocked - this shows up as
// net::ERR_FILE_NOT_FOUND in DevTools, not as a CORS error).
//
// This script runs after `vite build` and before `electron-builder`,
// stripping the attribute so the packaged app can load its own assets.

const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('postbuild-fix-electron-html: dist/index.html not found, did the build run?');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
const before = html;

html = html.replace(/\s+crossorigin(="[^"]*")?/g, '');

if (html === before) {
  console.log('postbuild-fix-electron-html: no crossorigin attributes found (already clean).');
} else {
  fs.writeFileSync(indexPath, html);
  console.log('postbuild-fix-electron-html: removed crossorigin attributes from dist/index.html.');
}

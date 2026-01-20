#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const APP_NAME = 'VK Wrapper';

// Path to Electron's Info.plist on macOS
const plistPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Info.plist'
);

if (process.platform !== 'darwin') {
  console.log('Skipping Electron name patch (not macOS)');
  process.exit(0);
}

if (!fs.existsSync(plistPath)) {
  console.log('Electron Info.plist not found, skipping patch');
  process.exit(0);
}

try {
  let plist = fs.readFileSync(plistPath, 'utf8');

  // Replace CFBundleName
  plist = plist.replace(
    /<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/,
    `<key>CFBundleName</key>\n\t<string>${APP_NAME}</string>`
  );

  // Replace CFBundleDisplayName
  plist = plist.replace(
    /<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
    `<key>CFBundleDisplayName</key>\n\t<string>${APP_NAME}</string>`
  );

  fs.writeFileSync(plistPath, plist);
  console.log(`Patched Electron app name to "${APP_NAME}"`);
} catch (err) {
  console.error('Failed to patch Electron name:', err.message);
  process.exit(1);
}

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.join(__dirname, '..', 'assets');
const sourcePng = path.join(assetsDir, 'icon.png');

async function generateIcons() {
  if (!fs.existsSync(sourcePng)) {
    console.error('Source icon.png not found in assets/');
    process.exit(1);
  }

  // Generate Windows .ico
  console.log('Generating Windows icon...');
  try {
    const pngToIco = require('png-to-ico').default;
    const icoBuffer = await pngToIco([sourcePng]);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
    console.log('Created assets/icon.ico');
  } catch (err) {
    console.error('Failed to generate .ico:', err.message);
  }

  // Generate macOS .icns (only on macOS)
  if (process.platform === 'darwin') {
    console.log('Generating macOS icon...');
    const iconsetDir = path.join(assetsDir, 'icon.iconset');

    try {
      // Create iconset directory
      if (fs.existsSync(iconsetDir)) {
        fs.rmSync(iconsetDir, { recursive: true });
      }
      fs.mkdirSync(iconsetDir);

      // Generate different sizes using sips
      const sizes = [
        { size: 16, name: 'icon_16x16.png' },
        { size: 32, name: 'icon_16x16@2x.png' },
        { size: 32, name: 'icon_32x32.png' },
        { size: 64, name: 'icon_32x32@2x.png' },
        { size: 128, name: 'icon_128x128.png' },
        { size: 256, name: 'icon_128x128@2x.png' },
        { size: 256, name: 'icon_256x256.png' },
        { size: 512, name: 'icon_256x256@2x.png' },
        { size: 512, name: 'icon_512x512.png' },
        { size: 1024, name: 'icon_512x512@2x.png' },
      ];

      for (const { size, name } of sizes) {
        const outPath = path.join(iconsetDir, name);
        execSync(`sips -z ${size} ${size} "${sourcePng}" --out "${outPath}"`, { stdio: 'pipe' });
      }

      // Convert iconset to icns
      execSync(`iconutil -c icns "${iconsetDir}"`, { stdio: 'pipe' });

      // Clean up iconset
      fs.rmSync(iconsetDir, { recursive: true });

      console.log('Created assets/icon.icns');
    } catch (err) {
      console.error('Failed to generate .icns:', err.message);
    }
  }

  console.log('Icon generation complete!');
}

generateIcons().catch(console.error);

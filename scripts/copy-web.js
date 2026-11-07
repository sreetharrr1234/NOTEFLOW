const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'www');

function copyFileOrDir(rel) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) return;
  const dest = path.join(outDir, rel);
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function copyVendorFiles() {
  const vendorDir = path.join(root, 'assets', 'vendor');
  fs.mkdirSync(vendorDir, { recursive: true });

  const files = [
    ['node_modules/@capacitor/core/dist/capacitor.js', 'capacitor.js'],
    ['node_modules/@capacitor/app/dist/plugin.js', 'capacitor-app.js'],
    ['node_modules/@capacitor/haptics/dist/plugin.js', 'capacitor-haptics.js'],
    ['node_modules/@capacitor/share/dist/plugin.js', 'capacitor-share.js'],
    ['node_modules/@capacitor/status-bar/dist/plugin.js', 'capacitor-status-bar.js'],
  ];

  files.forEach(([src, dest]) => {
    const source = path.join(root, src);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(vendorDir, dest));
  });
}

copyVendorFiles();
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

['index.html', 'css', 'js', 'assets'].forEach(copyFileOrDir);
console.log(`Copied web assets to ${path.relative(root, outDir)}`);

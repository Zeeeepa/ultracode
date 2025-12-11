/**
 * Test custom-built Dawn WebGPU addon
 *
 * node test.js  - works
 * bun test.js   - crashes
 *
 * Requires dawn.node in the same directory.
 * Copy from: ../../external-libs/dawn-win32-x64/dawn.node
 */

const path = require('path');
const fs = require('fs');

const runtime = typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : `Node.js ${process.version}`;
console.log(`Runtime: ${runtime}`);

// Find dawn.node
const dawnPath = path.join(__dirname, 'dawn.node');
const fallbackPath = path.join(__dirname, '..', '..', 'external-libs', 'dawn-win32-x64', 'dawn.node');

let addonPath = dawnPath;
if (!fs.existsSync(dawnPath)) {
  if (fs.existsSync(fallbackPath)) {
    addonPath = fallbackPath;
  } else {
    console.log('ERROR: dawn.node not found');
    console.log('Copy from: ../../external-libs/dawn-win32-x64/dawn.node');
    process.exit(1);
  }
}

console.log('Loading custom dawn.node from:', addonPath);
const dawn = require(addonPath);
console.log('Module loaded');

const gpu = dawn.create([]);
console.log('GPU created');

const adapter = await gpu.requestAdapter();
if (!adapter) {
  console.log('No adapter');
  process.exit(1);
}
console.log('Adapter:', adapter.info?.device || 'unknown');

const device = await adapter.requestDevice();
console.log('Device created');
console.log('SUCCESS!');

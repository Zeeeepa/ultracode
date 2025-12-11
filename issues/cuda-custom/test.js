/**
 * Test custom CUDA addon (CUDA 13.1, Blackwell support)
 *
 * node test.js  - works
 * bun test.js   - crashes
 *
 * Requires ultrascript_cuda.node in the same directory.
 * Copy from: ../../external-libs/cuda-win32-x64/ultrascript_cuda.node
 */

const path = require('path');
const fs = require('fs');

const runtime = typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : `Node.js ${process.version}`;
console.log(`Runtime: ${runtime}`);

// Find CUDA addon
const cudaPath = path.join(__dirname, 'ultrascript_cuda.node');
const fallbackPath = path.join(__dirname, '..', '..', 'external-libs', 'cuda-win32-x64', 'ultrascript_cuda.node');

let addonPath = cudaPath;
if (!fs.existsSync(cudaPath)) {
  if (fs.existsSync(fallbackPath)) {
    addonPath = fallbackPath;
  } else {
    console.log('ERROR: ultrascript_cuda.node not found');
    console.log('Copy from: ../../external-libs/cuda-win32-x64/ultrascript_cuda.node');
    process.exit(1);
  }
}

console.log('Loading CUDA from:', addonPath);
const cuda = require(addonPath);
console.log('Module loaded');
console.log('Exports:', Object.keys(cuda));

// Test getDeviceInfo if available
if (cuda.getDeviceInfo) {
  console.log('\nDevice info:');
  const info = cuda.getDeviceInfo();
  console.log(info);
}

console.log('\nSUCCESS!');

/**
 * Minimal WebGPU test using npm package
 *
 * node test.js  - works
 * bun test.js   - crashes
 */

const runtime = typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : `Node.js ${process.version}`;
console.log(`Runtime: ${runtime}`);
console.log('Loading webgpu...');

const webgpu = require('webgpu');
console.log('✓ Module loaded');

const gpu = webgpu.create([]);
console.log('✓ GPU instance created');

const adapter = await gpu.requestAdapter();
if (!adapter) {
  console.log('✗ No adapter');
  process.exit(1);
}
console.log('✓ Adapter:', adapter.info?.device || 'unknown');

const device = await adapter.requestDevice();
console.log('✓ Device created');

console.log('WebGPU works!');

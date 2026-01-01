// Patch PE subsystem from CONSOLE (3) to WINDOWS (2)
const fs = require('fs');
const path = process.argv[2];

if (!path) {
  console.log('Usage: node patch-subsystem.js <exe-file>');
  process.exit(1);
}

const buf = fs.readFileSync(path);

// Check MZ signature
if (buf[0] !== 0x4D || buf[1] !== 0x5A) {
  console.error('Not a valid PE file (no MZ signature)');
  process.exit(1);
}

// Get PE header offset from 0x3C
const peOffset = buf.readUInt32LE(0x3C);
console.log('PE header offset: 0x' + peOffset.toString(16));

// Check PE signature
if (buf[peOffset] !== 0x50 || buf[peOffset + 1] !== 0x45) {
  console.error('Not a valid PE file (no PE signature)');
  process.exit(1);
}

// Optional header starts at peOffset + 24 (4-byte PE sig + 20-byte COFF header)
const optionalHeaderOffset = peOffset + 24;
const magic = buf.readUInt16LE(optionalHeaderOffset);
console.log('PE Magic: 0x' + magic.toString(16), magic === 0x20B ? '(PE32+)' : '(PE32)');

// Subsystem is at offset 68 (0x44) in both PE32 and PE32+ optional header
const subsystemOffset = optionalHeaderOffset + 68;
console.log('Subsystem offset: 0x' + subsystemOffset.toString(16));

const currentSubsystem = buf.readUInt16LE(subsystemOffset);
const subsystemNames = { 2: 'WINDOWS (GUI)', 3: 'CONSOLE (CUI)' };
console.log('Current subsystem:', currentSubsystem, '(' + (subsystemNames[currentSubsystem] || 'OTHER') + ')');

const dryRun = process.argv.includes('--dry-run');

if (currentSubsystem === 3) {
  if (dryRun) {
    console.log('Would patch to WINDOWS subsystem (2) [dry-run]');
  } else {
    buf.writeUInt16LE(2, subsystemOffset); // WINDOWS = 2
    fs.writeFileSync(path, buf);
    console.log('Patched to WINDOWS subsystem (2)');
  }
} else if (currentSubsystem === 2) {
  console.log('Already WINDOWS subsystem');
} else {
  console.log('Subsystem is not CONSOLE, not patching');
}

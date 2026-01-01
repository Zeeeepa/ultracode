# FAISS Prebuilt Binary for Linux x64

This directory contains prebuilt `faiss-node.node` for Node 24 (ABI v137) on Linux x64.

## Building

Run from project root on a Linux machine, WSL, or Docker:

```bash
npm run build:faiss
```

This will compile and place `faiss-node.node` in this directory.

See `scripts/BUILD_FAISS_README.md` for details.

## Contents

- `faiss-node.node` - Native addon for Node 24 (ABI v137)

## Usage

This binary is automatically copied to `node_modules/faiss-node/` during `npm install` via the postinstall script.

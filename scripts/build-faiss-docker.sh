#!/bin/bash
set -e

echo "Installing build dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git cmake build-essential libopenblas-dev libblas-dev liblapack-dev python3 patchelf

echo "Installing node-gyp..."
npm install -g node-gyp

echo "Cloning faiss-node repository..."
if [ -d .build-cache/faiss-node ]; then
  cd .build-cache/faiss-node
  git pull || true
else
  mkdir -p .build-cache
  git clone --depth 1 https://github.com/ewfian/faiss-node.git .build-cache/faiss-node
  cd .build-cache/faiss-node
fi

echo "Cleaning old build artifacts..."
rm -rf deps node_modules build

echo "Installing npm dependencies and building (via cmake-js)..."
npm install

echo "Copying to external-libs..."
mkdir -p /work/external-libs/faiss-linux-x64
cp build/Release/faiss-node.node /work/external-libs/faiss-linux-x64/

echo "Testing..."
node -e "require('/work/external-libs/faiss-linux-x64/faiss-node.node'); console.log('✓ Build successful')"

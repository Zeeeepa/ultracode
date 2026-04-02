#!/bin/bash
# Convert Jina Embeddings V2 Base Code to OpenVINO format

MODEL_ID="jinaai/jina-embeddings-v2-base-code"
MODEL_NAME="jina-embeddings-v2-base-code"
OUTPUT_DIR="./ovms-models/${MODEL_NAME}/1"

echo "🚀 Converting ${MODEL_ID} to OpenVINO IR format..."

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Convert using optimum-cli (supports Jina's ALiBi architecture)
echo "📦 Running optimum-cli export..."
optimum-cli export openvino \
  --model "${MODEL_ID}" \
  --task feature-extraction \
  --weight-format int8 \
  --trust-remote-code \
  "${OUTPUT_DIR}"

if [ $? -eq 0 ]; then
  echo "✅ Conversion successful!"
  echo "📁 Output: ${OUTPUT_DIR}"
  ls -la "${OUTPUT_DIR}"
else
  echo "❌ Conversion failed!"
  exit 1
fi

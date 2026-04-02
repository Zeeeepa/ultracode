#!/bin/bash
# Convert Jina Embedding models to OpenVINO IR format for OVMS
# Requires: pip install optimum[openvino] transformers

MODELS_DIR="C:/Users/faxen/AppData/Local/UltraCode/models"

echo "=========================================="
echo "  Jina Embeddings -> OpenVINO Converter"
echo "=========================================="

# Function to convert a model
convert_model() {
    local HF_MODEL="$1"
    local MODEL_NAME="$2"
    local OUTPUT_DIR="${MODELS_DIR}/${MODEL_NAME}/1"

    echo ""
    echo "Converting: ${HF_MODEL}"
    echo "Output: ${OUTPUT_DIR}"
    echo ""

    mkdir -p "${OUTPUT_DIR}"

    # Convert using optimum-cli with INT8 quantization
    optimum-cli export openvino \
        --model "${HF_MODEL}" \
        --task feature-extraction \
        --weight-format int8 \
        --trust-remote-code \
        "${OUTPUT_DIR}"

    if [ $? -eq 0 ]; then
        echo "✅ ${MODEL_NAME} converted successfully!"
        ls -lh "${OUTPUT_DIR}"/*.xml "${OUTPUT_DIR}"/*.bin 2>/dev/null
        return 0
    else
        echo "❌ ${MODEL_NAME} conversion FAILED!"
        return 1
    fi
}

# Convert Jina Code V2
echo ""
echo "========== Jina Embeddings V2 Base Code =========="
convert_model "jinaai/jina-embeddings-v2-base-code" "jina-embeddings-v2-base-code"
JINA_CODE_RESULT=$?

# Convert Jina V3
echo ""
echo "========== Jina Embeddings V3 =========="
convert_model "jinaai/jina-embeddings-v3" "jina-embeddings-v3"
JINA_V3_RESULT=$?

# Update OVMS config.json
echo ""
echo "========== Updating OVMS config.json =========="
cat > "${MODELS_DIR}/config.json" << 'EOFCONFIG'
{
    "model_config_list": [
        {
            "config": {
                "name": "multilingual-e5-base",
                "base_path": "/models/multilingual-e5-base"
            }
        },
        {
            "config": {
                "name": "jina-embeddings-v2-base-code",
                "base_path": "/models/jina-embeddings-v2-base-code"
            }
        },
        {
            "config": {
                "name": "jina-embeddings-v3",
                "base_path": "/models/jina-embeddings-v3"
            }
        }
    ]
}
EOFCONFIG

echo "✅ OVMS config.json updated"
cat "${MODELS_DIR}/config.json"

# Summary
echo ""
echo "=========================================="
echo "  CONVERSION SUMMARY"
echo "=========================================="
echo "Jina Code V2: $([ $JINA_CODE_RESULT -eq 0 ] && echo '✅ OK' || echo '❌ FAILED')"
echo "Jina V3:      $([ $JINA_V3_RESULT -eq 0 ] && echo '✅ OK' || echo '❌ FAILED')"
echo ""
echo "To reload OVMS: docker restart ovms-embedding"
echo ""

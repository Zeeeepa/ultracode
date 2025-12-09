# Intel NPU Integration Plan for UltraScript Tools MCP

## Overview

Интеграция Intel NPU для ускорения embedding-инференса с использованием:
1. **Primary**: `openvino-node` (native bindings)
2. **Fallback**: OVMS REST API (Docker)

---

## 🧪 Результаты тестирования (2024-12-07)

### Успешно протестировано:

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| `openvino-node` в Bun | ⚠️ Частично | Работает, но `model.inputs` крашит |
| `openvino-node` в Node.js | ✅ Работает | Полная поддержка |
| `@xenova/transformers` | ✅ Работает | В Bun и Node.js |
| CPU inference | ✅ 2.9ms | Стабильно |
| GPU.0 inference | ✅ 2.5ms | 16% быстрее CPU |
| NPU inference | ❌ | Не поддерживает `Where` операцию в ONNX модели |

### Проблема с NPU:

```
[ERROR] vpux-compiler: Got non broadcastable dimensions pair: '0' and -9223372036854775808'
loc: /Where_1 (Select operation)
```

**Причина**: ONNX модель `all-MiniLM-L6-v2` использует операцию `Where`, которую NPU не поддерживает.

**Решение**: Конвертация модели через `optimum-intel` в OpenVINO IR формат с заменой неподдерживаемых операций.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EmbeddingProvider Interface                  │
├─────────────────────────────────────────────────────────────────┤
│  OllamaProvider │ TEIProvider │ OpenVINOProvider │ OVMSProvider │
└────────┬────────┴──────┬──────┴────────┬─────────┴──────┬───────┘
         │               │               │                │
         ▼               ▼               ▼                ▼
      Ollama          TEI Docker    openvino-node     OVMS REST
      (GPU/CPU)       (CPU/GPU)     (NPU/CPU/GPU)    (NPU/CPU/GPU)
```

## NPU-Specific Requirements

### 1. Static Shapes (КРИТИЧНО для NPU)

NPU требует статические размеры тензоров. Это значит:
- Фиксированная длина последовательности (seq_length)
- Padding коротких текстов до max_length
- Truncation длинных текстов

```typescript
// NPU-специфичная конфигурация
interface NPUConfig {
  maxSequenceLength: number;  // default: 512 для all-MiniLM-L6-v2
  paddingStrategy: 'max_length' | 'batch_max';
  truncation: boolean;
}
```

**Где применять:**
- `OpenVINOProvider.preprocess()` - padding/truncation перед инференсом
- Отключать для Ollama/TEI (они делают это сами)

### 2. Model Quantization

NPU оптимизирован для INT4/INT8:

```bash
# Конвертация модели для NPU
optimum-cli export openvino \
  --model sentence-transformers/all-MiniLM-L6-v2 \
  --weight-format int8 \
  --task feature-extraction \
  models/all-MiniLM-L6-v2-int8-ov
```

**Структура модели:**
```
models/all-MiniLM-L6-v2-int8-ov/
├── openvino_model.xml    # Model graph
├── openvino_model.bin    # Weights
├── tokenizer.json        # HF tokenizer
└── config.json           # Model config
```

### 3. Tokenization (CPU only)

OpenVINO Tokenizers работают ТОЛЬКО на CPU:

```typescript
// Варианты токенизации:
// A) OpenVINO Tokenizers (CPU) → встроенные в pipeline
// B) Внешний tokenizer (@xenova/transformers) → более гибко
// C) Предварительная токенизация на сервере

// Рекомендую вариант B для гибкости
import { AutoTokenizer } from '@xenova/transformers';
```

### 4. Mean Pooling

Sentence embeddings требуют mean pooling:

```typescript
function meanPooling(
  lastHiddenState: Float32Array,  // [batch, seq_len, hidden_dim]
  attentionMask: Float32Array,    // [batch, seq_len]
  hiddenDim: number
): Float32Array {
  // Применять attention mask
  // Суммировать по seq_len
  // Делить на количество не-padding токенов
}
```

**Где применять:**
- `OpenVINOProvider.postprocess()` - после инференса
- Отключать для Ollama/TEI (они возвращают готовые embeddings)

---

## Implementation Plan

### Phase 1: OpenVINO Provider (Native)

#### Files to Create/Modify:

```
src/semantic/providers/
├── base.ts                    # Добавить: ProviderKind = "openvino" | "ovms"
├── openvino-provider.ts       # NEW: Native openvino-node provider
├── ovms-provider.ts           # NEW: OVMS REST fallback
├── factory.ts                 # Добавить: auto-detection NPU
└── preprocessing/             # NEW: Shared preprocessing
    ├── tokenizer.ts           # Tokenization wrapper
    ├── pooling.ts             # Mean pooling
    └── padding.ts             # Static shape padding

src/config/
└── yaml-config.ts             # Добавить: openvino/ovms config sections

scripts/
├── setup-openvino.sh          # Model download & conversion
└── setup-ovms.sh              # OVMS Docker setup
```

#### 1.1 OpenVINOProvider Implementation

```typescript
// src/semantic/providers/openvino-provider.ts

import type { EmbeddingProvider, EmbedOptions, ProviderInfo } from "./base.js";

export interface OpenVINOOptions {
  model: string;
  modelPath: string;           // Path to .xml/.bin files
  device: 'NPU' | 'CPU' | 'GPU' | 'AUTO';
  maxSequenceLength?: number;  // NPU: required, others: optional
  quantization?: 'fp32' | 'fp16' | 'int8' | 'int4';
  logger?: ProviderLogger;
}

export class OpenVINOProvider implements EmbeddingProvider {
  private core: any;           // ov.Core
  private compiledModel: any;  // ov.CompiledModel
  private inferRequest: any;   // ov.InferRequest
  private tokenizer: any;      // @xenova/transformers tokenizer

  private device: string;
  private maxSeqLen: number;
  private hiddenDim: number;

  public info: ProviderInfo;

  constructor(opts: OpenVINOOptions) {
    this.device = opts.device;
    this.maxSeqLen = opts.maxSequenceLength ?? 512;
    // ...
  }

  async initialize(): Promise<void> {
    // 1. Check NPU availability
    const isNPUAvailable = await this.checkNPU();

    // 2. Load openvino-node (dynamic import for Bun compatibility)
    const { addon: ov } = await import('openvino-node');
    this.core = new ov.Core();

    // 3. Check device
    const devices = this.core.getAvailableDevices();
    if (this.device === 'NPU' && !devices.includes('NPU')) {
      throw new Error('NPU device not available');
    }

    // 4. Load model
    const model = await this.core.readModel(this.opts.modelPath);

    // 5. NPU-specific: reshape to static shape
    if (this.device === 'NPU') {
      model.reshapeInput('input_ids', [1, this.maxSeqLen]);
      model.reshapeInput('attention_mask', [1, this.maxSeqLen]);
      // token_type_ids if present
    }

    // 6. Compile for target device
    this.compiledModel = await this.core.compileModel(model, this.device);
    this.inferRequest = this.compiledModel.createInferRequest();

    // 7. Load tokenizer
    const { AutoTokenizer } = await import('@xenova/transformers');
    this.tokenizer = await AutoTokenizer.from_pretrained(this.opts.model);

    // 8. Warmup
    await this.embed("warmup");
  }

  async embed(text: string, opts?: EmbedOptions): Promise<Float32Array> {
    // 1. Tokenize with padding/truncation for NPU
    const encoded = await this.tokenizer(text, {
      padding: this.device === 'NPU' ? 'max_length' : true,
      truncation: true,
      max_length: this.maxSeqLen,
      return_tensors: 'np',
    });

    // 2. Set input tensors
    this.inferRequest.setInputTensor('input_ids', encoded.input_ids);
    this.inferRequest.setInputTensor('attention_mask', encoded.attention_mask);

    // 3. Run inference
    this.inferRequest.infer();

    // 4. Get output
    const output = this.inferRequest.getOutputTensor();
    const lastHiddenState = output.getData();

    // 5. Mean pooling
    return this.meanPooling(lastHiddenState, encoded.attention_mask);
  }

  private meanPooling(
    hiddenState: Float32Array,
    attentionMask: Float32Array
  ): Float32Array {
    // Implementation...
  }

  private async checkNPU(): Promise<boolean> {
    // Check Intel NPU driver availability
    // Windows: check for npud.dll
    // Linux: check for /dev/accel
  }
}
```

#### 1.2 NPU Detection in Factory

```typescript
// src/semantic/providers/factory.ts - additions

async function detectAvailableProvider(): Promise<{ provider: ProviderKind; model: string }> {
  // NEW: Try OpenVINO NPU first (highest priority for local inference)
  try {
    const hasNPU = await detectNPU();
    const modelPath = findOpenVINOModel();
    if (hasNPU && modelPath) {
      appLogger.info("EmbeddingFactory", "Auto-detected: Intel NPU with OpenVINO");
      return { provider: "openvino", model: modelPath };
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "OpenVINO NPU not available");
  }

  // NEW: Try OVMS (OpenVINO Model Server) with NPU
  try {
    const ovmsResponse = await fetch("http://127.0.0.1:8080/v3/models", {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    if (ovmsResponse.ok) {
      appLogger.info("EmbeddingFactory", "Auto-detected: OVMS (OpenVINO Model Server)");
      return { provider: "ovms", model: "all-MiniLM-L6-v2" };
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "OVMS not available");
  }

  // Existing: TEI > Ollama > Memory
  // ...
}

async function detectNPU(): Promise<boolean> {
  // Platform-specific NPU detection
  if (process.platform === 'win32') {
    // Check for Intel NPU driver
    const { existsSync } = await import('node:fs');
    return existsSync('C:\\Windows\\System32\\npud.dll') ||
           existsSync('C:\\Windows\\System32\\DriverStore\\FileRepository\\*intel*npu*');
  }
  if (process.platform === 'linux') {
    const { existsSync } = await import('node:fs');
    return existsSync('/dev/accel/accel0');
  }
  return false;
}
```

#### 1.3 Configuration Schema

```typescript
// src/config/yaml-config.ts - additions

export interface MCPConfig {
  embedding?: {
    // Existing...
    provider?: "memory" | "ollama" | "openai" | "cloudru" | "huggingface" | "tei" | "openvino" | "ovms" | "auto";

    // NEW: OpenVINO native config
    openvino?: {
      modelPath?: string;          // Path to model directory
      device?: 'NPU' | 'CPU' | 'GPU' | 'AUTO';
      maxSequenceLength?: number;  // NPU requires fixed length
      quantization?: 'fp32' | 'fp16' | 'int8' | 'int4';
      cacheDir?: string;           // OpenVINO cache directory
      numStreams?: number;         // Inference streams (NPU: 1)
    };

    // NEW: OVMS REST config
    ovms?: {
      baseUrl?: string;            // default: http://127.0.0.1:8080
      timeoutMs?: number;
      concurrency?: number;
    };
  };
}
```

### Phase 2: OVMS Fallback Provider

```typescript
// src/semantic/providers/ovms-provider.ts

/**
 * OpenVINO Model Server Provider
 *
 * REST API compatible with OpenAI embeddings endpoint.
 * Fallback when native openvino-node doesn't work (e.g., Bun incompatibility).
 *
 * Setup:
 * docker run -d --device /dev/accel \
 *   -p 8080:8080 \
 *   -v ./models:/models \
 *   openvino/model_server:2025.2-gpu \
 *   --rest_port 8080 --config_path /models/config.json
 */
export class OVMSProvider implements EmbeddingProvider {
  // Similar to TEIProvider but using OVMS /v3/embeddings endpoint

  async embed(text: string): Promise<Float32Array> {
    const res = await fetch(`${this.baseUrl}/v3/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    const json = await res.json();
    // OpenAI-compatible response: { data: [{ embedding: number[] }] }
    return new Float32Array(json.data[0].embedding);
  }
}
```

---

## NPU vs Other Providers Comparison

| Feature | Ollama/TEI | OpenVINO (CPU/GPU) | OpenVINO (NPU) | OVMS |
|---------|------------|-------------------|----------------|------|
| **Static shapes** | No | Optional | **Required** | Handled by server |
| **Tokenization** | Internal | External | External | Internal |
| **Mean pooling** | Internal | External | External | Internal |
| **Padding** | Auto | Optional | **Required** | Auto |
| **Quantization** | Model-dependent | Optional | **Recommended** | Optional |
| **Batch size** | Dynamic | Dynamic | **Fixed** | Dynamic |

---

## Conditional Logic by Provider

```typescript
// src/semantic/providers/utils/preprocessing.ts

export interface PreprocessConfig {
  device: 'NPU' | 'CPU' | 'GPU' | 'AUTO' | 'OLLAMA' | 'TEI';
  maxSequenceLength?: number;
}

export function needsStaticShapes(config: PreprocessConfig): boolean {
  return config.device === 'NPU';
}

export function needsExternalTokenization(config: PreprocessConfig): boolean {
  return ['NPU', 'CPU', 'GPU', 'AUTO'].includes(config.device);
}

export function needsMeanPooling(config: PreprocessConfig): boolean {
  return ['NPU', 'CPU', 'GPU', 'AUTO'].includes(config.device);
}

export function getRecommendedBatchSize(config: PreprocessConfig): number {
  switch (config.device) {
    case 'NPU': return 1;      // NPU: single inference is optimal
    case 'CPU': return 8;      // CPU: moderate batching
    case 'GPU': return 32;     // GPU: large batches
    default: return 8;
  }
}
```

---

## Setup Scripts

### scripts/setup-openvino-model.py

```python
#!/usr/bin/env python3
"""
Download and convert embedding model to OpenVINO format for NPU.

Usage:
  python scripts/setup-openvino-model.py \
    --model sentence-transformers/all-MiniLM-L6-v2 \
    --output models/all-MiniLM-L6-v2-int8-ov \
    --quantization int8 \
    --device NPU
"""

from optimum.intel import OVModelForFeatureExtraction
from transformers import AutoTokenizer
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default='sentence-transformers/all-MiniLM-L6-v2')
    parser.add_argument('--output', default='models/all-MiniLM-L6-v2-int8-ov')
    parser.add_argument('--quantization', choices=['fp32', 'fp16', 'int8', 'int4'], default='int8')
    parser.add_argument('--device', choices=['NPU', 'CPU', 'GPU'], default='NPU')
    args = parser.parse_args()

    # Load and convert
    model = OVModelForFeatureExtraction.from_pretrained(
        args.model,
        export=True,
        compile=False,
    )

    # Quantize if needed
    if args.quantization in ['int8', 'int4']:
        from optimum.intel import OVQuantizer
        quantizer = OVQuantizer.from_pretrained(model)
        quantizer.quantize(save_directory=args.output, weights_only=True)
    else:
        model.save_pretrained(args.output)

    # Copy tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    tokenizer.save_pretrained(args.output)

    print(f"Model saved to {args.output}")

if __name__ == '__main__':
    main()
```

### scripts/setup-ovms.sh

```bash
#!/bin/bash
# Setup OpenVINO Model Server for embeddings

MODEL_DIR=${1:-"./models"}
MODEL_NAME=${2:-"all-MiniLM-L6-v2"}

# Create config
cat > "$MODEL_DIR/config.json" << EOF
{
  "model_config_list": [
    {
      "config": {
        "name": "$MODEL_NAME",
        "base_path": "/models/$MODEL_NAME",
        "target_device": "NPU"
      }
    }
  ]
}
EOF

# Run OVMS with NPU support
docker run -d \
  --name ovms-embeddings \
  --device /dev/accel \
  -p 8080:8080 \
  -v "$MODEL_DIR:/models" \
  openvino/model_server:2025.2-gpu \
  --rest_port 8080 \
  --config_path /models/config.json

echo "OVMS started at http://localhost:8080"
echo "Test: curl http://localhost:8080/v3/embeddings -d '{\"model\":\"$MODEL_NAME\",\"input\":\"test\"}'"
```

---

## Testing Bun Compatibility

### Test Script

```typescript
// scripts/test-openvino-bun.ts
// Run: bun run scripts/test-openvino-bun.ts

async function testOpenVINOInBun() {
  console.log('Testing openvino-node in Bun...');

  try {
    // Dynamic import to test loading
    const { addon: ov } = await import('openvino-node');
    console.log('✓ openvino-node loaded');

    // Create core
    const core = new ov.Core();
    console.log('✓ Core created');

    // Get devices
    const devices = core.getAvailableDevices();
    console.log('✓ Available devices:', devices);

    // Check NPU
    if (devices.includes('NPU')) {
      console.log('✓ NPU detected!');
    } else {
      console.log('⚠ NPU not found, available:', devices);
    }

    return { success: true, devices };

  } catch (error: any) {
    console.error('✗ Failed:', error.message);
    return { success: false, error: error.message };
  }
}

testOpenVINOInBun();
```

---

## Priority Order

1. **openvino-node + NPU** - Best performance, lowest power
2. **openvino-node + CPU** - If NPU unavailable
3. **OVMS + NPU** - If openvino-node has Bun issues
4. **TEI** - Existing fallback
5. **Ollama** - Existing fallback
6. **Memory** - Hash-based (no ML)

---

## Estimated Changes

| File | Action | Lines |
|------|--------|-------|
| `src/semantic/providers/base.ts` | Modify | +2 |
| `src/semantic/providers/openvino-provider.ts` | **Create** | ~300 |
| `src/semantic/providers/ovms-provider.ts` | **Create** | ~150 |
| `src/semantic/providers/factory.ts` | Modify | +50 |
| `src/semantic/providers/utils/preprocessing.ts` | **Create** | ~100 |
| `src/config/yaml-config.ts` | Modify | +30 |
| `scripts/setup-openvino-model.py` | **Create** | ~50 |
| `scripts/setup-ovms.sh` | **Create** | ~30 |
| `scripts/test-openvino-bun.ts` | **Create** | ~40 |

**Total: ~750 lines of code**

---

## Next Steps

1. [ ] Попробовать `npm install openvino-node` в Bun
2. [ ] Тестировать базовый инференс с CPU
3. [ ] Проверить NPU detection на Intel Core Ultra
4. [ ] Реализовать OpenVINOProvider
5. [ ] Реализовать OVMSProvider как fallback
6. [ ] Интегрировать в factory с auto-detection
7. [ ] Добавить конфигурацию в yaml-config
8. [ ] Написать setup scripts

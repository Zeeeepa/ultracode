# Development Scripts

This directory contains setup scripts for UltraScript Tools MCP.

## Embeddings Setup

**One unified script for all embedding providers:**

### Linux/macOS

```bash
./setup-embeddings.sh
```

### Windows

```cmd
setup-embeddings.cmd
```

### Features

- **Interactive Mode**: Step-by-step wizard for provider and model selection
- **Auto GPU Detection**: Automatically detects NVIDIA GPUs (RTX 30xx/40xx series)
- **Dependency Installation**: Auto-installs Docker, NVIDIA Container Toolkit, or Ollama
- **Centralized Config**: All models defined in `config/embedding-models.json`

### Supported Providers

| Provider   | Description                                                                                                      | Requirements   |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | -------------- |
| **TEI**    | HuggingFace Text Embeddings Inference<br>✅ 8192 tokens context<br>🚀 GPU acceleration<br>⚡ 5-10x faster on GPU | Docker Desktop |
| **Ollama** | Simple local inference<br>✅ Easy installation<br>🎮 Auto-detects GPU<br>📦 Smaller downloads                    | Ollama binary  |
| **Memory** | Hash-based embeddings<br>⚠️ No ML (deterministic)<br>⚡ Instant, no compute                                      | None           |

### Usage Examples

#### Interactive Mode (Recommended)

```bash
# Linux/macOS
./setup-embeddings.sh

# Windows
setup-embeddings.cmd
```

You will be prompted to:

1. Choose provider (TEI, Ollama, or Memory)
2. Select model from available list
3. Choose GPU/CPU mode (for TEI)

#### Non-Interactive Mode

```bash
# Use default TEI model
./setup-embeddings.sh --provider tei

# Specific model
./setup-embeddings.sh --provider tei --model granite-embedding-278m

# Force CPU mode
./setup-embeddings.sh --provider tei --force-cpu

# Custom port
./setup-embeddings.sh --provider tei --port 8081

# Ollama with default model
./setup-embeddings.sh --provider ollama

# Memory provider (no installation)
./setup-embeddings.sh --provider memory
```

### Available Models

Models are defined in `config/embedding-models.json`. To add a new model, simply edit the JSON file:

```json
{
  "id": "new-model",
  "provider": "tei",
  "name": "New Model",
  "badge": "🚀 New",
  "model_id": "organization/model-name",
  "gpu_support": true,
  "image_gpu": "ghcr.io/huggingface/text-embeddings-inference:1.5",
  "image_cpu": "ghcr.io/huggingface/text-embeddings-inference:cpu-1.5",
  "language": "en",
  "context_tokens": 8192,
  "dimensions": 768,
  "size_mb": 600,
  "description": "Description of the model"
}
```

**Current models include:**

- IBM Granite (125M, 278M, 30M) - 8192 tokens, English
- BGE (Small, Base, Large, M3) - 512-8192 tokens
- E5 (Small, Base, Large) - 512 tokens
- GTE Base - 512 tokens
- Nomic Embed Text (Ollama) - 8192 tokens
- MxBai Embed Large (Ollama) - 512 tokens
- And more...

### GPU Support

The script automatically:

1. Detects NVIDIA GPU (via `nvidia-smi`)
2. Checks Compute Capability (requires 8.0+ for RTX 30xx/40xx)
3. Installs NVIDIA Container Toolkit if needed (Linux/WSL2)
4. Falls back to CPU mode if GPU unavailable

### Troubleshooting

#### Docker not found

- **macOS**: Install [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- **Windows**: Install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- **Linux**: Follow [Docker Engine installation](https://docs.docker.com/engine/install/)

#### GPU not detected

- Ensure NVIDIA drivers are installed
- Run `nvidia-smi` to verify GPU
- For WSL2: Enable GPU support in Docker Desktop settings

#### Port already in use

- Use `--port <number>` to specify a different port
- Check if TEI container is already running: `docker ps`

#### Model download fails

- Check internet connection
- Verify HuggingFace model ID in config
- Try a different model

### Legacy Scripts (Deprecated)

The following scripts are deprecated and will be removed:

- ~~`setup-tei.sh`~~ → Use `setup-embeddings.sh --provider tei`
- ~~`setup-tei.cmd`~~ → Use `setup-embeddings.cmd --provider tei`
- ~~`setup-embeddings-interactive.cmd`~~ → Use `setup-embeddings.cmd`

## Contributing

To add a new embedding model:

1. Edit `config/embedding-models.json`
2. Add model metadata (id, name, provider, specs)
3. The script will automatically detect and display it

No need to modify shell/batch scripts!

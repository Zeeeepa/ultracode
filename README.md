```
        ██  ██
        ██  ██  ██    ██████ █████▄  ▄████▄
        ██  ██  ██      ██   ██▄▄██▄ ██▄▄██
        ██  ██  ██      ██   ██   ██ ██  ██
        ██  ██  ██████  ██   ██   ██ ██  ██
        ▀████▀            ▄▄▄▄  ▄▄▄▄ ▄▄▄▄  ▄▄ ▄▄▄▄ ▄▄▄▄▄▄
                         ███▄▄ ██▀▀▀ ██▄█▄ ██ ██▄█▀  ██
                         ▄▄██▀ ▀████ ██ ██ ██ ██     ██

                              ░▒▓█████▓▒░

     ╔═════════════════════════════════════════════════════╗
     ║            ULTRASCRIPT TOOLS MCP SERVER             ║
     ╚═════════════════════════════════════════════════════╝
```

[![npm version](https://badge.fury.io/js/ultrascript-tools-mcp.svg)](https://www.npmjs.com/package/ultrascript-tools-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)


**Multi-agent code analysis MCP server with advanced graph-based understanding**

Powerful code analysis tool that understands your codebase structure, finds duplicates, analyzes impact of changes, and provides intelligent refactoring suggestions through Model Context Protocol (MCP).

## Features

- 🔍 **Semantic Code Search** - Find code by meaning, not just keywords
- 🔄 **Duplicate Detection** - Automatically find similar code blocks
- 📊 **Impact Analysis** - See what breaks when you change code
- 🎯 **Smart Refactoring** - Get AI-powered refactoring suggestions
- 🌳 **Git Branch Support** - Analyze code across different branches
- ⚡ **SIMD/CUDA Acceleration** - Fast processing with hardware acceleration
- 🌍 **10 Languages** - TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++, Swift, Bash

## Installation

```bash
# Install globally
npm install -g ultrascript-tools-mcp

# Or use without installing
npx ultrascript-tools-mcp
```

## Quick Start

### 1. Setup Semantic Embeddings (Optional but Recommended)

```bash
# Interactive setup wizard
npx ultrascript-tools-mcp setup

# Or specify provider directly
npx ultrascript-tools-mcp setup --provider ollama   # Easy setup
npx ultrascript-tools-mcp setup --provider tei      # Best performance (Docker)
npx ultrascript-tools-mcp setup --provider memory   # No ML (default)
```

The setup wizard will:
- Auto-detect your GPU (NVIDIA Turing/Ampere/Ada/Hopper)
- Help you choose the best embedding model
- Install TEI (Docker) or Ollama automatically
- Save configuration to your system config directory

### 2. Configure Claude Desktop

Add to your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "npx",
      "args": ["ultrascript-tools-mcp", "/path/to/your/project"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "ultrascript-tools-mcp",
      "args": ["/path/to/your/project"]
    }
  }
}
```

### 3. Start Using

Open Claude Desktop and ask:

- "Index my project at /path/to/my-project"
- "Find all functions related to authentication"
- "Show me duplicate code in this project"
- "What will break if I change the UserManager class?"

## Available Tools

The MCP server provides 45+ tools for code analysis:

### Core Analysis
- `index` - Index a codebase for analysis
- `query` - Natural language queries about code
- `semantic_search` - Semantic code search
- `list_file_entities` - List code entities in a file
- `list_entity_relationships` - Show code dependencies

### Code Quality
- `detect_code_clones` - Find duplicate code
- `jscpd_detect_clones` - Fast duplicate detection
- `analyze_code_impact` - Impact analysis
- `suggest_refactoring` - Refactoring suggestions
- `analyze_hotspots` - Find complex code areas

### Git Integration
- `list_branches` - List indexed branches
- `switch_branch` - Switch between branches
- `get_branch_status` - Branch analysis status
- `get_changed_files` - Compare branches

### System
- `get_graph` - Get code graph
- `get_graph_stats` - Graph statistics
- `get_agent_metrics` - Performance metrics

## Configuration

Configuration through environment variables or config file at `config/default.yaml`.

### Basic Configuration

```yaml
# Minimal config - works out of the box
mcp:
  embedding:
    provider: "memory"  # No ML needed
    enabled: true
```

### Optional: ML-Powered Semantic Search

For better semantic search, run the setup wizard:

```bash
# Interactive setup - recommended
npx ultrascript-tools-mcp setup

# Non-interactive options
npx ultrascript-tools-mcp setup --provider tei      # Docker + GPU
npx ultrascript-tools-mcp setup --provider ollama   # Native install
npx ultrascript-tools-mcp setup --provider memory   # Hash-based (default)
```

**Providers comparison:**

| Provider | Setup | Performance | GPU Support | Requirements |
|----------|-------|-------------|-------------|--------------|
| **TEI** | Docker | ⭐⭐⭐ Best | RTX 20xx-40xx | Docker Desktop |
| **Ollama** | Native | ⭐⭐ Good | All GPUs incl. RTX 50xx | None |
| **Memory** | None | ⭐ Basic | N/A | None |

**Configuration location:**
- Windows: `%LOCALAPPDATA%\UltraScriptTools\semantic-config.json`
- macOS: `~/Library/Application Support/UltraScriptTools/semantic-config.json`
- Linux: `~/.config/ultrascript-tools/semantic-config.json`

## Performance

- **5.5x faster** than built-in Claude tools for large codebases
- **SIMD acceleration** included (2-4x speedup)
- **CUDA support** for NVIDIA GPUs (optional)
- **WebGPU support** for cross-platform acceleration (optional)

## Examples

### Find Similar Code

```
You: "Find duplicate code in my project"

Response:
✓ Found 12 duplicate groups
  - auth/login.ts and auth/verify.ts (similarity: 89%)
  - utils/format.ts and helpers/formatter.ts (similarity: 85%)
```

### Impact Analysis

```
You: "What will break if I change UserManager.login()?"

Response:
✓ Impact Analysis:
  - 15 files depend on this method
  - 23 call sites found
  - High risk: AuthController, SessionService
```

### Semantic Search

```
You: "Find code that validates email addresses"

Response:
✓ Found 4 matches:
  - validators/email.ts: validateEmail()
  - utils/auth.ts: checkEmailFormat()
  - services/user.ts: verifyUserEmail()
```

## Requirements

- **Node.js**: 24.0.0 or higher
- **Memory**: 4GB+ RAM recommended
- **Optional**: Docker (for TEI embeddings)
- **Optional**: NVIDIA GPU (for CUDA acceleration)

## Documentation

After installation, see:
- `node_modules/ultrascript-tools-mcp/README_DEV.md` - Detailed documentation
- `node_modules/ultrascript-tools-mcp/GETTING_STARTED.md` - Setup guide
- `node_modules/ultrascript-tools-mcp/NPM_PUBLISHING.md` - Publishing guide

## Troubleshooting

### MCP Server Not Responding

1. Check Node.js version: `node --version` (must be 24.0.0+)
2. Verify config path in `claude_desktop_config.json`
3. Check Claude Desktop logs (Help → Developer Tools)

### Installation Issues

```bash
# Clear cache and reinstall
npm cache clean --force
npm install -g ultrascript-tools-mcp
```

### Embeddings Setup

If embeddings setup fails or you want to reconfigure:

```bash
# Run setup wizard
npx ultrascript-tools-mcp setup

# Or run postinstall manually
cd node_modules/ultrascript-tools-mcp
node scripts/postinstall.js
```

## Advanced Features

### CUDA Acceleration (NVIDIA GPUs)

```bash
# CUDA module included, builds automatically on first use
# Provides 10-50x speedup for vector operations
```

### Multi-Project Analysis (Lerna)

```bash
# For monorepos using Lerna
ultrascript-tools-mcp lerna_project_graph --ingest
```

### Branch Comparison

```bash
# Compare code between branches
ultrascript-tools-mcp get_changed_files --fromBranch main --toBranch feature
```

## CLI Usage

```bash
# Setup semantic embeddings (interactive wizard)
npx ultrascript-tools-mcp setup

# Setup with specific provider
npx ultrascript-tools-mcp setup --provider ollama
npx ultrascript-tools-mcp setup --provider tei
npx ultrascript-tools-mcp setup --provider memory

# Index a project
ultrascript-tools-mcp index /path/to/project

# Query code
ultrascript-tools-mcp query "find authentication code"

# Find duplicates
ultrascript-tools-mcp detect_code_clones --minSimilarity 0.8

# Check branch status
ultrascript-tools-mcp get_branch_status
```

## Environment Variables

```bash
# Logging level
LOG_LEVEL=info

# Embeddings provider
EMBEDDING_PROVIDER=memory

# Enable GPU
USE_GPU=true
```

## Contributing

This package is open source under MIT license.

Repository: https://github.com/faxenoff/ultrascript-tools-mcp

## Support

- **Issues**: https://github.com/faxenoff/ultrascript-tools-mcp/issues
- **Sponsor**: https://accelerator.slider-ai.ru/
- **Telegram**: https://t.me/SliderQuery

## License

MIT © faxen

---

**Ready to analyze your codebase!** 🚀

Install: `npm install -g ultrascript-tools-mcp`

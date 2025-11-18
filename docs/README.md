# UltraScript Tools MCP - Documentation

Complete documentation for UltraScript Tools MCP - Multi-agent LiteRAG server for advanced code graph analysis.

## 📚 Table of Contents

### 🚀 Getting Started

- **[Installation Guide](guides/installation.md)** - Setup and installation instructions
- **[Embeddings Setup](guides/embeddings-setup.md)** - Configure local ML embeddings (TEI, Ollama)
- **[Bun Setup](guides/bun-setup.md)** - Using Bun runtime for faster performance

### ✨ Features

- **[Script Parsers](features/script-parsers.md)** - PowerShell, Bash, Batch script analysis
- **[Semantic Merge](features/)** - AI-powered code merging
  - [Architecture](features/SEMANTIC_MERGE_ARCHITECTURE.md)
  - [Quickstart](features/SEMANTIC_MERGE_QUICKSTART.md)
  - [Step-by-Step Guide](features/SEMANTIC_MERGE_STEP_BY_STEP.md)
  - [Comparison](features/SEMANTIC_MERGE_COMPARISON.md)
  - [Demo Results](features/SEMANTIC_MERGE_DEMO_RESULTS.md)
  - [Roadmap](features/SEMANTIC_MERGE_ROADMAP.md)
- **[Chaos Analysis](features/chaos-analysis.md)** - Codebase entropy and complexity analysis
- **[Code Modification](features/code-modification.md)** - Advanced code transformation features

### 🏗️ Architecture

- **[Multi-Agent System](architecture/agents.md)** - Agent architecture and coordination
- **[Layered Indexing](architecture/layered-indexing.md)** - Progressive code indexing strategy
- **[Branch-Aware Indexing](architecture/branch-aware-indexing.md)** - Git branch isolation and management
- **[Worker Threads](architecture/worker-threads.md)** - Parallel processing architecture

### 🚢 Deployment

- **[Deployment Guide](deployment/deployment.md)** - Production deployment instructions
- **[CUDA Setup](deployment/cuda.md)** - NVIDIA GPU acceleration
- **[WebGPU Setup](deployment/webgpu.md)** - Browser-based GPU acceleration

### 🔧 Development

- **[Build Guide](development/build-guide.md)** - Native module compilation (CUDA, WASM)
- **[Tool Naming](development/tool-naming.md)** - MCP tool naming conventions
- **[Implementation Summary](development/implementation-summary.md)** - Recent implementation details
- **[Test Results](development/test-results.md)** - Analyzer test results
- **[Changelog (Embeddings)](development/changelog-embeddings.md)** - Embedding system changes

#### Refactoring Reports

- [Complete Report](development/refactoring-reports/REFACTORING_COMPLETE_REPORT.md)
- [Implementation Report](development/refactoring-reports/REFACTORING_IMPLEMENTATION_REPORT.md)
- [P0-2 Demo](development/refactoring-reports/REFACTORING_P0-2_DEMO.md)
- [P1-2 Architecture](development/refactoring-reports/REFACTORING_P1-2_ARCHITECTURE.md)

### 📖 Additional Resources

- **[CLAUDE.md](CLAUDE.md)** - Claude AI integration notes
- **[ULTRA.md](ULTRA.md)** - UltraScript project overview
- **[NPM README](npm-readme.md)** - Official NPM package documentation (marketing)
- **[NPM License](npm-license.md)** - MIT License for NPM package

---

## 🔍 Quick Reference

### Installation

```bash
# Clone repository
git clone https://github.com/er77/ultrascript-tools-mcp.git
cd ultrascript-tools-mcp

# Install dependencies
npm install

# Setup embeddings (optional but recommended)
./scripts/setup-embeddings.sh  # Linux/macOS
scripts\setup-embeddings.cmd   # Windows

# Build
npm run build

# Run MCP server
node dist/index.js .
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Script Parsing** | PowerShell, Bash, Batch analysis with Tree-sitter |
| **Semantic Search** | Vector embeddings for code similarity |
| **Multi-Agent** | Specialized agents for different tasks |
| **Graph Storage** | SQLite-based code relationship graph |
| **Branch Isolation** | Separate databases per git branch |
| **GPU Acceleration** | CUDA/WebGPU for embeddings |

### Supported Languages

- TypeScript/JavaScript (tree-sitter)
- Python (tree-sitter)
- C/C++ (tree-sitter)
- PowerShell (tree-sitter)
- Bash/Shell (tree-sitter)
- Batch/CMD (regex-based)
- And more...

---

## 🤝 Contributing

See main [README.md](../README.md) for contribution guidelines.

## 📝 License

MIT License - see [LICENSE](../LICENSE)

---

**Version:** 3.9.0
**Last Updated:** 2025-11-18

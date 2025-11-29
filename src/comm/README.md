# UltraScript.Comm (Portable C Proxy)

Lightweight proxy for UltraScript Tools MCP server.
Single portable binary for Windows, Linux, and macOS using [Cosmopolitan Libc](https://github.com/jart/cosmopolitan).

## Features

- **~700KB binary** (vs ~15MB Node.js bundle)
- **Single file** runs on Win/Linux/macOS/BSD - no separate builds needed!
- Zero dependencies (no Node.js required)
- Minimal memory footprint (~1MB)
- Instant startup (<1ms)

## How it works

```
Claude Desktop <--stdin/stdout--> Comm <--Named Pipe/Unix Socket--> Core
```

1. Connects to Core via Named Pipe (Windows) or Unix Socket (Linux/macOS)
2. If Core not running - starts it automatically
3. Proxies stdin/stdout ↔ pipe (pure byte-level, no parsing)

## Quick Start (Windows)

```powershell
# 1. Install cosmocc (one-time)
.\setup.ps1

# 2. Build (creates ultrascript-tools.com in dist/)
.\build.ps1
```

## Quick Start (Linux/macOS)

```bash
# Using Makefile
make

# Or using cosmocc directly
cosmocc -Os -DNDEBUG -o ultrascript-tools.com comm.c
```

## Building

### Automatic Setup (Windows)

```powershell
.\setup.ps1   # Downloads and installs cosmocc
.\build.ps1   # Builds and copies to dist/
```

### Manual Build

```bash
# Using Makefile (Linux/macOS/WSL)
make
make install  # copies to dist/

# Using cosmocc directly
cosmocc -Os -DNDEBUG -o ultrascript-tools.com comm.c

# Using gcc directly (single platform only)
gcc -Os -o ultrascript comm.c
```

## Usage

```bash
# Show help
./ultrascript-tools.com --help

# Show version
./ultrascript-tools.com --version

# Normal usage (called by Claude Desktop)
./ultrascript-tools.com [PROJECT_PATH]
```

## Claude Desktop Configuration

```json
{
  "mcpServers": {
    "ultrascript": {
      "command": "path/to/ultrascript-tools.com",
      "args": ["/path/to/project"]
    }
  }
}
```

## File locations

| OS | Pipe/Socket Path |
|----|------------------|
| Windows | `\\.\pipe\UltraScript_Core` |
| Linux/macOS | `/tmp/UltraScript_Core.sock` |

## Comparison with Node.js version

| Metric | Node.js | Cosmopolitan C |
|--------|---------|----------------|
| Binary size | ~15 MB | ~700 KB |
| Memory usage | ~30 MB | ~1 MB |
| Startup time | ~100ms | ~1ms |
| Platforms | Separate runtimes | Single file |
| Dependencies | Node.js | None |

## NPM Distribution

The pre-built `ultrascript-tools.com` is included in the npm package. It works on:
- Windows x64
- Linux x64
- macOS x64 (Intel)
- macOS ARM64 (Apple Silicon)
- FreeBSD x64
- NetBSD x64
- OpenBSD x64

## License

Same as UltraScript Tools project (MIT).

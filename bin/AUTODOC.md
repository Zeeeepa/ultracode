# bin

## Overview

The `bin` module provides the command-line entry point for UltraCode, serving as a Node.js executable script that launches the application. It acts as a wrapper that resolves file paths, validates required dependencies (the Comm binary and Core MCP server), and spawns the Comm process to route commands from Claude Code to the Core server. This module ensures the application can be invoked from the terminal with proper error handling and path resolution regardless of installation method (npm, bun, or global).

## Flow

```
CLI invocation (node bin/ultracode.js)
          ↓
Resolve dist directory & file paths
          ↓
Validate Comm binary exists → Exit if missing
          ↓
Validate Core MCP server exists → Exit if missing
          ↓
Set environment variables (ULTRACODE_CORE_PATH, ULTRACODE_DIST_DIR)
          ↓
Spawn Comm process
          ↓
Forward Claude Code commands → Core server
```

## Entity Listing

### Executable Scripts

- **bin/ultracode.js:1-50** — Main CLI entry point script that validates dependencies, resolves paths, sets environment variables, and spawns the Comm binary to route requests from Claude Code to the Core MCP server.


### Added Entities

- **tryBunPath** — `ultracode-setup.cjs:34-48`
- **runSetup** — `ultracode-setup.cjs:50-56`
- **{ existsSync }** — `ultracode-setup.cjs:10-10`
- **{ join, dirname }** — `ultracode-setup.cjs:11-11`
- **{ execSync }** — `ultracode-setup.cjs:12-12`
- **{ platform }** — `ultracode-setup.cjs:13-13`
- **relPath** — `ultracode-setup.cjs:16-16`
- **npmRoot** — `ultracode-setup.cjs:22-22`
- **npmPath** — `ultracode-setup.cjs:23-23`
- **home** — `ultracode-setup.cjs:36-36`
- **bunPath** — `ultracode-setup.cjs:37-39`

## Dependencies

### Node.js Built-ins
- `node:child_process` — `spawn` for launching the Comm process
- `node:fs` — `existsSync` for validating file existence
- `node:os` — `platform` for detecting operating system
- `node:path` — `dirname`, `join` for path resolution
- `node:url` — `fileURLToPath` for converting ES module URLs to file paths

### External Dependencies
- **Comm binary** (`dist/ultracode.com`) — Cosmopolitan-based proxy binary that routes requests from Claude Code to the Core server
- **Core MCP server** (`dist/index.js`) — Main UltraCode server that processes requests
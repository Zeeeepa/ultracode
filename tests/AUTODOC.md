# MCP Test Module

## Overview

The MCP test module provides comprehensive testing for the Model Control Protocol (MCP) server implementation. It includes direct functional tests that communicate with the MCP server via the SDK client, and protocol-level tests that verify protocol compliance and data exchange correctness. The module validates that MCP components operate correctly both in isolation and according to protocol specifications.

## Flow

```
Environment Config (TEST_DIR, DIST_JS)
    ↓
Start MCP Server Subprocess
    ↓
Create MCP Client & StdioClientTransport
    ↓
Connect to Server
    ↓
Execute Protocol Requests (tools/list, etc.)
    ↓
Verify Results & Protocol Compliance
    ↓
Test Report Output
```

## Entity Listing

### Test Suites

- **tests/test-mcp-direct.js** — Direct MCP server interaction tests using the MCP SDK client, validating tool availability and server connectivity via stdio transport.
- **tests/test-mcp-protocol.js** — Protocol compliance tests verifying correct MCP protocol implementation, data exchange format, and request/response handling.

## Dependencies

### External Libraries
- `@modelcontextprotocol/sdk` — MCP SDK providing `Client` and `StdioClientTransport` for server communication and protocol handling.
- `node:child_process` — Node.js built-in module for spawning the MCP server subprocess.

### Environment Configuration
- `TEST_DIR` / `TARGET_DIR` / `PROJECT_DIR` — Environment variables specifying the target repository path for analysis.
- `DIST_JS` — Environment variable pointing to the compiled MCP server entry point (defaults to `dist/index.js`).

### Design Pattern

**Client-Server Test Architecture** — Tests spawn an MCP server subprocess and communicate via stdio transport, validating real protocol interaction rather than mocking server behavior. This ensures tests verify actual MCP implementation correctness including subprocess lifecycle, stdio communication, and protocol-level request/response exchange.
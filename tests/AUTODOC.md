# Test Module for MCP

## Description

The `tests` module is designed for running tests related to the MCP (Model Control Protocol) protocol. It includes tests for direct interaction with MCP and MCP protocol tests. This module is used to verify the correct operation of MCP-related components within the project.

## Files

| File | Description |
|------|----------|
| `test-mcp-direct.js` | Contains tests for direct interaction with MCP, including functionality and correctness verification of components without using the protocol. |
| `test-mcp-protocol.js` | Contains MCP protocol tests that verify the correctness of data exchange and protocol compliance. |

## Exports

The module has no public exports. All functions and classes are intended for internal use and testing.

## Usage

To run the tests, execute the following command:

```bash
npm run test
```

or

```bash
yarn test
```

The tests will automatically run and display the MCP component verification results.

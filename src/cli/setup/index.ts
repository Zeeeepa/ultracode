/**
 * Setup module exports
 */

// Hardware detection
export * from "./setup-hardware.js";
// Provider installers
export * from "./setup-installers.js";
// LLM setup
export * from "./setup-llm.js";

// Selection dialogs
export * from "./setup-selection.js";
// Types
export * from "./setup-types.js";
// UI utilities
export * from "./setup-ui.js";
// MCP auto-installer
export { installMcpConfigs } from "./mcp-installer.js";

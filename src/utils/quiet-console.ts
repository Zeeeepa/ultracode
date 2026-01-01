/**
 * Quiet Console - Environment-aware console wrapper
 *
 * Disables console output when MCP_QUIET_MODE env is set (--pipe mode)
 * This prevents JSON-RPC corruption in pipe transport mode
 */

const isQuiet = () => process.env["MCP_QUIET_MODE"] === "true";

export const quietConsole = {
  error: (...args: any[]) => {
    if (!isQuiet()) console.error(...args);
  },
  warn: (...args: any[]) => {
    if (!isQuiet()) console.warn(...args);
  },
  log: (...args: any[]) => {
    if (!isQuiet()) console.log(...args);
  },
  info: (...args: any[]) => {
    if (!isQuiet()) console.info(...args);
  },
  debug: (...args: any[]) => {
    if (!isQuiet()) console.debug(...args);
  },
};

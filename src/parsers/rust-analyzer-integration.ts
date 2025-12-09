/**
 * Rust Analyzer Integration
 *
 * Provides Rust analysis using rust-analyzer LSP.
 * Uses LSP protocol to get diagnostics and symbol information.
 *
 * Philosophy: Rust developers have rust-analyzer installed.
 *
 * Features:
 * - Diagnostics (errors, warnings)
 * - Type information
 * - Symbol resolution
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ParsedEntity } from "../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

export interface RustDiagnostic {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string;
  source?: string;
}

export interface RustAnalyzerResult {
  diagnostics: RustDiagnostic[];
  symbols?: RustSymbolInfo[];
}

export interface RustSymbolInfo {
  name: string;
  kind: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  detail?: string;
}

// LSP message types
interface LSPMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

// =============================================================================
// RUST-ANALYZER CLIENT
// =============================================================================

let rustAnalyzerPath: string | null = null;
let rustAnalyzerChecked = false;
let rustAnalyzerProcess: ChildProcess | null = null;
let messageId = 0;
const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let initialized = false;
let messageBuffer = "";

/**
 * Find rust-analyzer executable
 */
export async function findRustAnalyzer(): Promise<string | null> {
  if (rustAnalyzerChecked) {
    return rustAnalyzerPath;
  }

  rustAnalyzerChecked = true;

  const commands = [
    "rust-analyzer",
    "rust-analyzer.exe",
    // Common installation paths
    join(process.env.HOME || "", ".cargo", "bin", "rust-analyzer"),
    join(process.env.USERPROFILE || "", ".cargo", "bin", "rust-analyzer.exe"),
  ];

  for (const cmd of commands) {
    try {
      const available = await checkCommand(cmd);
      if (available) {
        rustAnalyzerPath = cmd;
        console.error(`[RustAnalyzerIntegration] Found rust-analyzer: ${cmd}`);
        return rustAnalyzerPath;
      }
    } catch {
      // Try next
    }
  }

  console.error("[RustAnalyzerIntegration] rust-analyzer not found");
  return null;
}

/**
 * Check if a command is available
 */
function checkCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, ["--version"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);

    proc.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

/**
 * Check if rust-analyzer is available
 */
export function isRustAnalyzerAvailable(): boolean {
  return rustAnalyzerPath !== null;
}

/**
 * Start rust-analyzer LSP server
 */
export async function startRustAnalyzer(workspaceRoot: string): Promise<boolean> {
  if (!rustAnalyzerPath) {
    await findRustAnalyzer();
  }

  if (!rustAnalyzerPath) {
    return false;
  }

  if (rustAnalyzerProcess) {
    return true; // Already running
  }

  return new Promise((resolve) => {
    try {
      rustAnalyzerProcess = spawn(rustAnalyzerPath!, [], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: workspaceRoot,
        windowsHide: true,
      });

      rustAnalyzerProcess.stdout?.on("data", (data: Buffer) => {
        handleLspData(data.toString());
      });

      rustAnalyzerProcess.stderr?.on("data", (data: Buffer) => {
        console.error(`[rust-analyzer stderr] ${data.toString()}`);
      });

      rustAnalyzerProcess.on("error", (err: Error) => {
        console.error(`[RustAnalyzerIntegration] Process error: ${err}`);
        rustAnalyzerProcess = null;
        resolve(false);
      });

      rustAnalyzerProcess.on("close", (_code: number | null) => {
        rustAnalyzerProcess = null;
        initialized = false;
      });

      // Send initialize request
      initializeLsp(workspaceRoot)
        .then(() => {
          initialized = true;
          resolve(true);
        })
        .catch((err) => {
          console.error(`[RustAnalyzerIntegration] Init failed: ${err}`);
          resolve(false);
        });
    } catch (err) {
      console.error(`[RustAnalyzerIntegration] Spawn error: ${err}`);
      resolve(false);
    }
  });
}

/**
 * Handle incoming LSP data
 */
function handleLspData(data: string): void {
  messageBuffer += data;

  while (true) {
    // Parse Content-Length header
    const headerEnd = messageBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = messageBuffer.substring(0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch || !contentLengthMatch[1]) {
      messageBuffer = messageBuffer.substring(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (messageBuffer.length < bodyEnd) break;

    const body = messageBuffer.substring(bodyStart, bodyEnd);
    messageBuffer = messageBuffer.substring(bodyEnd);

    try {
      const message = JSON.parse(body) as LSPMessage;
      handleLspMessage(message);
    } catch (e) {
      console.error(`[RustAnalyzerIntegration] Parse error: ${e}`);
    }
  }
}

/**
 * Handle parsed LSP message
 */
function handleLspMessage(message: LSPMessage): void {
  if (message.id !== undefined) {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    }
  }
}

/**
 * Send LSP request
 */
function sendRequest(method: string, params: unknown): Promise<unknown> {
  if (!rustAnalyzerProcess?.stdin) {
    return Promise.reject(new Error("rust-analyzer not running"));
  }

  const id = ++messageId;
  const message: LSPMessage = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request ${method} timed out`));
    }, 30000);

    pendingRequests.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    rustAnalyzerProcess!.stdin!.write(header + body);
  });
}

/**
 * Send LSP notification (no response expected)
 */
function sendNotification(method: string, params: unknown): void {
  if (!rustAnalyzerProcess?.stdin) return;

  const message: LSPMessage = {
    jsonrpc: "2.0",
    method,
    params,
  };

  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;

  rustAnalyzerProcess.stdin.write(header + body);
}

/**
 * Initialize LSP connection
 */
async function initializeLsp(workspaceRoot: string): Promise<void> {
  await sendRequest("initialize", {
    processId: process.pid,
    capabilities: {
      textDocument: {
        publishDiagnostics: {
          relatedInformation: true,
        },
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
        },
      },
    },
    rootUri: `file://${workspaceRoot.replace(/\\/g, "/")}`,
    workspaceFolders: [
      {
        uri: `file://${workspaceRoot.replace(/\\/g, "/")}`,
        name: "workspace",
      },
    ],
  });

  sendNotification("initialized", {});
}

/**
 * Open a document in rust-analyzer
 */
export function openDocument(filePath: string, content: string): void {
  if (!initialized) return;

  const uri = `file://${filePath.replace(/\\/g, "/")}`;

  sendNotification("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "rust",
      version: 1,
      text: content,
    },
  });
}

/**
 * Close a document in rust-analyzer
 */
export function closeDocument(filePath: string): void {
  if (!initialized) return;

  const uri = `file://${filePath.replace(/\\/g, "/")}`;

  sendNotification("textDocument/didClose", {
    textDocument: { uri },
  });
}

/**
 * Get document symbols
 */
export async function getDocumentSymbols(filePath: string): Promise<RustSymbolInfo[]> {
  if (!initialized) return [];

  const uri = `file://${filePath.replace(/\\/g, "/")}`;

  try {
    const result = (await sendRequest("textDocument/documentSymbol", {
      textDocument: { uri },
    })) as any[];

    if (!result) return [];

    const symbols: RustSymbolInfo[] = [];

    function processSymbol(sym: any): void {
      symbols.push({
        name: sym.name,
        kind: getSymbolKindName(sym.kind),
        range: sym.range || sym.location?.range,
        detail: sym.detail,
      });

      if (sym.children) {
        for (const child of sym.children) {
          processSymbol(child);
        }
      }
    }

    for (const sym of result) {
      processSymbol(sym);
    }

    return symbols;
  } catch (err) {
    console.error(`[RustAnalyzerIntegration] getDocumentSymbols error: ${err}`);
    return [];
  }
}

/**
 * Convert LSP symbol kind to string
 */
function getSymbolKindName(kind: number): string {
  const kinds: Record<number, string> = {
    1: "file",
    2: "module",
    3: "namespace",
    4: "package",
    5: "class",
    6: "method",
    7: "property",
    8: "field",
    9: "constructor",
    10: "enum",
    11: "interface",
    12: "function",
    13: "variable",
    14: "constant",
    15: "string",
    16: "number",
    17: "boolean",
    18: "array",
    19: "object",
    20: "key",
    21: "null",
    22: "enummember",
    23: "struct",
    24: "event",
    25: "operator",
    26: "typeparameter",
  };
  return kinds[kind] || "unknown";
}

/**
 * Stop rust-analyzer
 */
export function stopRustAnalyzer(): void {
  if (rustAnalyzerProcess) {
    sendNotification("shutdown", null);
    sendNotification("exit", null);
    rustAnalyzerProcess.kill();
    rustAnalyzerProcess = null;
    initialized = false;
  }
}

/**
 * Enhance parsed entities with rust-analyzer information
 */
export async function enhanceWithRustAnalyzer(
  entities: ParsedEntity[],
  filePath: string,
  content: string,
): Promise<void> {
  if (!initialized) return;

  try {
    // Open document
    openDocument(filePath, content);

    // Get symbols
    const symbols = await getDocumentSymbols(filePath);

    // Create a map of symbols by line
    const symbolsByLine = new Map<number, RustSymbolInfo[]>();
    for (const sym of symbols) {
      if (sym.range) {
        const line = sym.range.start.line + 1; // Convert to 1-indexed
        const existing = symbolsByLine.get(line) || [];
        existing.push(sym);
        symbolsByLine.set(line, existing);
      }
    }

    // Enhance entities with symbol info
    for (const entity of entities) {
      if (!entity.location) continue;

      const startLine = entity.location.start.line;
      const lineSymbols = symbolsByLine.get(startLine);

      if (lineSymbols) {
        for (const sym of lineSymbols) {
          if (sym.name === entity.name && sym.detail) {
            (entity as any).rustAnalyzerInfo = {
              kind: sym.kind,
              detail: sym.detail,
            };
            break;
          }
        }
      }
    }

    // Close document
    closeDocument(filePath);
  } catch (err) {
    console.error(`[RustAnalyzerIntegration] Enhancement error: ${err}`);
  }
}

/**
 * Get rust-analyzer version
 */
export async function getRustAnalyzerVersion(): Promise<string | null> {
  if (!rustAnalyzerPath) return null;

  return new Promise((resolve) => {
    const proc = spawn(rustAnalyzerPath!, ["--version"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let output = "";

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", () => {
      const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
      resolve(versionMatch?.[1] ?? null);
    });

    proc.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Find Cargo.toml in parent directories
 */
export function findCargoToml(filePath: string): string | null {
  let dir = dirname(filePath);
  const root = process.platform === "win32" ? dir.split("\\")[0] + "\\" : "/";

  while (dir !== root) {
    const cargoPath = join(dir, "Cargo.toml");
    if (existsSync(cargoPath)) {
      return dir;
    }
    dir = dirname(dir);
  }

  return null;
}

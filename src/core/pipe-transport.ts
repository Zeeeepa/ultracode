/**
 * Pipe Transport for MCP Server
 *
 * Allows MCP Server to communicate through Named Pipe (Windows) or Unix Socket (Linux/macOS)
 * instead of stdio. This enables the Cosmopolitan Comm proxy to work.
 */

import { existsSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { log } from "../logging/index.js";

/**
 * Get the pipe/socket path based on platform
 */
export function getPipePath(): string {
  if (process.platform === "win32") {
    return "\\\\.\\pipe\\UltraCode_Core";
  }
  return "/tmp/ultracode-core.sock";
}

/**
 * ReadBuffer for parsing newline-delimited JSON messages
 */
class ReadBuffer {
  private buffer = "";

  append(chunk: Buffer | string): void {
    this.buffer += chunk.toString();
  }

  readMessage(): unknown | null {
    const newlineIndex = this.buffer.indexOf("\n");
    if (newlineIndex === -1) {
      return null;
    }

    const line = this.buffer.slice(0, newlineIndex);
    this.buffer = this.buffer.slice(newlineIndex + 1);

    if (!line.trim()) {
      return null;
    }

    return JSON.parse(line);
  }

  clear(): void {
    this.buffer = "";
  }
}

/**
 * Transport interface matching MCP SDK
 */
export interface Transport {
  start(): Promise<void>;
  close(): Promise<void>;
  send(message: unknown): Promise<void>;
  onmessage?: (message: unknown) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

/**
 * Prefix for JSON init message (v3.0 protocol)
 * Format: ULTRACODE_INIT:{"cwd":"...","branch":"...","agentId":"..."}\n
 */
export const INIT_MESSAGE_PREFIX = "ULTRACODE_INIT:";

/**
 * Legacy prefix for v2.x protocol (plain text CWD)
 * @deprecated Kept for backward compatibility with older comm.c binaries
 */
export const LEGACY_INIT_PREFIX = "ULTRACODE_CWD:";

/**
 * Parsed init message from comm.c client
 */
export interface InitMessage {
  /** Client's working directory */
  cwd: string;
  /** Explicit branch name (skips git detection on server) */
  branch?: string;
  /** Agent identifier for multi-agent coordination */
  agentId?: string;
}

/**
 * Pipe-based transport for a single client connection
 */
export class PipeClientTransport implements Transport {
  private readBuffer = new ReadBuffer();
  private started = false;

  onmessage?: (message: unknown) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(private socket: Socket) {}

  /**
   * Read the init message before MCP handshake.
   * Supports both v3.0 JSON protocol (ULTRACODE_INIT:{...}) and
   * legacy v2.x plain text protocol (ULTRACODE_CWD:path).
   *
   * Must be called BEFORE start() to intercept the init message.
   * Returns parsed InitMessage if sent, undefined otherwise.
   *
   * @param timeoutMs - Timeout in milliseconds (default 2000)
   */
  async readInitMessage(timeoutMs = 2000): Promise<InitMessage | undefined> {
    if (this.started) {
      throw new Error("readInitMessage must be called before start()");
    }

    log.d("PIPE", "read_init_start", { timeout: timeoutMs });

    return new Promise<InitMessage | undefined>((resolve) => {
      let resolved = false;

      const cleanup = (timer: NodeJS.Timeout) => {
        clearTimeout(timer);
        this.socket.removeListener("data", dataHandler);
      };

      const doResolve = (value: InitMessage | undefined, timer: NodeJS.Timeout) => {
        if (resolved) return;
        resolved = true;
        cleanup(timer);
        resolve(value);
      };

      // Set up temporary data handler for init message
      const dataHandler = (chunk: Buffer | string) => {
        this.readBuffer.append(chunk);

        // Try to read first line
        const newlineIndex = (this.readBuffer as any).buffer.indexOf("\n");
        if (newlineIndex === -1) {
          return; // Wait for more data
        }

        const firstLine = (this.readBuffer as any).buffer.slice(0, newlineIndex);
        const remaining = (this.readBuffer as any).buffer.slice(newlineIndex + 1);

        // v3.0 JSON protocol: ULTRACODE_INIT:{"cwd":"...","branch":"...","agentId":"..."}
        if (firstLine.startsWith(INIT_MESSAGE_PREFIX)) {
          const jsonStr = firstLine.slice(INIT_MESSAGE_PREFIX.length).trim();
          try {
            const parsed = JSON.parse(jsonStr) as InitMessage;
            log.d("PIPE", "init_json", {
              cwd: parsed.cwd,
              branch: parsed.branch ?? "-",
              agentId: parsed.agentId ?? "-",
              remaining: remaining.length,
            });

            (this.readBuffer as any).buffer = remaining;
            doResolve(parsed, timer);
          } catch {
            log.w("PIPE", "init_json_parse_fail", { json: jsonStr.slice(0, 100) });
            (this.readBuffer as any).buffer = remaining;
            doResolve(undefined, timer);
          }
          return;
        }

        // Legacy v2.x protocol: ULTRACODE_CWD:path
        if (firstLine.startsWith(LEGACY_INIT_PREFIX)) {
          const clientCwd = firstLine.slice(LEGACY_INIT_PREFIX.length).trim();
          log.d("PIPE", "init_legacy", { cwd: clientCwd, remaining: remaining.length });

          (this.readBuffer as any).buffer = remaining;
          doResolve(clientCwd ? { cwd: clientCwd } : undefined, timer);
          return;
        }

        // Not an init message - leave data in buffer for MCP
        log.d("PIPE", "init_not_found", { firstLine: firstLine.slice(0, 50) });
        doResolve(undefined, timer);
      };

      this.socket.on("data", dataHandler);

      // Timeout - proceed without init message
      const timer = setTimeout(() => {
        log.w("PIPE", "init_timeout", { timeoutMs });
        doResolve(undefined, timer);
      }, timeoutMs);
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new Error("PipeClientTransport already started");
    }
    this.started = true;

    this.socket.on("data", (chunk) => {
      this.readBuffer.append(chunk);
      this.processReadBuffer();
    });

    this.socket.on("error", (error) => {
      this.onerror?.(error);
    });

    this.socket.on("close", () => {
      this.readBuffer.clear();
      this.onclose?.();
    });

    // Process any data already in buffer from readInitMessage()
    // This handles case where MCP request arrived with init message
    this.processReadBuffer();
  }

  private processReadBuffer(): void {
    while (true) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) {
          break;
        }
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error as Error);
      }
    }
  }

  async close(): Promise<void> {
    this.socket.end();
    this.readBuffer.clear();
    this.onclose?.();
  }

  send(message: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const json = `${JSON.stringify(message)}\n`;
      this.socket.write(json, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * Pipe Server that accepts connections and creates transports
 */
export class PipeServer {
  private server: Server | null = null;
  private pipePath: string;

  constructor(pipePath?: string) {
    this.pipePath = pipePath ?? getPipePath();
  }

  /**
   * Start the pipe server and return a promise that resolves with the first client transport
   */
  async waitForConnection(): Promise<PipeClientTransport> {
    // Clean up old socket (Unix only)
    if (process.platform !== "win32" && existsSync(this.pipePath)) {
      try {
        unlinkSync(this.pipePath);
      } catch {
        // Ignore
      }
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        const transport = new PipeClientTransport(socket);
        resolve(transport);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          log.e("PIPE", "EADDRINUSE: pipe already in use by another server instance, exiting", { pipe: this.pipePath });
          process.exit(1);
        }
        reject(err);
      });

      // Named Pipe on Windows, Unix socket elsewhere
      this.server.listen(this.pipePath);
    });
  }

  /**
   * Start the pipe server and call handler for each connection
   */
  async start(onConnection: (transport: PipeClientTransport) => void): Promise<void> {
    // Clean up old socket (Unix only)
    if (process.platform !== "win32" && existsSync(this.pipePath)) {
      try {
        unlinkSync(this.pipePath);
      } catch {
        // Ignore
      }
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        const transport = new PipeClientTransport(socket);
        onConnection(transport);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          log.e("PIPE", "EADDRINUSE: pipe already in use by another server instance, exiting", { pipe: this.pipePath });
          process.exit(1);
        }
        reject(err);
      });

      // Named Pipe on Windows, Unix socket elsewhere
      this.server.listen(this.pipePath, () => {
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Clean up socket file (Unix only)
    if (process.platform !== "win32" && existsSync(this.pipePath)) {
      try {
        unlinkSync(this.pipePath);
      } catch {
        // Ignore
      }
    }
  }

  getPath(): string {
    return this.pipePath;
  }
}

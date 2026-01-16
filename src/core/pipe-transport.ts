/**
 * Pipe Transport for MCP Server
 *
 * Allows MCP Server to communicate through Named Pipe (Windows) or Unix Socket (Linux/macOS)
 * instead of stdio. This enables the Cosmopolitan Comm proxy to work.
 */

import { existsSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";

/**
 * Get the pipe/socket path based on platform
 */
export function getPipePath(): string {
  if (process.platform === "win32") {
    return "\\\\.\\pipe\\UltraScript_Core";
  }
  return "/tmp/ultrascript-core.sock";
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
 * Prefix for init message containing client's working directory
 */
export const INIT_MESSAGE_PREFIX = "ULTRASCRIPT_CWD:";

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
   * Read the init message (ULTRASCRIPT_CWD:path) before MCP handshake.
   * Must be called BEFORE start() to intercept the init message.
   * Returns the client's working directory if sent, undefined otherwise.
   *
   * @param timeoutMs - Timeout in milliseconds (default 2000)
   */
  async readInitMessage(timeoutMs = 2000): Promise<string | undefined> {
    if (this.started) {
      throw new Error("readInitMessage must be called before start()");
    }

    // eslint-disable-next-line no-console
    console.error(`[pipe-transport] readInitMessage started, timeout=${timeoutMs}ms`);

    return new Promise<string | undefined>((resolve) => {
      let resolved = false;

      const cleanup = (timer: NodeJS.Timeout) => {
        clearTimeout(timer);
        this.socket.removeListener("data", dataHandler);
      };

      const doResolve = (value: string | undefined, timer: NodeJS.Timeout) => {
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

        // Check if this is an init message
        if (firstLine.startsWith(INIT_MESSAGE_PREFIX)) {
          const clientCwd = firstLine.slice(INIT_MESSAGE_PREFIX.length).trim();
          // eslint-disable-next-line no-console
          console.error(`[pipe-transport] Got init message, cwd=${clientCwd}, remaining=${remaining.length} bytes`);

          // Keep remaining data in buffer for MCP protocol
          (this.readBuffer as any).buffer = remaining;

          doResolve(clientCwd || undefined, timer);
        } else {
          // Not an init message - leave data in buffer for MCP
          // eslint-disable-next-line no-console
          console.error(`[pipe-transport] First line is not init message: ${firstLine.slice(0, 50)}...`);
          doResolve(undefined, timer);
        }
      };

      this.socket.on("data", dataHandler);

      // Timeout - proceed without init message
      const timer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.error(`[pipe-transport] readInitMessage timeout after ${timeoutMs}ms`);
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

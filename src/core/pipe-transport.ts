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
 * Note: Bun doesn't support Windows Named Pipes, so we use TCP port on Windows
 */
export function getPipePath(): string {
  if (process.platform === "win32") {
    // Bun doesn't support Named Pipes on Windows, use TCP port instead
    return "127.0.0.1:51734";
  }
  return "/tmp/ultrascript-core.sock";
}

/**
 * Check if path is a TCP address (host:port format)
 */
export function isTcpAddress(path: string): boolean {
  return path.includes(":") && !path.startsWith("\\\\");
}

/**
 * Parse TCP address into host and port
 */
export function parseTcpAddress(address: string): { host: string; port: number } {
  const [host = "127.0.0.1", portStr = "51734"] = address.split(":");
  return { host, port: parseInt(portStr, 10) };
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
 * Pipe-based transport for a single client connection
 */
export class PipeClientTransport implements Transport {
  private readBuffer = new ReadBuffer();
  private started = false;

  onmessage?: (message: unknown) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(private socket: Socket) {}

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
        console.error(`[PipeServer] Client connected`);
        const transport = new PipeClientTransport(socket);
        resolve(transport);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`[PipeServer] Address already in use: ${this.pipePath}`);
          console.error(`[PipeServer] Another instance may be running. Exiting.`);
          process.exit(1);
        }
        reject(err);
      });

      console.error(`[PipeServer] Waiting for connection on ${this.pipePath}...`);

      // Use TCP on Windows (Bun doesn't support Named Pipes), Unix socket elsewhere
      if (isTcpAddress(this.pipePath)) {
        const { host, port } = parseTcpAddress(this.pipePath);
        this.server.listen(port, host, () => {
          console.error(`[PipeServer] Listening on ${this.pipePath}`);
        });
      } else {
        this.server.listen(this.pipePath, () => {
          console.error(`[PipeServer] Listening on ${this.pipePath}`);
        });
      }
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
        console.error(`[PipeServer] Client connected`);
        const transport = new PipeClientTransport(socket);
        onConnection(transport);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`[PipeServer] Address already in use: ${this.pipePath}`);
          console.error(`[PipeServer] Another instance may be running. Exiting.`);
          process.exit(1);
        }
        reject(err);
      });

      // Use TCP on Windows (Bun doesn't support Named Pipes), Unix socket elsewhere
      if (isTcpAddress(this.pipePath)) {
        const { host, port } = parseTcpAddress(this.pipePath);
        this.server.listen(port, host, () => {
          console.error(`[PipeServer] Listening on ${this.pipePath}`);
          resolve();
        });
      } else {
        this.server.listen(this.pipePath, () => {
          console.error(`[PipeServer] Listening on ${this.pipePath}`);
          resolve();
        });
      }
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

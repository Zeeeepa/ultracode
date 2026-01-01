/**
 * Named Pipe Transport for GPU Worker IPC
 *
 * Provides binary IPC between Bun main process and Node.js GPU subprocess.
 * Uses Named Pipes on Windows, Unix Domain Sockets on Linux/Mac.
 *
 * Protocol:
 * - Length-prefixed binary: [4 bytes length][payload]
 * - Payload format: [4 bytes header_length][header JSON][raw vectors bytes]
 * - Request/Response pattern: each request gets exactly one response
 *
 * @task_id UNIFIED-GPU-001
 */

import { existsSync, unlinkSync } from "node:fs";
import { connect, createServer, type Server, type Socket } from "node:net";

// =============================================================================
// Constants
// =============================================================================

const PIPE_PREFIX = process.platform === "win32" ? "\\\\.\\pipe\\ultrascript-gpu-" : "/tmp/ultrascript-gpu-";

// =============================================================================
// Types
// =============================================================================

export interface NamedPipeServerOptions {
  /** Unique identifier for the pipe (appended to prefix) */
  pipeId: string;
  /** Request handler - receives raw packet, returns raw response */
  onRequest: (packet: Buffer) => Promise<Buffer>;
  /** Called when server is ready */
  onReady?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

export interface NamedPipeClientOptions {
  /** Unique identifier for the pipe (appended to prefix) */
  pipeId: string;
  /** Request timeout in ms */
  timeout?: number | undefined;
  /** Called on connection */
  onConnect?: () => void;
  /** Called on disconnect */
  onDisconnect?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

// =============================================================================
// Server
// =============================================================================

export class NamedPipeServer {
  private server: Server | null = null;
  private options: NamedPipeServerOptions;
  private pipePath: string;
  private activeSockets: Set<Socket> = new Set();

  constructor(options: NamedPipeServerOptions) {
    this.options = options;
    this.pipePath = PIPE_PREFIX + options.pipeId;
  }

  get path(): string {
    return this.pipePath;
  }

  async start(): Promise<void> {
    // Cleanup stale socket file on Unix
    if (process.platform !== "win32" && existsSync(this.pipePath)) {
      try {
        unlinkSync(this.pipePath);
      } catch {
        // Ignore - file may be in use
      }
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.activeSockets.add(socket);
        this.handleConnection(socket);

        socket.on("close", () => {
          this.activeSockets.delete(socket);
        });
      });

      this.server.on("error", (err) => {
        this.options.onError?.(err);
        reject(err);
      });

      this.server.listen(this.pipePath, () => {
        this.options.onReady?.();
        resolve();
      });
    });
  }

  private handleConnection(socket: Socket): void {
    let buffer = Buffer.alloc(0);

    socket.on("data", async (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Process complete packets
      while (buffer.length >= 4) {
        const packetLen = buffer.readUInt32LE(0);

        // Wait for complete packet
        if (buffer.length < 4 + packetLen) break;

        const packet = buffer.subarray(4, 4 + packetLen);
        buffer = buffer.subarray(4 + packetLen);

        try {
          // Process request and send response
          const response = await this.options.onRequest(packet);

          // Send length-prefixed response
          const respLen = Buffer.allocUnsafe(4);
          respLen.writeUInt32LE(response.length, 0);
          socket.write(Buffer.concat([respLen, response]));
        } catch (error) {
          // Send error response
          const errorResponse = Buffer.from(JSON.stringify({ success: false, error: (error as Error).message }));
          const respLen = Buffer.allocUnsafe(4);
          respLen.writeUInt32LE(errorResponse.length, 0);
          socket.write(Buffer.concat([respLen, errorResponse]));
        }
      }
    });

    socket.on("error", (err) => {
      this.options.onError?.(err);
    });
  }

  async stop(): Promise<void> {
    // Close all active sockets
    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;

          // Cleanup socket file on Unix
          if (process.platform !== "win32" && existsSync(this.pipePath)) {
            try {
              unlinkSync(this.pipePath);
            } catch {
              // Ignore
            }
          }

          resolve();
        });
      });
    }
  }
}

// =============================================================================
// Client
// =============================================================================

export class NamedPipeClient {
  private socket: Socket | null = null;
  private options: NamedPipeClientOptions;
  private pipePath: string;
  private connected = false;
  private pendingRequest: {
    resolve: (response: Buffer) => void;
    reject: (error: Error) => void;
  } | null = null;
  private responseBuffer = Buffer.alloc(0);

  constructor(options: NamedPipeClientOptions) {
    this.options = {
      timeout: 30000,
      ...options,
    };
    this.pipePath = PIPE_PREFIX + options.pipeId;
  }

  get path(): string {
    return this.pipePath;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.socket = connect(this.pipePath);

      this.socket.on("connect", () => {
        this.connected = true;
        this.options.onConnect?.();
        resolve();
      });

      this.socket.on("data", (chunk: Buffer) => {
        this.handleData(chunk);
      });

      this.socket.on("error", (err) => {
        this.connected = false;
        this.options.onError?.(err);

        // Reject pending request if any
        if (this.pendingRequest) {
          this.pendingRequest.reject(err);
          this.pendingRequest = null;
        }

        reject(err);
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.options.onDisconnect?.();

        // Reject pending request if any
        if (this.pendingRequest) {
          this.pendingRequest.reject(new Error("Connection closed"));
          this.pendingRequest = null;
        }
      });
    });
  }

  private handleData(chunk: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, chunk]);

    // Check if we have a complete response
    if (this.responseBuffer.length >= 4) {
      const respLen = this.responseBuffer.readUInt32LE(0);

      if (this.responseBuffer.length >= 4 + respLen) {
        const response = this.responseBuffer.subarray(4, 4 + respLen);
        this.responseBuffer = this.responseBuffer.subarray(4 + respLen);

        // Resolve pending request
        if (this.pendingRequest) {
          this.pendingRequest.resolve(response);
          this.pendingRequest = null;
        }
      }
    }
  }

  async send(packet: Buffer): Promise<Buffer> {
    if (!this.socket || !this.connected) {
      throw new Error("Not connected");
    }

    if (this.pendingRequest) {
      throw new Error("Another request is pending");
    }

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequest = null;
        reject(new Error("Request timeout"));
      }, this.options.timeout);

      this.pendingRequest = {
        resolve: (response: Buffer) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };

      // Send length-prefixed packet
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32LE(packet.length, 0);
      this.socket!.write(Buffer.concat([lenBuf, packet]));
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}

// =============================================================================
// Packet Helpers
// =============================================================================

/**
 * Create a binary packet with JSON header and raw vector data
 */
export function createPacket(header: Record<string, unknown>, vectors?: Float32Array): Buffer {
  const headerJson = JSON.stringify(header);
  const headerBuf = Buffer.from(headerJson);

  if (!vectors || vectors.length === 0) {
    // Header-only packet
    const packet = Buffer.allocUnsafe(4 + headerBuf.length);
    packet.writeUInt32LE(headerBuf.length, 0);
    headerBuf.copy(packet, 4);
    return packet;
  }

  // Header + vectors packet
  const vectorsBuf = Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength);
  const packet = Buffer.allocUnsafe(4 + headerBuf.length + vectorsBuf.length);
  packet.writeUInt32LE(headerBuf.length, 0);
  headerBuf.copy(packet, 4);
  vectorsBuf.copy(packet, 4 + headerBuf.length);

  return packet;
}

/**
 * Parse a binary packet into header and optional vector data
 */
export function parsePacket(packet: Buffer): {
  header: Record<string, unknown>;
  vectors?: Float32Array;
} {
  const headerLen = packet.readUInt32LE(0);
  const headerJson = packet.subarray(4, 4 + headerLen).toString();
  const header = JSON.parse(headerJson) as Record<string, unknown>;

  if (packet.length > 4 + headerLen) {
    // Extract vectors from remaining bytes
    const vectorsOffset = 4 + headerLen;
    const vectorsLen = packet.length - vectorsOffset;

    // Create Float32Array view (copy to ensure alignment)
    const vectorsBuf = packet.subarray(vectorsOffset);
    const vectors = new Float32Array(vectorsLen / 4);
    for (let i = 0; i < vectors.length; i++) {
      vectors[i] = vectorsBuf.readFloatLE(i * 4);
    }

    return { header, vectors };
  }

  return { header };
}

/**
 * Get the pipe path for a given ID
 */
export function getPipePath(pipeId: string): string {
  return PIPE_PREFIX + pipeId;
}

/**
 * Check if a pipe exists (for Unix sockets)
 */
export function pipeExists(pipeId: string): boolean {
  if (process.platform === "win32") {
    // Named pipes on Windows don't have filesystem presence
    // We can try to connect to check, but for simplicity return true
    return true;
  }
  return existsSync(PIPE_PREFIX + pipeId);
}

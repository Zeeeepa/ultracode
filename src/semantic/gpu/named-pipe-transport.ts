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
import { sleep } from "../../utils/runtime-detection.js";

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

// =============================================================================
// Reusable Buffer Helper
// =============================================================================

/**
 * Pre-allocated buffer with dynamic growth for efficient chunk accumulation.
 * Avoids O(n²) Buffer.concat in hot paths.
 * Shrinks back to initial size when empty to prevent memory bloat.
 */
class GrowableBuffer {
  private buffer: Buffer;
  private length = 0;
  private readonly initialSize: number;

  constructor(initialSize = 65536) {
    this.initialSize = initialSize;
    this.buffer = Buffer.allocUnsafe(initialSize);
  }

  /** Ensure capacity for additional bytes */
  private ensureCapacity(needed: number): void {
    const required = this.length + needed;
    if (required > this.buffer.length) {
      const newSize = Math.max(this.buffer.length * 2, required);
      const newBuffer = Buffer.allocUnsafe(newSize);
      this.buffer.copy(newBuffer, 0, 0, this.length);
      this.buffer = newBuffer;
    }
  }

  /** Shrink buffer back to initial size if empty and oversized */
  private shrinkIfEmpty(): void {
    if (this.length === 0 && this.buffer.length > this.initialSize) {
      this.buffer = Buffer.allocUnsafe(this.initialSize);
    }
  }

  /** Append chunk to buffer */
  append(chunk: Buffer): void {
    this.ensureCapacity(chunk.length);
    chunk.copy(this.buffer, this.length);
    this.length += chunk.length;
  }

  /** Get current data length */
  get dataLength(): number {
    return this.length;
  }

  /** Read UInt32LE at offset */
  readUInt32LE(offset: number): number {
    return this.buffer.readUInt32LE(offset);
  }

  /** Get subarray view (valid until next append) */
  subarray(start: number, end: number): Buffer {
    return this.buffer.subarray(start, end);
  }

  /** Consume bytes from front (shift remaining data) */
  consume(bytes: number): void {
    if (bytes >= this.length) {
      this.length = 0;
    } else {
      this.buffer.copy(this.buffer, 0, bytes, this.length);
      this.length -= bytes;
    }
    this.shrinkIfEmpty();
  }

  /** Reset buffer */
  reset(): void {
    this.length = 0;
    this.shrinkIfEmpty();
  }
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
    const buffer = new GrowableBuffer(65536);

    socket.on("data", async (chunk: Buffer) => {
      buffer.append(chunk);

      // Process complete packets
      while (buffer.dataLength >= 4) {
        const packetLen = buffer.readUInt32LE(0);

        // Wait for complete packet
        if (buffer.dataLength < 4 + packetLen) break;

        // Copy packet data before consuming (subarray is invalidated by consume)
        const packet = Buffer.from(buffer.subarray(4, 4 + packetLen));
        buffer.consume(4 + packetLen);

        try {
          // Process request and send response
          const response = await this.options.onRequest(packet);

          // Send length-prefixed response (single allocation)
          const respBuffer = Buffer.allocUnsafe(4 + response.length);
          respBuffer.writeUInt32LE(response.length, 0);
          response.copy(respBuffer, 4);
          socket.write(respBuffer);
        } catch (error) {
          // Send error response
          const errorJson = JSON.stringify({ success: false, error: (error as Error).message });
          const errorBuffer = Buffer.allocUnsafe(4 + errorJson.length);
          errorBuffer.writeUInt32LE(errorJson.length, 0);
          errorBuffer.write(errorJson, 4);
          socket.write(errorBuffer);
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
  private responseBuffer = new GrowableBuffer(65536);

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
    this.responseBuffer.append(chunk);

    // Check if we have a complete response
    if (this.responseBuffer.dataLength >= 4) {
      const respLen = this.responseBuffer.readUInt32LE(0);

      if (this.responseBuffer.dataLength >= 4 + respLen) {
        // Copy response data before consuming
        const response = Buffer.from(this.responseBuffer.subarray(4, 4 + respLen));
        this.responseBuffer.consume(4 + respLen);

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

    const abortController = new AbortController();

    // Response promise
    const responsePromise = new Promise<Buffer>((resolve, reject) => {
      this.pendingRequest = {
        resolve: (response: Buffer) => {
          abortController.abort();
          resolve(response);
        },
        reject: (error: Error) => {
          abortController.abort();
          reject(error);
        },
      };

      // Send length-prefixed packet (single allocation)
      const sendBuffer = Buffer.allocUnsafe(4 + packet.length);
      sendBuffer.writeUInt32LE(packet.length, 0);
      packet.copy(sendBuffer, 4);
      this.socket!.write(sendBuffer);
    });

    // Timeout promise (Bun-compatible using async sleep)
    const timeoutPromise = (async (): Promise<Buffer> => {
      await sleep(this.options.timeout ?? 30000);
      if (abortController.signal.aborted) {
        // Response already received, return never-resolving promise
        return new Promise<Buffer>(() => {});
      }
      this.pendingRequest = null;
      throw new Error("Request timeout");
    })();

    return Promise.race([responsePromise, timeoutPromise]);
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

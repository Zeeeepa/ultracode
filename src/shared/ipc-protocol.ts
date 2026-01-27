/**
 * IPC Protocol for communication between Commer (proxy) and Core processes
 *
 * Wire format: <4-byte length (BE)><JSON payload>
 * Transport: Named Pipe (Windows) / Unix Domain Socket (Linux/Mac)
 */

import { randomUUID } from "node:crypto";
import type { Socket } from "node:net";
import { log } from "../logging/index.js";
import { sleep } from "../utils/runtime-detection.js";

// =============================================================================
// Types
// =============================================================================

export type IPCMessageType = "request" | "response" | "event";

export interface IPCRequest {
  id: string;
  type: "request";
  method: string;
  params?: unknown;
  projectPath?: string | undefined;
}

export interface IPCResponse {
  id: string;
  type: "response";
  result?: unknown;
  error?: IPCError;
}

export interface IPCEvent {
  id: string;
  type: "event";
  event: string;
  data?: unknown;
  projectPath?: string | undefined;
}

export interface IPCError {
  code: number;
  message: string;
  data?: unknown;
}

export type IPCMessage = IPCRequest | IPCResponse | IPCEvent;

// Error codes
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  PROJECT_NOT_FOUND: -32001,
  WORKER_ERROR: -32002,
} as const;

// Method names
export const Methods = {
  // Project management
  PROJECT_REGISTER: "project.register",
  PROJECT_UNREGISTER: "project.unregister",
  PROJECT_LIST: "project.list",

  // Indexing
  INDEX_START: "index.start",
  INDEX_STATUS: "index.status",
  INDEX_CANCEL: "index.cancel",

  // Tools (MCP tools forwarding)
  TOOL_CALL: "tool.call",

  // System
  PING: "ping",
  SHUTDOWN: "shutdown",
  GET_STATUS: "status",
} as const;

// Events
export const Events = {
  INDEX_PROGRESS: "index.progress",
  INDEX_COMPLETE: "index.complete",
  INDEX_ERROR: "index.error",
  PROJECT_INDEXED: "project.indexed",
  CORE_SHUTDOWN: "core.shutdown",
} as const;

// =============================================================================
// Message Encoding/Decoding
// =============================================================================

// Reusable TextEncoder for UTF-8 encoding
const textEncoder = new TextEncoder();

/**
 * Encode a message for wire transmission
 * Format: <4-byte length (BE)><JSON payload>
 * Optimized: single buffer allocation instead of 3
 */
export function encodeMessage(message: IPCMessage): Buffer {
  const jsonBytes = textEncoder.encode(JSON.stringify(message));
  const result = Buffer.allocUnsafe(4 + jsonBytes.length);
  result.writeUInt32BE(jsonBytes.length, 0);
  result.set(jsonBytes, 4);
  return result;
}

/**
 * Message decoder with buffering for partial reads
 * Optimized: pre-allocated buffer with dynamic growth
 * Shrinks back to initial size when empty to prevent memory bloat
 */
export class MessageDecoder {
  private buffer: Buffer;
  private length = 0;
  private readonly initialSize: number;

  constructor(initialSize = 16384) {
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

  /**
   * Add data to buffer and return any complete messages
   */
  decode(chunk: Buffer): IPCMessage[] {
    this.ensureCapacity(chunk.length);
    chunk.copy(this.buffer, this.length);
    this.length += chunk.length;

    const messages: IPCMessage[] = [];

    while (this.length >= 4) {
      const msgLength = this.buffer.readUInt32BE(0);

      if (this.length < 4 + msgLength) {
        // Not enough data yet
        break;
      }

      const payload = this.buffer.subarray(4, 4 + msgLength);

      try {
        const message = JSON.parse(payload.toString("utf-8")) as IPCMessage;
        messages.push(message);
      } catch (error) {
        log.e("IPC", "parse_fail", { err: String(error) });
      }

      // Shift remaining data to front
      const consumed = 4 + msgLength;
      if (consumed < this.length) {
        this.buffer.copy(this.buffer, 0, consumed, this.length);
      }
      this.length -= consumed;
    }

    // Shrink if all data consumed
    this.shrinkIfEmpty();

    return messages;
  }

  /**
   * Reset the buffer (e.g., on reconnect)
   */
  reset(): void {
    this.length = 0;
    this.shrinkIfEmpty();
  }
}

// =============================================================================
// Request/Response Helpers
// =============================================================================

/**
 * Create a new request message
 */
export function createRequest(method: string, params?: unknown, projectPath?: string): IPCRequest {
  return {
    id: randomUUID(),
    type: "request",
    method,
    params,
    projectPath,
  };
}

/**
 * Create a success response
 */
export function createResponse(requestId: string, result: unknown): IPCResponse {
  return {
    id: requestId,
    type: "response",
    result,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(requestId: string, code: number, message: string, data?: unknown): IPCResponse {
  return {
    id: requestId,
    type: "response",
    error: { code, message, data },
  };
}

/**
 * Create an event message
 */
export function createEvent(event: string, data?: unknown, projectPath?: string): IPCEvent {
  return {
    id: randomUUID(),
    type: "event",
    event,
    data,
    projectPath,
  };
}

// =============================================================================
// IPC Client Helper
// =============================================================================

export interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  abortController: AbortController;
}

/**
 * IPC Client for making requests and handling responses
 */
export class IPCClient {
  private decoder = new MessageDecoder();
  private pendingRequests = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<(data: unknown, projectPath?: string) => void>>();
  private requestTimeout: number;

  constructor(
    private socket: Socket,
    options: { requestTimeout?: number } = {},
  ) {
    this.requestTimeout = options.requestTimeout ?? 30000;

    socket.on("data", (chunk) => {
      const messages = this.decoder.decode(chunk as Buffer);
      for (const message of messages) {
        this.handleMessage(message);
      }
    });

    socket.on("close", () => {
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.abortController.abort();
        pending.reject(new Error("Connection closed"));
        this.pendingRequests.delete(id);
      }
      this.decoder.reset();

      // Clear event handlers to prevent memory leak
      this.eventHandlers.clear();
    });
  }

  /**
   * Send a request and wait for response
   */
  async request<T = unknown>(method: string, params?: unknown, projectPath?: string): Promise<T> {
    const req = createRequest(method, params, projectPath);

    return new Promise((resolve, reject) => {
      const abortController = new AbortController();

      // Async timeout using sleep pattern (Bun compatible)
      (async () => {
        await sleep(this.requestTimeout);
        if (!abortController.signal.aborted) {
          this.pendingRequests.delete(req.id);
          reject(new Error(`Request timeout: ${method}`));
        }
      })();

      this.pendingRequests.set(req.id, { resolve: resolve as (r: unknown) => void, reject, abortController });
      this.socket.write(encodeMessage(req));
    });
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: (data: unknown, projectPath?: string) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, handler: (data: unknown, projectPath?: string) => void): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Send an event (for Core to send to proxies)
   */
  sendEvent(event: string, data?: unknown, projectPath?: string): void {
    const msg = createEvent(event, data, projectPath);
    this.socket.write(encodeMessage(msg));
  }

  private handleMessage(message: IPCMessage): void {
    if (message.type === "response") {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        pending.abortController.abort();
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.type === "event") {
      const handlers = this.eventHandlers.get(message.event);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message.data, message.projectPath);
          } catch (error) {
            log.e("IPC", "handler_error", { event: message.event, err: String(error) });
          }
        }
      }
    }
  }
}

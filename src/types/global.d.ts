/// <reference types="@types/bun" />

import type Database from "better-sqlite3";

declare global {
  var testDb: Database.Database | undefined;

  /**
   * Bun global object (undefined when running under Node.js)
   * Types from @types/bun package
   */
  var Bun: typeof import("bun") | undefined;

  /**
   * ReadableStream with getReader method
   */
  interface ReadableStream<R = unknown> {
    readonly locked: boolean;
    cancel(reason?: unknown): Promise<void>;
    getReader(): ReadableStreamDefaultReader<R>;
    pipeThrough<T>(transform: ReadableWritablePair<T, R>, options?: StreamPipeOptions): ReadableStream<T>;
    pipeTo(destination: WritableStream<R>, options?: StreamPipeOptions): Promise<void>;
    tee(): [ReadableStream<R>, ReadableStream<R>];
  }

  interface ReadableStreamDefaultReader<R = unknown> {
    readonly closed: Promise<undefined>;
    cancel(reason?: unknown): Promise<void>;
    read(): Promise<ReadableStreamReadResult<R>>;
    releaseLock(): void;
  }

  interface ReadableStreamReadResult<T> {
    done: boolean;
    value?: T;
  }

  /**
   * Global fetch API types (Node.js 18+ / Bun)
   * Explicitly declared to avoid conflicts between @types/node and @types/bun
   */
  interface Response {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly headers: Headers;
    readonly body: ReadableStream<Uint8Array> | null;
    readonly bodyUsed: boolean;
    readonly url: string;
    readonly type: ResponseType;
    readonly redirected: boolean;
    json<T = unknown>(): Promise<T>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
    formData(): Promise<FormData>;
    clone(): Response;
  }

  interface RequestInit {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    mode?: RequestMode;
    credentials?: RequestCredentials;
    cache?: RequestCache;
    redirect?: RequestRedirect;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy;
    integrity?: string;
    keepalive?: boolean;
    signal?: AbortSignal | null;
  }

  function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

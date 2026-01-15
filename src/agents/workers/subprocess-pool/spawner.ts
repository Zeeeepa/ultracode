/**
 * Subprocess Spawner
 *
 * Platform-specific subprocess spawning for Bun and Node.js runtimes.
 */

import type { ChildProcess } from "node:child_process";
import { log } from "../../../logging/index.js";
import type { ParseResponse, SubprocessState } from "./types.js";

/**
 * Bun process wrapper to match ChildProcess interface
 */
interface BunProcessWrapper {
  stderr: ReadableStream<Uint8Array>;
  pid: number;
  kill: () => void;
  send: (msg: ParseResponse) => void;
  on: (event: "exit" | "close", handler: (code: number | null) => void) => void;
}

/**
 * Spawn context containing runtime info and callbacks
 */
export interface SpawnContext {
  language: string;
  workerScript: string;
  isBun: boolean;
  isShuttingDown: () => boolean;
  onMessage: (workerId: number, message: ParseResponse) => void;
  onUnexpectedExit: (workerId: number, code: number | null) => void;
}

/**
 * Log stderr output from subprocess
 */
async function logBunStderr(stderr: ReadableStream<Uint8Array>, language: string, workerId: number): Promise<void> {
  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const msg = decoder.decode(value).trim();
      if (msg) {
        log.d("WORKER", "stderr", { language, workerId, msg });
      }
    }
  } catch {
    // Ignore read errors on process exit
  }
}

/**
 * Spawn Bun subprocess with native IPC
 */
export async function spawnBunProcess(workerId: number, state: SubprocessState, context: SpawnContext): Promise<void> {
  const global = globalThis as any;
  const bunProc = global.Bun?.["spawn"](["bun", context.workerScript], {
    stderr: "pipe",
    env: {
      ...process.env,
      PARSING_WORKER_ID: `${context.language}-${workerId}`,
      PARSING_WORKER_LANGUAGE: context.language,
    },
    ipc: (message: ParseResponse) => {
      context.onMessage(workerId, message);
    },
    serialization: "advanced",
  });

  // Wrap Bun process to match ChildProcess interface
  const proc: BunProcessWrapper = {
    stderr: bunProc.stderr,
    pid: bunProc.pid,
    kill: () => bunProc.kill(),
    send: (msg: ParseResponse) => bunProc.send(msg),
    on: (event: "exit" | "close", handler: (code: number | null) => void) => {
      if (event === "exit" || event === "close") {
        bunProc.exited.then((code: number | null) => handler(code));
      }
    },
  };

  state.process = proc as any;

  log.d("SUBPROCESS", "spawned_bun", { workerId, language: context.language, pid: proc.pid });

  // Log stderr asynchronously
  logBunStderr(bunProc.stderr, context.language, workerId);

  // Handle unexpected exit
  const stateRef = state;
  bunProc.exited.then((code: number | null) => {
    if (!context.isShuttingDown() && !stateRef.intentionalKill) {
      log.w("SUBPROCESS", "unexpected_exit", { workerId, code, language: context.language });
      context.onUnexpectedExit(workerId, code);
    }
  });
}

/**
 * Spawn Node.js subprocess with fork IPC
 */
export async function spawnNodeProcess(workerId: number, state: SubprocessState, context: SpawnContext): Promise<void> {
  const { fork } = await import("node:child_process");

  const proc = fork(context.workerScript, [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    serialization: "advanced" as const,
    env: {
      ...process.env,
      PARSING_WORKER_ID: `${context.language}-${workerId}`,
      PARSING_WORKER_LANGUAGE: context.language,
    },
  });

  proc.unref();
  state.process = proc;

  log.d("SUBPROCESS", "forked_node", { workerId, language: context.language, pid: proc.pid });

  // V8 native IPC message handler
  proc.on("message", (message: ParseResponse) => {
    context.onMessage(workerId, message);
  });

  // Log stderr
  proc.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) {
      log.d("WORKER", "stderr", { language: context.language, workerId, msg });
    }
  });

  // Handle unexpected exit
  const stateRef = state;
  proc.on("exit", (code) => {
    if (!context.isShuttingDown() && !stateRef.intentionalKill) {
      log.w("SUBPROCESS", "unexpected_exit", { workerId, code, language: context.language });
      context.onUnexpectedExit(workerId, code);
    }
  });
}

/**
 * Spawn subprocess based on runtime (Bun or Node.js)
 */
export async function spawnProcess(workerId: number, state: SubprocessState, context: SpawnContext): Promise<void> {
  if (context.isBun) {
    await spawnBunProcess(workerId, state, context);
  } else {
    await spawnNodeProcess(workerId, state, context);
  }
}

/**
 * Kill a subprocess safely
 */
export function killProcess(process: ChildProcess | any | null): void {
  if (!process) return;
  try {
    process.kill?.();
  } catch {
    // Ignore kill errors
  }
}

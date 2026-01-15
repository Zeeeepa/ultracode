/**
 * Shutdown Handlers
 *
 * Graceful shutdown logic for SIGINT, SIGTERM, and other signals.
 * Extracted from index.ts for better modularity.
 */

import type { ConductorOrchestrator } from "../agents/conductor-orchestrator.js";
import type { LayeredIndexManager } from "../layered/index.js";
import { log } from "../logging/index.js";
import type { KVPairs } from "../logging/log-types.js";
import { shutdownFaissProvider } from "../semantic/faiss/faiss-provider.js";
import { shutdownGpuClient } from "../semantic/gpu/gpu-client.js";
import { shutdownOVMSNative } from "../semantic/ovms-native-manager.js";
import type { Agent } from "../types/agent.js";
import { resourceManager } from "./resource-manager.js";

interface DiagnosticSnapshot {
  pid: number;
  memory: NodeJS.MemoryUsage;
  uptime: number;
  conductor?: {
    pendingTasks?: number;
    agents: Array<{
      id: string;
      type: string;
      status: string;
      memMB: number;
      queue: number;
      lastActivity?: number;
    }>;
  };
}

// =============================================================================
// SHUTDOWN STATE
// =============================================================================

let isShuttingDownGlobal = false;

/**
 * Check if shutdown is in progress
 */
export function isShuttingDown(): boolean {
  return isShuttingDownGlobal;
}

// =============================================================================
// SHUTDOWN CONTEXT
// =============================================================================

export interface ShutdownContext {
  conductor: ConductorOrchestrator | null;
  layeredIndexManager: LayeredIndexManager | null;
}

let shutdownContext: ShutdownContext = {
  conductor: null,
  layeredIndexManager: null,
};

/**
 * Set the shutdown context (call during initialization)
 */
export function setShutdownContext(context: Partial<ShutdownContext>): void {
  shutdownContext = { ...shutdownContext, ...context };
}

// =============================================================================
// GLOBAL SHUTDOWN
// =============================================================================

/**
 * Perform graceful shutdown - shared logic for SIGINT and SIGTERM
 */
export async function performGlobalShutdown(signal: string): Promise<void> {
  if (isShuttingDownGlobal) return;
  isShuttingDownGlobal = true;

  log.i("SHUTDOWN", "shutdown_start", { signal });

  // Shutdown OVMS Native first (if running)
  try {
    await shutdownOVMSNative();
    log.i("SHUTDOWN", "ovms_shutdown_ok");
  } catch (error) {
    log.e("SHUTDOWN", "ovms_shutdown_fail", { err: String(error) });
  }

  // Shutdown GPU worker (if running)
  try {
    await shutdownGpuClient();
    log.i("SHUTDOWN", "GPU Client Shutdown Complete");
  } catch (error) {
    log.e("SHUTDOWN", "Shutdown error", { error: String(error) });
  }

  // Shutdown FAISS provider (if running)
  try {
    await shutdownFaissProvider();
    log.i("SHUTDOWN", "FAISS Provider Shutdown Complete");
  } catch (error) {
    log.e("SHUTDOWN", "Shutdown error", { error: String(error) });
  }

  if (shutdownContext.conductor) {
    await shutdownContext.conductor.shutdown();
    log.i("SHUTDOWN", "Conductor Shutdown Complete");
  }

  if (shutdownContext.layeredIndexManager) {
    await shutdownContext.layeredIndexManager.shutdown();
    log.i("SHUTDOWN", "LayeredIndexManager Shutdown Complete");
  }

  resourceManager.stopMonitoring();
  log.i("SHUTDOWN", "Resource Manager Stopped");
  log.i("SHUTDOWN", "MCP Server Shutdown Complete", { signal });

  process.exit(0);
}

// =============================================================================
// SIGNAL HANDLERS REGISTRATION
// =============================================================================

/**
 * Register all signal handlers for graceful shutdown
 */
export function registerSignalHandlers(): void {
  process.on("SIGINT", () => {
    performGlobalShutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    performGlobalShutdown("SIGTERM");
  });

  // Fallback: beforeExit fires when event loop is empty but before exit
  process.on("beforeExit", async (code) => {
    if (code === 0 && !isShuttingDownGlobal) {
      await performGlobalShutdown("beforeExit");
    }
  });

  // Windows: detect parent process exit via stdin close
  process.stdin.on("close", () => {
    if (!isShuttingDownGlobal) {
      log.i("SHUTDOWN", "stdin closed (parent exited), shutting down...");
      performGlobalShutdown("stdin-close");
    }
  });

  process.stdin.on("end", () => {
    if (!isShuttingDownGlobal) {
      log.i("SHUTDOWN", "stdin ended (parent exited), shutting down...");
      performGlobalShutdown("stdin-end");
    }
  });
}

// =============================================================================
// DEBUG SIGNAL HANDLER
// =============================================================================

/**
 * Register SIGUSR1 debug signal handler for runtime state dump
 */
export function registerDebugSignalHandler(): void {
  process.on("SIGUSR1", async () => {
    try {
      const snapshot: DiagnosticSnapshot = {
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      };
      if (shutdownContext.conductor) {
        snapshot.conductor = {
          pendingTasks: shutdownContext.conductor.getPendingTasksCount(),
          agents: Array.from(shutdownContext.conductor.agents.values()).map((agent: Agent) => {
            const metrics = agent.getMetrics();
            return {
              id: agent.id,
              type: agent.type,
              status: agent.status,
              memMB: agent.getMemoryUsage(),
              queue: agent.getTaskQueue().length,
              lastActivity: metrics.lastActivity,
            };
          }),
        };
      }
      log.w("INCIDENT", "SIGUSR1 dump", snapshot as unknown as KVPairs);
    } catch (err) {
      log.w("INCIDENT", "sigusr1_dump_fail", { err: String(err) });
    }
  });
}

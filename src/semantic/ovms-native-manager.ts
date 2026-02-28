/**
 * OVMS Native Process Manager
 *
 * Manages the lifecycle of OVMS Native binary:
 * - Starts OVMS when MCP server starts (if configured)
 * - Stops OVMS when MCP server shuts down
 * - Health monitoring and auto-restart
 *
 * Port allocation:
 * - OVMS Docker: 8082 (REST), 9000 (gRPC)
 * - OVMS Native: 8083 (REST), 9001 (gRPC)
 */

import { type ChildProcess, exec, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { log } from "../logging/index.js";
import { getDataDir, getLogsDir } from "../utils/config-paths.js";
import { toError } from "../utils/error-handling.js";
import { isBunRuntime, sleep } from "../utils/runtime.js";

// Event-driven architecture: health check uses setInterval for Node.js, disabled for Bun

const execAsync = promisify(exec);

export const OVMS_NATIVE_REST_PORT = 8083;
export const OVMS_NATIVE_GRPC_PORT = 9001;
export const OVMS_DOCKER_REST_PORT = 8082;
export const OVMS_DOCKER_GRPC_PORT = 9000;

export interface OVMSNativeConfig {
  enabled: boolean;
  autoStart?: boolean;
  restPort?: number;
  grpcPort?: number;
  healthCheckIntervalMs?: number;
  healthCheckIdleMs?: number;
  startupTimeoutMs?: number;
}

interface OVMSNativeState {
  process: ChildProcess | null;
  pid: number | null;
  isRunning: boolean;
  startedAt: number | null;
  restartCount: number;
  lastHealthCheck: number | null;
  lastError: string | null;
}

class OVMSNativeManager {
  private state: OVMSNativeState = {
    process: null,
    pid: null,
    isRunning: false,
    startedAt: null,
    restartCount: 0,
    lastHealthCheck: null,
    lastError: null,
  };

  private config: OVMSNativeConfig = {
    enabled: false,
    autoStart: true,
    restPort: OVMS_NATIVE_REST_PORT,
    grpcPort: OVMS_NATIVE_GRPC_PORT,
    healthCheckIntervalMs: 30000,
    healthCheckIdleMs: 120000, // 2 min when idle
    startupTimeoutMs: 120000, // 2 minutes for model loading
  };

  private healthCheckRunning = false;
  private shutdownPromise: Promise<void> | null = null;
  private ovmsLogFile: string | null = null;

  /**
   * Get OVMS log file path (creates logs dir if needed)
   */
  private getOVMSLogFile(): string {
    if (this.ovmsLogFile) return this.ovmsLogFile;

    const logsDir = getLogsDir();
    mkdirSync(logsDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    this.ovmsLogFile = join(logsDir, `ovms-${date}.log`);
    return this.ovmsLogFile;
  }

  /**
   * Write to OVMS log file
   */
  private writeOVMSLog(level: "INFO" | "WARN" | "ERROR" | "DEBUG", message: string): void {
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] [${level}] ${message}\n`;
      appendFileSync(this.getOVMSLogFile(), logLine);
    } catch {
      // Ignore log write errors
    }
  }

  /**
   * Get OVMS binary path
   * Note: Windows ZIP extracts to ovms/ovms/ subfolder
   */
  private getOVMSBinaryPath(): string {
    const dataDir = getDataDir();
    const ovmsBaseDir = join(dataDir, "ovms");
    const isWindows = process.platform === "win32";

    if (isWindows) {
      // Windows ZIP creates ovms/ovms/ subfolder structure
      const nestedPath = join(ovmsBaseDir, "ovms", "ovms.exe");
      const flatPath = join(ovmsBaseDir, "ovms.exe");
      // Check nested first (from ZIP), then flat (manual install)
      return existsSync(nestedPath) ? nestedPath : flatPath;
    } else {
      // Linux tar extracts with --strip-components=1
      return join(ovmsBaseDir, "ovms");
    }
  }

  /**
   * Get models config path
   */
  private getModelsConfigPath(): string {
    const dataDir = getDataDir();
    return join(dataDir, "models", "config.json");
  }

  /**
   * Kill existing processes using OVMS ports
   * Cleans up orphaned OVMS processes from previous runs
   */
  private async killProcessesOnPorts(): Promise<void> {
    const ports = [this.config.restPort!, this.config.grpcPort!];
    const isWindows = process.platform === "win32";
    let killedAny = false;

    // Run port checks in parallel for faster startup
    const portChecks = ports.map(async (port) => {
      try {
        if (isWindows) {
          // Windows: use netstat to find PID, then taskkill
          const { stdout } = await execAsync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, {
            timeout: 2000,
          });

          // Parse PID from netstat output (last column)
          const lines = stdout.trim().split("\n").filter(Boolean);
          const pidsToKill = new Set<string>();

          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== "0" && /^\d+$/.test(pid)) {
              pidsToKill.add(pid);
            }
          }

          for (const pid of pidsToKill) {
            try {
              // Check if it's an OVMS process before killing
              const { stdout: taskInfo } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV`, { timeout: 2000 });
              if (taskInfo.includes("ovms") || taskInfo.includes("cmd.exe")) {
                log.w("OVMS", `Killing orphaned process on port ${port}`, { pid });
                await execAsync(`taskkill /F /PID ${pid}`, { timeout: 3000 });
                killedAny = true;
              }
            } catch {
              // Process already dead or permission denied
            }
          }
        } else {
          // Linux/Mac: use lsof and kill
          try {
            const { stdout } = await execAsync(`lsof -ti:${port}`, { timeout: 2000 });
            const pids = stdout.trim().split("\n").filter(Boolean);
            for (const pid of pids) {
              log.w("OVMS", `Killing orphaned process on port ${port}`, { pid });
              await execAsync(`kill -9 ${pid}`, { timeout: 2000 });
              killedAny = true;
            }
          } catch {
            // No process on port or already dead
          }
        }
      } catch {
        // No process found on this port - that's fine
      }
    });

    await Promise.all(portChecks);

    // Only delay if we actually killed something
    if (killedAny) {
      await sleep(300);
    }
  }

  /**
   * Check if OVMS Native is installed
   */
  isInstalled(): boolean {
    return existsSync(this.getOVMSBinaryPath());
  }

  /**
   * Configure the manager
   */
  configure(config: Partial<OVMSNativeConfig>): void {
    this.config = { ...this.config, ...config };
    log.i("OVMS", "configured", { ...this.config });
  }

  /**
   * Get current state
   */
  getState(): Readonly<OVMSNativeState> {
    return { ...this.state };
  }

  /**
   * Get endpoint URL
   */
  getEndpoint(): string {
    return `http://127.0.0.1:${this.config.restPort}`;
  }

  /**
   * Start OVMS Native process
   */
  async start(): Promise<boolean> {
    if (this.state.isRunning) {
      log.i("OVMS", "Already running", { pid: this.state.pid });
      return true;
    }

    const ovmsBin = this.getOVMSBinaryPath();
    const configPath = this.getModelsConfigPath();

    if (!existsSync(ovmsBin)) {
      this.state.lastError = "OVMS binary not found";
      log.e("OVMS", this.state.lastError, { path: ovmsBin });
      return false;
    }

    if (!existsSync(configPath)) {
      this.state.lastError = "OVMS config not found";
      log.e("OVMS", this.state.lastError, { path: configPath });
      return false;
    }

    // Debug: skip subprocess spawning to identify console window source
    if (process.env["ULTRACODE_NO_SUBPROCESS"] === "1") {
      log.w("OVMS", "SKIPPED (ULTRACODE_NO_SUBPROCESS=1)");
      return false;
    }

    log.i("OVMS", "Starting OVMS Native", {
      binary: ovmsBin,
      config: configPath,
      restPort: this.config.restPort,
      grpcPort: this.config.grpcPort,
    });

    // Kill any orphaned OVMS processes on our ports before starting
    await this.killProcessesOnPorts();

    try {
      const args = [
        "--rest_port",
        String(this.config.restPort),
        "--port",
        String(this.config.grpcPort),
        "--config_path",
        configPath,
      ];

      const isWindows = process.platform === "win32";
      const ovmsDir = dirname(ovmsBin);

      if (isWindows) {
        // On Windows, set OpenVINO environment directly without setupvars.bat
        // This avoids conhost/cmd.exe issues and is more reliable
        const dataDir = getDataDir();
        const openvinoDir = join(dataDir, "openvino");

        // Build OpenVINO library paths (same logic as setupvars.bat)
        const libPaths = [
          join(openvinoDir, "runtime", "bin", "intel64", "Release"),
          join(openvinoDir, "runtime", "bin", "intel64", "Debug"),
          join(openvinoDir, "runtime", "3rdparty", "tbb", "bin"),
          join(openvinoDir, "runtime", "3rdparty", "tbb", "redist", "intel64", "vc14"),
          join(openvinoDir, "runtime", "3rdparty", "tbb", "bin", "intel64", "vc14"),
          ovmsDir, // OVMS folder itself may have DLLs
        ].filter((p) => existsSync(p));

        const envPath = [...libPaths, process.env["PATH"] || ""].join(";");

        const env: Record<string, string | undefined> = {
          ...process.env,
          PATH: envPath,
          INTEL_OPENVINO_DIR: openvinoDir,
          OpenVINO_DIR: join(openvinoDir, "runtime", "cmake"),
        };

        // Add OpenVINO debug logging env vars for NPU/GPU debugging
        if (process.env["OV_DEBUG"]) {
          env["OV_NPU_LOG_LEVEL"] = "LOG_DEBUG";
          env["OPENVINO_LOG_LEVEL"] = "3";
        }

        log.i("OVMS", "Starting with direct env", {
          cwd: ovmsDir,
          binary: ovmsBin,
          libPaths: libPaths.slice(0, 3),
          args,
        });

        // Spawn OVMS directly without cmd.exe wrapper
        this.state.process = spawn(ovmsBin, args, {
          detached: false,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          cwd: ovmsDir,
          env,
        });
      } else {
        // On Linux, spawn directly with LD_LIBRARY_PATH
        this.state.process = spawn(ovmsBin, args, {
          detached: false,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, LD_LIBRARY_PATH: ovmsDir },
          cwd: ovmsDir,
        });
      }

      const proc = this.state.process;
      if (!proc) {
        throw new Error("Failed to start OVMS process");
      }

      this.state.pid = proc.pid ?? null;
      this.state.startedAt = Date.now();

      // Write startup marker to OVMS log file
      const logFile = this.getOVMSLogFile();
      writeFileSync(
        logFile,
        `\n${"=".repeat(80)}\n[${new Date().toISOString()}] OVMS Native starting (PID: ${proc.pid})\n${"=".repeat(80)}\n`,
        { flag: "a" },
      );
      log.i("OVMS", "Log file", { path: logFile });

      // Handle stdout - write full output to file
      proc.stdout?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          this.writeOVMSLog("INFO", msg);
          // Also log summary to main log
          if (msg.length > 200) {
            log.d("OVMS", `stdout: ${msg.slice(0, 200)}... (see ovms-*.log)`);
          } else {
            log.d("OVMS", `stdout: ${msg}`);
          }
        }
      });

      // Handle stderr - write full output to file (OVMS logs to stderr)
      proc.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          // Write full message to file
          const isError = msg.includes("error") || msg.includes("Error") || msg.includes("ERROR");
          this.writeOVMSLog(isError ? "ERROR" : "DEBUG", msg);

          // Also log to main log (truncated)
          if (isError) {
            log.w("OVMS", `stderr: ${msg.slice(0, 300)}`);
          } else {
            log.d("OVMS", `stderr: ${msg.slice(0, 200)}`);
          }
        }
      });

      // Handle process exit
      proc.on("exit", (code, signal) => {
        log.i("OVMS", "Process exited", { code, signal, pid: this.state.pid });
        this.state.isRunning = false;
        this.state.process = null;
        this.state.pid = null;
      });

      // Handle process error
      proc.on("error", (err) => {
        this.state.lastError = err.message;
        log.e("OVMS", "Process error", { error: err.message });
        this.state.isRunning = false;
      });

      // Wait for server to be ready
      const ready = await this.waitForReady(this.config.startupTimeoutMs!);

      if (ready) {
        this.state.isRunning = true;
        this.startHealthCheck();
        log.i("OVMS", "Started successfully", {
          pid: this.state.pid,
          endpoint: this.getEndpoint(),
        });
        return true;
      } else {
        this.state.lastError = "Startup timeout";
        log.e("OVMS", "Startup timeout - killing process");
        await this.stop();
        return false;
      }
    } catch (error: unknown) {
      const err = toError(error);
      this.state.lastError = err.message;
      log.e("OVMS", "Failed to start", { error: err.message });
      return false;
    }
  }

  /**
   * Wait for OVMS to be ready
   * For MediaPipe models, they load synchronously during server startup.
   * Once /v2/health/ready returns 200, the server is ready to serve requests.
   */
  private async waitForReady(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms for faster response

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.getEndpoint()}/v2/health/ready`, {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          const elapsed = Date.now() - startTime;
          log.i("OVMS", "Server ready", { elapsedMs: elapsed });
          return true;
        }
      } catch {
        // Server not ready yet
      }

      // Check if process exited (error during startup)
      if (this.state.process?.exitCode !== null) {
        log.e("OVMS", "Process exited during startup");
        return false;
      }

      await sleep(checkInterval);
    }

    return false;
  }

  /**
   * Stop OVMS Native process
   */
  async stop(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.doStop();
    await this.shutdownPromise;
    this.shutdownPromise = null;
  }

  private async doStop(): Promise<void> {
    this.stopHealthCheck();

    if (!this.state.process) {
      this.state.isRunning = false;
      return;
    }

    const pid = this.state.pid;
    log.i("OVMS", "Stopping OVMS Native", { pid });

    return new Promise((resolve) => {
      const abortController = new AbortController();

      // Async force kill timeout using sleep pattern (Bun compatible)
      (async () => {
        await sleep(5000);
        if (!abortController.signal.aborted) {
          if (this.state.process || pid) {
            log.w("OVMS", "Force killing process tree");
            await this.forceKillProcessTree(pid);
          }
          this.state.isRunning = false;
          this.state.process = null;
          this.state.pid = null;
          resolve();
        }
      })();

      this.state.process!.once("exit", () => {
        abortController.abort();
        this.state.isRunning = false;
        this.state.process = null;
        this.state.pid = null;
        log.i("OVMS", "Stopped successfully");
        resolve();
      });

      // On Windows, use taskkill for process tree termination
      // On Unix, send SIGTERM first for graceful shutdown
      if (process.platform === "win32" && pid) {
        this.killWindowsProcessTree(pid).catch(() => {
          // Fallback to Node.js kill
          this.state.process?.kill("SIGTERM");
        });
      } else {
        this.state.process!.kill("SIGTERM");
      }
    });
  }

  /**
   * Kill process tree on Windows using taskkill /T
   * This ensures child processes (like ovms.exe spawned via cmd.exe) are also killed
   */
  private async killWindowsProcessTree(pid: number | null): Promise<void> {
    if (!pid) return;

    try {
      // /T = terminate child processes, /F = force
      await execAsync(`taskkill /T /F /PID ${pid}`, { timeout: 5000 });
      log.d("OVMS", "Process tree killed via taskkill", { pid });
    } catch (error: unknown) {
      // Process might already be dead
      const err = toError(error);
      log.d("OVMS", "taskkill returned error (process may already be dead)", {
        pid,
        error: err.message,
      });
    }
  }

  /**
   * Force kill process tree (fallback for timeout)
   */
  private async forceKillProcessTree(pid: number | null): Promise<void> {
    if (process.platform === "win32") {
      await this.killWindowsProcessTree(pid);
    } else if (pid) {
      try {
        // On Unix, kill process group
        process.kill(-pid, "SIGKILL");
      } catch {
        // Try killing just the process
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Process already dead
        }
      }
    }
  }

  /** Timer handle for Node.js setInterval */
  private healthCheckTimer?: ReturnType<typeof setInterval> | undefined;

  /**
   * Start health check
   * Event-driven: uses setInterval for Node.js, disabled for Bun
   */
  private startHealthCheck(): void {
    if (this.healthCheckRunning) return;
    this.healthCheckRunning = true;

    // For Bun: skip health check loop to avoid CPU spinning
    if (isBunRuntime()) return;

    // For Node.js: use setInterval
    const checkHealth = async () => {
      if (!this.healthCheckRunning || !this.state.isRunning) return;

      try {
        const response = await fetch(`${this.getEndpoint()}/v2/health/ready`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });

        this.state.lastHealthCheck = Date.now();

        if (!response.ok) {
          log.w("OVMS", "Health check failed", { status: response.status });
        }
      } catch (error: unknown) {
        const err = toError(error);
        log.w("OVMS", "Health check error", { error: err.message });
      }
    };

    // Use setInterval with base interval
    const interval = this.config.healthCheckIntervalMs ?? 30000;
    this.healthCheckTimer = setInterval(checkHealth, interval);
  }

  /**
   * Stop health check loop
   */
  private stopHealthCheck(): void {
    this.healthCheckRunning = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Check if OVMS is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.state.isRunning) return false;

    try {
      const response = await fetch(`${this.getEndpoint()}/v2/health/ready`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Restart OVMS Native
   */
  async restart(): Promise<boolean> {
    log.i("OVMS", "Restarting");
    await this.stop();
    this.state.restartCount++;
    return this.start();
  }
}

// Singleton instance
export const ovmsNativeManager = new OVMSNativeManager();

/**
 * Initialize OVMS Native on MCP startup
 * Called from main MCP server initialization
 */
export async function initializeOVMSNative(config?: OVMSNativeConfig): Promise<boolean> {
  if (!config?.enabled) {
    log.d("OVMS", "Disabled in config");
    return false;
  }

  if (!ovmsNativeManager.isInstalled()) {
    log.w("OVMS", "Not installed - run setup-embedding first");
    return false;
  }

  ovmsNativeManager.configure(config);

  if (config.autoStart !== false) {
    return ovmsNativeManager.start();
  }

  return true;
}

/**
 * Shutdown OVMS Native on MCP shutdown
 * Called from main MCP server shutdown
 */
export async function shutdownOVMSNative(): Promise<void> {
  if (ovmsNativeManager.getState().isRunning) {
    await ovmsNativeManager.stop();
  }
}

// Register process signal handlers for graceful OVMS shutdown
// This ensures OVMS is stopped even on unexpected termination
let signalHandlersRegistered = false;

/**
 * Synchronously kill OVMS process tree on Windows
 * Used in exit handlers where async is not available
 */
function killOVMSSync(pid: number | null): void {
  if (!pid) return;

  try {
    if (process.platform === "win32") {
      // Use spawnSync for synchronous taskkill on Windows
      const { spawnSync } = require("node:child_process");
      spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], {
        timeout: 3000,
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      // On Unix, try process group kill first
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    // Best effort - process may already be dead
  }
}

function registerSignalHandlers(): void {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const shutdownHandler = async (signal: string) => {
    log.i("OVMS", "signal_received", { signal });
    try {
      await shutdownOVMSNative();
    } catch (error) {
      log.e("OVMS", "shutdown_error", { signal, err: String(error) });
    }
    // Don't call process.exit here - let the main process handle it
  };

  // Windows: SIGINT (Ctrl+C), SIGTERM (taskkill), SIGBREAK (Ctrl+Break)
  // Linux: SIGINT, SIGTERM, SIGHUP
  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  if (process.platform === "win32") {
    process.on("SIGBREAK", () => shutdownHandler("SIGBREAK"));
  } else {
    process.on("SIGHUP", () => shutdownHandler("SIGHUP"));
  }

  // Handle process.exit() - synchronous, last resort cleanup
  // This fires right before process exits, no async allowed
  process.on("exit", (code) => {
    const state = ovmsNativeManager.getState();
    if (state.isRunning && state.pid) {
      log.i("OVMS", `exit event (code=${code}) - killing OVMS synchronously`);
      killOVMSSync(state.pid);
    }
  });

  // Also handle beforeExit for graceful async cleanup
  process.on("beforeExit", () => {
    if (ovmsNativeManager.getState().isRunning) {
      log.i("OVMS", "beforeExit - stopping OVMS");
      const state = ovmsNativeManager.getState();
      if (state.pid) {
        killOVMSSync(state.pid);
      }
    }
  });

  // Handle uncaught exceptions - try to cleanup OVMS
  process.on("uncaughtException", (error) => {
    log.e("OVMS", "Uncaught exception - attempting OVMS cleanup", { error: error.message });
    const state = ovmsNativeManager.getState();
    if (state.pid) {
      killOVMSSync(state.pid);
    }
  });

  log.d("OVMS", "Signal handlers registered");
}

// Auto-register signal handlers when module is loaded
registerSignalHandlers();

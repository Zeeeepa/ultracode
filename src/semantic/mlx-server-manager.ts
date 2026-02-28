/**
 * MLX Embedding Server Manager
 *
 * Manages the lifecycle of the Python-based MLX embedding server:
 * - Creates/validates Python venv in ~/.ultracode/mlx/venv/
 * - Installs dependencies from requirements.txt
 * - Starts/stops the FastAPI server process
 * - Health monitoring and auto-restart
 *
 * Port: 8087 (MLX_EMBEDDING_PORT)
 * Platform: macOS ARM64 only (Apple Silicon with Metal GPU)
 */

import { type ChildProcess, exec, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { log } from "../logging/index.js";
import { getDataDir } from "../utils/config-paths.js";
import { toError } from "../utils/error-handling.js";
import { isBunRuntime, sleep } from "../utils/runtime.js";

const execAsync = promisify(exec);

export const MLX_EMBEDDING_PORT = 8087;

export interface MlxServerConfig {
  enabled: boolean;
  model: string;
  port?: number;
  host?: string;
  batchSize?: number;
  autoStart?: boolean;
  healthCheckIntervalMs?: number;
  startupTimeoutMs?: number;
}

interface MlxServerState {
  process: ChildProcess | null;
  pid: number | null;
  isRunning: boolean;
  isStarting: boolean;
  startedAt: number | null;
  restartCount: number;
  lastHealthCheck: number | null;
  lastError: string | null;
  model: string | null;
}

class MlxServerManager {
  private state: MlxServerState = {
    process: null,
    pid: null,
    isRunning: false,
    isStarting: false,
    startedAt: null,
    restartCount: 0,
    lastHealthCheck: null,
    lastError: null,
    model: null,
  };

  private config: MlxServerConfig = {
    enabled: false,
    model: "intfloat/multilingual-e5-base",
    port: MLX_EMBEDDING_PORT,
    host: "127.0.0.1",
    batchSize: 128,
    autoStart: true,
    healthCheckIntervalMs: 30000,
    startupTimeoutMs: 300_000, // 5 minutes - first model download from HF can be slow
  };

  private healthCheckRunning = false;
  private shutdownPromise: Promise<void> | null = null;
  private healthCheckTimer?: ReturnType<typeof setInterval> | undefined;

  /**
   * Check if MLX is available on this platform.
   * MLX requires macOS ARM64 (Apple Silicon).
   */
  isAvailable(): boolean {
    return process.platform === "darwin" && process.arch === "arm64";
  }

  /**
   * Get venv directory path
   */
  private getVenvDir(): string {
    const dataDir = getDataDir();
    return join(dataDir, "mlx", "venv");
  }

  /**
   * Get the path to the server.py script
   */
  private getServerScript(): string {
    // Find project root - look for the external-tools directory relative to this module
    // In built form: dist/semantic/mlx-server-manager.js -> ../../external-tools/
    // In dev form: src/semantic/mlx-server-manager.ts -> ../../external-tools/
    const moduleDir = dirname(new URL(import.meta.url).pathname);
    // On Windows, pathname starts with /C:/ — strip leading slash
    const normalizedDir = process.platform === "win32" ? moduleDir.replace(/^\/([A-Za-z]:)/, "$1") : moduleDir;
    const projectRoot = join(normalizedDir, "..", "..");
    const serverPath = join(projectRoot, "external-tools", "mlx-embedding-server", "server.py");

    if (existsSync(serverPath)) {
      return serverPath;
    }

    // Fallback: look relative to data dir
    const dataDir = getDataDir();
    const fallbackPath = join(dataDir, "mlx", "server.py");
    if (existsSync(fallbackPath)) {
      return fallbackPath;
    }

    return serverPath; // Return expected path even if not found (error will be handled later)
  }

  /**
   * Get requirements.txt path
   */
  private getRequirementsPath(): string {
    const serverScript = this.getServerScript();
    return join(dirname(serverScript), "requirements.txt");
  }

  /**
   * Create or verify Python venv
   */
  private async findOrCreateVenv(): Promise<string> {
    const venvDir = this.getVenvDir();
    const venvPython = join(venvDir, "bin", "python3");

    if (existsSync(venvPython)) {
      log.d("MLX", "Existing venv found", { venvDir });
      return venvPython;
    }

    // Find system python3
    let systemPython: string | null = null;
    try {
      const { stdout } = await execAsync("which python3", { timeout: 5000 });
      systemPython = stdout.trim();
    } catch {
      throw new Error("python3 not found in PATH. Install Python 3.10+ for MLX support.");
    }

    if (!systemPython) {
      throw new Error("python3 not found in PATH. Install Python 3.10+ for MLX support.");
    }

    // Create venv
    log.i("MLX", "Creating Python venv", { venvDir });
    const venvParent = dirname(venvDir);
    if (!existsSync(venvParent)) {
      const { mkdirSync } = require("node:fs");
      mkdirSync(venvParent, { recursive: true });
    }

    await execAsync(`${systemPython} -m venv "${venvDir}"`, { timeout: 60_000 });

    if (!existsSync(venvPython)) {
      throw new Error(`Failed to create venv at ${venvDir}`);
    }

    log.i("MLX", "Venv created successfully", { venvDir });
    return venvPython;
  }

  /**
   * Install dependencies from requirements.txt
   */
  private async installDependencies(pythonPath: string): Promise<void> {
    const requirementsPath = this.getRequirementsPath();

    if (!existsSync(requirementsPath)) {
      log.w("MLX", "requirements.txt not found, skipping install", { path: requirementsPath });
      return;
    }

    // Check if dependencies are already installed
    try {
      await execAsync(`"${pythonPath}" -c "import mlx_embedding_models; import fastapi; import uvicorn"`, {
        timeout: 10_000,
      });
      log.d("MLX", "Dependencies already installed");
      return;
    } catch {
      // Not installed, proceed with installation
    }

    log.i("MLX", "Installing dependencies...", { requirements: requirementsPath });

    try {
      await execAsync(`"${pythonPath}" -m pip install -r "${requirementsPath}" --quiet`, {
        timeout: 300_000, // 5 minutes for first install
      });
      log.i("MLX", "Dependencies installed successfully");
    } catch (error: unknown) {
      const err = toError(error);
      throw new Error(`Failed to install MLX dependencies: ${err.message}`);
    }
  }

  /**
   * Kill existing processes using the specified port
   */
  private async killProcessOnPort(port: number): Promise<void> {
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`, { timeout: 2000 });
      const pids = stdout.trim().split("\n").filter(Boolean);
      for (const pid of pids) {
        log.w("MLX", `Killing orphaned process on port ${port}`, { pid });
        await execAsync(`kill -9 ${pid}`, { timeout: 2000 });
      }
    } catch {
      // No process on port
    }
  }

  /**
   * Configure the manager
   */
  configure(config: Partial<MlxServerConfig>): void {
    this.config = { ...this.config, ...config };

    if (!config.port) {
      this.config.port = MLX_EMBEDDING_PORT;
    }

    log.i("MLX", "configured", {
      model: this.config.model,
      port: this.config.port,
      batchSize: this.config.batchSize,
    });
  }

  /**
   * Get current state
   */
  getState(): Readonly<MlxServerState> {
    return { ...this.state };
  }

  /**
   * Get endpoint URL
   */
  getEndpoint(): string {
    return `http://127.0.0.1:${this.config.port}`;
  }

  /**
   * Start the MLX embedding server
   */
  async start(): Promise<boolean> {
    if (this.state.isRunning) {
      log.i("MLX", "Already running", { pid: this.state.pid });
      return true;
    }

    // Prevent race condition: if another start() is in progress, wait for it
    if (this.state.isStarting) {
      log.i("MLX", "Start already in progress, waiting...");
      const maxWait = 300_000;
      const startWait = Date.now();
      while (this.state.isStarting && Date.now() - startWait < maxWait) {
        await sleep(500);
      }
      return this.state.isRunning;
    }

    this.state.isStarting = true;

    // Check platform
    if (!this.isAvailable()) {
      this.state.lastError = "MLX requires macOS ARM64 (Apple Silicon)";
      log.e("MLX", this.state.lastError);
      this.state.isStarting = false;
      return false;
    }

    // Debug: skip subprocess spawning if disabled
    if (process.env["ULTRACODE_NO_SUBPROCESS"] === "1") {
      log.w("MLX", "SKIPPED (ULTRACODE_NO_SUBPROCESS=1)");
      this.state.isStarting = false;
      return false;
    }

    const serverScript = this.getServerScript();
    if (!existsSync(serverScript)) {
      this.state.lastError = `MLX server script not found: ${serverScript}`;
      log.e("MLX", this.state.lastError);
      this.state.isStarting = false;
      return false;
    }

    try {
      // Setup venv and install dependencies
      const pythonPath = await this.findOrCreateVenv();
      await this.installDependencies(pythonPath);

      log.i("MLX", "Starting MLX embedding server", {
        python: pythonPath,
        model: this.config.model,
        port: this.config.port,
      });

      // Kill any orphaned processes on our port
      await this.killProcessOnPort(this.config.port!);
      await sleep(200);

      // Build command args
      const args = [
        serverScript,
        "--model",
        this.config.model,
        "--port",
        String(this.config.port),
        "--host",
        this.config.host || "127.0.0.1",
        "--batch-size",
        String(this.config.batchSize || 128),
      ];

      log.d("MLX", "Spawning process", { args: args.join(" ") });

      this.state.process = spawn(pythonPath, args, {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: dirname(serverScript),
      });

      const proc = this.state.process;
      if (!proc) {
        throw new Error("Failed to spawn MLX server process");
      }

      this.state.pid = proc.pid ?? null;
      this.state.startedAt = Date.now();
      this.state.model = this.config.model;

      // Handle stdout
      proc.stdout?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          log.d("MLX", `stdout: ${msg.slice(0, 300)}`);
        }
      });

      // Handle stderr
      proc.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          if (msg.includes("error") || msg.includes("Error") || msg.includes("ERROR")) {
            log.w("MLX", `stderr: ${msg.slice(0, 400)}`);
          } else if (msg.includes("Model ready") || msg.includes("Starting server")) {
            log.i("MLX", msg.slice(0, 200));
          } else {
            log.d("MLX", `stderr: ${msg.slice(0, 200)}`);
          }
        }
      });

      // Handle process exit
      proc.on("exit", (code, signal) => {
        log.i("MLX", "Process exited", { code, signal, pid: this.state.pid });
        this.state.isRunning = false;
        this.state.process = null;
        this.state.pid = null;
      });

      // Handle process error
      proc.on("error", (err) => {
        this.state.lastError = err.message;
        log.e("MLX", "Process error", { error: err.message });
        this.state.isRunning = false;
      });

      // Wait for server to be ready
      const ready = await this.waitForReady(this.config.startupTimeoutMs!);

      if (ready) {
        this.state.isRunning = true;
        this.state.isStarting = false;
        this.startHealthCheck();
        log.i("MLX", "Started successfully", {
          pid: this.state.pid,
          model: this.config.model,
          endpoint: this.getEndpoint(),
        });
        return true;
      } else {
        this.state.lastError = "Startup timeout";
        log.e("MLX", "Startup timeout - killing process");
        await this.stop();
        this.state.isStarting = false;
        return false;
      }
    } catch (error: unknown) {
      const err = toError(error);
      this.state.lastError = err.message;
      log.e("MLX", "Failed to start", { error: err.message });
      this.state.isStarting = false;
      return false;
    }
  }

  /**
   * Wait for MLX server to be ready
   */
  private async waitForReady(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.getEndpoint()}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          const elapsed = Date.now() - startTime;
          log.i("MLX", "Server ready", { elapsedMs: elapsed });
          return true;
        }
      } catch {
        // Server not ready yet
      }

      // Check if process exited
      if (this.state.process?.exitCode !== null && this.state.process?.exitCode !== undefined) {
        log.e("MLX", "Process exited during startup", { exitCode: this.state.process.exitCode });
        return false;
      }

      await sleep(checkInterval);
    }

    return false;
  }

  /**
   * Stop MLX server process
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
    log.i("MLX", "Stopping MLX server", { pid });

    return new Promise((resolve) => {
      const abortController = new AbortController();

      // Force kill timeout
      (async () => {
        await sleep(5000);
        if (!abortController.signal.aborted) {
          if (pid) {
            log.w("MLX", "Force killing process");
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              // Process already dead
            }
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
        log.i("MLX", "Stopped successfully");
        resolve();
      });

      this.state.process!.kill("SIGTERM");
    });
  }

  /**
   * Start health check loop
   */
  private startHealthCheck(): void {
    if (this.healthCheckRunning) return;
    this.healthCheckRunning = true;

    if (isBunRuntime()) return;

    const checkHealth = async () => {
      if (!this.healthCheckRunning || !this.state.isRunning) return;

      try {
        const response = await fetch(`${this.getEndpoint()}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });

        this.state.lastHealthCheck = Date.now();

        if (!response.ok) {
          log.w("MLX", "Health check failed", { status: response.status });
        }
      } catch (error: unknown) {
        const err = toError(error);
        log.w("MLX", "Health check error", { error: err.message });
      }
    };

    const interval = this.config.healthCheckIntervalMs ?? 30000;
    this.healthCheckTimer = setInterval(checkHealth, interval);
  }

  private stopHealthCheck(): void {
    this.healthCheckRunning = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Check if server is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.state.isRunning) return false;

    try {
      const response = await fetch(`${this.getEndpoint()}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ensure server is running with the given config
   */
  async ensureRunning(config: Partial<MlxServerConfig>): Promise<boolean> {
    const needsRestart =
      this.state.isRunning && (this.state.model !== config.model || this.config.port !== config.port);

    if (needsRestart) {
      log.i("MLX", "Config changed, restarting", {
        oldModel: this.state.model,
        newModel: config.model,
      });
      await this.stop();
    }

    if (!this.state.isRunning) {
      this.configure({ ...config, enabled: true });
      return this.start();
    }

    return true;
  }
}

// Singleton instance
export const mlxEmbeddingManager = new MlxServerManager();

/**
 * Initialize MLX embedding server
 */
export async function initializeMlxEmbedding(config: Partial<MlxServerConfig>): Promise<boolean> {
  if (!config.model) {
    config.model = "intfloat/multilingual-e5-base";
  }

  mlxEmbeddingManager.configure({
    ...config,
    port: config.port ?? MLX_EMBEDDING_PORT,
  });

  if (config.autoStart !== false) {
    return mlxEmbeddingManager.start();
  }

  return true;
}

/**
 * Shutdown MLX server
 */
export async function shutdownMlx(): Promise<void> {
  if (mlxEmbeddingManager.getState().isRunning) {
    await mlxEmbeddingManager.stop();
  }
}

// Synchronous kill for exit handlers
function killMlxSync(pid: number | null): void {
  if (!pid) return;

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Best effort
  }
}

// Register signal handlers
let signalHandlersRegistered = false;

function registerSignalHandlers(): void {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const shutdownHandler = async (signal: string) => {
    log.i("MLX", "signal_received", { signal });
    try {
      await shutdownMlx();
    } catch (error) {
      log.e("MLX", "shutdown_error", { signal, err: String(error) });
    }
  };

  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  if (process.platform !== "win32") {
    process.on("SIGHUP", () => shutdownHandler("SIGHUP"));
  }

  process.on("exit", () => {
    const state = mlxEmbeddingManager.getState();
    if (state.isRunning && state.pid) {
      killMlxSync(state.pid);
    }
  });

  process.on("beforeExit", async () => {
    await shutdownMlx();
  });

  log.d("MLX", "Signal handlers registered");
}

registerSignalHandlers();

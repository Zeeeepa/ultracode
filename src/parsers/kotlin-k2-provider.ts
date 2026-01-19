/**
 * Kotlin K2 Provider
 *
 * TypeScript client for kotlin-k2-cli (Kotlin Analysis API based parser).
 * Provides faster and more accurate Kotlin parsing than KLS with:
 * - Call graph extraction
 * - Better type resolution
 * - Faster startup (5-8s vs 20-35s for KLS)
 *
 * Communication via JSON Lines over stdin/stdout.
 *
 * Requirements:
 * - JDK 11+ for kotlin-k2-cli
 * - kotlin-k2-cli fat JAR (auto-downloaded if missing)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { log } from "../logging/index.js";
import { workerLog } from "../agents/workers/worker-logging.js";
import { getDataDir } from "../utils/config-paths.js";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const K2_CLI_VERSION = "1.0.0";
const K2_JAR_NAME = `kotlin-k2-cli-${K2_CLI_VERSION}-all.jar`;

// GitHub release URL for auto-download
const K2_RELEASES_API = "https://api.github.com/repos/RainbowScientist5/ultrascript-tools-mcp/releases";
const K2_DOWNLOAD_URL_TEMPLATE = "https://github.com/RainbowScientist5/ultrascript-tools-mcp/releases/download/k2-cli-v{VERSION}/kotlin-k2-cli-{VERSION}-all.jar";

// =============================================================================
// TYPES
// =============================================================================

interface K2Command {
  id: string;
  type: "parse" | "shutdown";
  filePath?: string;
  content?: string;
}

interface K2ParseResult {
  id: string;
  success: boolean;
  entities: K2Entity[];
  relationships: K2Relationship[];
  callGraph: K2CallEdge[];
  error?: string;
}

interface K2Entity {
  name: string;
  type: string;
  filePath: string;
  location: {
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };
  modifiers?: string[];
  parameters?: Array<{ name: string; type?: string; optional?: boolean; defaultValue?: string }>;
  returnType?: string;
  superTypes?: string[];
  documentation?: string;
  children?: K2Entity[];
}

interface K2Relationship {
  from: string;
  to: string;
  type: string;
  metadata?: Record<string, string>;
}

interface K2CallEdge {
  from?: string;
  to?: string;
  line: number;
}

// =============================================================================
// K2 PROVIDER
// =============================================================================

/**
 * Error thrown when K2 CLI fails due to incompatible Java version.
 */
export class K2JavaVersionError extends Error {
  constructor(
    public readonly javaVersion: string,
    public readonly javaHome: string | undefined,
  ) {
    super(`kotlin-k2-cli requires Java 11+, found Java ${javaVersion}`);
    this.name = "K2JavaVersionError";
  }
}

export class KotlinK2Provider {
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private pendingRequests: Map<string, { resolve: (value: K2ParseResult) => void; reject: (error: Error) => void }> =
    new Map();
  private ready = false;
  private k2JarPath: string | null = null;
  private javaHome: string | undefined;
  private javaPath: string;

  constructor(javaPath: string) {
    this.javaPath = javaPath;
    // Derive JAVA_HOME from javaPath
    if (javaPath) {
      const binDir = dirname(javaPath);
      if (binDir.toLowerCase().endsWith("bin")) {
        this.javaHome = dirname(binDir);
      }
    }
  }

  /**
   * Get or download kotlin-k2-cli JAR
   */
  private async getK2JarPath(): Promise<string> {
    if (this.k2JarPath) return this.k2JarPath;

    const targetDir = join(getDataDir(), "kotlin-k2");
    const jarPath = join(targetDir, K2_JAR_NAME);
    const versionFile = join(targetDir, "version.txt");

    mkdirSync(targetDir, { recursive: true });

    // Check if JAR exists with correct version
    if (existsSync(jarPath) && existsSync(versionFile)) {
      try {
        const { readFileSync } = await import("node:fs");
        const cachedVersion = readFileSync(versionFile, "utf-8").trim();
        if (cachedVersion === K2_CLI_VERSION) {
          this.k2JarPath = jarPath;
          log.d("KOTLINK2", "found_jar", { path: jarPath, ver: K2_CLI_VERSION });
          workerLog("INFO", "KOTLINK2 found_jar", { path: jarPath, ver: K2_CLI_VERSION });
          return jarPath;
        }
      } catch {
        // Version file read error, will re-download
      }
    }

    // Check if JAR exists in project build directory (local development)
    const projectJarPath = join(process.cwd(), "kotlin-k2-cli", "build", "libs", K2_JAR_NAME);
    if (existsSync(projectJarPath)) {
      // Copy to data dir for future use
      const { copyFileSync } = await import("node:fs");
      copyFileSync(projectJarPath, jarPath);
      writeFileSync(versionFile, K2_CLI_VERSION, "utf-8");
      this.k2JarPath = jarPath;
      log.d("KOTLINK2", "copied_jar", { from: projectJarPath, to: jarPath });
      workerLog("INFO", "KOTLINK2 copied_jar", { path: jarPath });
      return jarPath;
    }

    // Try to download from GitHub Releases
    try {
      log.i("KOTLINK2", "downloading_jar", { ver: K2_CLI_VERSION });
      workerLog("INFO", "KOTLINK2 downloading_jar", { ver: K2_CLI_VERSION });
      await this.downloadK2Jar(jarPath, versionFile);
      this.k2JarPath = jarPath;
      return jarPath;
    } catch (downloadError) {
      log.w("KOTLINK2", "download_failed", { err: String(downloadError) });
      workerLog("WARN", "KOTLINK2 download_failed", { err: String(downloadError) });

      // Provide helpful error message
      throw new Error(
        `K2 CLI JAR not found and download failed.\n` +
          `Error: ${downloadError}\n\n` +
          `Options:\n` +
          `1. Build locally: cd kotlin-k2-cli && gradle fatJar\n` +
          `2. Download manually from GitHub Releases\n` +
          `Expected path: ${jarPath}`,
      );
    }
  }

  /**
   * Download K2 CLI JAR from GitHub Releases
   */
  private async downloadK2Jar(jarPath: string, versionFile: string): Promise<void> {
    const downloadUrl = K2_DOWNLOAD_URL_TEMPLATE
      .replace(/{VERSION}/g, K2_CLI_VERSION);

    log.d("KOTLINK2", "download_start", { url: downloadUrl });
    workerLog("INFO", "KOTLINK2 download_start", { url: downloadUrl });

    const response = await fetch(downloadUrl, {
      headers: { "User-Agent": "ultrascript-tools-mcp" },
    });

    if (!response.ok) {
      // Try to find latest release if specific version not found
      if (response.status === 404) {
        const latestUrl = await this.findLatestK2Release();
        if (latestUrl) {
          return this.downloadFromUrl(latestUrl, jarPath, versionFile);
        }
      }
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await this.downloadFromUrl(downloadUrl, jarPath, versionFile);
  }

  /**
   * Find latest K2 CLI release from GitHub API
   */
  private async findLatestK2Release(): Promise<string | null> {
    try {
      const response = await fetch(K2_RELEASES_API, {
        headers: { "User-Agent": "ultrascript-tools-mcp" },
      });

      if (!response.ok) return null;

      const releases = (await response.json()) as Array<{
        tag_name: string;
        assets: Array<{ name: string; browser_download_url: string }>;
      }>;

      // Find first release with k2-cli tag
      for (const release of releases) {
        if (release.tag_name.startsWith("k2-cli-v")) {
          const jarAsset = release.assets.find((a) => a.name.endsWith("-all.jar"));
          if (jarAsset) {
            log.d("KOTLINK2", "found_release", { tag: release.tag_name });
            return jarAsset.browser_download_url;
          }
        }
      }
    } catch (err) {
      log.w("KOTLINK2", "releases_api_fail", { err: String(err) });
    }

    return null;
  }

  /**
   * Download file from URL to path
   */
  private async downloadFromUrl(url: string, jarPath: string, versionFile: string): Promise<void> {
    const response = await fetch(url, {
      headers: { "User-Agent": "ultrascript-tools-mcp" },
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const tempPath = jarPath + ".tmp";

    try {
      const fileStream = createWriteStream(tempPath);
      // @ts-ignore - Node 18+ has Readable.fromWeb
      await finished(Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(fileStream));

      // Rename temp to final
      const { renameSync } = await import("node:fs");
      renameSync(tempPath, jarPath);

      // Save version
      writeFileSync(versionFile, K2_CLI_VERSION, "utf-8");

      log.i("KOTLINK2", "download_done", { path: jarPath });
      workerLog("INFO", "KOTLINK2 download_done", { path: jarPath });
    } finally {
      // Cleanup temp file on error
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Start the K2 CLI process
   */
  async start(): Promise<void> {
    const startTime = Date.now();

    if (this.process) {
      log.w("KOTLINK2", "already_started");
      return;
    }

    const jarPath = await this.getK2JarPath();
    const getJarTime = Date.now() - startTime;

    log.d("KOTLINK2", "start_process", { jar: jarPath, javaHome: this.javaHome });
    workerLog("INFO", "KOTLINK2 start_process", { jar: jarPath, javaHome: this.javaHome, getJarMs: getJarTime });

    // Set JAVA_HOME if provided
    const env = { ...process.env };
    if (this.javaHome) {
      env["JAVA_HOME"] = this.javaHome;
    }

    // JVM optimization flags for faster startup
    const jvmOpts = "-Xms256m -Xmx1g -XX:TieredStopAtLevel=1 -XX:+UseParallelGC";

    const spawnStartTime = Date.now();
    this.process = spawn(
      this.javaPath,
      [
        ...jvmOpts.split(" "),
        "-jar",
        jarPath,
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env,
      },
    );

    const spawnTime = Date.now() - spawnStartTime;
    workerLog("INFO", "KOTLINK2 process_spawned", { pid: this.process.pid, spawnMs: spawnTime });

    // Handle stdout (JSON Lines responses)
    this.readline = createInterface({ input: this.process.stdout! });

    let firstOutputLogged = false;
    this.readline.on("line", (line) => {
      if (!firstOutputLogged) {
        firstOutputLogged = true;
        workerLog("INFO", "KOTLINK2 first_stdout", { afterSpawnMs: Date.now() - spawnStartTime });
      }

      if (!line.trim()) return;

      try {
        const result = JSON.parse(line) as K2ParseResult;
        const pending = this.pendingRequests.get(result.id);
        if (pending) {
          this.pendingRequests.delete(result.id);
          if (result.success) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(result.error || "Parse failed"));
          }
        }
      } catch (e) {
        log.w("KOTLINK2", "parse_response_error", { err: String(e), line: line.slice(0, 200) });
      }
    });

    // Handle stderr (logs)
    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        log.d("KOTLINK2", "stderr", { msg: msg.slice(0, 300) });
        workerLog("DEBUG", "KOTLINK2 stderr", { msg: msg.slice(0, 300) });
      }
    });

    this.process.on("error", (error) => {
      log.e("KOTLINK2", "process_error", { err: error.message });
      this.ready = false;
      this.cleanup();
    });

    this.process.on("close", (code) => {
      log.d("KOTLINK2", "process_close", { code });
      workerLog("DEBUG", "KOTLINK2 process closed", { code });
      this.ready = false;

      // Reject all pending requests
      const error = new Error(`K2 process exited with code ${code}`);
      for (const [, pending] of this.pendingRequests) {
        pending.reject(error);
      }
      this.pendingRequests.clear();
      this.cleanup();
    });

    // Wait for process to be ready
    await this.waitForReady();
  }

  /**
   * Wait for K2 CLI to initialize
   */
  private async waitForReady(): Promise<void> {
    // K2 CLI prints to stderr when ready
    // We can test with a simple parse request
    const testContent = "package test\nclass Test";

    try {
      await this.sendCommand({
        id: "init-test",
        type: "parse",
        filePath: "test.kt",
        content: testContent,
      });

      this.ready = true;
      log.i("KOTLINK2", "ready");
      workerLog("INFO", "KOTLINK2 ready");
    } catch (e) {
      log.e("KOTLINK2", "init_failed", { err: String(e) });
      throw e;
    }
  }

  /**
   * Send command to K2 CLI and wait for response
   */
  private async sendCommand(cmd: K2Command, timeout = 30000): Promise<K2ParseResult> {
    if (!this.process?.stdin) {
      throw new Error("K2 CLI not running");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(cmd.id);
        reject(new Error(`K2 request timeout: ${cmd.type}`));
      }, timeout);

      this.pendingRequests.set(cmd.id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      const line = JSON.stringify(cmd) + "\n";
      this.process!.stdin!.write(line);
    });
  }

  /**
   * Parse a Kotlin file
   */
  async parse(
    filePath: string,
    content: string,
  ): Promise<{ entities: ParsedEntity[]; relationships: EntityRelationship[]; callGraph: K2CallEdge[] }> {
    if (!this.ready) {
      throw new Error("K2 CLI not ready");
    }

    const id = `parse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await this.sendCommand({
      id,
      type: "parse",
      filePath,
      content,
    });

    return {
      entities: this.convertEntities(result.entities, filePath),
      relationships: this.convertRelationships(result.relationships),
      callGraph: result.callGraph,
    };
  }

  /**
   * Convert K2 entities to ParsedEntity format
   */
  private convertEntities(k2Entities: K2Entity[], filePath: string): ParsedEntity[] {
    const convert = (entity: K2Entity): ParsedEntity => {
      const result: ParsedEntity = {
        name: entity.name,
        type: this.mapEntityType(entity.type),
        filePath,
        location: entity.location,
      };

      if (entity.modifiers?.length) {
        result.modifiers = entity.modifiers;
      }

      if (entity.parameters?.length) {
        result.parameters = entity.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          optional: p.optional,
          defaultValue: p.defaultValue,
        }));
      }

      if (entity.returnType) {
        result.returnType = entity.returnType;
      }

      if (entity.documentation) {
        result.documentation = {
          description: entity.documentation,
        };
      }

      if (entity.superTypes?.length) {
        result.inheritance = {
          baseClasses: entity.superTypes.slice(0, 1),
          interfaces: entity.superTypes.slice(1),
          isAbstract: entity.modifiers?.includes("abstract") ?? false,
        };
      }

      if (entity.children?.length) {
        result.children = entity.children.map(convert);
      }

      return result;
    };

    return k2Entities.map(convert);
  }

  /**
   * Map K2 entity type to ParsedEntity type
   */
  private mapEntityType(k2Type: string): ParsedEntity["type"] {
    const typeMap: Record<string, ParsedEntity["type"]> = {
      class: "class",
      interface: "interface",
      enum: "enum",
      object: "class",
      function: "function",
      method: "method",
      async_function: "async_function",
      property: "property",
      constant: "constant",
      field: "field",
      import: "import",
      module: "module",
      type: "type",
      enum_variant: "enum_variant",
    };

    return typeMap[k2Type] || "variable";
  }

  /**
   * Convert K2 relationships to EntityRelationship format
   */
  private convertRelationships(k2Relationships: K2Relationship[]): EntityRelationship[] {
    return k2Relationships.map((rel) => ({
      from: rel.from,
      to: rel.to,
      type: rel.type as EntityRelationship["type"],
      metadata: rel.metadata,
    }));
  }

  /**
   * Check if K2 CLI is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Stop the K2 CLI process
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    log.d("KOTLINK2", "stop");

    try {
      // Send shutdown command
      await this.sendCommand({ id: "shutdown", type: "shutdown" }, 5000);
    } catch {
      // Force kill if graceful shutdown fails
      this.process.kill("SIGKILL");
    }

    this.cleanup();
  }

  private cleanup(): void {
    this.readline?.close();
    this.readline = null;
    this.process = null;
    this.ready = false;
    this.pendingRequests.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let providerInstance: KotlinK2Provider | null = null;
let initializationPromise: Promise<KotlinK2Provider> | null = null;

/**
 * Get or create Kotlin K2 provider instance
 */
export async function getKotlinK2Provider(javaPath: string): Promise<KotlinK2Provider> {
  // If already initialized, return immediately
  if (providerInstance?.isReady()) {
    workerLog("DEBUG", "KOTLINK2 getProvider: already ready, returning cached");
    return providerInstance;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    workerLog("DEBUG", "KOTLINK2 getProvider: init in progress, waiting...");
    return initializationPromise;
  }

  // Start initialization
  workerLog("DEBUG", "KOTLINK2 getProvider: starting new initialization");
  initializationPromise = (async () => {
    providerInstance = new KotlinK2Provider(javaPath);
    workerLog("DEBUG", "KOTLINK2 getProvider: calling start()");
    await providerInstance.start();
    workerLog("DEBUG", "KOTLINK2 getProvider: start() completed", { ready: providerInstance.isReady() });
    return providerInstance;
  })();

  try {
    return await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

/**
 * Stop and cleanup Kotlin K2 provider
 */
export async function stopKotlinK2Provider(): Promise<void> {
  initializationPromise = null;
  if (providerInstance) {
    await providerInstance.stop();
    providerInstance = null;
  }
}

/**
 * Check if Kotlin K2 provider is available and ready
 */
export function isKotlinK2Ready(): boolean {
  return providerInstance?.isReady() ?? false;
}

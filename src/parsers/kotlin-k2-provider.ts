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

import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { workerLog } from "../agents/workers/worker-logging.js";
import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";
import { getDataDir } from "../utils/config-paths.js";
import { sleep } from "../utils/runtime-detection.js";

// =============================================================================
// CONSTANTS
// =============================================================================

// Fallback K2 CLI version (used when no local JAR and API unavailable)
const K2_CLI_VERSION = "1.1.0";

// GitHub releases API for version checking
const K2_RELEASES_API = "https://api.github.com/repos/faxenoff/ultracode/releases";

// Cache for latest version check (avoid repeated API calls)
let latestVersionCache: { version: string; url: string; checkedAt: number } | null = null;
const VERSION_CHECK_INTERVAL_MS = 3600000; // 1 hour

// Flag to prevent multiple background updates
let backgroundUpdateInProgress = false;

// =============================================================================
// VERSION CHECKING
// =============================================================================

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

/**
 * Parse version from tag (e.g., "k2-cli-v1.1.0" → "1.1.0")
 */
function parseVersionFromTag(tag: string): string | null {
  const match = tag.match(/k2-cli-v(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

/**
 * Compare semantic versions. Returns:
 *  1 if a > b
 *  0 if a == b
 * -1 if a < b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Check GitHub releases for latest K2 CLI version
 * Returns null if check fails or no releases found
 */
async function checkLatestVersion(): Promise<{ version: string; url: string } | null> {
  // Use cache if recent
  if (latestVersionCache && Date.now() - latestVersionCache.checkedAt < VERSION_CHECK_INTERVAL_MS) {
    return { version: latestVersionCache.version, url: latestVersionCache.url };
  }

  try {
    const response = await fetch(K2_RELEASES_API, {
      headers: {
        "User-Agent": "ultracode",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      log.d("KOTLINK2", "releases_api_error", { status: response.status });
      return null;
    }

    const releases = (await response.json()) as ReleaseInfo[];

    // Find latest k2-cli release
    for (const release of releases) {
      const version = parseVersionFromTag(release.tag_name);
      if (!version) continue;

      const jarAsset = release.assets.find((a) => a.name.endsWith("-all.jar") && a.name.includes("kotlin-k2-cli"));
      if (jarAsset) {
        latestVersionCache = {
          version,
          url: jarAsset.browser_download_url,
          checkedAt: Date.now(),
        };
        log.d("KOTLINK2", "found_latest_release", { version, tag: release.tag_name });
        return { version, url: jarAsset.browser_download_url };
      }
    }

    log.d("KOTLINK2", "no_k2_releases_found");
    return null;
  } catch (err) {
    log.d("KOTLINK2", "version_check_failed", { err: String(err) });
    return null;
  }
}

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
   * Uses file-based locking to prevent multiple workers from downloading simultaneously
   *
   * Version check logic:
   * - If local JAR exists → use immediately, check for updates in background
   * - If no local JAR → download latest from GitHub releases
   */
  private async getK2JarPath(): Promise<string> {
    if (this.k2JarPath) return this.k2JarPath;

    const targetDir = join(getDataDir(), "kotlin-k2");
    const lockFile = join(targetDir, "downloading.lock");

    mkdirSync(targetDir, { recursive: true });

    // Check if any JAR exists locally (regardless of version)
    const localJar = await this.findLocalJar(targetDir);

    if (localJar) {
      // Use local JAR immediately
      this.k2JarPath = localJar.path;
      log.d("KOTLINK2", "found_local_jar", { path: localJar.path, ver: localJar.version });
      workerLog("INFO", "KOTLINK2 found_local_jar", { path: localJar.path, ver: localJar.version });

      // Check for updates in background (non-blocking)
      this.checkForUpdatesInBackground(targetDir, localJar.version);

      return localJar.path;
    }

    // No local JAR found - need to download
    // First check if another worker is already downloading
    if (existsSync(lockFile)) {
      workerLog("INFO", "KOTLINK2 waiting_for_download", { lockFile });
      await this.waitForDownloadAny(targetDir, lockFile);
      const downloaded = await this.findLocalJar(targetDir);
      if (downloaded) {
        this.k2JarPath = downloaded.path;
        workerLog("INFO", "KOTLINK2 download_completed_by_other", { path: downloaded.path });
        return downloaded.path;
      }
    }

    // Check if JAR exists in project build directory (local development)
    const projectJar = await this.findProjectBuildJar();
    if (projectJar) {
      const jarPath = join(targetDir, `kotlin-k2-cli-${projectJar.version}-all.jar`);
      const versionFile = join(targetDir, "version.txt");
      const { copyFileSync } = await import("node:fs");
      copyFileSync(projectJar.path, jarPath);
      writeFileSync(versionFile, projectJar.version, "utf-8");
      this.k2JarPath = jarPath;
      log.d("KOTLINK2", "copied_jar", { from: projectJar.path, to: jarPath });
      workerLog("INFO", "KOTLINK2 copied_jar", { path: jarPath });
      return jarPath;
    }

    // Try to acquire lock and download
    try {
      const { openSync, closeSync } = await import("node:fs");
      const fd = openSync(lockFile, "wx");
      closeSync(fd);
    } catch {
      workerLog("INFO", "KOTLINK2 lock_exists_waiting", { lockFile });
      await this.waitForDownloadAny(targetDir, lockFile);
      const downloaded = await this.findLocalJar(targetDir);
      if (downloaded) {
        this.k2JarPath = downloaded.path;
        return downloaded.path;
      }
      throw new Error("Download by another worker failed");
    }

    // We have the lock - download latest version
    try {
      const latest = await checkLatestVersion();
      if (!latest) {
        throw new Error("Cannot determine latest K2 CLI version from GitHub releases");
      }

      const jarPath = join(targetDir, `kotlin-k2-cli-${latest.version}-all.jar`);
      const versionFile = join(targetDir, "version.txt");

      log.i("KOTLINK2", "downloading_jar", { ver: latest.version });
      workerLog("INFO", "KOTLINK2 downloading_jar", { ver: latest.version, url: latest.url });
      await this.downloadFromUrl(latest.url, jarPath, versionFile, latest.version);
      this.k2JarPath = jarPath;
      return jarPath;
    } catch (downloadError) {
      log.w("KOTLINK2", "download_failed", { err: String(downloadError) });
      workerLog("WARN", "KOTLINK2 download_failed", { err: String(downloadError) });

      throw new Error(
        `K2 CLI JAR not found and download failed.\n` +
          `Error: ${downloadError}\n\n` +
          `Options:\n` +
          `1. Build locally: cd kotlin-k2-cli && ./gradlew fatJar\n` +
          `2. Download manually from GitHub Releases\n` +
          `Expected directory: ${targetDir}`,
      );
    } finally {
      try {
        unlinkSync(lockFile);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Find any K2 CLI JAR in the target directory
   */
  private async findLocalJar(targetDir: string): Promise<{ path: string; version: string } | null> {
    const versionFile = join(targetDir, "version.txt");

    // First try to read version from version.txt
    if (existsSync(versionFile)) {
      try {
        const { readFileSync } = await import("node:fs");
        const version = readFileSync(versionFile, "utf-8").trim();
        const jarPath = join(targetDir, `kotlin-k2-cli-${version}-all.jar`);
        if (existsSync(jarPath)) {
          return { path: jarPath, version };
        }
      } catch {
        // Fall through to scan directory
      }
    }

    // Scan directory for any JAR
    try {
      const { readdirSync } = await import("node:fs");
      const files = readdirSync(targetDir);
      for (const file of files) {
        const match = file.match(/^kotlin-k2-cli-(\d+\.\d+\.\d+)-all\.jar$/);
        if (match?.[1]) {
          return { path: join(targetDir, file), version: match[1] };
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return null;
  }

  /**
   * Find JAR in project build directory (local development)
   */
  private async findProjectBuildJar(): Promise<{ path: string; version: string } | null> {
    try {
      const { readdirSync } = await import("node:fs");
      const libsDir = join(process.cwd(), "kotlin-k2-cli", "build", "libs");
      if (!existsSync(libsDir)) return null;

      const files = readdirSync(libsDir);
      for (const file of files) {
        const match = file.match(/^kotlin-k2-cli-(\d+\.\d+\.\d+)-all\.jar$/);
        if (match?.[1]) {
          return { path: join(libsDir, file), version: match[1] };
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return null;
  }

  /**
   * Check for updates in background (non-blocking)
   */
  private checkForUpdatesInBackground(targetDir: string, currentVersion: string): void {
    if (backgroundUpdateInProgress) return;

    backgroundUpdateInProgress = true;

    // Run in background, don't await
    (async () => {
      try {
        const latest = await checkLatestVersion();
        if (!latest) {
          log.d("KOTLINK2", "no_updates_available");
          return;
        }

        if (compareVersions(latest.version, currentVersion) > 0) {
          log.i("KOTLINK2", "new_version_available", { current: currentVersion, latest: latest.version });
          workerLog("INFO", "KOTLINK2 new_version_available", { current: currentVersion, latest: latest.version });

          // Download in background
          const jarPath = join(targetDir, `kotlin-k2-cli-${latest.version}-all.jar`);
          const versionFile = join(targetDir, "version.txt");

          if (!existsSync(jarPath)) {
            log.i("KOTLINK2", "background_download_start", { ver: latest.version });
            await this.downloadFromUrl(latest.url, jarPath, versionFile, latest.version);
            log.i("KOTLINK2", "background_download_done", { ver: latest.version });
            workerLog("INFO", "KOTLINK2 background_download_done. Restart to use new version.", {
              ver: latest.version,
            });
          }
        } else {
          log.d("KOTLINK2", "version_is_current", { current: currentVersion });
        }
      } catch (err) {
        log.d("KOTLINK2", "background_update_failed", { err: String(err) });
      } finally {
        backgroundUpdateInProgress = false;
      }
    })();
  }

  /**
   * Wait for another worker to complete download (any JAR version)
   */
  private async waitForDownloadAny(targetDir: string, lockFile: string, timeoutMs = 120000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      // Check if any JAR appeared
      const jar = await this.findLocalJar(targetDir);
      if (jar) {
        return;
      }
      // Check if lock was released (download failed)
      if (!existsSync(lockFile)) {
        return;
      }
      // Wait and retry
      await sleep(pollInterval);
    }

    workerLog("WARN", "KOTLINK2 wait_timeout", { elapsed: Date.now() - startTime });
  }

  /**
   * Download file from URL to path
   */
  private async downloadFromUrl(url: string, jarPath: string, versionFile: string, version?: string): Promise<void> {
    const response = await fetch(url, {
      headers: { "User-Agent": "ultracode" },
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const tempPath = jarPath + ".tmp";

    try {
      const fileStream = createWriteStream(tempPath);
      await finished(Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(fileStream));

      // Rename temp to final
      const { renameSync } = await import("node:fs");
      renameSync(tempPath, jarPath);

      // Save version
      const versionToSave = version ?? K2_CLI_VERSION;
      writeFileSync(versionFile, versionToSave, "utf-8");

      log.i("KOTLINK2", "download_done", { path: jarPath, ver: versionToSave });
      workerLog("INFO", "KOTLINK2 download_done", { path: jarPath, ver: versionToSave });
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
    this.process = spawn(this.javaPath, [...jvmOpts.split(" "), "-jar", jarPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

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
        language: "kotlin",
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

/**
 * JVM Detection Utility
 *
 * Detects Java Virtual Machine (JVM) installation on the system.
 * Used by kotlin-native-parser to enable kotlin-language-server integration.
 *
 * Detection order:
 * 1. JAVA_HOME environment variable
 * 2. java command in PATH
 * 3. Common installation directories (Windows, macOS, Linux)
 *
 * Requirements:
 * - JDK 11+ for kotlin-language-server
 */

import { exec, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { workerLog } from "../agents/workers/worker-logging.js";
import { log } from "../logging/index.js";
import { ensureConfigDir, getParserConfigPath } from "./config-paths.js";

const execAsync = promisify(exec);

// =============================================================================
// TYPES
// =============================================================================

export interface JvmInfo {
  javaPath: string;
  version: string;
  majorVersion: number;
  vendor: string;
  isJdk: boolean;
}

// =============================================================================
// DETECTION
// =============================================================================

let cachedJvmInfo: JvmInfo | null | undefined;

/**
 * Detect JVM installation on the system.
 * Returns null if JVM is not found.
 * Caches result for subsequent calls.
 */
export async function detectJvm(): Promise<JvmInfo | null> {
  // Return cached result if available
  if (cachedJvmInfo !== undefined) {
    workerLog("DEBUG", "JVMDETECT cached", { found: !!cachedJvmInfo });
    return cachedJvmInfo;
  }

  log.d("JVMDETECT", "start");
  workerLog("INFO", "JVMDETECT start");

  // Try JAVA_HOME first
  const javaHome = process.env["JAVA_HOME"];
  workerLog("DEBUG", "JVMDETECT checking JAVA_HOME", { javaHome: javaHome || "(not set)" });
  if (javaHome) {
    const javaPath = getJavaExecutable(javaHome);
    workerLog("DEBUG", "JVMDETECT JAVA_HOME executable", { path: javaPath });
    if (javaPath) {
      const info = await getJvmInfo(javaPath);
      workerLog("DEBUG", "JVMDETECT JAVA_HOME info", {
        info: info ? { ver: info.version, major: info.majorVersion } : null,
      });
      if (info) {
        log.i("JVMDETECT", "found_java_home", { path: javaPath, ver: info.version });
        workerLog("INFO", "JVMDETECT found_java_home", { path: javaPath, ver: info.version, major: info.majorVersion });
        cachedJvmInfo = info;
        return info;
      }
    }
  }

  // Try java in PATH
  workerLog("DEBUG", "JVMDETECT checking PATH...");
  const pathJava = await findJavaInPath();
  workerLog("DEBUG", "JVMDETECT PATH result", { path: pathJava });
  if (pathJava) {
    const info = await getJvmInfo(pathJava);
    workerLog("DEBUG", "JVMDETECT PATH info", { info: info ? { ver: info.version, major: info.majorVersion } : null });
    if (info) {
      log.i("JVMDETECT", "found_in_path", { path: pathJava, ver: info.version });
      workerLog("INFO", "JVMDETECT found_in_path", { path: pathJava, ver: info.version, major: info.majorVersion });
      cachedJvmInfo = info;
      return info;
    }
  }

  // Try common installation directories
  const commonPaths = getCommonJavaPaths();
  workerLog("DEBUG", "JVMDETECT checking common paths", { count: commonPaths.length });
  for (const dir of commonPaths) {
    const javaPath = getJavaExecutable(dir);
    if (javaPath) {
      const info = await getJvmInfo(javaPath);
      if (info) {
        log.i("JVMDETECT", "found_common", { path: javaPath, ver: info.version });
        workerLog("INFO", "JVMDETECT found_common", { path: javaPath, ver: info.version, major: info.majorVersion });
        cachedJvmInfo = info;
        return info;
      }
    }
  }

  log.w("JVMDETECT", "not_found");
  workerLog("WARN", "JVMDETECT not_found");
  cachedJvmInfo = null;
  return null;
}

/**
 * Synchronous version of detectJvm.
 * Uses cached result if available.
 */
export function detectJvmSync(): JvmInfo | null {
  if (cachedJvmInfo !== undefined) {
    return cachedJvmInfo;
  }

  // Try JAVA_HOME first
  const javaHome = process.env["JAVA_HOME"];
  if (javaHome) {
    const javaPath = getJavaExecutable(javaHome);
    if (javaPath) {
      const info = getJvmInfoSync(javaPath);
      if (info) {
        cachedJvmInfo = info;
        return info;
      }
    }
  }

  // Try java in PATH (sync)
  const pathJava = findJavaInPathSync();
  if (pathJava) {
    const info = getJvmInfoSync(pathJava);
    if (info) {
      cachedJvmInfo = info;
      return info;
    }
  }

  cachedJvmInfo = null;
  return null;
}

/**
 * Check if JVM version meets minimum requirement.
 */
export function isJvmVersionSupported(info: JvmInfo, minMajorVersion: number = 11): boolean {
  return info.majorVersion >= minMajorVersion;
}

/**
 * Check if JVM version is within a supported range.
 * Used by kotlin-language-server which requires Java 11-24 (Java 25+ not supported).
 */
export function isJvmVersionInRange(info: JvmInfo, minMajorVersion: number, maxMajorVersion: number): boolean {
  return info.majorVersion >= minMajorVersion && info.majorVersion <= maxMajorVersion;
}

/**
 * Maximum Java version supported by kotlin-language-server.
 * KLS uses IntelliJ platform libraries that don't support Java 25+.
 */
export const KLS_MAX_JAVA_VERSION = 24;

// =============================================================================
// PERSISTENT CACHE
// =============================================================================

interface ParserConfig {
  klsJavaPath?: string;
  klsJavaVersion?: string;
  klsJavaMajorVersion?: number;
  lastUpdated?: string;
}

/**
 * Load cached KLS-compatible JVM path from config.
 * Returns null if no cached path or if the path is no longer valid.
 */
function loadCachedKlsJvmPath(): JvmInfo | null {
  try {
    const configPath = getParserConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }

    const content = readFileSync(configPath, "utf-8");
    const config: ParserConfig = JSON.parse(content);

    if (!config.klsJavaPath || !existsSync(config.klsJavaPath)) {
      workerLog("DEBUG", "JVMDETECT cached path invalid or missing", { path: config.klsJavaPath });
      return null;
    }

    // Verify the cached JVM still works and is still compatible
    const info = getJvmInfoSync(config.klsJavaPath);
    if (!info) {
      workerLog("DEBUG", "JVMDETECT cached JVM no longer works", { path: config.klsJavaPath });
      return null;
    }

    // Check version is still in range (in case KLS_MAX_JAVA_VERSION changes)
    if (!isJvmVersionInRange(info, KLS_MIN_JAVA_VERSION, KLS_MAX_JAVA_VERSION)) {
      workerLog("DEBUG", "JVMDETECT cached JVM version out of range", {
        path: config.klsJavaPath,
        ver: info.version,
        major: info.majorVersion,
      });
      return null;
    }

    workerLog("INFO", "JVMDETECT using cached KLS JVM", {
      path: info.javaPath,
      ver: info.version,
      cached: config.lastUpdated,
    });
    return info;
  } catch (err) {
    workerLog("DEBUG", "JVMDETECT cache read error", { err: String(err) });
    return null;
  }
}

/**
 * Save successful KLS-compatible JVM path to config for future use.
 */
function saveCachedKlsJvmPath(info: JvmInfo): void {
  try {
    ensureConfigDir();
    const configPath = getParserConfigPath();

    // Load existing config or create new
    let config: ParserConfig = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        // Ignore parse errors, start fresh
      }
    }

    // Update KLS JVM cache
    config.klsJavaPath = info.javaPath;
    config.klsJavaVersion = info.version;
    config.klsJavaMajorVersion = info.majorVersion;
    config.lastUpdated = new Date().toISOString();

    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    workerLog("INFO", "JVMDETECT cached KLS JVM path", { path: info.javaPath, ver: info.version });
    log.i("JVMDETECT", "cached_kls_jvm", { path: info.javaPath, ver: info.version });
  } catch (err) {
    workerLog("WARN", "JVMDETECT cache write error", { err: String(err) });
  }
}

/**
 * Clear cached KLS JVM path (e.g., when user wants to re-detect).
 */
export function clearCachedKlsJvmPath(): void {
  try {
    const configPath = getParserConfigPath();
    if (!existsSync(configPath)) {
      return;
    }

    const config: ParserConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    delete config.klsJavaPath;
    delete config.klsJavaVersion;
    delete config.klsJavaMajorVersion;
    delete config.lastUpdated;

    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    workerLog("INFO", "JVMDETECT cleared KLS JVM cache");
  } catch {
    // Ignore errors
  }
}

/**
 * Minimum Java version for kotlin-language-server.
 */
export const KLS_MIN_JAVA_VERSION = 11;

/**
 * Find a compatible JVM for kotlin-language-server.
 * Checks persistent cache first, then default JVM, then scans for alternatives.
 * Returns the best compatible version (highest version in range 11-24).
 */
export async function detectCompatibleJvmForKls(): Promise<JvmInfo | null> {
  workerLog("INFO", "JVMDETECT searching compatible JVM for KLS", {
    minVer: KLS_MIN_JAVA_VERSION,
    maxVer: KLS_MAX_JAVA_VERSION,
  });

  // Check persistent cache first (fast path for subsequent runs)
  const cachedJvm = loadCachedKlsJvmPath();
  if (cachedJvm) {
    return cachedJvm;
  }

  // Try default JVM detection
  const defaultJvm = await detectJvm();

  if (defaultJvm && isJvmVersionInRange(defaultJvm, KLS_MIN_JAVA_VERSION, KLS_MAX_JAVA_VERSION)) {
    workerLog("INFO", "JVMDETECT default JVM compatible", { ver: defaultJvm.version });
    saveCachedKlsJvmPath(defaultJvm);
    return defaultJvm;
  }

  if (defaultJvm) {
    workerLog("INFO", "JVMDETECT default JVM incompatible, scanning for alternatives", {
      ver: defaultJvm.version,
      major: defaultJvm.majorVersion,
    });
  }

  // Scan for all installed Java versions
  const allJvms = await findAllInstalledJvms();

  // Filter compatible versions and sort by version (prefer highest)
  const compatibleJvms = allJvms
    .filter((jvm) => isJvmVersionInRange(jvm, KLS_MIN_JAVA_VERSION, KLS_MAX_JAVA_VERSION))
    .sort((a, b) => b.majorVersion - a.majorVersion);

  if (compatibleJvms.length > 0) {
    const best = compatibleJvms[0]!;
    saveCachedKlsJvmPath(best); // Cache successful result
    workerLog("INFO", "JVMDETECT found compatible JVM", {
      ver: best.version,
      path: best.javaPath,
      alternatives: compatibleJvms.length,
    });
    return best;
  }

  workerLog("WARN", "JVMDETECT no compatible JVM found", {
    installed: allJvms.map((j) => ({ ver: j.version, major: j.majorVersion })),
  });
  return null;
}

/**
 * Find all installed JVM versions on the system.
 * Scans JAVA_HOME, PATH, and common installation directories.
 */
export async function findAllInstalledJvms(): Promise<JvmInfo[]> {
  const jvms: JvmInfo[] = [];
  const seenPaths = new Set<string>();

  // Check JAVA_HOME
  const javaHome = process.env["JAVA_HOME"];
  if (javaHome) {
    const javaPath = getJavaExecutable(javaHome);
    if (javaPath && !seenPaths.has(javaPath)) {
      seenPaths.add(javaPath);
      const info = await getJvmInfo(javaPath);
      if (info) jvms.push(info);
    }
  }

  // Check PATH
  const pathJava = await findJavaInPath();
  if (pathJava && !seenPaths.has(pathJava)) {
    seenPaths.add(pathJava);
    const info = await getJvmInfo(pathJava);
    if (info) jvms.push(info);
  }

  // Scan common directories
  const commonPaths = getCommonJavaPaths();
  for (const dir of commonPaths) {
    // Check if this is a JDK root or a directory containing JDKs
    const javaPath = getJavaExecutable(dir);
    if (javaPath && !seenPaths.has(javaPath)) {
      seenPaths.add(javaPath);
      const info = await getJvmInfo(javaPath);
      if (info) jvms.push(info);
    }

    // Also scan subdirectories (e.g., C:\Program Files\Java contains jdk-24, jdk-21, etc.)
    try {
      const { readdirSync, statSync } = await import("node:fs");
      const subdirs = readdirSync(dir);
      for (const subdir of subdirs) {
        const subPath = join(dir, subdir);
        try {
          if (statSync(subPath).isDirectory()) {
            const subJavaPath = getJavaExecutable(subPath);
            if (subJavaPath && !seenPaths.has(subJavaPath)) {
              seenPaths.add(subJavaPath);
              const info = await getJvmInfo(subJavaPath);
              if (info) jvms.push(info);
            }
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    } catch {
      // Directory not readable
    }
  }

  workerLog("DEBUG", "JVMDETECT found JVMs", {
    count: jvms.length,
    versions: jvms.map((j) => j.version),
  });

  return jvms;
}

/**
 * Clear cached JVM detection result.
 */
export function clearJvmCache(): void {
  cachedJvmInfo = undefined;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getJavaExecutable(javaHome: string): string | null {
  const isWindows = process.platform === "win32";
  const javaExe = isWindows ? "java.exe" : "java";
  const binPath = join(javaHome, "bin", javaExe);

  if (existsSync(binPath)) {
    return binPath;
  }

  // Some distributions have java directly in the dir
  const directPath = join(javaHome, javaExe);
  if (existsSync(directPath)) {
    return directPath;
  }

  return null;
}

async function findJavaInPath(): Promise<string | null> {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "where java" : "which java";

  try {
    const { stdout } = await execAsync(command, { timeout: 5000 });
    const javaPath = stdout.trim().split("\n")[0]?.trim();
    if (javaPath && existsSync(javaPath)) {
      return javaPath;
    }
  } catch {
    // java not in PATH
  }

  return null;
}

function findJavaInPathSync(): string | null {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "where java" : "which java";

  try {
    const stdout = execSync(command, { timeout: 5000, encoding: "utf-8" });
    const javaPath = stdout.trim().split("\n")[0]?.trim();
    if (javaPath && existsSync(javaPath)) {
      return javaPath;
    }
  } catch {
    // java not in PATH
  }

  return null;
}

function getCommonJavaPaths(): string[] {
  const paths: string[] = [];

  if (process.platform === "win32") {
    // Windows common paths
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    paths.push(
      // Eclipse Adoptium / Temurin
      join(programFiles, "Eclipse Adoptium"),
      join(programFiles, "Temurin"),
      // Microsoft OpenJDK
      join(programFiles, "Microsoft"),
      // Oracle JDK
      join(programFiles, "Java"),
      join(programFilesX86, "Java"),
      // Amazon Corretto
      join(programFiles, "Amazon Corretto"),
      // Zulu
      join(programFiles, "Zulu"),
      // GraalVM
      join(programFiles, "GraalVM"),
      // Android Studio JetBrains Runtime (JBR) - based on OpenJDK
      join(programFiles, "Android", "Android Studio", "jbr"),
      // IntelliJ IDEA JetBrains Runtime
      join(programFiles, "JetBrains"),
    );

    // Check for numbered versions in Java and Microsoft directories
    for (const baseDir of [join(programFiles, "Java"), join(programFiles, "Microsoft")]) {
      if (existsSync(baseDir)) {
        try {
          const { readdirSync } = require("node:fs");
          const subdirs = readdirSync(baseDir);
          for (const subdir of subdirs) {
            if (subdir.includes("jdk") || subdir.includes("JDK") || subdir.includes("java")) {
              paths.push(join(baseDir, subdir));
            }
          }
        } catch {
          // Ignore errors
        }
      }
    }

    // Check JetBrains IDEs for bundled JBR (IntelliJ IDEA, Android Studio, etc.)
    const jetbrainsDir = join(programFiles, "JetBrains");
    if (existsSync(jetbrainsDir)) {
      try {
        const { readdirSync } = require("node:fs");
        const products = readdirSync(jetbrainsDir);
        for (const product of products) {
          // Each JetBrains product (IntelliJ IDEA 2024.1, PyCharm 2024.1, etc.) has jbr subfolder
          const jbrPath = join(jetbrainsDir, product, "jbr");
          if (existsSync(jbrPath)) {
            paths.push(jbrPath);
          }
        }
      } catch {
        // Ignore errors
      }
    }
  } else if (process.platform === "darwin") {
    // macOS common paths
    const home = process.env["HOME"] || "";
    paths.push(
      "/Library/Java/JavaVirtualMachines",
      join(home, "Library/Java/JavaVirtualMachines"),
      "/usr/local/opt/openjdk",
      "/opt/homebrew/opt/openjdk",
      "/usr/local/opt/java",
      "/opt/homebrew/opt/java",
      // Android Studio on macOS
      "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
      join(home, "Applications/Android Studio.app/Contents/jbr/Contents/Home"),
      // JetBrains Toolbox installs
      join(home, "Library/Application Support/JetBrains/Toolbox/apps"),
    );
  } else {
    // Linux common paths
    const home = process.env["HOME"] || "";
    paths.push(
      "/usr/lib/jvm",
      "/usr/java",
      "/opt/java",
      "/opt/jdk",
      join(home, ".sdkman/candidates/java/current"),
      join(home, ".jdks"),
      // Android Studio on Linux
      "/opt/android-studio/jbr",
      join(home, "android-studio/jbr"),
      // JetBrains Toolbox installs
      join(home, ".local/share/JetBrains/Toolbox/apps"),
    );
  }

  return paths.filter(existsSync);
}

async function getJvmInfo(javaPath: string): Promise<JvmInfo | null> {
  try {
    const { stdout, stderr } = await execAsync(`"${javaPath}" -version`, { timeout: 10000 });
    const output = stderr || stdout; // java -version outputs to stderr
    return parseJavaVersion(output, javaPath);
  } catch {
    return null;
  }
}

function getJvmInfoSync(javaPath: string): JvmInfo | null {
  try {
    // java -version outputs to stderr
    const output = execSync(`"${javaPath}" -version 2>&1`, { timeout: 10000, encoding: "utf-8" });
    return parseJavaVersion(output, javaPath);
  } catch {
    return null;
  }
}

function parseJavaVersion(output: string, javaPath: string): JvmInfo | null {
  // Match version patterns:
  // - openjdk version "17.0.1" 2021-10-19
  // - java version "1.8.0_291"
  // - openjdk version "11.0.11" 2021-04-20
  const versionMatch = output.match(/(?:openjdk|java)\s+version\s+"([^"]+)"/i);
  if (!versionMatch) {
    return null;
  }

  const version = versionMatch[1] || "";
  const majorVersion = parseMajorVersion(version);

  // Detect vendor
  let vendor = "Unknown";
  if (output.includes("OpenJDK")) vendor = "OpenJDK";
  else if (output.includes("Oracle")) vendor = "Oracle";
  else if (output.includes("Temurin") || output.includes("Adoptium")) vendor = "Eclipse Temurin";
  else if (output.includes("Microsoft")) vendor = "Microsoft";
  else if (output.includes("Amazon") || output.includes("Corretto")) vendor = "Amazon Corretto";
  else if (output.includes("Zulu")) vendor = "Azul Zulu";
  else if (output.includes("GraalVM")) vendor = "GraalVM";

  // Check if it's JDK (has javac) or JRE
  const javacPath = javaPath.replace(/java(?:\.exe)?$/, "javac$1");
  const isJdk = existsSync(javacPath.replace("$1", process.platform === "win32" ? ".exe" : ""));

  return {
    javaPath,
    version,
    majorVersion,
    vendor,
    isJdk,
  };
}

function parseMajorVersion(version: string): number {
  // Parse major version from version string
  // Examples: "17.0.1" -> 17, "1.8.0_291" -> 8, "11.0.11" -> 11
  const parts = version.split(".");

  // Handle 1.x format (Java 8 and earlier)
  if (parts[0] === "1" && parts[1]) {
    return parseInt(parts[1], 10);
  }

  // Handle modern format (Java 9+)
  return parseInt(parts[0] || "0", 10);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { detectJvm as findJava, detectJvmSync as findJavaSync, getJavaExecutable };

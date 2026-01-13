/**
 * Build faiss-node from source for Node 24 (ABI v137)
 * Creates prebuilt binaries in external-libs/ for npm distribution
 *
 * Auto-installs dependencies (Windows only):
 * - CMake 3.20+
 * - Visual Studio Build Tools 2022 (MSVC)
 * - Git
 * - Python 3.x
 * - node-gyp
 * - vcpkg (Microsoft C++ package manager)
 * - OpenBLAS (BLAS/LAPACK implementation via vcpkg)
 *
 * For Linux: Run on Linux machine or use WSL/Docker
 */

import { execSync } from "node:child_process";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import https from "node:https";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  faissNodeRepo: "https://github.com/ewfian/faiss-node.git",
  faissNodeBranch: "main",
  buildDir: join(process.cwd(), ".build-cache", "faiss-node"),
  externalLibsDir: join(process.cwd(), "external-libs"),
  vcpkgRoot: "C:\\vcpkg",

  // Windows installers
  cmakeUrl: "https://github.com/Kitware/CMake/releases/download/v3.28.3/cmake-3.28.3-windows-x86_64.msi",
  vsInstallerUrl: "https://aka.ms/vs/17/release/vs_BuildTools.exe",
  pythonUrl: "https://www.python.org/ftp/python/3.12.1/python-3.12.1-amd64.exe",
};

// =============================================================================
// Logging
// =============================================================================

function log(msg, ...args) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] ${msg}`, ...args);
}

function logSection(title) {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70) + "\n");
}

// =============================================================================
// Execution Helpers
// =============================================================================

function exec(cmd, opts = {}) {
  const silent = opts.silent || false;
  const allowFail = opts.allowFail || false;

  if (!silent) log(`> ${cmd}`);

  try {
    const result = execSync(cmd, {
      stdio: silent ? "pipe" : "inherit",
      encoding: "utf8",
      ...opts,
    });
    return result;
  } catch (err) {
    if (!allowFail) throw err;
    return null;
  }
}

function checkCommand(cmd, args = ["--version"]) {
  try {
    execSync(`${cmd} ${args.join(" ")}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Download Helper
// =============================================================================

async function downloadFile(url, dest) {
  log(`Downloading ${url.split("/").pop()}...`);

  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const request = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        rmSync(dest, { force: true });
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        rmSync(dest, { force: true });
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (err) => {
      file.close();
      rmSync(dest, { force: true });
      reject(err);
    });

    file.on("error", (err) => {
      file.close();
      rmSync(dest, { force: true });
      reject(err);
    });
  });
}

// =============================================================================
// Dependency Checks
// =============================================================================

function checkGit() {
  if (checkCommand("git")) {
    const version = exec("git --version", { silent: true }).trim();
    log(`✓ Git: ${version}`);
    return true;
  }
  log("✗ Git not found");
  return false;
}

function checkCMake() {
  if (checkCommand("cmake")) {
    const version = exec("cmake --version", { silent: true }).split("\n")[0];
    log(`✓ CMake: ${version}`);
    return true;
  }
  log("✗ CMake not found");
  return false;
}

function checkPython() {
  for (const cmd of ["python", "python3", "py"]) {
    if (checkCommand(cmd)) {
      const version = exec(`${cmd} --version`, { silent: true }).trim();
      log(`✓ Python: ${version}`);
      return true;
    }
  }
  log("✗ Python not found");
  return false;
}

function checkVSBuildTools() {
  const vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";

  if (!existsSync(vswhere)) {
    log("✗ VS Build Tools not found (vswhere missing)");
    return false;
  }

  try {
    const output = exec(
      `"${vswhere}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64`,
      { silent: true },
    );

    if (output && output.includes("installationPath")) {
      const version = output.match(/installationVersion: ([\d.]+)/)?.[1] || "unknown";
      log(`✓ VS Build Tools: ${version}`);
      return true;
    }
  } catch {}

  log("✗ VS Build Tools not found (C++ tools missing)");
  return false;
}

function checkNodeGyp() {
  if (checkCommand("node-gyp")) {
    const version = exec("node-gyp --version", { silent: true }).trim();
    log(`✓ node-gyp: ${version}`);
    return true;
  }
  log("✗ node-gyp not found");
  return false;
}

function checkVcpkg() {
  const vcpkgExe = join(CONFIG.vcpkgRoot, "vcpkg.exe");
  if (existsSync(vcpkgExe)) {
    const version = exec(`"${vcpkgExe}" version`, { silent: true }).split("\n")[0];
    log(`✓ vcpkg: ${version}`);
    return true;
  }
  log("✗ vcpkg not found");
  return false;
}

function checkOpenBLAS() {
  const openblasPath = join(CONFIG.vcpkgRoot, "installed", "x64-windows", "bin", "openblas.dll");
  if (existsSync(openblasPath)) {
    log("✓ OpenBLAS: installed (vcpkg x64-windows)");
    return true;
  }
  log("✗ OpenBLAS not found");
  return false;
}

// =============================================================================
// Dependency Installers
// =============================================================================

async function installGit() {
  log("\n❌ Git is required but not installed.");
  log("Please install Git from: https://git-scm.com/download/win");
  log("After installation, restart your terminal and run this script again.");
  process.exit(1);
}

async function installCMake() {
  log("\nInstalling CMake...");

  const tempDir = join(homedir(), "Downloads");
  mkdirSync(tempDir, { recursive: true });

  const installerPath = join(tempDir, "cmake-installer.msi");
  await downloadFile(CONFIG.cmakeUrl, installerPath);

  log("Running CMake installer (silent)...");
  exec(`msiexec /i "${installerPath}" /quiet /norestart ADD_CMAKE_TO_PATH=System`, {
    silent: true,
  });

  log("Waiting for installation to complete...");
  await sleep(30000);

  // Refresh PATH
  process.env.PATH = exec("echo %PATH%", { silent: true }).trim();

  if (checkCommand("cmake")) {
    log("✓ CMake installed successfully");
    rmSync(installerPath, { force: true });
  } else {
    log("⚠ CMake installed but not found in PATH. You may need to restart your terminal.");
  }
}

async function installPython() {
  log("\nInstalling Python 3.12...");

  const tempDir = join(homedir(), "Downloads");
  mkdirSync(tempDir, { recursive: true });

  const installerPath = join(tempDir, "python-installer.exe");
  await downloadFile(CONFIG.pythonUrl, installerPath);

  log("Running Python installer (silent)...");
  exec(`"${installerPath}" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1`, { silent: true });

  log("Waiting for installation to complete...");
  await sleep(60000);

  // Refresh PATH
  process.env.PATH = exec("echo %PATH%", { silent: true }).trim();

  if (checkCommand("python") || checkCommand("python3")) {
    log("✓ Python installed successfully");
    rmSync(installerPath, { force: true });
  } else {
    log("⚠ Python installed but not found in PATH. You may need to restart your terminal.");
  }
}

async function installVSBuildTools() {
  log("\n❌ Visual Studio Build Tools 2022 required but not installed.");
  log("\nPlease install manually:");
  log("1. Download: https://aka.ms/vs/17/release/vs_BuildTools.exe");
  log("2. Run installer and select: 'Desktop development with C++'");
  log("3. Make sure to include:");
  log("   - MSVC v143 - VS 2022 C++ x64/x86 build tools");
  log("   - Windows 11 SDK (10.0.22000.0 or newer)");
  log("\nAfter installation completes, run this script again.");

  const answer = await askYesNo("\nAttempt automatic installation? (requires GUI interaction)");

  if (!answer) {
    process.exit(1);
  }

  const tempDir = join(homedir(), "Downloads");
  mkdirSync(tempDir, { recursive: true });

  const installerPath = join(tempDir, "vs_BuildTools.exe");
  await downloadFile(CONFIG.vsInstallerUrl, installerPath);

  log("\nLaunching VS Build Tools installer...");
  log("⚠ A GUI window will appear. Please complete the installation manually.");
  log("Required: Desktop development with C++");

  exec(
    `start "" "${installerPath}" --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.22000 --includeRecommended`,
    { silent: true, allowFail: true },
  );

  log("\n✋ Please complete the installation, then run this script again.");
  process.exit(0);
}

function installNodeGyp() {
  log("\nInstalling node-gyp globally...");
  exec("npm install -g node-gyp");
  log("✓ node-gyp installed");
}

async function installVcpkg() {
  log("\nInstalling vcpkg (Microsoft C++ package manager)...");

  if (existsSync(CONFIG.vcpkgRoot)) {
    log(`⚠ Directory ${CONFIG.vcpkgRoot} already exists, removing...`);
    rmSync(CONFIG.vcpkgRoot, { recursive: true, force: true });
  }

  log(`Cloning vcpkg to ${CONFIG.vcpkgRoot}...`);
  exec(`git clone https://github.com/Microsoft/vcpkg.git "${CONFIG.vcpkgRoot}"`);

  log("Bootstrapping vcpkg (1-2 minutes)...");
  exec(`"${join(CONFIG.vcpkgRoot, "bootstrap-vcpkg.bat")}"`, { cwd: CONFIG.vcpkgRoot });

  if (existsSync(join(CONFIG.vcpkgRoot, "vcpkg.exe"))) {
    log("✓ vcpkg installed successfully");
  } else {
    throw new Error("vcpkg installation failed");
  }
}

async function installOpenBLAS() {
  log("\nInstalling OpenBLAS and LAPACK via vcpkg (15-20 minutes)...");
  log("This will compile libraries from source - please be patient.");

  const vcpkgExe = join(CONFIG.vcpkgRoot, "vcpkg.exe");

  log("Installing openblas:x64-windows...");
  exec(`"${vcpkgExe}" install openblas:x64-windows`, { cwd: CONFIG.vcpkgRoot });

  log("Installing lapack:x64-windows...");
  exec(`"${vcpkgExe}" install lapack:x64-windows`, { cwd: CONFIG.vcpkgRoot });

  const openblasPath = join(CONFIG.vcpkgRoot, "installed", "x64-windows", "bin", "openblas.dll");
  if (existsSync(openblasPath)) {
    log("✓ OpenBLAS and LAPACK installed successfully");

    // Add to PATH for this session
    const binPath = join(CONFIG.vcpkgRoot, "installed", "x64-windows", "bin");
    process.env.PATH = `${binPath};${process.env.PATH}`;

    // Set CMAKE_PREFIX_PATH for cmake to find libraries
    const vcpkgToolchain = join(CONFIG.vcpkgRoot, "scripts", "buildsystems", "vcpkg.cmake");
    process.env.CMAKE_PREFIX_PATH = join(CONFIG.vcpkgRoot, "installed", "x64-windows");
    process.env.CMAKE_TOOLCHAIN_FILE = vcpkgToolchain;

    log(`Added to PATH: ${binPath}`);
    log(`Set CMAKE_PREFIX_PATH: ${process.env.CMAKE_PREFIX_PATH}`);
    log(`Set CMAKE_TOOLCHAIN_FILE: ${vcpkgToolchain}`);
  } else {
    throw new Error("OpenBLAS installation failed");
  }
}

// =============================================================================
// Build Process
// =============================================================================

async function cloneFaissNode() {
  if (existsSync(CONFIG.buildDir)) {
    log("Build cache exists, updating...");
    exec(`git -C "${CONFIG.buildDir}" pull`, { allowFail: true });
  } else {
    log(`Cloning faiss-node repository...`);
    mkdirSync(dirname(CONFIG.buildDir), { recursive: true });
    exec(`git clone --depth 1 --branch ${CONFIG.faissNodeBranch} ${CONFIG.faissNodeRepo} "${CONFIG.buildDir}"`);
  }
  log("✓ Repository ready");
}

async function buildNativeAddon() {
  log("Cleaning old build artifacts...");
  const depsDir = join(CONFIG.buildDir, "deps");
  const nodeModulesDir = join(CONFIG.buildDir, "node_modules");
  const buildDir = join(CONFIG.buildDir, "build");

  rmSync(depsDir, { recursive: true, force: true });
  rmSync(nodeModulesDir, { recursive: true, force: true });
  rmSync(buildDir, { recursive: true, force: true });

  log("\nInstalling npm dependencies and building (via cmake-js)...");
  log("⏳ This will take 10-20 minutes - faiss-node uses cmake-js to compile FAISS library");
  log("⏳ OpenBLAS and LAPACK will be used for linear algebra operations\n");

  // npm install will trigger cmake-js build automatically
  // Pass environment variables explicitly to child process
  const vcpkgToolchain = join(CONFIG.vcpkgRoot, "scripts", "buildsystems", "vcpkg.cmake");

  exec("npm install", {
    cwd: CONFIG.buildDir,
    env: {
      ...process.env,
      // Ensure vcpkg paths are visible to cmake
      PATH: process.env.PATH,
      CMAKE_PREFIX_PATH: process.env.CMAKE_PREFIX_PATH || join(CONFIG.vcpkgRoot, "installed", "x64-windows"),
      CMAKE_TOOLCHAIN_FILE: vcpkgToolchain,
      // Pass toolchain to cmake-js via CMAKE_ARGS
      CMAKE_ARGS: `-DCMAKE_TOOLCHAIN_FILE="${vcpkgToolchain}"`,
    },
  });

  log("✓ Native addon built successfully");
}

function installToExternalLibs() {
  const builtAddon = join(CONFIG.buildDir, "build", "Release", "faiss-node.node");

  if (!existsSync(builtAddon)) {
    throw new Error(`Built addon not found: ${builtAddon}`);
  }

  const plat = process.platform;
  const architecture = process.arch;

  log(`Copying to external-libs for ${plat}-${architecture}...`);

  // Target: external-libs/faiss-{platform}-{arch}/faiss-node.node
  const targetDir = join(CONFIG.externalLibsDir, `faiss-${plat}-${architecture}`);
  mkdirSync(targetDir, { recursive: true });

  const targetPath = join(targetDir, "faiss-node.node");
  copyFileSync(builtAddon, targetPath);

  log(`✓ Copied to ${targetPath}`);
  log(`✓ Prebuilt binary ready for npm distribution`);

  return targetPath;
}

function testBuiltAddon(addonPath) {
  log("\nTesting built addon...");

  try {
    // Test loading the addon directly
    exec(
      `node -e "const f=require('${addonPath.replace(/\\/g, "\\\\")}');console.log('✓ Addon loaded successfully');process.exit(0)"`,
    );
    return true;
  } catch (error) {
    log(`✗ Test failed - addon could not be loaded: ${error.message}`);
    return false;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function askYesNo(question) {
  if (process.env.CI || process.env.AUTOMATED) return true;

  const readline = (await import("node:readline")).default;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} [Y/n] `, (answer) => {
      rl.close();
      resolve(!answer || answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  logSection("faiss-node Build Tool for Node 24");

  const nodeVersion = process.versions.node;
  const abiVersion = process.versions.modules;

  log(`Node: ${nodeVersion}`);
  log(`ABI: v${abiVersion}`);

  if (abiVersion !== "137") {
    log(`\n⚠ Warning: Expected ABI v137 (Node 24), found v${abiVersion}`);
    log("The build will continue but may not work as expected.\n");
  }

  // Step 1: Check dependencies
  logSection("Step 1: Checking Dependencies");

  const deps = {
    git: checkGit(),
    cmake: checkCMake(),
    python: checkPython(),
    vsBuildTools: checkVSBuildTools(),
    nodeGyp: checkNodeGyp(),
    vcpkg: checkVcpkg(),
    openblas: checkOpenBLAS(),
  };

  // Step 2: Install missing dependencies
  if (!Object.values(deps).every(Boolean)) {
    logSection("Step 2: Installing Missing Dependencies");

    if (!deps.git) await installGit();
    if (!deps.cmake) await installCMake();
    if (!deps.python) await installPython();
    if (!deps.vsBuildTools) await installVSBuildTools();
    if (!deps.nodeGyp) installNodeGyp();
    if (!deps.vcpkg) await installVcpkg();
    if (!deps.openblas) await installOpenBLAS();

    log("\n✓ All dependencies installed");
  } else {
    log("\n✓ All dependencies satisfied");
  }

  // Step 3: Clone repository
  logSection("Step 3: Cloning faiss-node Repository");
  await cloneFaissNode();

  // Step 4: Build
  logSection("Step 4: Building Native Addon");
  await buildNativeAddon();

  // Step 5: Copy to external-libs
  logSection("Step 5: Copying to external-libs");
  const addonPath = installToExternalLibs();

  // Step 6: Test
  logSection("Step 6: Testing");
  const success = testBuiltAddon(addonPath);

  // Done
  logSection("Build Complete");

  if (success) {
    log("✅ faiss-node prebuilt binary created successfully!");
    log(`\nLocation: ${addonPath}`);
    log("\nAdd this file to npm package via package.json 'files' field.");
    log("Users will get this prebuilt binary without needing to compile.");
  } else {
    log("⚠ Build completed but verification failed.");
    log("Please check the error messages above.");
    process.exit(1);
  }
}

// Run
main().catch((err) => {
  console.error("\n❌ Build failed:");
  console.error(err.message);
  console.error("\nStack trace:");
  console.error(err.stack);
  process.exit(1);
});

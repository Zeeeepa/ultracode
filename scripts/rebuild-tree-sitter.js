#!/usr/bin/env node
/**
 * Rebuilds tree-sitter native bindings for Bun compatibility
 * Creates prebuilds/win32-x64/tree-sitter.node from node-gyp build
 * Offers to install build tools if missing
 */

import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bright: "\x1b[1m",
};

function log(msg) {
  console.log(msg);
}

function logSuccess(msg) {
  console.log(`${colors.green}[OK]${colors.reset} ${msg}`);
}

function logInfo(msg) {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`);
}

function logWarning(msg) {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`);
}

function logError(msg) {
  console.log(`${colors.red}[FAIL]${colors.reset} ${msg}`);
}

async function askYesNo(question) {
  // Skip in CI or non-interactive environments
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION || !process.stdin.isTTY) {
    return false;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}?${colors.reset} ${question} [Y/n]: `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "" || normalized === "y" || normalized === "yes");
    });
  });
}

function findVSInstallPath() {
  // Common VS 2022 paths
  const vsPaths = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community",
  ];

  for (const vsPath of vsPaths) {
    if (existsSync(vsPath)) {
      return vsPath;
    }
  }

  // Try vswhere
  try {
    const vswherePath = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
    if (existsSync(vswherePath)) {
      const result = execSync(`"${vswherePath}" -latest -property installationPath`, { encoding: "utf8" });
      const path = result.trim();
      if (path && existsSync(path)) {
        return path;
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

function findClExe(vsPath) {
  if (!vsPath) return null;

  // Find cl.exe in VS installation
  const msvcPath = join(vsPath, "VC", "Tools", "MSVC");
  if (!existsSync(msvcPath)) return null;

  try {
    const versions = readdirSync(msvcPath).sort().reverse();
    for (const version of versions) {
      const clPath = join(msvcPath, version, "bin", "Hostx64", "x64", "cl.exe");
      if (existsSync(clPath)) {
        return clPath;
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

function checkBuildTools() {
  const plat = platform();

  if (plat === "win32") {
    // Check if cl.exe is in PATH
    try {
      execSync("where cl.exe", { stdio: "ignore" });
      return { available: true };
    } catch {
      // Not in PATH, check default locations
      const vsPath = findVSInstallPath();
      if (vsPath) {
        const clExe = findClExe(vsPath);
        if (clExe) {
          return { available: true, vsPath, clExe, needsEnvSetup: true };
        }
      }
      return { available: false };
    }
  }

  if (plat === "darwin") {
    // Check for Xcode command line tools
    try {
      execSync("xcode-select -p", { stdio: "ignore" });
      return { available: true };
    } catch {
      return { available: false };
    }
  }

  if (plat === "linux") {
    // Check for gcc/g++
    try {
      execSync("which gcc", { stdio: "ignore" });
      execSync("which g++", { stdio: "ignore" });
      return { available: true };
    } catch {
      return { available: false };
    }
  }

  return { available: false };
}

async function installBuildTools() {
  const plat = platform();

  if (plat === "win32") {
    logInfo("Installing Visual Studio Build Tools 2022...");
    log("");
    log(`${colors.bright}This will download and install Visual Studio Build Tools (~1.5GB)${colors.reset}`);
    log("Installation requires administrator privileges.");
    log("");

    const confirm = await askYesNo("Proceed with installation?");
    if (!confirm) {
      logWarning("Installation cancelled");
      return false;
    }

    try {
      // Try winget first
      logInfo("Trying winget...");
      const wingetResult = spawnSync(
        "winget",
        [
          "install",
          "--id",
          "Microsoft.VisualStudio.2022.BuildTools",
          "--override",
          '"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet --wait"',
        ],
        { encoding: "utf8", shell: true, stdio: "inherit", timeout: 600000 },
      );

      if (wingetResult.status === 0) {
        logSuccess("Visual Studio Build Tools installed via winget");
        return true;
      }
    } catch {
      // winget failed, try direct download
    }

    // Direct download fallback
    logInfo("Downloading Visual Studio Build Tools installer...");
    const installerUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe";
    const installerPath = join(process.env.TEMP || "C:\\Temp", "vs_BuildTools.exe");

    try {
      execSync(`curl -L -o "${installerPath}" "${installerUrl}"`, { stdio: "inherit" });

      logInfo("Running installer (this may take 5-10 minutes)...");
      const installResult = spawnSync(
        installerPath,
        ["--add", "Microsoft.VisualStudio.Workload.VCTools", "--includeRecommended", "--quiet", "--wait"],
        { encoding: "utf8", shell: true, stdio: "inherit", timeout: 900000 },
      );

      if (installResult.status === 0) {
        logSuccess("Visual Studio Build Tools installed");
        return true;
      }
    } catch (err) {
      logError(`Installation failed: ${err.message}`);
    }

    return false;
  }

  if (plat === "darwin") {
    logInfo("Installing Xcode Command Line Tools...");
    log("");

    const confirm = await askYesNo("Proceed with installation?");
    if (!confirm) {
      logWarning("Installation cancelled");
      return false;
    }

    try {
      // This opens a GUI dialog on macOS
      execSync("xcode-select --install", { stdio: "inherit" });
      logInfo("Please complete the installation in the dialog that appeared");
      logInfo("After installation completes, run this script again");
      return false; // User needs to wait for GUI install
    } catch {
      logError("Failed to start Xcode tools installation");
      return false;
    }
  }

  if (plat === "linux") {
    logInfo("Installing build-essential...");
    log("");

    // Detect package manager
    let pkgManager = null;
    let installCmd = null;

    if (existsSync("/usr/bin/apt-get")) {
      pkgManager = "apt";
      installCmd = "sudo apt-get update && sudo apt-get install -y build-essential python3";
    } else if (existsSync("/usr/bin/dnf")) {
      pkgManager = "dnf";
      installCmd = 'sudo dnf groupinstall -y "Development Tools" && sudo dnf install -y python3';
    } else if (existsSync("/usr/bin/yum")) {
      pkgManager = "yum";
      installCmd = 'sudo yum groupinstall -y "Development Tools" && sudo yum install -y python3';
    } else if (existsSync("/usr/bin/pacman")) {
      pkgManager = "pacman";
      installCmd = "sudo pacman -S --noconfirm base-devel python";
    } else if (existsSync("/usr/bin/zypper")) {
      pkgManager = "zypper";
      installCmd = "sudo zypper install -y -t pattern devel_basis && sudo zypper install -y python3";
    }

    if (!installCmd) {
      logError("Unknown package manager. Please install build tools manually:");
      log("  - Debian/Ubuntu: sudo apt-get install build-essential");
      log("  - Fedora: sudo dnf groupinstall 'Development Tools'");
      log("  - Arch: sudo pacman -S base-devel");
      return false;
    }

    log(`Detected package manager: ${pkgManager}`);
    log(`Command: ${installCmd}`);
    log("");

    const confirm = await askYesNo("Proceed with installation? (requires sudo)");
    if (!confirm) {
      logWarning("Installation cancelled");
      return false;
    }

    try {
      execSync(installCmd, { stdio: "inherit", shell: true });
      logSuccess("Build tools installed");
      return true;
    } catch (err) {
      logError(`Installation failed: ${err.message}`);
      return false;
    }
  }

  return false;
}

function runNodeGypWithVS(treeSitterDir, vsPath) {
  // Setup environment for VS
  const vcvarsPath = join(vsPath, "VC", "Auxiliary", "Build", "vcvars64.bat");

  if (!existsSync(vcvarsPath)) {
    logWarning("vcvars64.bat not found, trying without environment setup");
    return runNodeGyp(treeSitterDir);
  }

  logInfo("Setting up Visual Studio environment...");

  // Run node-gyp with VS environment
  const cmd = `"${vcvarsPath}" && npx node-gyp rebuild`;

  const result = spawnSync("cmd", ["/c", cmd], {
    cwd: treeSitterDir,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
    timeout: 300000,
  });

  return result.status === 0;
}

function runNodeGyp(treeSitterDir) {
  const result = spawnSync("npx", ["node-gyp", "rebuild"], {
    cwd: treeSitterDir,
    encoding: "utf8",
    shell: true,
    stdio: "inherit",
    timeout: 300000,
  });

  return result.status === 0;
}

async function main() {
  const plat = platform();
  const architecture = arch();
  const prebuildsDir = `prebuilds/${plat}-${architecture}`;

  const treeSitterDir = join(projectRoot, "node_modules", "tree-sitter");
  const prebuildsPath = join(treeSitterDir, prebuildsDir);
  const targetFile = join(prebuildsPath, "tree-sitter.node");

  // Check if tree-sitter exists
  if (!existsSync(treeSitterDir)) {
    logWarning("tree-sitter not found in node_modules, skipping rebuild");
    return;
  }

  // Check if prebuilds already exist
  if (existsSync(targetFile)) {
    logInfo("tree-sitter native bindings already exist, skipping rebuild");
    return;
  }

  logInfo(`Rebuilding tree-sitter for Bun compatibility (${plat}-${architecture})...`);

  // Check for build tools
  let buildTools = checkBuildTools();

  if (!buildTools.available) {
    logWarning("Build tools not found");
    log("");

    if (plat === "win32") {
      log("Visual Studio Build Tools 2022 is required to compile native modules.");
      log("Download: https://aka.ms/vs/17/release/vs_BuildTools.exe");
    } else if (plat === "darwin") {
      log("Xcode Command Line Tools are required.");
      log("Run: xcode-select --install");
    } else if (plat === "linux") {
      log("Build tools (gcc, g++, make) are required.");
      log("Install: sudo apt-get install build-essential");
    }

    log("");

    const shouldInstall = await askYesNo("Would you like to install build tools now?");

    if (shouldInstall) {
      const installed = await installBuildTools();

      if (installed) {
        // Re-check build tools after installation
        buildTools = checkBuildTools();

        if (!buildTools.available) {
          logWarning("Build tools still not detected after installation");
          logInfo("You may need to restart your terminal and run this script again");
          return;
        }
      } else {
        logWarning("Installation was not completed");
        logInfo("Please install build tools manually and run this script again");
        return;
      }
    } else {
      logInfo("Skipping tree-sitter rebuild");
      logInfo("Bun users will need to use Node.js instead, or install build tools later");
      return;
    }
  }

  // Check for node-gyp
  try {
    execSync("npx node-gyp --version", { stdio: "ignore" });
  } catch {
    logError("node-gyp not available");
    logInfo("Install with: npm install -g node-gyp");
    return;
  }

  // Run node-gyp rebuild
  logInfo("Running node-gyp rebuild (this may take a minute)...");

  let buildSuccess = false;

  if (plat === "win32" && buildTools.needsEnvSetup && buildTools.vsPath) {
    // Windows with VS not in PATH - use vcvars
    buildSuccess = runNodeGypWithVS(treeSitterDir, buildTools.vsPath);
  } else {
    // Standard build
    buildSuccess = runNodeGyp(treeSitterDir);
  }

  if (!buildSuccess) {
    logError("node-gyp rebuild failed");
    if (plat === "win32") {
      logInfo("Make sure Visual Studio Build Tools 2022 is properly installed");
      logInfo("Try opening 'Developer Command Prompt for VS 2022' and running this script");
    }
    return;
  }

  // Find the built .node file
  const buildDir = join(treeSitterDir, "build", "Release");
  const possibleNames = ["tree_sitter_runtime_binding.node", "tree_sitter.node", "binding.node"];

  let sourceFile = null;
  for (const name of possibleNames) {
    const candidate = join(buildDir, name);
    if (existsSync(candidate)) {
      sourceFile = candidate;
      break;
    }
  }

  if (!sourceFile) {
    logError("Built .node file not found in build/Release/");
    logInfo(`Checked: ${possibleNames.join(", ")}`);
    return;
  }

  // Create prebuilds directory and copy
  logInfo(`Copying to ${prebuildsDir}/tree-sitter.node...`);

  try {
    mkdirSync(prebuildsPath, { recursive: true });
    copyFileSync(sourceFile, targetFile);
    logSuccess("tree-sitter native bindings installed for Bun");
    logInfo(`Location: node_modules/tree-sitter/${prebuildsDir}/tree-sitter.node`);
  } catch (err) {
    logError(`Failed to copy: ${err.message}`);
  }
}

main().catch((err) => {
  logError(`Unexpected error: ${err.message}`);
  process.exit(0); // Don't fail the install
});

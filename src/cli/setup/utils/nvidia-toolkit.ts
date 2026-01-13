/**
 * NVIDIA Container Toolkit
 *
 * Check and ensure NVIDIA Container Toolkit is working for Docker GPU access.
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { t, ta, ti } from "../i18n/index.js";
import { printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { sleep } from "./runtime.js";

/**
 * Check and ensure NVIDIA Container Toolkit is working for Docker GPU access
 */
export async function checkNvidiaContainerToolkit(): Promise<boolean> {
  const isWindows = process.platform === "win32";

  // Test if nvidia-docker works
  printInfo(t("nvidia.checking"));

  const testResult = spawnSync(
    "docker",
    ["run", "--rm", "--gpus", "all", "nvidia/cuda:13.1.0-base-ubuntu24.04", "nvidia-smi"],
    {
      encoding: "utf-8",
      timeout: 60000,
      windowsHide: true,
      stdio: "pipe",
    },
  );

  if (testResult.status === 0) {
    printOK(t("nvidia.toolkit_works"));
    return true;
  }

  printWarn(t("nvidia.toolkit_not_configured"));

  if (isWindows) {
    // On Windows, Docker Desktop handles GPU passthrough via WSL2
    // Check NVIDIA driver version (must be 525+ for WSL2 GPU)
    try {
      const driverCheck = spawnSync("nvidia-smi", ["--query-gpu=driver_version", "--format=csv,noheader"], {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
        stdio: "pipe",
      });

      if (driverCheck.status === 0) {
        const driverVersion = driverCheck.stdout.trim();
        const majorVersion = parseInt(driverVersion.split(".")[0] || "0", 10);

        if (majorVersion >= 525) {
          printOK(ti("nvidia.driver_ok", { version: driverVersion }));
        } else {
          printError(ti("nvidia.driver_old", { version: driverVersion }));
          console.error("");
          console.error(`  ${t("nvidia.driver_update_hint")}`);
          console.error(`  ${t("nvidia.driver_update_url")}`);
          return false;
        }
      }
    } catch {
      printError(t("nvidia.driver_not_found"));
      return false;
    }

    // Check Docker Desktop WSL2 backend
    printInfo(t("nvidia.wsl_check"));
    console.error("");
    const wslReqs = ta("nvidia.wsl_requirements");
    for (let i = 0; i < wslReqs.length; i++) {
      console.error(`  ${i + 1}. ${wslReqs[i]}`);
    }
    console.error("");

    const answer = await prompt(`  ${t("nvidia.wsl_configured")} `);
    if (answer.toLowerCase() !== "y") {
      printInfo(t("nvidia.wsl_configure_hint"));
      return false;
    }

    // Restart Docker Desktop to apply GPU settings
    printInfo(t("nvidia.docker_restarting"));
    try {
      spawnSync(
        "powershell",
        ["-Command", "Stop-Process -Name 'Docker Desktop' -Force -ErrorAction SilentlyContinue"],
        {
          windowsHide: true,
          stdio: "pipe",
        },
      );
      await sleep(2000);

      // Start Docker Desktop
      const dockerPath = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
      if (existsSync(dockerPath)) {
        const proc = spawn(dockerPath, [], { detached: true, stdio: "ignore", windowsHide: true });
        proc.unref();
        printInfo(t("nvidia.docker_starting"));
        await sleep(10000); // Wait for Docker to start
      }
    } catch {
      printWarn(t("nvidia.docker_restart_failed"));
    }

    // Test again
    const retestResult = spawnSync(
      "docker",
      ["run", "--rm", "--gpus", "all", "nvidia/cuda:13.1.0-base-ubuntu24.04", "nvidia-smi"],
      {
        encoding: "utf-8",
        timeout: 60000,
        windowsHide: true,
        stdio: "pipe",
      },
    );

    if (retestResult.status === 0) {
      printOK(t("nvidia.toolkit_now_works"));
      return true;
    }

    printError(t("nvidia.gpu_still_unavailable"));
    console.error("");
    const hints = ta("nvidia.troubleshoot_hints");
    for (let i = 0; i < hints.length; i++) {
      console.error(`  ${i + 1}. ${hints[i]}`);
    }
    return false;
  } else {
    // Linux: Install NVIDIA Container Toolkit
    printInfo(t("nvidia.installing"));

    try {
      execSync(
        `curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg`,
        { stdio: "pipe" },
      );
      execSync(
        `curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
         sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
         sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list`,
        { stdio: "pipe" },
      );
      execSync(`sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit`, { stdio: "inherit" });
      execSync(`sudo nvidia-ctk runtime configure --runtime=docker`, { stdio: "pipe" });
      execSync(`sudo systemctl restart docker`, { stdio: "pipe" });

      printOK(t("nvidia.installed"));

      // Test again
      await sleep(3000);
      const retestResult = spawnSync(
        "docker",
        ["run", "--rm", "--gpus", "all", "nvidia/cuda:13.1.0-base-ubuntu24.04", "nvidia-smi"],
        {
          encoding: "utf-8",
          timeout: 60000,
          stdio: "pipe",
        },
      );

      if (retestResult.status === 0) {
        printOK(t("nvidia.gpu_available"));
        return true;
      }
    } catch (e: any) {
      printError(ti("nvidia.install_error", { error: e.message }));
    }

    return false;
  }
}

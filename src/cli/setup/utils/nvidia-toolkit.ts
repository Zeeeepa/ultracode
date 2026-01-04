/**
 * NVIDIA Container Toolkit
 *
 * Check and ensure NVIDIA Container Toolkit is working for Docker GPU access.
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { sleep } from "./runtime.js";

/**
 * Check and ensure NVIDIA Container Toolkit is working for Docker GPU access
 */
export async function checkNvidiaContainerToolkit(): Promise<boolean> {
  const isWindows = process.platform === "win32";

  // Test if nvidia-docker works
  printInfo("Проверка NVIDIA Container Toolkit...");

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
    printOK("NVIDIA Container Toolkit работает");
    return true;
  }

  printWarn("NVIDIA Container Toolkit не настроен");

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
          printOK(`NVIDIA драйвер ${driverVersion} (✓ поддерживает WSL2 GPU)`);
        } else {
          printError(`NVIDIA драйвер ${driverVersion} слишком старый. Требуется 525+`);
          console.error("");
          console.error("  Обновите драйвер NVIDIA:");
          console.error("  https://www.nvidia.com/download/index.aspx");
          return false;
        }
      }
    } catch {
      printError("nvidia-smi не найден. Установите NVIDIA драйвер.");
      return false;
    }

    // Check Docker Desktop WSL2 backend
    printInfo("Проверка Docker Desktop WSL2 backend...");
    console.error("");
    console.error("  Для GPU в Docker Desktop нужно:");
    console.error('  1. Docker Desktop → Settings → General → "Use the WSL 2 based engine" ✓');
    console.error("  2. Docker Desktop → Settings → Resources → WSL Integration → Enable");
    console.error("");

    const answer = await prompt("  Docker Desktop настроен для WSL2? [y/N]: ");
    if (answer.toLowerCase() !== "y") {
      printInfo("Откройте Docker Desktop → Settings и настройте WSL2 backend");
      return false;
    }

    // Restart Docker Desktop to apply GPU settings
    printInfo("Перезапуск Docker Desktop для применения GPU настроек...");
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
        printInfo("Docker Desktop запускается...");
        await sleep(10000); // Wait for Docker to start
      }
    } catch {
      printWarn("Не удалось перезапустить Docker Desktop. Перезапустите вручную.");
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
      printOK("NVIDIA Container Toolkit теперь работает!");
      return true;
    }

    printError("GPU всё ещё недоступен в Docker");
    console.error("");
    console.error("  Попробуйте:");
    console.error("  1. Перезагрузить компьютер");
    console.error("  2. Обновить NVIDIA драйвер до последней версии");
    console.error("  3. Переустановить Docker Desktop");
    return false;
  } else {
    // Linux: Install NVIDIA Container Toolkit
    printInfo("Установка NVIDIA Container Toolkit...");

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

      printOK("NVIDIA Container Toolkit установлен");

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
        printOK("GPU доступен в Docker!");
        return true;
      }
    } catch (e: any) {
      printError(`Ошибка установки: ${e.message}`);
    }

    return false;
  }
}

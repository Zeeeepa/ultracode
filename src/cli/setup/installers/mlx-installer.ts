/**
 * MLX Embedding Installation (Apple Silicon / Metal GPU)
 *
 * Sets up Python venv with MLX dependencies and writes config.
 * The actual server lifecycle is managed by mlx-server-manager.ts at runtime.
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../../../utils/config-paths.js";
import type { EmbeddingModel, InstallResult } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn } from "../setup-ui.js";

const MLX_PORT = 8087;

function findPython(): string | null {
  for (const cmd of ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    if (r.status === 0 && r.stdout) {
      const ver = r.stdout.match(/(\d+)\.(\d+)/);
      if (ver && parseInt(ver[1]) >= 3 && parseInt(ver[2]) >= 10) return cmd;
    }
  }
  return null;
}

export async function installMLX(
  model: EmbeddingModel,
  _language: "en" | "multi",
): Promise<InstallResult> {
  printInfo("Настройка MLX (Apple Metal Native)...");
  console.error("");

  // Check Python 3.10+
  const python = findPython();
  if (!python) {
    printError("Python 3.10+ не найден");
    printInfo("Установите: brew install python@3.12");
    return { success: false, error: "Python 3.10+ not found" };
  }
  printOK(`Python найден: ${python}`);

  // Setup venv
  const dataDir = getDataDir();
  const mlxDir = join(dataDir, "mlx");
  const venvDir = join(mlxDir, "venv");

  if (!existsSync(venvDir)) {
    printInfo("Создание Python venv...");
    const r = spawnSync(python, ["-m", "venv", venvDir], {
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (r.status !== 0) {
      printError(`Ошибка создания venv: ${r.stderr}`);
      return { success: false, error: "Failed to create venv" };
    }
    printOK("venv создан");
  } else {
    printOK("venv уже существует");
  }

  // Install MLX dependencies
  const pip = join(venvDir, "bin", "pip");
  const deps = ["mlx>=0.21.0", "mlx-embedding-models>=0.1.0", "fastapi", "uvicorn[standard]"];

  printInfo("Установка MLX зависимостей (может занять 1-2 минуты)...");
  const installResult = spawnSync(pip, ["install", "--upgrade", ...deps], {
    encoding: "utf-8",
    timeout: 300_000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (installResult.status !== 0) {
    printError(`pip install failed: ${installResult.stderr?.slice(0, 200)}`);
    return { success: false, error: "Failed to install MLX dependencies" };
  }
  printOK("MLX зависимости установлены");

  // Verify MLX import
  const venvPython = join(venvDir, "bin", "python");
  const checkResult = spawnSync(venvPython, ["-c", "import mlx; import mlx_embedding_models; print('OK')"], {
    encoding: "utf-8",
    timeout: 15_000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (checkResult.status !== 0 || !checkResult.stdout?.includes("OK")) {
    printError("MLX import verification failed");
    return { success: false, error: "MLX import failed" };
  }
  printOK("MLX проверен — Metal GPU доступен");

  console.error("");
  printOK(`Модель: ${model.name} (${model.id})`);
  printOK(`Сервер: http://127.0.0.1:${MLX_PORT}/v1/embeddings`);
  printInfo("MLX сервер запустится автоматически при индексации");

  return {
    success: true,
    config: {
      provider: "mlx",
      model: model.id,
      url: `http://127.0.0.1:${MLX_PORT}`,
      dimensions: model.dimensions,
    },
  };
}

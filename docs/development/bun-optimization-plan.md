# План оптимизации под Bun Runtime

*Версия: 1.0 | Дата: 2025-11-27*

---

## Текущее состояние

### ✅ Уже реализовано

| Компонент | Файл | Статус |
|-----------|------|--------|
| **SQLite Adapter** | `src/storage/sqlite-adapter.ts` | ✅ Полная поддержка `bun:sqlite` |
| **Runtime Detection** | `isBunRuntime()` | ✅ Через `process.versions.bun` |
| **Database Wrapper** | `BunDatabaseAdapter` | ✅ API-совместимый с `better-sqlite3` |

### ⚠️ Требует оптимизации

| Компонент | Файлы | Проблема |
|-----------|-------|----------|
| **Файловые операции** | 20+ файлов | Синхронные `node:fs` операции |
| **Shell команды** | 8 файлов | `execSync` блокирует event loop |
| **Glob поиск** | Нет | Используется `find` через shell |
| **Stream helpers** | `stream-helpers.ts` | Node streams (совместимы, но можно ускорить) |

---

## Фаза 1: Runtime Utilities (Приоритет: HIGH)

### 1.1 Создать `src/utils/runtime.ts`

```typescript
/**
 * Runtime Detection and Feature Flags
 */

export const runtime = {
  isBun: typeof Bun !== "undefined",
  isNode: typeof process !== "undefined" && !("bun" in process.versions),
  version: typeof Bun !== "undefined" ? Bun.version : process.version,
} as const;

// Feature detection
export const features = {
  bunFile: typeof Bun !== "undefined" && typeof Bun.file === "function",
  bunGlob: typeof Bun !== "undefined" && typeof Bun.Glob === "function",
  bunShell: typeof Bun !== "undefined",
  bunSqlite: typeof Bun !== "undefined",
} as const;
```

### 1.2 Типы для Bun API

Создать `src/types/bun.d.ts`:
```typescript
declare global {
  const Bun: {
    version: string;
    revision: string;
    file(path: string): BunFile;
    write(path: string | BunFile, data: string | Blob | ArrayBuffer): Promise<number>;
    sleep(ms: number): Promise<void>;
    sleepSync(ms: number): void;
    hash(data: string | ArrayBuffer): number;
    randomUUIDv7(): string;
    Glob: typeof BunGlob;
    // ... остальные типы
  } | undefined;
}
```

---

## Фаза 2: Файловые операции (Приоритет: HIGH)

### 2.1 Создать `src/utils/file-ops.ts`

Универсальные обёртки для файловых операций:

```typescript
import { runtime, features } from "./runtime.js";

// ============================================================================
// ASYNC FILE OPERATIONS
// ============================================================================

/**
 * Read file as text (Bun.file или fs/promises)
 */
export async function readFileText(path: string): Promise<string> {
  if (features.bunFile) {
    return Bun.file(path).text();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf-8");
}

/**
 * Read file as JSON (оптимизировано для Bun)
 */
export async function readFileJSON<T = unknown>(path: string): Promise<T> {
  if (features.bunFile) {
    return Bun.file(path).json() as Promise<T>;
  }
  const content = await readFileText(path);
  return JSON.parse(content) as T;
}

/**
 * Write file (Bun.write или fs/promises)
 */
export async function writeFile(path: string, data: string): Promise<void> {
  if (features.bunFile) {
    await Bun.write(path, data);
    return;
  }
  const { writeFile: fsWriteFile } = await import("node:fs/promises");
  await fsWriteFile(path, data, "utf-8");
}

/**
 * Check file exists (Bun.file.exists или fs.stat)
 */
export async function fileExists(path: string): Promise<boolean> {
  if (features.bunFile) {
    return Bun.file(path).exists();
  }
  const { stat } = await import("node:fs/promises");
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// SYNC FILE OPERATIONS (для критичных путей)
// ============================================================================

/**
 * Sync read (для конфигов при старте)
 */
export function readFileTextSync(path: string): string {
  if (features.bunFile) {
    // Bun.file().text() async, но для sync используем Node fallback
    // или новый API если доступен
    const file = Bun.file(path);
    // Используем Bun.readableStreamToText если нужен sync
  }
  const { readFileSync } = require("node:fs");
  return readFileSync(path, "utf-8");
}
```

### 2.2 Файлы для миграции

| Файл | Операции | Приоритет |
|------|----------|-----------|
| `src/utils/config-paths.ts` | `readFileSync`, `writeFileSync`, `existsSync` | HIGH |
| `src/config/yaml-config.ts` | `readFileSync`, `existsSync` | HIGH |
| `src/versioning/version-manager.ts` | `readFile`, `writeFile`, `mkdir` | MEDIUM |
| `src/modification/file-operations.ts` | `readFile`, `writeFile`, `stat` | MEDIUM |
| `src/modification/code-modifier.ts` | `readFile`, `writeFile` | MEDIUM |
| `src/validation/code-validator.ts` | `readFile`, `readdir` | LOW |
| `src/utils/logger.ts` | `writeFileSync`, `mkdirSync` | LOW |

### 2.3 Стратегия миграции

```
1. НЕ ломать Node.js совместимость
2. Использовать feature detection
3. Приоритет async операциям
4. Sync только для критического пути (startup)
```

---

## Фаза 3: Shell операции (Приоритет: MEDIUM)

### 3.1 Создать `src/utils/shell.ts`

```typescript
import { runtime } from "./runtime.js";

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute shell command (Bun $ или child_process)
 */
export async function exec(command: string, cwd?: string): Promise<ShellResult> {
  if (runtime.isBun) {
    const { $ } = await import("bun");
    try {
      const result = await $`${command}`.cwd(cwd || process.cwd()).quiet();
      return {
        stdout: await result.text(),
        stderr: "",
        exitCode: result.exitCode,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || "",
        stderr: error.stderr?.toString() || "",
        exitCode: error.exitCode || 1,
      };
    }
  }

  // Node.js fallback
  const { exec: nodeExec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(nodeExec);

  try {
    const { stdout, stderr } = await execAsync(command, { cwd, encoding: "utf-8" });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      exitCode: error.code || 1,
    };
  }
}

/**
 * Git-specific helpers (наиболее частые операции)
 */
export async function gitDiff(base: string, head: string, cwd: string): Promise<string> {
  const result = await exec(`git diff --name-status ${base}..${head}`, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`git diff failed: ${result.stderr}`);
  }
  return result.stdout;
}

export async function gitMergeBase(branch1: string, branch2: string, cwd: string): Promise<string> {
  const result = await exec(`git merge-base ${branch1} ${branch2}`, cwd);
  return result.stdout.trim();
}
```

### 3.2 Критические места для миграции

| Файл | Операция | Риск |
|------|----------|------|
| `src/index.ts:1473-1491` | `find`, `du` команды | **CRITICAL** - блокирует main thread |
| `src/core/git-watcher.ts` | `git diff`, `git status` | HIGH |
| `src/layered/git-delta-computer.ts` | `git merge-base`, `git diff` | HIGH |
| `src/gpu/detection/gpu-detector.ts` | `nvidia-smi` | MEDIUM |

### 3.3 Замена `find`/`du` на нативные API

```typescript
// БЫЛО (блокирующее):
const fileCount = execSync(`find "${dir}" -type f | wc -l`);
const dirSize = execSync(`du -sb "${dir}" | cut -f1`);

// СТАНЕТ (async, cross-platform):
import { glob } from "./glob.js";
import { stat } from "node:fs/promises";

async function countFiles(dir: string): Promise<number> {
  const files = await glob("**/*", { cwd: dir, onlyFiles: true });
  return files.length;
}

async function getDirSize(dir: string): Promise<number> {
  // Используем fast-glob или Bun.Glob + stat
  let totalSize = 0;
  const files = await glob("**/*", { cwd: dir, onlyFiles: true });
  for (const file of files) {
    const stats = await stat(join(dir, file));
    totalSize += stats.size;
  }
  return totalSize;
}
```

---

## Фаза 4: Glob операции (Приоритет: MEDIUM)

### 4.1 Создать `src/utils/glob.ts`

```typescript
import { runtime, features } from "./runtime.js";

interface GlobOptions {
  cwd?: string;
  onlyFiles?: boolean;
  onlyDirectories?: boolean;
  ignore?: string[];
  absolute?: boolean;
}

/**
 * Glob file search (Bun.Glob или fast-glob fallback)
 */
export async function glob(pattern: string, options: GlobOptions = {}): Promise<string[]> {
  if (features.bunGlob) {
    const glob = new Bun.Glob(pattern);
    const results: string[] = [];

    for await (const path of glob.scan({
      cwd: options.cwd || ".",
      onlyFiles: options.onlyFiles,
    })) {
      // Apply ignore patterns
      if (options.ignore?.some(ig => path.includes(ig))) continue;
      results.push(options.absolute ? join(options.cwd || ".", path) : path);
    }

    return results;
  }

  // Node.js fallback using fast-glob
  const fg = await import("fast-glob");
  return fg.default(pattern, {
    cwd: options.cwd,
    onlyFiles: options.onlyFiles,
    onlyDirectories: options.onlyDirectories,
    ignore: options.ignore,
    absolute: options.absolute,
  });
}

/**
 * Check if path matches pattern
 */
export function match(pattern: string, path: string): boolean {
  if (features.bunGlob) {
    const glob = new Bun.Glob(pattern);
    return glob.match(path);
  }

  // Node.js fallback using minimatch
  const { minimatch } = require("minimatch");
  return minimatch(path, pattern);
}
```

### 4.2 Зависимости

```json
{
  "dependencies": {
    "fast-glob": "^3.3.0"  // Только для Node.js fallback
  },
  "optionalDependencies": {
    "minimatch": "^9.0.0"
  }
}
```

---

## Фаза 5: SQLite оптимизации (Приоритет: LOW)

### 5.1 Текущий статус

**`src/storage/sqlite-adapter.ts` уже готов!**

- ✅ `isBunRuntime()` - определение runtime
- ✅ `BunDatabaseAdapter` - wrapper для `bun:sqlite`
- ✅ API совместимость с `better-sqlite3`
- ✅ Поддержка extensions (`loadExtension`)
- ✅ Transactions, prepared statements

### 5.2 Дополнительные оптимизации

```typescript
// В Bun можно использовать WAL2 mode (если поддерживается)
if (runtime.isBun) {
  db.exec("PRAGMA journal_mode = WAL;");
  // Bun's SQLite может поддерживать дополнительные оптимизации
}
```

### 5.3 Бенчмарки (ожидаемые)

| Операция | Node.js + better-sqlite3 | Bun + bun:sqlite | Speedup |
|----------|-------------------------|------------------|---------|
| SELECT 1000 rows | ~15ms | ~5ms | **3x** |
| INSERT batch 1000 | ~25ms | ~8ms | **3x** |
| Prepared statement | ~1ms | ~0.3ms | **3x** |

---

## Фаза 6: Дополнительные Bun фичи (Приоритет: LOW)

### 6.1 Password Hashing

```typescript
// Если нужно хэширование паролей
export async function hashPassword(password: string): Promise<string> {
  if (runtime.isBun) {
    return Bun.password.hash(password);
  }
  // Node.js fallback
  const bcrypt = await import("bcrypt");
  return bcrypt.hash(password, 10);
}
```

### 6.2 Compression

```typescript
export function gzipSync(data: Buffer): Buffer {
  if (runtime.isBun) {
    return Buffer.from(Bun.gzipSync(data));
  }
  const { gzipSync } = require("node:zlib");
  return gzipSync(data);
}
```

### 6.3 YAML Parsing

```typescript
export function parseYaml(content: string): unknown {
  if (runtime.isBun && typeof Bun.YAML !== "undefined") {
    return Bun.YAML.parse(content);
  }
  const yaml = require("yaml");
  return yaml.parse(content);
}
```

---

## План внедрения

### Этап 1: Подготовка (1-2 дня)
- [ ] Создать `src/utils/runtime.ts`
- [ ] Создать `src/types/bun.d.ts`
- [ ] Добавить тесты для runtime detection

### Этап 2: Файловые операции (3-4 дня)
- [ ] Создать `src/utils/file-ops.ts`
- [ ] Мигрировать `config-paths.ts`
- [ ] Мигрировать `yaml-config.ts`
- [ ] Мигрировать `version-manager.ts`
- [ ] Добавить интеграционные тесты

### Этап 3: Shell операции (2-3 дня)
- [ ] Создать `src/utils/shell.ts`
- [ ] Заменить `find`/`du` в `index.ts`
- [ ] Мигрировать Git операции
- [ ] Тестирование cross-platform

### Этап 4: Glob (1-2 дня)
- [ ] Создать `src/utils/glob.ts`
- [ ] Добавить `fast-glob` dependency
- [ ] Интеграция с file discovery

### Этап 5: Бенчмаркинг (1 день)
- [ ] Создать benchmark suite
- [ ] Сравнить Node.js vs Bun performance
- [ ] Документировать результаты

---

## Риски и митигации

| Риск | Митигация |
|------|-----------|
| Breaking Node.js | Feature detection + fallbacks |
| Bun API изменения | Pin Bun version, типы из DefinitelyTyped |
| Extension несовместимость | Graceful fallback на pure JS |
| Тесты не проходят | Отдельные test suites для Bun/Node |

---

## Метрики успеха

| Метрика | Цель |
|---------|------|
| Startup time | -50% под Bun |
| File read latency | -30% под Bun |
| SQLite queries | -60% под Bun |
| Memory usage | -20% под Bun |
| Node.js regression | 0% (полная совместимость) |

---

## Команды для разработки

```bash
# Запуск под Node.js
npm run dev

# Запуск под Bun
bun run src/index.ts

# Тесты под Node.js
npm test

# Тесты под Bun
bun test

# Бенчмарки
bun run benchmarks/runtime-comparison.ts
```

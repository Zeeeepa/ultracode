# Bun Runtime: Специфичные API и фичи

*Справочник для разработчиков MCP-сервисов и CLI-утилит*

---

## Введение

Bun — это современный JavaScript/TypeScript runtime, написанный на Zig и использующий JavaScriptCore (движок Safari). Он значительно быстрее Node.js на старте и имеет множество встроенных оптимизированных API.

Этот документ описывает Bun-специфичные API, которые можно использовать в коде для повышения производительности, а также паттерны для создания гибридных пакетов, работающих и под Bun, и под Node.js.

---

## 1. Определение рантайма

Перед использованием Bun-специфичных API необходимо определить, под каким рантаймом выполняется код.

### Через глобальный объект Bun

```typescript
if (typeof Bun !== "undefined") {
  // Код выполняется под Bun
  console.log("Running on Bun", Bun.version);
}
```

### Через process.versions (TypeScript-безопасно)

```typescript
const isBun = "bun" in process.versions;
const bunVersion = process.versions.bun; // "1.3.3" или undefined
```

### Универсальный хелпер

```typescript
export const runtime = {
  isBun: typeof Bun !== "undefined",
  isNode: typeof process !== "undefined" && !("bun" in process.versions),
  isDeno: typeof Deno !== "undefined",
};
```

---

## 2. Файловая система (Bun.file / Bun.write)

Bun предоставляет оптимизированные API для работы с файлами, которые значительно быстрее Node.js fs.

### Чтение файлов

```typescript
// Bun.file() создаёт «ленивую» ссылку — файл не читается сразу
const file = Bun.file("./data.json");

// Различные форматы чтения
const text = await file.text();          // string
const json = await file.json();          // parsed JSON
const bytes = await file.bytes();        // Uint8Array
const buffer = await file.arrayBuffer(); // ArrayBuffer
const stream = file.stream();            // ReadableStream

// Проверка существования и метаданные
const exists = await file.exists();      // boolean
const size = file.size;                  // number (bytes)
const type = file.type;                  // MIME type
```

### Запись файлов

```typescript
// Bun.write() принимает множество типов данных
await Bun.write("output.txt", "Hello, World!");
await Bun.write("data.json", JSON.stringify(obj));
await Bun.write("copy.txt", Bun.file("source.txt")); // копирование
await Bun.write("response.html", await fetch(url));  // из Response
await Bun.write(Bun.stdout, "Print to console");     // в stdout
```

### Инкрементальная запись

```typescript
const file = Bun.file("log.txt");
const writer = file.writer();
writer.write("Line 1\n");
writer.write("Line 2\n");
await writer.flush(); // или writer.end()
```

### Fallback для Node.js

```typescript
async function readFile(path: string): Promise<string> {
  if (typeof Bun !== "undefined") {
    return Bun.file(path).text();
  }
  const fs = await import("fs/promises");
  return fs.readFile(path, "utf-8");
}
```

---

## 3. Glob (Bun.Glob)

Встроенный glob для поиска файлов по паттерну, быстрее сторонних библиотек.

```typescript
const glob = new Bun.Glob("**/*.ts");

// Итерация по файлам
for await (const path of glob.scan({ cwd: "./src" })) {
  console.log(path);
}

// Или получить массив сразу
const files = await Array.fromAsync(glob.scan("./src"));

// Проверка соответствия паттерну
glob.match("src/index.ts"); // true
```

---

## 4. HTTP-сервер (Bun.serve)

Высокопроизводительный HTTP-сервер со встроенной маршрутизацией и WebSocket поддержкой.

### Базовый пример

```typescript
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/health") {
      return Response.json({ status: "ok" });
    }
    return new Response("Not Found", { status: 404 });
  },
});
console.log(`Server running at ${server.url}`);
```

### Встроенный роутинг (v1.2.3+)

```typescript
Bun.serve({
  routes: {
    // Статические роуты
    "/api/status": new Response("OK"),
    
    // Динамические параметры
    "/users/:id": (req) => Response.json({ id: req.params.id }),
    
    // Разные методы
    "/api/posts": {
      GET: () => Response.json([]),
      POST: async (req) => Response.json(await req.json()),
    },
    
    // Wildcard
    "/api/*": Response.json({ error: "Not found" }, { status: 404 }),
  },
  
  // Fallback для остальных запросов
  fetch(req) {
    return new Response("Fallback");
  },
});
```

### WebSocket поддержка

```typescript
Bun.serve({
  fetch(req, server) {
    if (server.upgrade(req)) return; // WebSocket upgrade
    return new Response("HTTP request");
  },
  websocket: {
    open(ws) { console.log("Connected"); },
    message(ws, msg) { ws.send(`Echo: ${msg}`); },
    close(ws) { console.log("Disconnected"); },
  },
});
```

---

## 5. SQLite (bun:sqlite)

Встроенный высокопроизводительный SQLite драйвер, в 3-6 раз быстрее better-sqlite3.

```typescript
import { Database } from "bun:sqlite";

const db = new Database("mydb.sqlite");
// Или in-memory: new Database(":memory:")

// Выполнение запросов
db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
db.run("INSERT INTO users (name) VALUES (?)", ["Alice"]);

// Подготовленные запросы (кэшируются)
const query = db.query("SELECT * FROM users WHERE id = ?");
const user = query.get(1);        // один результат
const users = query.all();        // массив
const rows = query.values();      // массив массивов

// Транзакции
const insertMany = db.transaction((items) => {
  for (const item of items) {
    db.run("INSERT INTO users (name) VALUES (?)", [item]);
  }
});
insertMany(["Bob", "Charlie"]);

// WAL mode для производительности
db.exec("PRAGMA journal_mode = WAL;");
```

---

## 6. Shell API ($ из bun)

Встроенная оболочка для выполнения команд, работает на всех платформах включая Windows.

```typescript
import { $ } from "bun";

// Простая команда
await $`echo "Hello"`;

// Получение результата
const result = await $`ls -la`.text();
const lines = await $`cat file.txt`.lines();

// Переменные безопасно экранируются
const dir = "./src";
await $`find ${dir} -name "*.ts"`;

// Пайпинг
const response = await fetch("https://example.com");
const compressed = await $`gzip < ${response}`.arrayBuffer();

// Тихий режим (без вывода)
await $`rm -rf temp`.quiet();

// Проверка exit code
const { exitCode } = await $`test -f config.json`.nothrow();
```

---

## 7. Хэширование и пароли

### Быстрое хэширование (некриптографическое)

```typescript
// Bun.hash — очень быстрый, для хэш-таблиц и дедупликации
const hash = Bun.hash("some data");           // number
const hashBigInt = Bun.hash.wyhash("data");   // bigint

// Криптографические хэши
const sha256 = Bun.SHA256.hash("data");       // Uint8Array
const sha512 = Bun.SHA512.hash("data");
const md5 = Bun.MD5.hash("data");
```

### Хэширование паролей

```typescript
// По умолчанию argon2id (рекомендуется)
const hash = await Bun.password.hash("my-password");
// => "$argon2id$v=19$m=65536,t=2,p=1$..."

const isValid = await Bun.password.verify("my-password", hash);
// => true

// Или bcrypt
const bcryptHash = await Bun.password.hash("password", "bcrypt");

// Синхронные версии (блокируют event loop)
const hashSync = Bun.password.hashSync("password");
```

---

## 8. Сжатие данных

```typescript
// Синхронное сжатие
const data = Buffer.from("Hello, World!");

const gzipped = Bun.gzipSync(data);
const ungzipped = Bun.gunzipSync(gzipped);

const deflated = Bun.deflateSync(data);
const inflated = Bun.inflateSync(deflated);

// Потоковое сжатие (v1.3.3+)
const stream = response.body
  .pipeThrough(new CompressionStream("gzip"));

// Поддерживаются: "gzip", "deflate", "deflate-raw", "brotli", "zstd"
```

---

## 9. FFI — вызов нативного кода

Bun позволяет вызывать функции из нативных библиотек (C, Rust, Zig и др.).

```typescript
import { dlopen, FFIType, suffix } from "bun:ffi";

const lib = dlopen(`libcrypto.${suffix}`, {
  SHA256: {
    args: [FFIType.ptr, FFIType.usize, FFIType.ptr],
    returns: FFIType.ptr,
  },
});

// Вызов функции
const result = lib.symbols.SHA256(dataPtr, dataLen, outputPtr);
```

---

## 10. Работа с YAML

```typescript
// Импорт YAML файлов напрямую
import config from "./config.yaml";

// Или парсинг в рантайме
const data = Bun.YAML.parse(`
name: my-app
database:
  host: localhost
  port: 5432
`);

console.log(data.database.host); // "localhost"
```

---

## 11. Тестирование (bun:test)

Встроенный Jest-совместимый тест-раннер.

```typescript
import { test, expect, describe, beforeAll } from "bun:test";

describe("MyModule", () => {
  beforeAll(() => {
    // setup
  });

  test("should work", () => {
    expect(1 + 1).toBe(2);
  });

  test.concurrent("async test", async () => {
    const res = await fetch("http://localhost:3000");
    expect(res.status).toBe(200);
  });
});

// Запуск: bun test
```

---

## 12. SQL-клиенты (PostgreSQL, MySQL)

```typescript
import { sql } from "bun";

// Автоматическая защита от SQL-инъекций
const users = await sql`
  SELECT * FROM users
  WHERE active = ${true}
  LIMIT 10
`;

// Вставка с объектом
const [user] = await sql`
  INSERT INTO users ${sql({ name: "Alice", email: "a@b.com" })}
  RETURNING *
`;
```

---

## 13. Redis клиент

```typescript
import { redis } from "bun";

await redis.set("key", "value");
const value = await redis.get("key");

// Pub/Sub
await redis.subscribe("channel", (message) => {
  console.log(message);
});
await redis.publish("channel", "Hello!");
```

---

## 14. Полезные утилиты

```typescript
// Версия Bun
Bun.version;      // "1.3.3"
Bun.revision;     // git commit hash

// Текущий файл
import.meta.dir;  // директория текущего файла
import.meta.file; // имя файла
import.meta.path; // полный путь

// Sleep
await Bun.sleep(1000); // ms
await Bun.sleepSync(1000);

// Генерация UUID
const id = Bun.randomUUIDv7(); // time-sortable UUID

// Base64
const encoded = btoa("Hello");
const decoded = atob(encoded);

// Semver сравнение
Bun.semver.satisfies("1.2.3", "^1.0.0"); // true

// Цвета для консоли
Bun.color("red", "ansi");    // ANSI escape code
Bun.color("#ff0000", "css"); // CSS color string
```

---

## 15. Паттерн гибридного пакета

Для MCP-сервиса, который должен работать и под Bun, и под Node.js:

### package.json

```json
{
  "name": "my-mcp-server",
  "exports": {
    ".": {
      "bun": "./src/index.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "bin": {
    "my-mcp": "./dist/cli.js",
    "my-mcp-bun": "./src/cli.ts"
  }
}
```

### Обёртка с определением рантайма

```typescript
// src/utils/file.ts
export async function readJSON(path: string): Promise<unknown> {
  if (typeof Bun !== "undefined") {
    return Bun.file(path).json();
  }
  const fs = await import("fs/promises");
  const content = await fs.readFile(path, "utf-8");
  return JSON.parse(content);
}

export async function writeFile(path: string, data: string): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(path, data);
    return;
  }
  const fs = await import("fs/promises");
  await fs.writeFile(path, data);
}
```

---

## 16. Сравнение API: Bun vs Node.js

| Функция | Bun | Node.js |
|---------|-----|---------|
| Чтение файла | `Bun.file(path).text()` | `fs.readFile(path, 'utf-8')` |
| Запись файла | `Bun.write(path, data)` | `fs.writeFile(path, data)` |
| HTTP сервер | `Bun.serve({ fetch })` | `http.createServer()` |
| SQLite | `bun:sqlite` (встроен) | `better-sqlite3` (npm) |
| Shell команды | `$` из `'bun'` | `child_process.exec` |
| Хэш пароля | `Bun.password.hash()` | `bcrypt` (npm) |
| Glob поиск | `new Bun.Glob(pattern)` | `glob` (npm) |
| Сжатие | `Bun.gzipSync()` | `zlib.gzipSync()` |
| Тесты | `bun:test` (встроен) | `jest/vitest` (npm) |
| YAML | `Bun.YAML.parse()` | `yaml` (npm) |

---

## Заключение

Использование Bun-специфичных API может значительно повысить производительность вашего приложения. При этом с помощью паттерна определения рантайма можно создавать гибридные пакеты, которые используют оптимальные API в зависимости от среды выполнения.

Для MCP-сервисов это особенно актуально, так как они часто работают как долгоживущие процессы, где встроенные оптимизации Bun (SQLite, файловые операции, Shell) могут дать существенный выигрыш.

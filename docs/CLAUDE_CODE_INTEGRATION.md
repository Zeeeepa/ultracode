# Интеграция с Claude Code

Три способа подключения UltraScript Tools к Claude Code, в зависимости от требований к производительности.

## Способ 1: Cosmopolitan Proxy (Рекомендуется)

**Использует:** `ultrascript-tools.com` — универсальный бинарник (Windows/Linux/macOS)

**Как работает:**
- Claude Code запускает `ultrascript-tools.com` как MCP сервер
- Cosmopolitan proxy автоматически находит Bun (приоритет) или Node.js
- Запускает `index.js` как дочерний процесс с проксированием stdin/stdout
- Работает независимо от того, под каким runtime запущен сам Claude Code

**Преимущества:**
- Универсальный бинарник для всех ОС
- Автоматический выбор лучшего runtime (Bun > Node.js)
- Изоляция MCP сервера от процесса Claude Code
- Работает даже если Claude Code запущен под Node.js

**Конфигурация `~/.claude.json`:**
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "type": "stdio",
      "command": "C:\\path\\to\\ultrascript-tools.cmd",
      "args": ["."]
    }
  }
}
```

> **Примечание:** При сборке автоматически генерируется `ultrascript-tools.cmd` — wrapper для Windows, т.к. Claude Code не распознаёт `.com` файлы.

**Для Linux/macOS:**
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "type": "stdio",
      "command": "/path/to/ultrascript-tools.com",
      "args": ["."]
    }
  }
}
```

**Режимы транспорта comm.c:**
```bash
# stdio режим (по умолчанию) — совместим с Bun
ultrascript-tools.com .

# pipe режим — для Node.js, использует Named Pipes (Windows)
ultrascript-tools.com --pipe .
```

---

## Способ 2: Прямой запуск через Node/Bun

**Использует:** `node index.js` или `bun index.js` напрямую

**Как работает:**
- Claude Code напрямую запускает JavaScript runtime
- Нет промежуточного прокси
- Каждый проект получает отдельный процесс MCP сервера

**Преимущества:**
- Простая конфигурация
- Прямая связь без прокси
- Полный контроль над runtime

**Недостатки:**
- Дублирование серверов для каждого проекта
- Зависимость от установленного runtime
- Bun под Windows имеет проблемы с `--pipe` режимом (setTimeout crashes)

**Конфигурация для Bun:**
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "type": "stdio",
      "command": "bun",
      "args": [
        "C:\\path\\to\\dist\\index.js",
        "."
      ]
    }
  }
}
```

**Конфигурация для Node.js:**
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\path\\to\\dist\\index.js",
        "."
      ]
    }
  }
}
```

---

## Способ 3: Ultra-режим (Максимальная производительность)

**Использует:** Claude Code под Bun + MCP через Cosmopolitan proxy

**Как работает:**
- Claude Code запускается через Bun вместо Node.js (~2-3x быстрее старт)
- MCP серверы работают через Cosmopolitan proxy
- Оба компонента используют Bun для максимальной производительности

**Преимущества:**
- Максимальная скорость запуска Claude Code
- Максимальная скорость MCP операций
- Полное использование Bun runtime

**Требования:**
- Bun установлен глобально
- Claude Code установлен через `bun install -g @anthropic-ai/claude-code`

**Запуск Claude Code через Bun:**

```powershell
# Windows PowerShell
bun "$env:USERPROFILE\.bun\install\global\node_modules\@anthropic-ai\claude-code\cli.js" --continue --permission-mode bypassPermissions
```

```bash
# Linux/macOS
bun ~/.bun/install/global/node_modules/@anthropic-ai/claude-code/cli.js --continue --permission-mode bypassPermissions
```

**Удобный алиас (PowerShell profile):**
```powershell
# Добавить в $PROFILE
function claude-ultra {
    bun "$env:USERPROFILE\.bun\install\global\node_modules\@anthropic-ai\claude-code\cli.js" --continue --permission-mode bypassPermissions @args
}
```

**Удобный алиас (Bash/Zsh):**
```bash
# Добавить в ~/.bashrc или ~/.zshrc
alias claude-ultra='bun ~/.bun/install/global/node_modules/@anthropic-ai/claude-code/cli.js --continue --permission-mode bypassPermissions'
```

**MCP конфигурация остаётся той же (Способ 1):**
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "ultrascript-tools.com", "."]
    }
  }
}
```

---

## Сравнение способов

| Критерий | Способ 1 (Proxy) | Способ 2 (Direct) | Способ 3 (Ultra) |
|----------|------------------|-------------------|------------------|
| Скорость запуска Claude | Node.js | Node.js | **Bun** |
| Скорость MCP | **Bun** | Зависит | **Bun** |
| Универсальность | **Высокая** | Средняя | Средняя |
| Настройка | Простая | **Простейшая** | Средняя |
| Изоляция процессов | **Да** | Нет | **Да** |
| Рекомендация | ⭐ Для всех | Для тестов | ⭐⭐ Для продакшн |

---

## Сборка Cosmopolitan proxy

Для сборки `ultrascript-tools.com` требуется [Cosmopolitan Libc](https://github.com/jart/cosmopolitan):

```bash
# Установка cosmocc (Windows PowerShell)
mkdir $env:LOCALAPPDATA\cosmocc
cd $env:LOCALAPPDATA\cosmocc
curl -LO https://cosmo.zip/pub/cosmocc/cosmocc.zip
Expand-Archive cosmocc.zip -DestinationPath .

# Сборка
cd ultrascript-tools-mcp/src/comm
powershell -File build.ps1
```

Результат: `dist/ultrascript-tools.com` — работает на Windows, Linux, macOS (x64/ARM64), FreeBSD, NetBSD, OpenBSD.

---

## Troubleshooting

### Windows: "Executable not found in $PATH"

Claude Code не распознаёт `.com` файлы. Решение — использовать `.cmd` wrapper (генерируется автоматически при сборке):

```json
{
  "command": "path\\to\\ultrascript-tools.cmd",
  "args": ["."]
}
```

Или вручную через `cmd /c`:
```json
{
  "command": "cmd",
  "args": ["/c", "path\\to\\ultrascript-tools.com", "."]
}
```

### Bun: Crash через 5-6 секунд в --pipe режиме

Известная проблема Bun 1.3.x на Windows с setTimeout callbacks. Решение — использовать stdio режим (по умолчанию в comm.c v2.1.0+).

### MCP сервер не отвечает

Проверьте логи:
```bash
# Запуск с отладкой
ultrascript-tools.com --help
bun dist/index.js . 2>&1 | head -100
```

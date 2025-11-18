# Парсеры скриптов (PowerShell, Bash, Batch)

Поддержка парсинга и валидации скриптов с использованием Tree-sitter и специализированных анализаторов.

## 🎯 Возможности

### PowerShell (.ps1, .psm1, .psd1)

**Извлечение сущностей:**
- ✅ Функции с `[CmdletBinding()]` и параметрами
- ✅ Фильтры (filters) - специальные функции для pipeline
- ✅ Классы и enums (PowerShell 5.0+)
- ✅ Переменные с определением scope (global/script/function)
- ✅ Импорты модулей (`using module`, `Import-Module`)
- ✅ Вызовы cmdlets и функций

**Валидация:**
- 🔍 Проверка на использование `Invoke-Expression` с пользовательским вводом
- 🔍 Обнаружение hardcoded credentials
- 🔍 Проверка использования approved verbs (Get, Set, New, Remove, etc.)
- 🔍 Валидация parameter sets и mandatory параметров

**Пример извлеченных данных:**
```typescript
{
  id: "script.ps1:function:Get-UserData",
  name: "Get-UserData",
  type: "function",
  metadata: {
    parameters: ["Username", "Detailed"],
    isCmdlet: true,
    attributes: ["CmdletBinding", "OutputType"]
  }
}
```

---

### Bash/Shell (.sh, .bash, .zsh, .fish)

**Извлечение сущностей:**
- ✅ Функции с автоопределением параметров ($1, $2, ...)
- ✅ Переменные (declare, local, export)
- ✅ Source/import statements (source, .)
- ✅ Команды и pipelines
- ✅ Control flow (if/while/for/case)

**Валидация:**
- 🔍 Проверка неопределенных переменных
- 🔍 Обнаружение опасных паттернов (`rm -rf`, `eval`)
- 🔍 Предупреждения о незакавыченных переменных
- 🔍 Best practices (set -e, trap, error handling)

**Пример извлеченных данных:**
```typescript
{
  id: "deploy.sh:function:deploy_app",
  name: "deploy_app",
  type: "function",
  metadata: {
    parameters: ["$1", "$2", "$3"],
    isBashFunction: true
  }
}
```

---

### Batch/CMD (.bat, .cmd)

**Извлечение сущностей:**
- ✅ Labels и GOTO statements
- ✅ CALL statements (subroutines и external scripts)
- ✅ Переменные (SET, SETX)
- ✅ Control flow (IF, FOR, ERRORLEVEL)

**Валидация:**
- 🔍 Проверка неиспользуемых labels
- 🔍 Обнаружение undefined labels
- 🔍 Опасные команды (FORMAT без /P, DEL /S /Q)
- 🔍 Некорректное использование ERRORLEVEL
- 🔍 Рекомендации по delayed expansion

**Пример извлеченных данных:**
```typescript
{
  id: "build.bat:label:COMPILE",
  name: ":COMPILE",
  type: "function",
  metadata: {
    isLabel: true,
    isBatchLabel: true
  }
}
```

---

## 🔧 Архитектура

### PowerShell Analyzer (`src/parsers/powershell-analyzer.ts`)

**Tree-sitter parser:** `tree-sitter-powershell@0.25.9`

**Поддерживаемые node types:**
- `function_statement` - функции и advanced functions
- `filter_statement` - фильтры для pipeline
- `class_statement` - классы (PS 5.0+)
- `enum_statement` - перечисления
- `assignment_statement` - переменные
- `using_statement` - импорты модулей
- `pipeline` - цепочки команд
- `try_statement` - обработка ошибок

**Специальные возможности:**
- Извлечение атрибутов (`[CmdletBinding()]`, `[Parameter()]`)
- Валидация approved verbs
- Обнаружение security issues
- Tracking imported modules и cmdlets

---

### Bash Analyzer (`src/parsers/bash-analyzer.ts`)

**Tree-sitter parser:** `tree-sitter-bash@0.21.0`

**Поддерживаемые node types:**
- `function_definition` - функции
- `variable_assignment` - переменные
- `declaration_command` - declare/local/export
- `command` - команды и source statements
- `pipeline` - pipelines и redirects
- Control flow: `if_statement`, `while_statement`, `for_statement`, `case_statement`

**Специальные возможности:**
- Автоопределение параметров функций через regex ($1, $2, ...)
- Tracking exports и scope переменных
- Обнаружение source/import dependencies
- Валидация undefined variables

---

### Batch Analyzer (`src/parsers/batch-analyzer.ts`)

**Парсинг:** Regex-based (tree-sitter для Batch недоступен)

**Извлекаемые паттерны:**
```regex
Label:        ^:([A-Za-z_][A-Za-z0-9_]*)\s*$
GOTO:         \bGOTO\s+:?([A-Za-z_][A-Za-z0-9_]*)
CALL:         \bCALL\s+:?([A-Za-z_][A-Za-z0-9_]*|"[^"]+"|[^\s]+)
SET:          \b(?:SET|SETX)\s+([A-Za-z_][A-Za-z0-9_]*)=
Variable ref: %([A-Za-z_][A-Za-z0-9_]*)%
```

**Специальные возможности:**
- Tracking label references и calls
- Валидация built-in переменных (%PATH%, %TEMP%, etc.)
- Обнаружение dangerous patterns
- Проверка delayed expansion usage

---

## 📊 Примеры валидации

### PowerShell - Security Issues

```powershell
# ❌ WARNING
$userInput = Read-Host "Command"
Invoke-Expression $userInput  # Dangerous!

# ✅ SUGGESTION
Use direct invocation or & operator instead
```

```powershell
# ❌ ERROR
$password = "MySecretPassword123"  # Hardcoded!

# ✅ SUGGESTION
Use Get-Credential or secure parameter storage
```

### Bash - Best Practices

```bash
# ❌ INFO
echo $MY_VAR  # Unquoted variable

# ✅ SUGGESTION
echo "$MY_VAR"  # Prevents word splitting
```

```bash
# ❌ WARNING
eval $user_command  # Dangerous with untrusted input

# ✅ SUGGESTION
Avoid eval if possible, or carefully validate input
```

### Batch - Dangerous Patterns

```batch
REM ❌ ERROR
FORMAT C:

REM ✅ SUGGESTION
FORMAT C: /P
```

```batch
REM ❌ WARNING
IF ERRORLEVEL == 1 GOTO ERROR

REM ✅ SUGGESTION
IF ERRORLEVEL 1 GOTO ERROR
REM или
IF %ERRORLEVEL% == 1 GOTO ERROR
```

---

## 🚀 Использование

### Автоматический парсинг

Парсеры автоматически используются при индексации проектов:

```bash
# Индексация проекта с PowerShell скриптами
npx @er77/ultrascript-tools-mcp index /path/to/project

# Парсер автоматически обработает:
# - .ps1, .psm1, .psd1 → PowerShellAnalyzer
# - .sh, .bash          → BashAnalyzer
# - .bat, .cmd          → BatchAnalyzer
```

### Программный доступ

```typescript
import { TreeSitterParser } from "./parsers/tree-sitter-parser.js";

const parser = new TreeSitterParser();
await parser.initialize();

// PowerShell
const psResult = await parser.parse(
  "Get-Process | Where-Object CPU -gt 100",
  "/scripts/monitor.ps1"
);

// Bash
const bashResult = await parser.parse(
  'function deploy() { echo "Deploying to $1"; }',
  "/scripts/deploy.sh"
);

// Batch
const batchResult = await parser.parse(
  ":MAIN\nCALL :COMPILE\nGOTO :EOF",
  "/scripts/build.bat"
);

// Проверка валидации
console.log(psResult.validationIssues);
// [{ type: "info", message: "...", line: 1, suggestion: "..." }]
```

---

## ⚙️ Конфигурация

Конфигурация языков находится в `src/parsers/language-configs.ts`:

```typescript
export const LANGUAGE_KEYWORDS = {
  bash: {
    functions: ["function", "declare"],
    imports: ["source", ".", "import"],
    exports: ["export", "declare"],
  },
  powershell: {
    functions: ["function", "filter", "workflow"],
    classes: ["class", "enum"],
    imports: ["Import-Module", "using", ".", "source"],
  },
  batch: {
    functions: ["call", "goto", "label"],
    imports: ["call"],
    exports: ["set", "setx"],
  },
};
```

---

## 🐛 Известные ограничения

### PowerShell
- Динамические имена функций (через `&`) могут быть не распознаны
- Workflow-блоки требуют дополнительного анализа

### Bash
- Сложные heredocs могут парситься некорректно
- Process substitution `<()` имеет ограниченную поддержку

### Batch
- Отсутствие tree-sitter → ограниченный синтаксический анализ
- Контекстно-зависимые конструкции могут требовать дополнительной валидации
- Delayed expansion `!VAR!` распознается только через проверку SETLOCAL

---

## 🔄 Интеграция с графом кода

Все извлеченные сущности автоматически добавляются в граф кода:

```typescript
// Entities
{ type: "function", name: "Deploy-Application" }
{ type: "class", name: "ConfigManager" }
{ type: "variable", name: "$connectionString" }

// Relationships
{ from: "deploy.ps1:function:Deploy-App", to: "Azure.Storage", type: "imports" }
{ from: "build.sh:function:compile", to: "utils.sh", type: "imports" }
{ from: "setup.bat:line:15", to: "setup.bat:label:INSTALL", type: "calls" }
```

**Запросы к графу:**

```
"Найди все PowerShell функции с CmdletBinding"
"Покажи зависимости между bash скриптами"
"Где используется переменная %JAVA_HOME%?"
```

---

## 📚 Дополнительные ресурсы

- [Tree-sitter PowerShell Grammar](https://github.com/PowerShell/tree-sitter-PowerShell)
- [Tree-sitter Bash Grammar](https://github.com/tree-sitter/tree-sitter-bash)
- [PowerShell Best Practices](https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands)
- [Bash Style Guide](https://google.github.io/styleguide/shellguide.html)

---

**Версия:** 3.9.0
**Дата:** 2025-11-18

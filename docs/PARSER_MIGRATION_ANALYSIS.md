# Анализ миграции парсеров: Tree-Sitter → Нативные парсеры языков

> **Дата анализа**: 2025-12-02
> **Ветка**: `no-trees`
> **Версия проекта**: 1.6.4

---

## Философия решения

**Принцип**: Разработчик, использующий инструмент для работы с кодом на языке X, **всегда имеет** установленный runtime/компилятор языка X.

- Python-разработчик → имеет `python`
- Java-разработчик → имеет `java` + JDK
- Rust-разработчик → имеет `rustc` + `cargo`
- Go-разработчик → имеет `go`

**Вывод**: Tree-sitter **полностью исключается**. Используем нативные инструменты каждого языка.

---

## 1. Текущее состояние Tree-Sitter (удаляется)

### 1.1 Проблемы, которые устраняем

| Проблема | Влияние | Решение |
|----------|---------|---------|
| NODE_MODULE_VERSION конфликты | Сломанная установка при обновлении Node.js | Нет нативных модулей |
| 28 MB prebuilds | Раздутый размер пакета | Только JS-зависимости |
| C++ компиляция | Требуется MSVC/GCC | Не нужна |
| Отсутствие типов | Только синтаксический AST | Полная семантика от нативных парсеров |
| Отставание грамматик | tree-sitter-kotlin@0.3.8 | Официальные компиляторы всегда актуальны |

### 1.2 Что удаляется

```
❌ external-libs/tree-sitter-*/           # 28 MB prebuilds
❌ src/parsers/tree-sitter-parser.ts      # Главный парсер
❌ src/parsers/tree-sitter-loader.ts      # Loader prebuilds
❌ scripts/build-tree-sitter-prebuilds.*  # Скрипты сборки
❌ optionalDependencies: tree-sitter-*    # 16 пакетов
```

---

## 2. Нативные парсеры по языкам

### 2.1 JavaScript/TypeScript (ПРИОРИТЕТ 0)

#### Решение: TypeScript Compiler API

| Критерий | Оценка | Детали |
|----------|--------|--------|
| **Полнота AST** | ⭐⭐⭐⭐⭐ | Полная типизация, резолвинг, семантика |
| **Инкрементальность** | ⭐⭐⭐⭐⭐ | Watch API, builder API |
| **Поддержка** | ⭐⭐⭐⭐⭐ | Microsoft, ежемесячные релизы |
| **Нативные модули** | ✅ НЕТ | Чистый TypeScript |
| **Требования** | Node.js | Уже есть (MCP сервер на Node) |

**Возможности:**
- Полная типовая модель (TypeChecker)
- Go to Definition, Find All References
- Рефакторинги: Rename, Extract Method
- Диагностики с точными позициями
- Инкрементальная компиляция

**API:**
```typescript
import ts from "typescript";

// Парсинг без типов (быстро)
const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest);

// Полный анализ с типами
const program = ts.createProgram(files, options);
const typeChecker = program.getTypeChecker();
```

---

### 2.2 Python (ПРИОРИТЕТ 1)

#### Решение: Python `ast` модуль + опционально Pyright

| Вариант | Плюсы | Минусы |
|---------|-------|--------|
| **Python ast** | Официальный, всегда актуальный | Только синтаксис, нет типов |
| **Pyright** | Полные типы, TypeScript-based | Отдельный процесс |

**Рекомендация**: `python -c "import ast; ..."` для базового AST + Pyright для type inference.

**Требования**: Python 3.8+ (у Python-разработчика есть)

**API (через subprocess):**
```python
import ast
import json
import sys

tree = ast.parse(sys.stdin.read())
# Сериализация в JSON для Node.js
```

**Pyright (опционально):**
```bash
npx pyright --outputjson file.py
```

---

### 2.3 Java (ПРИОРИТЕТ 2)

#### Решение: JavaParser (standalone JAR)

| Критерий | Оценка | Детали |
|----------|--------|--------|
| **Полнота AST** | ⭐⭐⭐⭐⭐ | Полный Java AST |
| **Symbol Resolution** | ⭐⭐⭐⭐ | Опционально через javaparser-symbol-solver |
| **Зрелость** | ⭐⭐⭐⭐⭐ | Широко используется |
| **Требования** | JRE 11+ | У Java-разработчика есть |

**Интеграция:**
```bash
# Запуск JAR с stdin/stdout
java -jar javaparser-cli.jar parse --format json < File.java
```

**Альтернатива**: Eclipse JDT LS (тяжелее, но полный LSP)

---

### 2.4 Kotlin (ПРИОРИТЕТ 2)

#### Решение: Kotlin Compiler Embeddable

| Критерий | Оценка | Детали |
|----------|--------|--------|
| **Полнота** | ⭐⭐⭐⭐⭐ | Официальный компилятор |
| **Интеграция** | ⭐⭐⭐ | Требует JVM |
| **Требования** | JRE 11+ / Kotlin | У Kotlin-разработчика есть |

**Библиотека:**
```kotlin
// kotlin-compiler-embeddable
val environment = KotlinCoreEnvironment.createForProduction(...)
val ktFile = PsiManager.getInstance(project).findFile(virtualFile)
```

**Альтернатива**: Kotlin Language Server (experimental)

---

### 2.5 Go (ПРИОРИТЕТ 2)

#### Решение: `go/parser` (стандартная библиотека)

| Критерий | Оценка | Детали |
|----------|--------|--------|
| **Полнота** | ⭐⭐⭐⭐⭐ | Официальный парсер Go |
| **Типы** | ⭐⭐⭐⭐⭐ | `go/types` для type checking |
| **Требования** | Go 1.18+ | У Go-разработчика есть |

**CLI tool (создаём свой):**
```go
package main

import (
    "go/parser"
    "go/token"
    "encoding/json"
)

func main() {
    fset := token.NewFileSet()
    f, _ := parser.ParseFile(fset, "file.go", nil, parser.ParseComments)
    // Сериализация в JSON
}
```

**Альтернатива**: `gopls` (Go Language Server)

---

### 2.6 Rust (ПРИОРИТЕТ 3)

#### Решение: `syn` + `rust-analyzer` API

| Критерий | Оценка | Детали |
|----------|--------|--------|
| **syn** | ⭐⭐⭐⭐⭐ | Парсинг Rust кода в proc-macros |
| **rust-analyzer** | ⭐⭐⭐⭐⭐ | Полная IDE функциональность |
| **Требования** | Rust toolchain | У Rust-разработчика есть |

**CLI (через cargo):**
```bash
cargo run --package ast-extractor < file.rs
```

**Альтернатива**: rust-analyzer LSP

---

### 2.7 C/C++ (ПРИОРИТЕТ 3)

#### Решение: Clang/libclang

| Критерий | Оценка | Детали |
|----------|--------|--------|
| **Полнота** | ⭐⭐⭐⭐⭐ | Полный AST + семантика |
| **Требования** | LLVM/Clang | У C/C++ разработчика обычно есть |

**CLI:**
```bash
clang -Xclang -ast-dump=json file.c
```

**Альтернатива**: clangd (LSP)

---

### 2.8 Swift (ПРИОРИТЕТ 3)

#### Решение: SwiftSyntax + SourceKit

| Критерий | Оценка | Детали |
|----------|--------|--------|
| **SwiftSyntax** | ⭐⭐⭐⭐⭐ | Официальная библиотека Apple |
| **Требования** | Xcode / Swift toolchain | У Swift-разработчика есть |

**CLI:**
```bash
swift-syntax-dump file.swift
# или через sourcekit-lsp
```

---

### 2.9 Bash/Shell (ПРИОРИТЕТ 3)

#### Решение: ShellCheck + shfmt

| Инструмент | Назначение |
|------------|------------|
| **shfmt** | Парсинг и форматирование |
| **ShellCheck** | Статический анализ |

**Требования**: Установленный `bash` (есть везде кроме Windows по умолчанию)

**CLI:**
```bash
shfmt -tojson script.sh
```

---

### 2.10 PowerShell (Windows)

#### Решение: PowerShell AST API

**Требования**: PowerShell 5.1+ (встроен в Windows)

```powershell
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$null)
$ast | ConvertTo-Json -Depth 10
```

---

## 3. Сводная таблица решений

| Язык | Парсер | Требования | Нативные модули |
|------|--------|------------|-----------------|
| **JS/TS** | TypeScript Compiler API | Node.js (уже есть) | ❌ Нет |
| **Python** | `ast` модуль + Pyright | Python 3.8+ | ❌ Нет |
| **Java** | JavaParser JAR | JRE 11+ | ❌ Нет |
| **Kotlin** | kotlin-compiler-embeddable | JRE 11+ | ❌ Нет |
| **Go** | go/parser | Go 1.18+ | ❌ Нет |
| **Rust** | syn / rust-analyzer | Rust toolchain | ❌ Нет |
| **C/C++** | Clang | LLVM/Clang | ❌ Нет |
| **Swift** | SwiftSyntax / SourceKit | Xcode/Swift | ❌ Нет |
| **Bash** | shfmt / ShellCheck | bash | ❌ Нет |
| **PowerShell** | PSParser | PowerShell 5.1+ | ❌ Нет |

**Итог**: 0 нативных Node.js модулей!

---

## 4. Архитектура интеграции

### 4.1 Общий паттерн

```
┌─────────────────────────────────────────────────────────────────┐
│                     UnifiedParser (TypeScript)                  │
├─────────────────────────────────────────────────────────────────┤
│  detectLanguage(file) → LanguageParser                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ TypeScript    │  │ Python        │  │ External      │
│ Compiler API  │  │ subprocess    │  │ CLI Tools     │
│ (in-process)  │  │ (ast module)  │  │ (Java, Go...) │
└───────────────┘  └───────────────┘  └───────────────┘
```

### 4.2 Типы интеграции

| Тип | Языки | Метод |
|-----|-------|-------|
| **In-process** | JS/TS | Прямой вызов TypeScript API |
| **Subprocess** | Python, Go, Rust | Вызов CLI с JSON output |
| **JAR execution** | Java, Kotlin | `java -jar parser.jar` |
| **System CLI** | C/C++, Swift | `clang`, `swift-syntax-dump` |

---

## 5. Требования к окружению (README секция)

### 5.1 Обязательные

| Компонент | Версия | Для чего |
|-----------|--------|----------|
| Node.js | 20+ | MCP сервер |

### 5.2 Опциональные (по языкам)

| Язык | Требование | Проверка |
|------|------------|----------|
| **Python** | Python 3.8+ | `python --version` |
| **Java** | JRE 11+ | `java --version` |
| **Kotlin** | JRE 11+ (то же что Java) | `java --version` |
| **Go** | Go 1.18+ | `go version` |
| **Rust** | rustc + cargo | `rustc --version` |
| **C/C++** | Clang 12+ | `clang --version` |
| **Swift** | Swift 5.5+ / Xcode | `swift --version` |
| **Bash** | shfmt (опционально) | `shfmt --version` |

---

## 6. Преимущества нового подхода

### 6.1 Устранённые проблемы

| Проблема | Было | Стало |
|----------|------|-------|
| NODE_MODULE_VERSION | Частые поломки | ❌ Нет |
| Prebuild размер | 28 MB | 0 MB |
| C++ компиляция | Требуется | ❌ Не нужна |
| Типовая информация | Отсутствует | ✅ Полная |
| Актуальность грамматик | Отстают | ✅ Официальные компиляторы |

### 6.2 Новые возможности

- ✅ **Полная типизация** для JS/TS/Python/Java/Go/Rust
- ✅ **Семантический анализ** (не только синтаксис)
- ✅ **Резолвинг импортов** и модулей
- ✅ **Рефакторинги** на уровне компилятора
- ✅ **Точные диагностики** с позициями ошибок

---

## 7. Метрики успеха

| Метрика | Было | Цель |
|---------|------|------|
| Нативные модули | 17 штук | 0 |
| Размер external-libs | 28 MB | 0 MB |
| Зависимость от Node ABI | Да | Нет |
| Типовая информация JS/TS | 0% | 100% |
| Типовая информация Python | 0% | 100% (с Pyright) |
| Поддержка новых фич языков | Отставание 6-12 мес | День в день |

---

## Источники

- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [Python ast module](https://docs.python.org/3/library/ast.html)
- [Pyright](https://github.com/microsoft/pyright)
- [JavaParser](https://javaparser.org/)
- [go/parser](https://pkg.go.dev/go/parser)
- [syn (Rust)](https://docs.rs/syn/latest/syn/)
- [Clang AST](https://clang.llvm.org/docs/IntroductionToTheClangAST.html)
- [SwiftSyntax](https://github.com/apple/swift-syntax)

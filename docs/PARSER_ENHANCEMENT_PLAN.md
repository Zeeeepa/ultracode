# Parser Enhancement Plan

План расширения парсеров для извлечения дополнительной информации из кода.

## Цели

1. **Статическая трассировка** - возможность отслеживать поток выполнения без запуска кода
2. **Call Graph** - граф вызовов между функциями/методами
3. **Data Flow** - отслеживание зависимостей данных
4. **Улучшенная документация** - извлечение JSDoc/docstrings
5. **Метрики качества** - cyclomatic complexity, cognitive complexity

---

## TypeScript/JavaScript Parser

### Текущее состояние

Парсер использует TypeScript Compiler API (`ts.createSourceFile`).

**Уже извлекается:**
- Functions, classes, methods, interfaces, types, enums
- Modifiers (async, static, private, public, readonly, abstract, export)
- Parameters с типами и default values
- Return types
- Decorators
- Inheritance (extends, implements)
- Imports/Exports со specifiers
- Properties, getters, setters

### Фаза 1: Call Graph

**Цель:** Извлекать все вызовы функций/методов внутри каждой функции.

**Что добавить в `ParsedEntity`:**
```typescript
calls?: Array<{
  name: string;           // имя вызываемой функции/метода
  target?: string;        // объект вызова (this, obj, ClassName)
  location: Location;     // где происходит вызов
  isAsync: boolean;       // await call()
  isOptional: boolean;    // obj?.method()
  arguments: number;      // количество аргументов
}>;
```

**TypeScript API для извлечения:**
- `ts.isCallExpression(node)` - обычный вызов `foo()`
- `ts.isNewExpression(node)` - `new Foo()`
- `ts.isPropertyAccessExpression(node)` - `obj.method`
- `ts.isElementAccessExpression(node)` - `obj['method']`
- `ts.isAwaitExpression(node)` - `await foo()`

**Файлы для изменения:**
- `src/parsers/typescript-parser.ts` - добавить extractCalls()
- `src/types/parser.ts` - расширить ParsedEntity

### Фаза 2: Control Flow

**Цель:** Извлекать структуру control flow для статической трассировки.

**Что добавить в `ParsedEntity`:**
```typescript
controlFlow?: {
  branches: Array<{
    type: 'if' | 'else' | 'switch' | 'case' | 'ternary';
    condition?: string;     // текст условия
    location: Location;
  }>;
  loops: Array<{
    type: 'for' | 'while' | 'do' | 'for-of' | 'for-in';
    location: Location;
  }>;
  exceptions: Array<{
    type: 'try' | 'catch' | 'finally' | 'throw';
    catchType?: string;     // тип в catch(e: Error)
    location: Location;
  }>;
  returns: Array<{
    location: Location;
    hasValue: boolean;
  }>;
  awaits: Array<{
    location: Location;
    expression: string;     // что awaited
  }>;
};
```

**TypeScript API:**
- `ts.isIfStatement`, `ts.isConditionalExpression`
- `ts.isSwitchStatement`, `ts.isCaseClause`
- `ts.isForStatement`, `ts.isWhileStatement`, `ts.isForOfStatement`
- `ts.isTryStatement`, `ts.isCatchClause`, `ts.isThrowStatement`
- `ts.isReturnStatement`
- `ts.isAwaitExpression`

### Фаза 3: JSDoc Extraction

**Цель:** Извлекать структурированную документацию.

**Что добавить в `ParsedEntity`:**
```typescript
documentation?: {
  description?: string;
  params?: Array<{
    name: string;
    type?: string;
    description?: string;
  }>;
  returns?: {
    type?: string;
    description?: string;
  };
  throws?: Array<{
    type?: string;
    description?: string;
  }>;
  examples?: string[];
  deprecated?: string | boolean;
  see?: string[];
  since?: string;
  author?: string;
};
```

**TypeScript API:**
- `ts.getJSDocTags(node)`
- `ts.getJSDocParameterTags(node)`
- `ts.getJSDocReturnTag(node)`
- `ts.getJSDocDeprecatedTag(node)`

### Фаза 4: Type References

**Цель:** Отслеживать какие типы использует каждая сущность.

**Что добавить в `ParsedEntity`:**
```typescript
typeReferences?: Array<{
  name: string;           // имя типа
  kind: 'parameter' | 'return' | 'variable' | 'generic' | 'extends' | 'implements';
  location: Location;
}>;
```

**TypeScript API:**
- `ts.isTypeReferenceNode(node)`
- `ts.isTypeQueryNode(node)`
- `checker.getTypeAtLocation(node)` - для resolved types

### Фаза 5: Complexity Metrics

**Цель:** Автоматически вычислять метрики сложности.

**Что добавить в `ParsedEntity.metadata`:**
```typescript
metrics?: {
  cyclomaticComplexity: number;   // количество путей
  cognitiveComplexity: number;    // сложность для понимания
  linesOfCode: number;            // LOC
  linesOfLogic: number;           // без пустых и комментариев
  nestingDepth: number;           // максимальная вложенность
  parameterCount: number;         // количество параметров
  returnCount: number;            // количество return statements
};
```

**Алгоритм Cyclomatic Complexity:**
```
CC = 1 + if + else-if + case + for + while + do + catch + && + || + ?:
```

### Фаза 6: Generics

**Цель:** Извлекать информацию о generic параметрах.

**Что добавить в `ParsedEntity`:**
```typescript
typeParameters?: Array<{
  name: string;           // T, K, V
  constraint?: string;    // extends SomeType
  default?: string;       // = DefaultType
}>;
```

### Фаза 7: Side Effects Detection

**Цель:** Определять функции с побочными эффектами.

**Что добавить в `ParsedEntity.metadata`:**
```typescript
sideEffects?: {
  hasSideEffects: boolean;
  types: Array<'io' | 'network' | 'storage' | 'dom' | 'global' | 'state'>;
  details: Array<{
    type: string;
    location: Location;
    expression: string;
  }>;
};
```

**Эвристики для детекции:**
- `console.*`, `process.*` - I/O
- `fetch`, `XMLHttpRequest`, `axios` - Network
- `localStorage`, `sessionStorage`, `fs.*` - Storage
- `document.*`, `window.*` - DOM
- `global.*`, assignments to outer scope - Global

---

## Python Native Parser

### Текущее состояние

**Файл:** `src/parsers/python-native-parser.ts`

Парсер использует subprocess с Python `ast` module. Встроенный Python скрипт выполняется через `python -c "..."`.

**Уже извлекается:**
- Functions (sync/async), methods, magic methods
- Classes с base classes
- Decorators с аргументами
- Parameters с типами, default values, *args, **kwargs
- Return type annotations
- Imports (import / from ... import)
- Module-level variables и constants (ALL_CAPS)
- Annotated assignments
- Dataclasses, Enums, Protocols, ABC

**Pyright интеграция:** Опциональное расширение типов через Pyright LSP.

### Возможности Python ast module

Python ast предоставляет **полный AST**, что позволяет извлечь всё:

```python
import ast

# Control Flow - ПОЛНОСТЬЮ ДОСТУПНО
ast.If, ast.For, ast.While, ast.Try, ast.With
ast.Match (Python 3.10+)
ast.Return, ast.Raise, ast.Assert
ast.Break, ast.Continue, ast.Pass

# Calls - ПОЛНОСТЬЮ ДОСТУПНО
ast.Call        # function/method calls
ast.Attribute   # obj.method access
ast.Subscript   # obj[key] access

# Comprehensions - ПОЛНОСТЬЮ ДОСТУПНО
ast.ListComp, ast.DictComp, ast.SetComp
ast.GeneratorExp

# Async - ПОЛНОСТЬЮ ДОСТУПНО
ast.AsyncFor, ast.AsyncWith, ast.Await
ast.AsyncFunctionDef

# Documentation - ПОЛНОСТЬЮ ДОСТУПНО
ast.get_docstring(node)  # первая строка body

# Assignments - ПОЛНОСТЬЮ ДОСТУПНО
ast.Assign, ast.AnnAssign, ast.AugAssign
ast.NamedExpr  # walrus operator :=
```

### План расширения Python Parser

#### Фаза 1: Call Graph (в PYTHON_PARSER_SCRIPT)
```python
def extract_calls(node):
    """Извлечь все вызовы внутри функции."""
    calls = []
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            call_info = {
                "location": get_location(child),
                "args_count": len(child.args),
                "has_kwargs": bool(child.keywords)
            }

            # Определить имя вызываемой функции
            if isinstance(child.func, ast.Name):
                call_info["name"] = child.func.id
                call_info["target"] = None
            elif isinstance(child.func, ast.Attribute):
                call_info["name"] = child.func.attr
                # target - это объект: obj.method()
                if isinstance(child.func.value, ast.Name):
                    call_info["target"] = child.func.value.id
                else:
                    call_info["target"] = ast.unparse(child.func.value)

            calls.append(call_info)
    return calls
```

#### Фаза 2: Control Flow (в PYTHON_PARSER_SCRIPT)
```python
def extract_control_flow(node):
    """Извлечь control flow структуру."""
    flow = {
        "branches": [],
        "loops": [],
        "exceptions": [],
        "returns": [],
        "awaits": []
    }

    for child in ast.walk(node):
        # Branches
        if isinstance(child, ast.If):
            flow["branches"].append({
                "type": "if",
                "condition": ast.unparse(child.test),
                "location": get_location(child),
                "has_else": bool(child.orelse)
            })

        # Match/case (Python 3.10+)
        if hasattr(ast, 'Match') and isinstance(child, ast.Match):
            flow["branches"].append({
                "type": "match",
                "cases": len(child.cases),
                "location": get_location(child)
            })

        # Loops
        if isinstance(child, (ast.For, ast.AsyncFor)):
            flow["loops"].append({
                "type": "async_for" if isinstance(child, ast.AsyncFor) else "for",
                "target": ast.unparse(child.target),
                "location": get_location(child)
            })
        elif isinstance(child, ast.While):
            flow["loops"].append({
                "type": "while",
                "condition": ast.unparse(child.test),
                "location": get_location(child)
            })

        # Exceptions
        if isinstance(child, ast.Try):
            flow["exceptions"].append({
                "type": "try",
                "handlers": len(child.handlers),
                "has_finally": bool(child.finalbody),
                "has_else": bool(child.orelse),
                "location": get_location(child)
            })
        elif isinstance(child, ast.Raise):
            flow["exceptions"].append({
                "type": "raise",
                "exception": ast.unparse(child.exc) if child.exc else None,
                "location": get_location(child)
            })

        # Returns
        if isinstance(child, ast.Return):
            flow["returns"].append({
                "location": get_location(child),
                "has_value": child.value is not None,
                "value": ast.unparse(child.value) if child.value else None
            })

        # Awaits
        if isinstance(child, ast.Await):
            flow["awaits"].append({
                "location": get_location(child),
                "expression": ast.unparse(child.value)
            })

    return flow
```

#### Фаза 3: Docstrings с парсингом
```python
def extract_docstring(node):
    """Извлечь и распарсить docstring."""
    docstring = ast.get_docstring(node)
    if not docstring:
        return None

    result = {"description": "", "params": [], "returns": None, "raises": []}

    # Google-style parsing
    lines = docstring.split('\n')
    current_section = "description"

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("Args:"):
            current_section = "args"
        elif stripped.startswith("Returns:"):
            current_section = "returns"
        elif stripped.startswith("Raises:"):
            current_section = "raises"
        elif stripped.startswith("Example"):
            current_section = "example"
        elif current_section == "description":
            result["description"] += line + "\n"
        elif current_section == "args":
            # Parse: param_name (type): description
            match = re.match(r'\s*(\w+)\s*(?:\(([^)]+)\))?:\s*(.+)', stripped)
            if match:
                result["params"].append({
                    "name": match.group(1),
                    "type": match.group(2),
                    "description": match.group(3)
                })
        elif current_section == "returns":
            result["returns"] = {"description": stripped}
        elif current_section == "raises":
            result["raises"].append(stripped)

    return result
```

#### Фаза 4: Comprehensions как отдельные entities
```python
def extract_comprehensions(node):
    """Найти все comprehensions."""
    comps = []
    for child in ast.walk(node):
        if isinstance(child, ast.ListComp):
            comps.append({"type": "list_comprehension", "location": get_location(child)})
        elif isinstance(child, ast.DictComp):
            comps.append({"type": "dict_comprehension", "location": get_location(child)})
        elif isinstance(child, ast.SetComp):
            comps.append({"type": "set_comprehension", "location": get_location(child)})
        elif isinstance(child, ast.GeneratorExp):
            comps.append({"type": "generator_expression", "location": get_location(child)})
    return comps
```

#### Фаза 5: Complexity Metrics
```python
def calculate_complexity(node):
    """Вычислить cyclomatic complexity."""
    complexity = 1  # Base

    for child in ast.walk(node):
        # +1 for each branch
        if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor)):
            complexity += 1
        # +1 for each except handler
        elif isinstance(child, ast.ExceptHandler):
            complexity += 1
        # +1 for each boolean operator
        elif isinstance(child, ast.BoolOp):
            complexity += len(child.values) - 1
        # +1 for comprehension
        elif isinstance(child, (ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)):
            complexity += 1
        # +1 for ternary
        elif isinstance(child, ast.IfExp):
            complexity += 1

    return complexity
```

### Ограничения и решения

| Ограничение | Решение |
|-------------|---------|
| Subprocess overhead | **Batch mode**: парсить несколько файлов за один вызов |
| No incremental parsing | **Кэширование**: хранить AST в SQLite по content hash |
| JSON serialization limits | **Selective extraction**: запрашивать только нужные части |
| Python version differences | **Version detection**: проверять `sys.version_info` |

### Архитектура улучшений

```
┌─────────────────────────────────────────────────────────┐
│                  python-native-parser.ts                │
├─────────────────────────────────────────────────────────┤
│  PYTHON_PARSER_SCRIPT (inline Python code)              │
│  ├── extract_entities()     ← существующее              │
│  ├── extract_calls()        ← NEW: Call Graph           │
│  ├── extract_control_flow() ← NEW: Control Flow         │
│  ├── extract_docstring()    ← NEW: Documentation        │
│  ├── extract_comprehensions()                           │
│  └── calculate_complexity() ← NEW: Metrics              │
├─────────────────────────────────────────────────────────┤
│  TypeScript wrapper                                     │
│  ├── parse()               - single file                │
│  ├── parseBatch()          - multiple files (NEW)       │
│  └── parseIncremental()    - with cache (NEW)           │
└─────────────────────────────────────────────────────────┘
```

---

## Kotlin Native Parser

### Текущее состояние

**Файл:** `src/parsers/kotlin-native-parser.ts`

Парсер использует **regex-based parsing** с опциональной интеграцией kotlinc для диагностики.

**Уже извлекается:**
- Package declarations
- Imports с aliases
- Classes, interfaces, objects, enums, data classes, sealed classes
- Functions с modifiers (suspend, inline, infix, operator, tailrec)
- Extension functions (receiver type)
- Properties (val/var) с типами
- Type aliases
- Inheritance (extends + implements через `:`)
- Modifiers (public, private, internal, abstract, open, final, sealed)

**kotlinc интеграция:** Опциональная валидация синтаксиса и диагностика ошибок.

### Текущие ограничения (regex-based)

| Ограничение | Проблема |
|-------------|----------|
| **Нет вложенности** | Не парсит методы внутри классов |
| **Нет bodies** | Только сигнатуры, без control flow |
| **Ложные срабатывания** | Regex может сматчить строки/комментарии |
| **Нет generics parsing** | `<T>` только в сигнатуре, не анализируется |
| **Нет lambdas** | Lambda expressions не извлекаются |

### Стратегии улучшения Kotlin Parser

#### Стратегия A: Улучшенный Regex (минимальные изменения)

**Плюсы:** Быстро, без зависимостей
**Минусы:** Ограниченные возможности

```typescript
// Добавить парсинг тела классов
private parseClassBody(content: string, classStart: number): ParsedEntity[] {
  // Найти { } класса
  const braceStart = content.indexOf('{', classStart);
  if (braceStart === -1) return [];

  // Извлечь содержимое между { }
  let depth = 1;
  let braceEnd = braceStart + 1;
  while (depth > 0 && braceEnd < content.length) {
    if (content[braceEnd] === '{') depth++;
    if (content[braceEnd] === '}') depth--;
    braceEnd++;
  }

  const classBody = content.slice(braceStart + 1, braceEnd - 1);
  // Парсить методы внутри classBody
  return this.parseFunctions(classBody);
}
```

**Что можно добавить regex:**
- ✅ Методы внутри классов
- ✅ KDoc комментарии (regex `/** ... */`)
- ✅ Простые call expressions (`functionName(`)
- ❌ Control flow (слишком сложно)
- ❌ Полный call graph

#### Стратегия B: Kotlin Script для AST (subprocess)

Использовать Kotlin Script (`.kts`) для парсинга через `kotlin-compiler`:

```kotlin
// kotlin-parser.kts
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.psi.*

val config = CompilerConfiguration()
val env = KotlinCoreEnvironment.createForProduction(
    Disposer.newDisposable(),
    config,
    EnvironmentConfigFiles.JVM_CONFIG_FILES
)

fun parseFile(path: String): String {
    val file = PsiManager.getInstance(env.project)
        .findFile(LocalFileSystem.getInstance().findFileByPath(path)!!) as KtFile

    val result = mutableListOf<Map<String, Any>>()

    file.declarations.forEach { decl ->
        when (decl) {
            is KtClass -> result.add(parseClass(decl))
            is KtNamedFunction -> result.add(parseFunction(decl))
            is KtProperty -> result.add(parseProperty(decl))
        }
    }

    return Json.encodeToString(result)
}

fun parseFunction(fn: KtNamedFunction): Map<String, Any> {
    return mapOf(
        "name" to (fn.name ?: ""),
        "type" to if (fn.hasModifier(KtTokens.SUSPEND_KEYWORD)) "async_function" else "function",
        "parameters" to fn.valueParameters.map { p ->
            mapOf(
                "name" to (p.name ?: ""),
                "type" to (p.typeReference?.text ?: ""),
                "hasDefault" to (p.hasDefaultValue())
            )
        },
        "returnType" to (fn.typeReference?.text ?: ""),
        "calls" to extractCalls(fn),       // NEW
        "controlFlow" to extractFlow(fn)   // NEW
    )
}

fun extractCalls(fn: KtNamedFunction): List<Map<String, Any>> {
    val calls = mutableListOf<Map<String, Any>>()

    fn.accept(object : KtTreeVisitorVoid() {
        override fun visitCallExpression(expression: KtCallExpression) {
            super.visitCallExpression(expression)
            calls.add(mapOf(
                "name" to (expression.calleeExpression?.text ?: ""),
                "args" to expression.valueArguments.size,
                "line" to expression.textOffset
            ))
        }
    })

    return calls
}
```

**Плюсы:** Полный AST, все возможности
**Минусы:** Требует JVM, медленный startup (~2-3 сек)

#### Стратегия C: Detekt API (рекомендуемая)

Detekt - статический анализатор для Kotlin, предоставляет API для AST:

```kotlin
// Через Detekt API (легче чем raw kotlin-compiler)
implementation("io.gitlab.arturbosch.detekt:detekt-parser:1.23.0")

val ktFile = KtPsiFactory(project).createFile(code)

ktFile.accept(object : DetektVisitor() {
    override fun visitNamedFunction(function: KtNamedFunction) {
        // Извлечь информацию
    }
})
```

**Плюсы:**
- Проще API чем kotlin-compiler напрямую
- Включает метрики complexity
- Активно поддерживается

**Минусы:**
- Всё ещё JVM зависимость
- ~15MB дополнительных JAR

### План расширения Kotlin Parser

#### Фаза 1: Улучшить regex (без новых зависимостей)

```typescript
// 1. Парсинг методов внутри классов
// 2. KDoc extraction
// 3. Простой call detection

private extractKDoc(content: string, nodeStart: number): Documentation | null {
  // Искать /** ... */ перед декларацией
  const before = content.slice(0, nodeStart);
  const kdocMatch = before.match(/\/\*\*[\s\S]*?\*\/\s*$/);
  if (!kdocMatch) return null;

  const kdoc = kdocMatch[0];
  return {
    description: this.extractKDocDescription(kdoc),
    params: this.extractKDocParams(kdoc),
    returns: this.extractKDocReturn(kdoc),
    throws: this.extractKDocThrows(kdoc)
  };
}

private extractSimpleCalls(fnBody: string): Call[] {
  const calls: Call[] = [];
  // Pattern: identifier followed by (
  const callRe = /(\w+)\s*\(/g;
  let match;
  while ((match = callRe.exec(fnBody))) {
    // Исключить keywords
    if (!KOTLIN_KEYWORDS.has(match[1])) {
      calls.push({ name: match[1], location: match.index });
    }
  }
  return calls;
}
```

#### Фаза 2: Добавить Kotlin Script парсер (опционально)

```typescript
// kotlin-native-parser.ts

private async parseWithKotlinScript(
  filePath: string,
  content: string
): Promise<ParsedEntity[]> {
  // Проверить наличие kotlin
  const kotlinPath = await findKotlin();
  if (!kotlinPath) {
    return this.parseWithRegex(filePath, content);
  }

  // Запустить kotlin script
  const result = await runKotlinScript(
    'scripts/kotlin-parser.kts',
    [filePath]
  );

  return JSON.parse(result);
}
```

#### Фаза 3: Detekt интеграция (для метрик)

```typescript
// Использовать Detekt CLI для complexity metrics
async function getKotlinComplexity(filePath: string): Promise<Metrics> {
  const result = await exec(
    `detekt --input ${filePath} --report sarif:- --config detekt-metrics.yml`
  );
  return parseDetektSarif(result);
}
```

### Сравнение стратегий

| Аспект | Regex | Kotlin Script | Detekt |
|--------|-------|---------------|--------|
| **Зависимости** | Нет | JVM + Kotlin | JVM + Detekt |
| **Startup time** | <1ms | ~2-3s | ~1-2s |
| **Call Graph** | Простой | Полный | Полный |
| **Control Flow** | Нет | Полный | Частичный |
| **Complexity** | Нет | Ручной | Встроенный |
| **Точность** | ~80% | 100% | 100% |

### Рекомендация

1. **Краткосрочно:** Улучшить regex - добавить KDoc, методы классов, простые calls
2. **Среднесрочно:** Добавить опциональный Kotlin Script парсер для полного AST
3. **Долгосрочно:** Интегрировать Detekt для метрик качества

---

## Сравнительная таблица возможностей

| Фича | TypeScript | Python | Kotlin |
|------|------------|--------|--------|
| **Call Graph** | ✅ Легко | ✅ Легко | ⚠️ Средне |
| **Control Flow** | ✅ Легко | ✅ Легко | ⚠️ Средне |
| **Documentation** | ✅ JSDoc API | ✅ docstrings | ⚠️ KDoc parsing |
| **Type References** | ✅ TypeChecker | ⚠️ Type hints | ✅ PSI types |
| **Complexity** | ✅ Легко | ✅ Легко | ⚠️ Средне |
| **Generics** | ✅ Легко | ⚠️ TypeVar | ✅ Легко |
| **Async/Await** | ✅ Легко | ✅ Легко | ⚠️ Coroutines |
| **Incremental** | ✅ LanguageService | ❌ Нет | ❌ Нет |

---

## Приоритеты реализации

### Высокий приоритет (для трассировки)
1. TypeScript Call Graph
2. TypeScript Control Flow
3. Python Call Graph
4. Python Control Flow

### Средний приоритет (улучшение качества)
5. TypeScript JSDoc
6. TypeScript Complexity Metrics
7. Python Docstrings
8. Kotlin Call Graph

### Низкий приоритет (nice to have)
9. TypeScript Type References
10. TypeScript Generics
11. Python Type Hints
12. Kotlin Control Flow
13. Side Effects Detection

---

## Новые MCP Tools

После реализации можно добавить инструменты:

### `trace_execution`
```typescript
trace_execution({
  entryPoint: "src/api/handler.ts:processRequest",
  maxDepth: 10,
  includeControlFlow: true
})
// Возвращает: путь выполнения от entry point
```

### `trace_backwards`
```typescript
trace_backwards({
  crashPoint: "src/db/query.ts:execute",
  stackTrace: ["..."]  // optional hints
})
// Возвращает: все пути, ведущие к точке
```

### `analyze_complexity`
```typescript
analyze_complexity({
  scope: "file" | "function" | "class",
  target: "src/services/user.ts",
  threshold: { cyclomatic: 10, cognitive: 15 }
})
// Возвращает: метрики + hotspots
```

### `find_side_effects`
```typescript
find_side_effects({
  function: "processOrder",
  types: ["io", "network", "state"]
})
// Возвращает: список side effects с locations
```

---

## Timeline

| Фаза | Описание | Оценка |
|------|----------|--------|
| 1 | TS Call Graph | 2-3 часа |
| 2 | TS Control Flow | 3-4 часа |
| 3 | TS JSDoc | 1-2 часа |
| 4 | TS Type References | 2-3 часа |
| 5 | TS Complexity | 1-2 часа |
| 6 | Python Call Graph | 2-3 часа |
| 7 | Python Control Flow | 2-3 часа |
| 8 | Kotlin basics | 4-5 часов |
| 9 | New MCP tools | 3-4 часа |

**Итого:** ~20-30 часов работы

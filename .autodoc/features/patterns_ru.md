# Детекция паттернов

## detect_patterns

Обнаружение анти-паттернов, лучших практик, code smells и возможностей оптимизации. Двухэтапный конвейер: структурный анализ + семантическая валидация.

### Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| projectPath | string? | текущий проект | Путь к директории проекта |
| filePath | string? | - | Сканировать конкретный файл |
| language | string? | автодетект | Фильтр: typescript, python, csharp, java, go |
| category | string? | "all" | anti-pattern, best-pattern, code-smell, optimization, all |
| tags | string[]? | - | Фильтр по тегам: async, performance, memory, security и др. |
| minConfidence | number? | 0.5 | Минимальный combined score (0-1) |
| severity | string? | "all" | critical, high, medium, low, info, all |
| format | string? | "summary" | Формат: summary, detailed, json |
| offset | number? | 0 | Смещение для пагинации |
| limit | number? | 50 | Макс. результатов на категорию |

### Возвращает

Формат summary включает:
- Health score (0-100)
- Количество по категориям
- Топ проблем по severity
- Детали совпадений: имя паттерна, entity, файл:строка, скоры уверенности

### Примеры

```json
// Найти все анти-паттерны
detect_patterns({category: "anti-pattern"})

// Только оптимизации производительности
detect_patterns({category: "optimization", tags: ["performance"]})

// Проверить конкретный файл
detect_patterns({filePath: "src/services/auth.ts", severity: "high"})
```

## check_entity_patterns

Проверка конкретной entity на совпадение с паттернами.

### Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| entityId | string | обязательный | ID entity для проверки |
| projectPath | string? | текущий проект | Путь к проекту |
| category | string? | "all" | Фильтр категории |

## Категории

### Anti-Patterns
Плохие практики, которые нужно исправить. Примеры: async-void, empty-catch, mutable-static, bare-except.

### Best-Patterns
Хорошие практики, найденные в коде. Примеры: proper-di, error-wrapping, context-propagation.

### Code Smells
Структурные проблемы, обнаруживаемые по метрикам. Примеры: god-function, deep-nesting, large-class, feature-envy.

### Optimization
Возможности оптимизации производительности с Big-O и бенчмарками. Примеры: string-concat-in-loop, linq-in-hotpath, ef-n-plus-one.

#### JIT-деоптимизация (JS/TS, тег: `jit`)
9 правил для обнаружения паттернов, вызывающих деоптимизацию V8/JSC JIT:
- **jit-delete-operator** — убивает inline caching (потеря 35-40% пропускной способности)
- **jit-with-statement**, **jit-eval** — полностью отключают JIT (critical)
- **jit-holey-array** — `new Array(n)` создаёт «дырявые» массивы (доступ в 6x медленнее)
- **jit-arguments-object** — предотвращает оптимизацию функций
- **jit-megamorphic-interface** — 5+ реализаций → мегаморфный dispatch (~3.5x медленнее)
- **jit-spread-in-hot-path**, **jit-dynamic-property-access**, **jit-optional-chaining-hot** — паттерны в горячих циклах

Фильтр: `detect_patterns({category: "optimization", tags: ["jit"]})`

## Скоринг

- **structuralConfidence** (0-1): Качество совпадения по метаданным
- **semanticSimilarity** (0-1): Сходство эмбеддингов с кураторскими примерами
- **combinedScore**: structural x 0.4 + semantic x 0.6 (для гибридных правил)
- **healthScore** (0-100): Общее здоровье проекта на основе баланса паттернов

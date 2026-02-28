# Анализ кода

🌐 **Language**: [EN](./analysis.md) | [RU]

---

Инструменты для анализа качества, сложности и зависимостей кода.

---

## analyze_code_impact

Анализ влияния изменений — показывает что сломается при изменении указанной сущности.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | да* | ID сущности для анализа |
| `entityName` | string | да* | Имя сущности (если нет ID) |
| `filePath` | string | нет | Путь к файлу (для уточнения entityName) |
| `depth` | number | нет | Глубина анализа зависимостей (по умолчанию 3) |
| `includeTests` | boolean | нет | Включать тестовые файлы |

*Укажите либо `entityId`, либо `entityName`

### Возвращает

```typescript
{
  entity: { id: string; name: string; type: string; };
  directDependents: Array<{
    entityId: string;
    name: string;
    filePath: string;
    usageType: "calls" | "imports" | "extends" | "implements";
  }>;
  indirectDependents: Array<{...}>;
  affectedFiles: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
}
```

### Примеры

**Анализ по ID:**
```
analyze_code_impact({
  entityId: "src/services/user.ts:UserService",
  depth: 4
})
```

**Анализ по имени:**
```
analyze_code_impact({
  entityName: "validateEmail",
  filePath: "src/utils/validators.ts"
})
```

**Contract Impact** (для проектов со Swagger/OpenAPI):

Когда затронутые сущности имеют связи `produces_api`, `consumes_api` или `generated_from`, ответ включает секцию `contractImpact`:

```typescript
{
  // ...стандартные поля...
  contractImpact: {
    affectsApiContract: true,
    affectedEndpoints: ["GET /api/users", "POST /api/users"],
    affectedSchemas: ["User", "CreateUserRequest"],
    breakingChangeRisk: "high" | "medium" | "low",
    consumers: ["frontend-client"],
    warning: "Изменения затрагивают внешний API-контракт — потребители могут сломаться"
  }
}
```

> Подробнее: [swagger_ru.md](swagger_ru.md)

---

## analyze_swagger_impact

Анализ влияния изменений Swagger/OpenAPI спецификации — затронутые контроллеры, сгенерированные клиенты, типы и оценка риска breaking changes.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `swaggerFile` | string | нет | Путь к swagger-файлу (авто-определяется) |
| `schemaName` | string | нет | Имя конкретной schema |
| `endpointPath` | string | нет | Конкретный endpoint (например `GET /api/users`) |
| `projectPath` | string | нет | Путь к директории проекта |

### Примеры

```
analyze_swagger_impact({ schemaName: "User" })
analyze_swagger_impact({ endpointPath: "GET /api/users" })
```

> Подробнее: [swagger_ru.md](swagger_ru.md)

---

## find_duplicates

Семантический поиск дубликатов кода. Находит функционально похожий код, даже если он написан по-разному.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `threshold` | number | нет | Порог схожести 0-1 (по умолчанию 0.8) |
| `minLines` | number | нет | Минимум строк для дубликата (по умолчанию 5) |
| `filePattern` | string | нет | Glob-паттерн для файлов |
| `excludePatterns` | string[] | нет | Паттерны исключения |
| `groupBy` | string | нет | Группировка: `file`, `similarity`, `type` |

### Возвращает

```typescript
{
  groups: Array<{
    similarity: number;
    entities: Array<{
      entityId: string;
      name: string;
      filePath: string;
      lines: [number, number];
      snippet: string;
    }>;
  }>;
  totalDuplicates: number;
  suggestion: string;
}
```

### Примеры

```
find_duplicates({
  threshold: 0.85,
  minLines: 10,
  excludePatterns: ["**/*.test.ts", "**/*.spec.ts"]
})
```

---

## jscpd_detect_clones

Детектор клонов на основе токенизации (без эмбеддингов). Быстрее чем семантический поиск, но менее гибкий.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `directory` | string | нет | Директория для анализа |
| `minLines` | number | нет | Минимум строк (по умолчанию 5) |
| `minTokens` | number | нет | Минимум токенов (по умолчанию 50) |
| `format` | string | нет | Формат: `summary`, `detailed`, `json` |

### Возвращает

```typescript
{
  clones: Array<{
    firstFile: string;
    secondFile: string;
    lines: number;
    tokens: number;
    fragment: string;
  }>;
  statistics: {
    totalFiles: number;
    totalLines: number;
    duplicatedLines: number;
    percentage: number;
  };
}
```

### Примеры

```
jscpd_detect_clones({
  minLines: 10,
  minTokens: 100,
  format: "detailed"
})
```

---

## suggest_refactoring

AI-предложения по рефакторингу кода. Анализирует код и предлагает улучшения.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | да* | ID сущности |
| `filePath` | string | да* | Путь к файлу |
| `focus` | string | нет | Фокус: `complexity`, `readability`, `performance`, `all` |

*Укажите либо `entityId`, либо `filePath`

### Возвращает

```typescript
{
  suggestions: Array<{
    type: "extract_function" | "rename" | "simplify" | "split_class" | ...;
    description: string;
    location: { file: string; line: number; };
    before: string;
    after: string;
    effort: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
  }>;
}
```

### Примеры

```
suggest_refactoring({
  entityId: "src/handlers/payment.ts:processPayment",
  focus: "complexity"
})
```

---

## analyze_hotspots

Поиск "горячих точек" — участков кода с высокой сложностью, частыми изменениями или сильной связанностью.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `metric` | string | нет | Метрика: `complexity`, `changes`, `coupling`, `all` |
| `threshold` | number | нет | Порог для отбора (зависит от метрики) |
| `limit` | number | нет | Максимум результатов |
| `includeHistory` | boolean | нет | Включать git-историю |

### Возвращает

```typescript
{
  hotspots: Array<{
    entityId: string;
    name: string;
    filePath: string;
    metrics: {
      cyclomatic: number;
      cognitive: number;
      coupling: number;
      changeFrequency?: number;
    };
    riskScore: number;
    recommendation: string;
  }>;
}
```

### Примеры

```
analyze_hotspots({
  metric: "complexity",
  threshold: 15,
  limit: 20
})
```

---

## analyze_state_chaos

Анализ "хаоса состояния" — обнаружение проблем с управлением состоянием в TypeScript/Angular проектах.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `scope` | string | нет | Область: `file`, `module`, `project` |
| `stateIdentifiers` | string[] | нет | Конкретные переменные для анализа |
| `autoDetect` | boolean | нет | Автоопределение состояний |
| `format` | string | нет | Формат: `summary`, `detailed`, `json` |
| `maxDepth` | number | нет | Глубина трассировки |
| `excludePatterns` | string[] | нет | Паттерны исключения |

### Возвращает

```typescript
{
  states: Array<{
    identifier: string;
    chaosScore: number;         // 0-100
    divergenceRisk: "low" | "medium" | "high" | "critical";
    filesAffected: number;
    mutationPoints: number;
    defensivePatterns: number;
    refactoringStrategy: "Service" | "Store" | "Signal" | "Context";
    problemAreas: Array<{
      file: string;
      line: number;
      issue: string;
    }>;
  }>;
  summary: string;
}
```

### Примеры

**Анализ конкретного состояния:**
```
analyze_state_chaos({
  stateIdentifiers: ["token", "userId"],
  format: "detailed"
})
```

**Автоопределение всех проблемных состояний:**
```
analyze_state_chaos({
  scope: "project",
  autoDetect: true,
  format: "summary"
})
```

> Подробнее: [chaos-analysis_ru.md](chaos-analysis_ru.md)

---

## detect_technology_stack

Автоматическое определение технологического стека проекта.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `directory` | string | нет | Директория для анализа |
| `detailed` | boolean | нет | Детальный анализ |

### Возвращает

```typescript
{
  languages: Array<{ name: string; percentage: number; files: number; }>;
  frameworks: string[];
  buildTools: string[];
  packageManagers: string[];
  databases: string[];
  testing: string[];
  ci: string[];
  containerization: string[];
}
```

### Примеры

```
detect_technology_stack({ detailed: true })
```

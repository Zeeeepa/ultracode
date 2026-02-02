# Поиск и навигация

🌐 **Language**: [EN](./search.md) | [RU]

---

Инструменты для поиска кода по смыслу, паттернам и структуре.

---

## semantic_search

Семантический поиск по кодовой базе с использованием векторных эмбеддингов. Находит код по смыслу, а не по точному совпадению текста.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `query` | string | да | Поисковый запрос на естественном языке |
| `limit` | number | нет | Максимум результатов (по умолчанию 10) |
| `threshold` | number | нет | Минимальный порог схожести 0-1 (по умолчанию 0.5) |
| `filePattern` | string | нет | Glob-паттерн для фильтрации файлов |
| `entityTypes` | string[] | нет | Типы сущностей: function, class, interface, etc. |
| `minCyclomatic` | number | нет | Минимальная цикломатическая сложность |
| `maxCyclomatic` | number | нет | Максимальная цикломатическая сложность |
| `hasExceptions` | boolean | нет | Фильтр по наличию try-catch |
| `hasLoops` | boolean | нет | Фильтр по наличию циклов |
| `hasAwaits` | boolean | нет | Фильтр по наличию async/await |
| `hasDocumentation` | boolean | нет | Фильтр по наличию документации |
| `minCallCount` | number | нет | Минимальное количество вызовов |

### Возвращает

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    type: string;
    filePath: string;
    line: number;
    score: number;           // Схожесть 0-1
    snippet: string;         // Фрагмент кода
    complexity?: {
      cyclomatic: number;
      cognitive: number;
    };
    documentation?: string;
  }>;
  totalFound: number;
  searchTime: number;
}
```

### Примеры

**Базовый поиск:**
```
semantic_search({ query: "функция валидации email" })
```

**Поиск сложного кода без документации:**
```
semantic_search({
  query: "обработка данных",
  minCyclomatic: 10,
  hasDocumentation: false
})
```

**Поиск async кода без обработки ошибок:**
```
semantic_search({
  query: "API запросы",
  hasAwaits: true,
  hasExceptions: false
})
```

---

## pattern_search

Продвинутый поиск с несколькими режимами: по имени сущности, по содержимому, семантический и гибридный.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `query` | string | да | Поисковый запрос или regex |
| `mode` | string | нет | Режим: `entity`, `content`, `semantic`, `hybrid` (по умолчанию `hybrid`) |
| `entityTypes` | string[] | нет | Типы сущностей для фильтрации |
| `filePattern` | string | нет | Glob-паттерн для файлов |
| `caseSensitive` | boolean | нет | Регистрозависимый поиск |
| `limit` | number | нет | Максимум результатов |

### Режимы поиска

- **entity** — поиск по имени сущности (regex)
- **content** — поиск внутри тела функций/классов
- **semantic** — векторный поиск по смыслу
- **hybrid** — комбинация всех режимов

### Возвращает

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    type: string;
    filePath: string;
    line: number;
    matchType: "entity" | "content" | "semantic";
    score: number;
    matches?: string[];  // Найденные совпадения для content mode
  }>;
}
```

### Примеры

**Поиск по regex в именах:**
```
pattern_search({
  query: "^handle.*Error$",
  mode: "entity"
})
```

**Поиск внутри кода:**
```
pattern_search({
  query: "console\\.log",
  mode: "content"
})
```

**Гибридный поиск:**
```
pattern_search({
  query: "аутентификация пользователя",
  mode: "hybrid",
  entityTypes: ["function", "class"]
})
```

---

## query

Универсальный запрос к графу кода на естественном языке.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `query` | string | да | Запрос на естественном языке |
| `format` | string | нет | Формат вывода: `summary`, `detailed`, `json` |

### Возвращает

```typescript
{
  answer: string;        // Ответ на запрос
  entities: Array<{...}>;  // Найденные сущности
  confidence: number;    // Уверенность 0-1
}
```

### Примеры

```
query({ query: "какие классы наследуются от BaseController?" })
query({ query: "где определена функция validateInput?" })
query({ query: "покажи все экспортируемые функции в utils/" })
```

---

## find_similar_code

Поиск кода, похожего на заданный фрагмент. Использует семантический анализ для нахождения функционально схожего кода.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `code` | string | да* | Фрагмент кода для поиска похожего |
| `entityId` | string | да* | ID сущности для поиска похожего |
| `threshold` | number | нет | Минимальный порог схожести (по умолчанию 0.7) |
| `limit` | number | нет | Максимум результатов |
| `excludeSameFile` | boolean | нет | Исключить результаты из того же файла |

*Укажите либо `code`, либо `entityId`

### Возвращает

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    filePath: string;
    similarity: number;  // 0-1
    snippet: string;
  }>;
}
```

### Примеры

**По фрагменту кода:**
```
find_similar_code({
  code: "function validate(email) { return /^[^@]+@[^@]+$/.test(email); }",
  threshold: 0.8
})
```

**По существующей сущности:**
```
find_similar_code({
  entityId: "src/utils/validators.ts:validateEmail",
  excludeSameFile: true
})
```

---

## cross_language_search

Поиск по нескольким языкам программирования одновременно. Полезно для проектов с несколькими языками.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `query` | string | да | Поисковый запрос |
| `languages` | string[] | нет | Языки для поиска (по умолчанию все) |
| `limit` | number | нет | Максимум результатов |

### Поддерживаемые языки

`typescript`, `javascript`, `python`, `go`, `rust`, `java`, `kotlin`, `cpp`, `swift`, `bash`, `powershell`

### Возвращает

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    language: string;
    filePath: string;
    score: number;
  }>;
  byLanguage: Record<string, number>;  // Количество по языкам
}
```

### Примеры

```
cross_language_search({
  query: "HTTP client implementation",
  languages: ["typescript", "python", "go"]
})
```

---

## find_related_concepts

Поиск концептуально связанного кода. Находит сущности, связанные по смыслу с указанной.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | да* | ID сущности |
| `concept` | string | да* | Концепция для поиска |
| `depth` | number | нет | Глубина поиска связей (по умолчанию 2) |
| `limit` | number | нет | Максимум результатов |

*Укажите либо `entityId`, либо `concept`

### Возвращает

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    relationshipType: string;  // "calls", "imports", "extends", "semantic"
    distance: number;          // Расстояние в графе
  }>;
}
```

### Примеры

**От существующей сущности:**
```
find_related_concepts({
  entityId: "src/auth/login.ts:LoginService",
  depth: 3
})
```

**По концепции:**
```
find_related_concepts({
  concept: "авторизация и права доступа"
})
```

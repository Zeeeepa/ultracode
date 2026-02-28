# Индексация

🌐 **Language**: [EN](./indexing.md) | [RU]

---

Инструменты для индексации кодовой базы и управления индексом.

---

## index

Основной инструмент индексации кодовой базы. Парсит файлы, строит граф сущностей, генерирует эмбеддинги.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `directory` | string | нет | Директория для индексации (по умолчанию текущая) |
| `incremental` | boolean | нет | Инкрементальная индексация (только изменённые файлы) |
| `fullScan` | boolean | нет | Полное сканирование (игнорировать кеш) |
| `reset` | boolean | нет | Сбросить граф перед индексацией |
| `excludePatterns` | string[] | нет | Паттерны исключения |
| `languages` | string[] | нет | Ограничить языками |

### Возвращает

```typescript
{
  success: boolean;
  directory: string;
  statistics: {
    filesScanned: number;
    filesIndexed: number;
    entitiesCreated: number;
    relationshipsCreated: number;
    embeddingsGenerated: number;
  };
  timing: {
    parseTime: number;
    indexTime: number;
    embeddingTime: number;
    totalTime: number;
  };
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}
```

### Примеры

**Первичная индексация:**
```
index({ directory: "/path/to/project" })
```

**Инкрементальная индексация:**
```
index({ incremental: true })
```

**Полная переиндексация:**
```
index({ reset: true, fullScan: true })
```

**С фильтрами:**
```
index({
  excludePatterns: ["**/node_modules/**", "**/*.test.ts"],
  languages: ["typescript", "javascript"]
})
```

---

## clean_index

Сброс графа и полная переиндексация. Комбинация `reset_graph` + `index`.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `directory` | string | нет | Директория для индексации |
| `excludePatterns` | string[] | нет | Паттерны исключения |

### Возвращает

```typescript
{
  success: boolean;
  resetStats: {
    deletedEntities: number;
    deletedRelationships: number;
  };
  indexStats: {
    filesIndexed: number;
    entitiesCreated: number;
    relationshipsCreated: number;
  };
  totalTime: number;
}
```

### Примеры

```
clean_index({
  directory: "/path/to/project",
  excludePatterns: ["**/dist/**"]
})
```

---

## Конфигурация индексации

Параметры индексации настраиваются в `parser-config.json` или через переменные окружения:

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `maxFileSize` | 1MB | Максимальный размер файла |
| `timeout` | 60s | Таймаут парсинга |
| `batchSize` | 50 | Файлов в батче |
| `workerPoolSize` | 4 | Параллельные воркеры |
| `incrementalThreshold` | 20 | Порог для полной переиндексации |

## Файл .ultracodeignore

Для исключения файлов из индексации создайте `.ultracodeignore` в корне проекта:

```gitignore
# Сборка
**/dist/**
**/build/**
**/out/**

# Зависимости
**/node_modules/**
**/vendor/**

# Тесты (опционально)
**/*.test.ts
**/*.spec.ts
**/test-fixtures/**

# Сгенерированный код
**/*.generated.ts
**/generated/**
```

Синтаксис аналогичен `.gitignore`.

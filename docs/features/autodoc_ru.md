# AutoDoc — Автоматическая документация

🌐 **Language**: [EN](./autodoc.md) | [RU]

---

Система автоматической генерации, обновления и поиска по документации кода.

---

## autodoc_init

Инициализация AutoDoc для проекта. Настройка языка, директории документации и параметров.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `language` | string | нет | Язык документации: `en`, `ru`, `zh` |
| `docsDirectory` | string | нет | Директория для документации (по умолчанию `.autodoc/`) |
| `enabled` | boolean | нет | Включить AutoDoc |

### Возвращает

```typescript
{
  success: boolean;
  config: {
    language: string;
    docsDirectory: string;
    enabled: boolean;
  };
}
```

### Примеры

```
autodoc_init({
  language: "ru",
  docsDirectory: ".autodoc/",
  enabled: true
})
```

---

## autodoc_generate

Автоматическая генерация документации для кодовой базы. Создаёт `.autodoc/` для общей документации и `README.md` в каждой директории модуля.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `scope` | string | нет | Область: `file`, `module`, `project` |
| `filePath` | string | нет | Путь к файлу/модулю (для scope=file/module) |
| `overwrite` | boolean | нет | Перезаписать существующую документацию |
| `includePrivate` | boolean | нет | Включать приватные члены |
| `format` | string | нет | Формат: `markdown`, `jsdoc`, `tsdoc` |

### Возвращает

```typescript
{
  success: boolean;
  documentsGenerated: number;
  files: Array<{
    filePath: string;
    entities: number;
    sections: number;
  }>;
}
```

### Примеры

**Генерация для всего проекта:**
```
autodoc_generate({
  scope: "project",
  overwrite: false,
  includePrivate: false
})
```

**Генерация для модуля:**
```
autodoc_generate({
  scope: "module",
  filePath: "src/services/",
  format: "markdown"
})
```

---

## autodoc_save

Сохранение markdown документа. Парсит секции, извлекает ссылки на код и индексирует для поиска.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | да | Путь к файлу документации |
| `content` | string | да | Содержимое в markdown |
| `metadata` | object | нет | Дополнительные метаданные |

### Возвращает

```typescript
{
  success: boolean;
  documentId: string;
  sections: number;
  referencesFound: number;
  indexed: boolean;
}
```

### Примеры

```
autodoc_save({
  filePath: ".autodoc/authentication.md",
  content: `
# Аутентификация

## Обзор
Модуль аутентификации использует [AuthService](src/services/auth.ts#AuthService).

## API
- [login](src/services/auth.ts#login) — вход пользователя
- [logout](src/services/auth.ts#logout) — выход пользователя
`
})
```

---

## autodoc_get

Получение документации по ID или пути к файлу.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `documentId` | string | да* | ID документа |
| `filePath` | string | да* | Путь к файлу |

*Укажите либо `documentId`, либо `filePath`

### Возвращает

```typescript
{
  documentId: string;
  filePath: string;
  content: string;
  sections: Array<{
    title: string;
    level: number;
    content: string;
  }>;
  references: Array<{
    text: string;
    entityId: string;
  }>;
  metadata: object;
  lastUpdated: string;
}
```

### Примеры

```
autodoc_get({ filePath: ".autodoc/authentication.md" })
```

---

## autodoc_search

Поиск по документации с использованием семантического поиска.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `query` | string | да | Поисковый запрос |
| `limit` | number | нет | Максимум результатов |
| `filePattern` | string | нет | Фильтр по файлам |

### Возвращает

```typescript
{
  results: Array<{
    documentId: string;
    filePath: string;
    section: string;
    snippet: string;
    score: number;
  }>;
  totalFound: number;
}
```

### Примеры

```
autodoc_search({
  query: "как настроить аутентификацию",
  limit: 10
})
```

---

## autodoc_validate

Валидация ссылок в документации. Проверяет что все ссылки на код указывают на существующие сущности.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | нет | Путь к конкретному файлу (или все файлы) |
| `fix` | boolean | нет | Попытаться исправить битые ссылки |

### Возвращает

```typescript
{
  valid: boolean;
  documents: number;
  references: number;
  brokenReferences: Array<{
    documentPath: string;
    reference: string;
    suggestion?: string;
  }>;
}
```

### Примеры

```
autodoc_validate({ fix: false })
```

---

## autodoc_status

Получение статуса AutoDoc — статистика по документам, ссылкам и проблемам.

### Параметры

Без параметров.

### Возвращает

```typescript
{
  enabled: boolean;
  config: object;
  statistics: {
    totalDocuments: number;
    totalSections: number;
    totalReferences: number;
    brokenReferences: number;
    lastGenerated: string;
    coverage: number;         // Процент покрытия кода документацией
  };
}
```

### Примеры

```
autodoc_status()
```

---

## autodoc_sync

Синхронизация документации с изменениями кода. Проверяет ссылки и помечает устаревшие документы.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `markOutdated` | boolean | нет | Помечать устаревшие документы |
| `removeOrphaned` | boolean | нет | Удалять документы без связей с кодом |

### Возвращает

```typescript
{
  success: boolean;
  documentsChecked: number;
  outdatedMarked: number;
  orphanedRemoved: number;
  referencesUpdated: number;
}
```

### Примеры

```
autodoc_sync({
  markOutdated: true,
  removeOrphaned: false
})
```

---

## autodoc_changelog

Просмотр истории изменений документации. Показывает какие документы были затронуты изменениями кода.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `since` | string | нет | Дата начала (ISO формат) |
| `limit` | number | нет | Максимум записей |

### Возвращает

```typescript
{
  changes: Array<{
    timestamp: string;
    documentPath: string;
    changeType: "created" | "updated" | "deleted" | "outdated";
    relatedCodeChanges: string[];
  }>;
}
```

### Примеры

```
autodoc_changelog({
  since: "2024-01-01",
  limit: 50
})
```

---

## autodoc_install_hooks

Установка или удаление git pre-commit хуков для валидации документации перед коммитом.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `action` | string | да | Действие: `install`, `uninstall` |
| `validateReferences` | boolean | нет | Проверять ссылки |
| `blockOnError` | boolean | нет | Блокировать коммит при ошибках |

### Возвращает

```typescript
{
  success: boolean;
  action: string;
  hookPath: string;
}
```

### Примеры

```
autodoc_install_hooks({
  action: "install",
  validateReferences: true,
  blockOnError: true
})
```

---

## autodoc_detect_language

Автоматическое определение языка документации по комментариям в коде и существующим документам.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `sampleSize` | number | нет | Количество файлов для анализа |

### Возвращает

```typescript
{
  detectedLanguage: "en" | "ru" | "zh";
  confidence: number;
  samples: Array<{
    source: string;
    language: string;
  }>;
}
```

### Примеры

```
autodoc_detect_language({ sampleSize: 20 })
```

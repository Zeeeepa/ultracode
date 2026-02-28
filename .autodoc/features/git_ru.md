# Git-интеграция

🌐 **Language**: [EN](./git.md) | [RU]

---

Инструменты для работы с git-ветками и инкрементной индексацией.

---

## list_branches

Список всех проиндексированных веток репозитория с метаданными.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `repositoryPath` | string | нет | Путь к репозиторию (по умолчанию текущая директория) |

### Возвращает

```typescript
{
  branches: Array<{
    name: string;
    isActive: boolean;
    lastAccessed: string;
    databaseSize: number;       // Размер БД в байтах
    metadata: {
      entityCount: number;
      relationshipCount: number;
      lastCommit: string;
      lastIndexed: string;
    };
  }>;
  currentBranch: string;
  totalBranches: number;
}
```

### Примеры

```
list_branches()
```

---

## switch_branch

Переключение активной ветки для индексации. Меняет контекст базы данных на указанную ветку.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `branch` | string | да | Имя ветки |
| `repositoryPath` | string | нет | Путь к репозиторию |

### Возвращает

```typescript
{
  success: boolean;
  previousBranch: string;
  currentBranch: string;
  needsReindex: boolean;        // Требуется ли переиндексация
  metadata: {
    entityCount: number;
    lastIndexed: string;
  };
}
```

### Примеры

```
switch_branch({ branch: "feature/new-auth" })
```

> **Примечание:** При переключении на ветку, которая ещё не индексировалась, потребуется запустить `index`.

---

## get_branch_status

Детальный статус текущей ветки — коммит, количество сущностей, информация о базе данных.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `repositoryPath` | string | нет | Путь к репозиторию |

### Возвращает

```typescript
{
  branch: string;
  commit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
  index: {
    entityCount: number;
    relationshipCount: number;
    fileCount: number;
    lastIndexed: string;
    isStale: boolean;           // Есть ли неиндексированные изменения
  };
  database: {
    path: string;
    size: number;
    vectorsCount: number;
  };
}
```

### Примеры

```
get_branch_status()
```

---

## cleanup_branches

Очистка старых веток по стратегии LRU (Least Recently Used).

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `keep` | number | нет | Количество веток для сохранения (по умолчанию из конфига) |
| `dryRun` | boolean | нет | Показать что будет удалено без удаления |

### Возвращает

```typescript
{
  success: boolean;
  deletedBranches: string[];
  keptBranches: string[];
  freedSpace: number;           // Освобождённое место в байтах
  dryRun: boolean;
}
```

### Примеры

**Предпросмотр:**
```
cleanup_branches({ keep: 5, dryRun: true })
```

**Очистка:**
```
cleanup_branches({ keep: 5 })
```

---

## get_changed_files

Получение списка изменённых файлов между двумя ветками.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `fromBranch` | string | да | Исходная ветка |
| `toBranch` | string | да | Целевая ветка |

### Возвращает

```typescript
{
  fromBranch: string;
  toBranch: string;
  files: {
    added: string[];
    modified: string[];
    deleted: string[];
    renamed: Array<{ from: string; to: string; }>;
  };
  summary: {
    totalChanged: number;
    additions: number;
    deletions: number;
  };
}
```

### Примеры

```
get_changed_files({
  fromBranch: "main",
  toBranch: "feature/new-auth"
})
```

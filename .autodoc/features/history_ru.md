# История версий (Prolly Tree)

🌐 **Language**: [EN](./history.md) | [RU]

---

Инструменты для работы с версионированной историей графа на основе Prolly Tree. Позволяют путешествовать во времени, сравнивать коммиты и отслеживать изменения сущностей.

---

## list_commits

Список коммитов графа (версионных снапшотов) для текущей ветки.

### Параметры

| Параметр | Тип | Обязателен | Описание |
|----------|-----|------------|----------|
| `projectPath` | string | нет | Путь к директории проекта |
| `branchName` | string | нет | Имя ветки (по умолчанию: текущая) |
| `limit` | number | нет | Максимум коммитов (по умолчанию: 100) |

### Возвращает

```typescript
{
  commits: Array<{
    hash: string;           // Хэш коммита (16 символов)
    message: string;        // Сообщение коммита
    entityCount: number;    // Сущностей в этом снапшоте
    relationshipCount: number;
    createdAt: string;      // ISO timestamp
    parentHash: string | null;
  }>;
  total: number;
}
```

### Примеры

```
list_commits({ limit: 10 })
```

---

## get_entity_history

История изменений конкретной сущности по коммитам. Показывает когда сущность была добавлена, изменена или удалена.

### Параметры

| Параметр | Тип | Обязателен | Описание |
|----------|-----|------------|----------|
| `projectPath` | string | нет | Путь к директории проекта |
| `entityId` | string | да | ID сущности для получения истории |
| `limit` | number | нет | Максимум коммитов (по умолчанию: 50) |

### Возвращает

```typescript
{
  entityId: string;
  history: Array<{
    commitHash: string;
    commitMessage: string;
    timestamp: string;
    changeType: "added" | "modified" | "deleted";
    entity?: Entity;        // Состояние сущности на этом коммите (если не удалена)
  }>;
  total: number;
}
```

### Примеры

```
get_entity_history({ entityId: "abc123def456" })
```

---

## diff_commits

Сравнение двух коммитов графа — показывает различия (добавленные, изменённые, удалённые сущности).

### Параметры

| Параметр | Тип | Обязателен | Описание |
|----------|-----|------------|----------|
| `projectPath` | string | нет | Путь к директории проекта |
| `commitA` | string | да | Первый хэш коммита (более старый) |
| `commitB` | string | нет | Второй хэш коммита (более новый, по умолчанию: HEAD) |
| `includeEntities` | boolean | нет | Включить полные данные сущностей (по умолчанию: false) |

### Возвращает

```typescript
{
  commitA: string;
  commitB: string;
  summary: {
    added: number;
    modified: number;
    deleted: number;
    total: number;
  };
  changes: {
    added: Array<{ id: string; name: string; type: string; entity?: Entity }>;
    modified: Array<{ id: string; name: string; type: string; before?: Entity; after?: Entity }>;
    deleted: Array<{ id: string; name: string; type: string; entity?: Entity }>;
  };
}
```

### Примеры

**Сравнение коммитов:**
```
diff_commits({
  commitA: "abc123def456",
  commitB: "xyz789abc012"
})
```

**С полными данными сущностей:**
```
diff_commits({
  commitA: "abc123def456",
  includeEntities: true
})
```

---

## checkout_commit

Time travel — просмотр состояния графа на момент конкретного коммита. Можно получить конкретную сущность или искать сущности в историческом состоянии.

### Параметры

| Параметр | Тип | Обязателен | Описание |
|----------|-----|------------|----------|
| `projectPath` | string | нет | Путь к директории проекта |
| `commitHash` | string | да | Хэш коммита для просмотра |
| `entityId` | string | нет | Конкретная сущность для получения |
| `query` | string | нет | Поиск сущностей в историческом состоянии |
| `limit` | number | нет | Максимум результатов (по умолчанию: 100) |
| `offset` | number | нет | Смещение для пагинации (по умолчанию: 0) |

### Возвращает

```typescript
{
  commitHash: string;
  commitMessage: string;
  timestamp: string;
  // Если указан entityId:
  entity?: Entity;
  // Если указан query или без фильтров:
  entities?: Array<Entity>;
  pagination?: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}
```

### Примеры

**Просмотр конкретной сущности на момент коммита:**
```
checkout_commit({
  commitHash: "abc123def456",
  entityId: "xyz789"
})
```

**Поиск в историческом состоянии:**
```
checkout_commit({
  commitHash: "abc123def456",
  query: "authentication"
})
```

---

## Сценарии использования

### Отслеживание недавних изменений

```typescript
// 1. Список недавних коммитов
const { commits } = await list_commits({ limit: 5 });

// 2. Сравнение последнего с предыдущим
if (commits.length >= 2) {
  const diff = await diff_commits({
    commitA: commits[1].hash,
    commitB: commits[0].hash
  });
  console.log(`Изменено: ${diff.summary.total} сущностей`);
}
```

### Отладка изменений сущности

```typescript
// Найти когда сущность была изменена
const history = await get_entity_history({
  entityId: "abc123",
  limit: 10
});

for (const change of history.history) {
  console.log(`${change.timestamp}: ${change.changeType}`);
}
```

### Time Travel для расследования

```typescript
// Посмотреть состояние сущности до удаления
const oldState = await checkout_commit({
  commitHash: "older-commit-hash",
  entityId: "deleted-entity-id"
});

console.log("Сущность до удаления:", oldState.entity);
```

---

## Интеграция с analyze_hotspots

Инструмент `analyze_hotspots` использует историю Prolly Tree для расчёта частоты изменений:

```typescript
// Включить исторические метрики (по умолчанию: true)
analyze_hotspots({
  metric: "changes",
  includeHistoricalMetrics: true,
  lookbackDays: 30
})
```

Результаты включают:
- `changeFrequency` — количество изменений за период
- `changeFrequencyScore` — нормализованный балл (0-100)
- `changeSource` — "prolly" | "git" | "none"

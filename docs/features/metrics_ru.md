# Метрики и мониторинг

🌐 **Language**: [EN](./metrics.md) | [RU]

---

Инструменты для получения метрик системы и диагностики.

---

## get_metrics

Системные метрики и статистика производительности.

### Параметры

Без параметров.

### Возвращает

```typescript
{
  system: {
    uptime: number;             // Время работы в секундах
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    cpuUsage: {
      user: number;
      system: number;
    };
  };
  operations: {
    totalQueries: number;
    totalIndexOperations: number;
    averageQueryTime: number;
    averageIndexTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  embeddings: {
    totalGenerated: number;
    averageTime: number;
    queueSize: number;
  };
}
```

### Примеры

```
get_metrics()
```

---

## get_version

Информация о версии сервера и runtime.

### Параметры

Без параметров.

### Возвращает

```typescript
{
  version: string;
  buildDate: string;
  runtime: {
    name: "bun" | "node";
    version: string;
  };
  platform: string;
  arch: string;
  features: {
    cuda: boolean;
    webgpu: boolean;
    faiss: boolean;
    simd: boolean;
  };
}
```

### Примеры

```
get_version()
```

---

## get_agent_metrics

Телеметрия многоагентной системы — conductor и зарегистрированные агенты.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `detailed` | boolean | нет | Детальная статистика по каждому агенту |

### Возвращает

```typescript
{
  conductor: {
    tasksProcessed: number;
    tasksQueued: number;
    averageTaskTime: number;
    errors: number;
  };
  agents: Array<{
    name: string;
    type: string;
    status: "idle" | "busy" | "error";
    tasksProcessed: number;
    averageTime: number;
    memoryUsage: number;
    lastActivity: string;
  }>;
  totalAgents: number;
  activeAgents: number;
}
```

### Примеры

```
get_agent_metrics({ detailed: true })
```

---

## get_bus_stats

Статистика шины знаний (Knowledge Bus) — топики, записи, подписки.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `topicFilter` | string | нет | Фильтр по имени топика |

### Возвращает

```typescript
{
  topics: Array<{
    name: string;
    entriesCount: number;
    subscribersCount: number;
    lastUpdated: string;
    size: number;
  }>;
  totalTopics: number;
  totalEntries: number;
  totalSubscribers: number;
  memoryUsage: number;
}
```

### Примеры

```
get_bus_stats()
```

---

## clear_bus_topic

Очистка кешированных записей для конкретного топика.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `topic` | string | да | Имя топика |

### Возвращает

```typescript
{
  success: boolean;
  topic: string;
  entriesCleared: number;
}
```

### Примеры

```
clear_bus_topic({ topic: "entity_cache" })
```

---

## get_watcher_status

Статус фоновых наблюдателей — FileWatcher и GitWatcher.

### Параметры

Без параметров.

### Возвращает

```typescript
{
  fileWatcher: {
    enabled: boolean;
    watching: string[];
    pendingChanges: number;
    lastEvent: string;
  };
  gitWatcher: {
    enabled: boolean;
    currentBranch: string;
    lastCommit: string;
    uncommittedChanges: number;
    pollInterval: number;
  };
  embeddingQueue: {
    enabled: boolean;
    queueSize: number;
    processing: boolean;
    lastProcessed: string;
  };
}
```

### Примеры

```
get_watcher_status()
```

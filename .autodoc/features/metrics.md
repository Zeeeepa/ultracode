# Metrics and Monitoring

🌐 **Language**: [EN] | [RU](./metrics_ru.md)

---

Tools for retrieving system metrics and diagnostics.

---

## get_metrics

System metrics and performance statistics.

### Parameters

No parameters.

### Returns

```typescript
{
  system: {
    uptime: number;             // Uptime in seconds
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

### Examples

```
get_metrics()
```

---

## get_version

Server version and runtime information.

### Parameters

No parameters.

### Returns

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

### Examples

```
get_version()
```

---

## get_agent_metrics

Multi-agent system telemetry — conductor and registered agents.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `detailed` | boolean | no | Detailed statistics per agent |

### Returns

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

### Examples

```
get_agent_metrics({ detailed: true })
```

---

## get_bus_stats

Knowledge Bus statistics — topics, entries, subscriptions.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `topicFilter` | string | no | Filter by topic name |

### Returns

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

### Examples

```
get_bus_stats()
```

---

## clear_bus_topic

Clear cached entries for a specific topic.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `topic` | string | yes | Topic name |

### Returns

```typescript
{
  success: boolean;
  topic: string;
  entriesCleared: number;
}
```

### Examples

```
clear_bus_topic({ topic: "entity_cache" })
```

---

## get_watcher_status

Status of background watchers — FileWatcher and GitWatcher.

### Parameters

No parameters.

### Returns

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

### Examples

```
get_watcher_status()
```

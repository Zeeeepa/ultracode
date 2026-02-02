# Семантический мерж

🌐 **Language**: [EN](./merge.md) | [RU]

---

AI-powered инструменты для мержа git-веток с пониманием кода.

---

## semantic_merge

AI-powered 3-way мерж веток с семантическим анализом кода. Автоматически находит merge-base, читает файлы из веток и выполняет интеллектуальный мерж.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `sourceBranch` | string | да | Исходная ветка (откуда мержим) |
| `targetBranch` | string | да | Целевая ветка (куда мержим) |
| `dryRun` | boolean | нет | Показать результат без применения |
| `autoResolve` | boolean | нет | Автоматически разрешать простые конфликты |
| `conflictStrategy` | string | нет | Стратегия: `ours`, `theirs`, `smart` |

### Возвращает

```typescript
{
  success: boolean;
  mergeBase: string;              // Общий предок
  files: {
    merged: string[];             // Успешно смержены
    conflicted: string[];         // С конфликтами
    autoResolved: string[];       // Автоматически разрешены
  };
  conflicts: Array<{
    filePath: string;
    conflictId: string;
    type: "content" | "rename" | "delete";
    description: string;
    markers: {
      start: number;
      middle: number;
      end: number;
    };
  }>;
  appliedChanges: boolean;
}
```

### Примеры

**Предпросмотр мержа:**
```
semantic_merge({
  sourceBranch: "feature/new-auth",
  targetBranch: "main",
  dryRun: true
})
```

**Мерж с авто-разрешением:**
```
semantic_merge({
  sourceBranch: "feature/new-auth",
  targetBranch: "main",
  autoResolve: true,
  conflictStrategy: "smart"
})
```

---

## analyze_merge_conflicts

Анализ потенциальных конфликтов между ветками без выполнения мержа. Классифицирует конфликты по серьёзности.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `sourceBranch` | string | да | Исходная ветка |
| `targetBranch` | string | да | Целевая ветка |
| `detailed` | boolean | нет | Детальный анализ каждого конфликта |

### Возвращает

```typescript
{
  sourceBranch: string;
  targetBranch: string;
  canAutoMerge: boolean;
  conflicts: Array<{
    conflictId: string;
    filePath: string;
    severity: "low" | "medium" | "high" | "critical";
    type: "content" | "semantic" | "structural" | "rename" | "delete";
    description: string;
    affectedEntities: string[];
    sourceChanges: string;
    targetChanges: string;
    autoResolvable: boolean;
  }>;
  summary: {
    totalConflicts: number;
    bySeverity: Record<string, number>;
    autoResolvable: number;
  };
}
```

### Примеры

```
analyze_merge_conflicts({
  sourceBranch: "feature/refactor",
  targetBranch: "main",
  detailed: true
})
```

---

## get_merge_suggestions

Получение AI-предложений для разрешения конкретного конфликта. Требует `conflictId` из `analyze_merge_conflicts`.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `conflictId` | string | да | ID конфликта |
| `context` | string | нет | Дополнительный контекст для AI |

### Возвращает

```typescript
{
  conflictId: string;
  suggestions: Array<{
    strategy: string;
    description: string;
    code: string;
    confidence: number;
    pros: string[];
    cons: string[];
  }>;
  recommendation: {
    strategy: string;
    reason: string;
  };
}
```

### Примеры

```
get_merge_suggestions({
  conflictId: "conflict_abc123",
  context: "Приоритет у новой логики авторизации"
})
```

---

## get_semantic_merge_info

Информация о возможностях семантического мержа и примеры использования.

### Параметры

Без параметров.

### Возвращает

```typescript
{
  version: string;
  capabilities: string[];
  supportedConflictTypes: string[];
  autoResolveStrategies: string[];
  examples: Array<{
    scenario: string;
    command: object;
  }>;
}
```

### Примеры

```
get_semantic_merge_info()
```

---

> **Подробнее о архитектуре:**
> - [SEMANTIC_MERGE_ARCHITECTURE.md](SEMANTIC_MERGE_ARCHITECTURE.md)
> - [SEMANTIC_MERGE_QUICKSTART.md](SEMANTIC_MERGE_QUICKSTART.md)

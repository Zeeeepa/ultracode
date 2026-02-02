# Граф кода и сущности

🌐 **Language**: [EN](./graph.md) | [RU]

---

Инструменты для работы с графом сущностей и их связей.

---

## get_members

Список сущностей в файле — импорты, функции, классы, переменные и т.д. Точка входа для получения ID сущностей перед другими операциями.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | да | Путь к файлу |
| `types` | string[] | нет | Типы сущностей для фильтрации |
| `includePrivate` | boolean | нет | Включать приватные члены |

### Типы сущностей

`function`, `class`, `interface`, `type`, `enum`, `variable`, `import`, `export`, `method`, `property`

### Возвращает

```typescript
{
  filePath: string;
  entities: Array<{
    entityId: string;
    name: string;
    type: string;
    line: number;
    endLine: number;
    exported: boolean;
    modifiers: string[];        // async, static, private, etc.
    signature?: string;         // Для функций/методов
  }>;
  totalCount: number;
}
```

### Примеры

**Все сущности файла:**
```
get_members({ filePath: "src/services/auth.ts" })
```

**Только функции и классы:**
```
get_members({
  filePath: "src/services/auth.ts",
  types: ["function", "class"]
})
```

---

## list_entity_relationships

Список связей сущности — импорты, вызовы, наследование, реализации.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | да* | ID сущности |
| `entityName` | string | да* | Имя сущности (если нет ID) |
| `filePath` | string | нет | Путь к файлу (для уточнения name) |
| `direction` | string | нет | Направление: `outgoing`, `incoming`, `both` |
| `relationshipTypes` | string[] | нет | Типы связей для фильтрации |

*Укажите либо `entityId`, либо `entityName`

### Типы связей

`imports`, `calls`, `extends`, `implements`, `references`, `contains`, `uses`

### Возвращает

```typescript
{
  entity: { id: string; name: string; type: string; };
  relationships: Array<{
    type: string;
    direction: "outgoing" | "incoming";
    target: {
      entityId: string;
      name: string;
      filePath: string;
    };
    metadata?: object;
  }>;
  totalCount: number;
}
```

### Примеры

**Все исходящие связи:**
```
list_entity_relationships({
  entityId: "src/services/auth.ts:AuthService"
})
```

**Кто вызывает эту функцию:**
```
list_entity_relationships({
  entityName: "validateEmail",
  filePath: "src/utils/validators.ts",
  direction: "incoming",
  relationshipTypes: ["calls"]
})
```

---

## get_graph

Получение полного графа кода или его части.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `scope` | string | нет | Область: `file`, `module`, `project` |
| `filePath` | string | нет | Путь для scope=file/module |
| `depth` | number | нет | Глубина связей |
| `format` | string | нет | Формат: `json`, `graphml`, `mermaid` |

### Возвращает

```typescript
{
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    filePath: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
  }>;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    scope: string;
  };
  mermaid?: string;
}
```

### Примеры

**Граф модуля:**
```
get_graph({
  scope: "module",
  filePath: "src/services/",
  format: "mermaid"
})
```

---

## get_graph_stats

Статистика графа — количество сущностей, связей, покрытие по типам.

### Параметры

Без параметров.

### Возвращает

```typescript
{
  entities: {
    total: number;
    byType: Record<string, number>;
    byLanguage: Record<string, number>;
  };
  relationships: {
    total: number;
    byType: Record<string, number>;
  };
  files: {
    total: number;
    indexed: number;
    byExtension: Record<string, number>;
  };
  lastUpdated: string;
}
```

### Примеры

```
get_graph_stats()
```

---

## reset_graph

Полная очистка графа — удаление всех сущностей, связей и файлов. Используйте перед полной переиндексацией.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `confirm` | boolean | нет | Подтверждение операции |

### Возвращает

```typescript
{
  success: boolean;
  deletedEntities: number;
  deletedRelationships: number;
  deletedFiles: number;
}
```

### Примеры

```
reset_graph({ confirm: true })
```

---

## get_graph_health

Диагностика состояния графа — проверка целостности, статистика, примеры данных.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `detailed` | boolean | нет | Детальная диагностика |
| `sampleSize` | number | нет | Количество примеров |

### Возвращает

```typescript
{
  healthy: boolean;
  issues: Array<{
    type: "orphan_entity" | "missing_file" | "broken_relationship";
    description: string;
    count: number;
  }>;
  statistics: {
    entities: number;
    relationships: number;
    files: number;
    vectors: number;
  };
  samples?: {
    entities: Array<{...}>;
    relationships: Array<{...}>;
  };
  databaseInfo: {
    path: string;
    size: number;
    lastModified: string;
  };
}
```

### Примеры

```
get_graph_health({ detailed: true, sampleSize: 5 })
```

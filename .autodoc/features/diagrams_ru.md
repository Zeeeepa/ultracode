# Архитектурные диаграммы

🌐 **Language**: [EN](./diagrams.md) | [RU]

---

Генерация архитектурных диаграмм из графа кода в форматах Mermaid, Graphviz DOT или D2. Визуализация структуры проекта, иерархий классов, потоков данных и связей компонентов — всё из проиндексированного графа кода без чтения исходных файлов.

---

## get_architecture_diagram

Генерация архитектурной диаграммы из графа кода. Поддерживает несколько форматов вывода, настраиваемую глубину и аннотации потоков данных.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entryPoint` | string | нет | Точка входа: путь к файлу, имя модуля, класса или ID сущности. Без указания — диаграмма всего проекта |
| `depth` | number | да | Глубина обхода: 1=файлы/модули, 2=классы/функции, 3=методы/свойства, 4+=глубже |
| `dataFlowLevel` | number | да | Детализация потоков данных: 0=только структура, 1=базовые типы, 2=параметры+условия, 3=маппинг полей |
| `format` | string | да | Формат вывода: `mermaid`, `graphviz`, `d2` |
| `direction` | string | да | Направление: `TD` (сверху вниз) или `LR` (слева направо) |
| `diagramType` | string | нет | Тип диаграммы: `flowchart`, `class`, `component`. Автоопределение если не указан |
| `projectPath` | string | нет | Путь к директории проекта |

### Уровни потоков данных

| Уровень | Что показывается | Пример ребра |
|---------|------------------|-------------|
| **0** | Только структура — узлы и связи calls/extends/implements | `A --> B` |
| **1** | Базовые типы: сигнатура вход→выход, маркер transform/passthrough, подсказки условий | `A --> \|"string → boolean \| transform \| ⚡if cached"\| B` |
| **2** | Всё из L1 + условные рёбра рисуются пунктиром (визуальное различие) | `A -.-> \|"string → boolean \| transform \| ⚡if cached"\| B` |
| **3** | Всё из L2 + маппинг полей через regex-анализ исходного кода | `A -.-> \|"... \| user.name,address.city"\| B` |

### Форматы вывода

| Формат | Лучше для | Рендеринг |
|--------|-----------|-----------|
| **mermaid** | Markdown, GitHub, документация | [mermaid.live](https://mermaid.live), GitHub/GitLab нативно |
| **graphviz** | Качественная печать/PDF, большие графы | `dot -Tsvg output.dot -o diagram.svg` |
| **d2** | Интерактивные, современный стиль | `d2 output.d2 diagram.svg` |

### Возвращает

```typescript
{
  format: "mermaid" | "graphviz" | "d2";
  diagramType: "flowchart" | "class" | "component";
  direction: "TD" | "LR";
  diagram: string;              // Текст диаграммы
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalGroups: number;
    truncated: boolean;          // true если сработали лимиты
    collectionTimeMs: number;
  };
}
```

### Примеры

**Обзор проекта (рекомендуемая отправная точка):**
```
get_architecture_diagram({
  depth: 2,
  dataFlowLevel: 1,
  format: "mermaid",
  direction: "TD"
})
```

**Диаграмма классов конкретного модуля:**
```
get_architecture_diagram({
  entryPoint: "TraceEngine",
  depth: 3,
  dataFlowLevel: 1,
  format: "mermaid",
  direction: "LR",
  diagramType: "class"
})
```

**Graphviz DOT для печатного качества:**
```
get_architecture_diagram({
  entryPoint: "src/agents/conductor-orchestrator.ts",
  depth: 2,
  dataFlowLevel: 0,
  format: "graphviz",
  direction: "TD"
})
```

**D2 с полными аннотациями потоков:**
```
get_architecture_diagram({
  entryPoint: "SchemaCollector",
  depth: 3,
  dataFlowLevel: 2,
  format: "d2",
  direction: "LR"
})
```

**Маппинг полей (L3) для анализа трансформаций данных:**
```
get_architecture_diagram({
  entryPoint: "processOrder",
  depth: 3,
  dataFlowLevel: 3,
  format: "mermaid",
  direction: "TD"
})
```

### Архитектура

Инструмент использует 3-слойный pipeline:

```
Граф (сущности + связи)
  → SchemaCollector (BFS-обход + обогащение потоками данных)
    → DiagramIR (промежуточное представление, не привязанное к формату)
      → Renderer (текстовый вывод Mermaid / Graphviz / D2)
```

**Ключевые решения:**
- Собственный BFS с обходом только по CONTAINS (не getSubgraph, который идёт по ВСЕМ типам связей)
- Lifting связей: при depth=2 показываются классы, CALLS между методами поднимаются на уровень классов
- Пакетное обогащение через `TraceEngine.getBatchNodeContext()` — 2 SQL-запроса на всю диаграмму
- LRU-кэш на DiagramIR (ключ SHA256, TTL 5мин, макс. 20 записей)
- Фильтрация: исключаются скрипты, тесты, сгенерированный код, документация

### Производительность

| Метрика | Значение |
|---------|----------|
| Макс. узлов | 500 |
| Макс. рёбер | 1000 |
| Макс. узлов на уровень | 100 |
| Таймаут | 10 секунд |
| TTL кэша | 5 минут |
| Типичное время ответа | 1-2 сек (первый вызов), <200мс (из кэша) |

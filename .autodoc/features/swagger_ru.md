# Интеграция Swagger/OpenAPI

**Language**: [EN](./swagger.md) | [RU]

---

Инструменты для понимания связи Swagger/OpenAPI спецификаций с кодом — контроллерами, сгенерированными клиентами и типами. Автоматически обнаруживает границы API-контрактов и предупреждает о breaking changes.

---

## Как это работает

Когда в проекте есть Swagger/OpenAPI JSON файлы, UltraCode автоматически:

1. **Парсит swagger-спецификации** в сущности графа с маркерами `metadata.swaggerType` (`api_spec`, `endpoint`, `schema`, `tag`)
2. **Связывает swagger с кодом** — соединяет контроллеры (producers), сгенерированные клиенты (consumers) и типы с их swagger-источниками
3. **Определяет активные контракты** — многосигнальная оценка определяет, какие swagger-файлы реально используются
4. **Аннотирует границы API** в результатах трассировки и анализа влияния

### Поддерживаемые экосистемы

| Роль | Фреймворки / Инструменты |
|------|--------------------------|
| **API Producers** | NestJS, Express/Fastify, Spring Boot, .NET (Swashbuckle, Microsoft.OpenApi) |
| **Кодогенераторы** | openapi-generator-cli, NSwag, swagger-codegen, Autorest, Refitter, ng-openapi-gen |

### Новые типы связей

| Связь | Направление | Значение |
|-------|-------------|----------|
| `produces_api` | Контроллер → Swagger endpoint | Метод контроллера реализует этот API-эндпоинт |
| `consumes_api` | Сгенерированный клиент → Swagger endpoint | Сгенерированный клиент вызывает этот API-эндпоинт |
| `generated_from` | Сгенерированный тип → Swagger schema | TypeScript/C# тип сгенерирован из этой схемы |

---

## analyze_swagger_impact

Анализ влияния изменений Swagger/OpenAPI спецификации. Показывает затронутые контроллеры (producers), сгенерированные клиенты (consumers) и сгенерированные типы.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `swaggerFile` | string | нет | Путь к swagger-файлу (авто-определяется если не указан) |
| `schemaName` | string | нет | Конкретная schema для анализа (например `User`) |
| `endpointPath` | string | нет | Конкретный endpoint (например `GET /api/users`) |
| `projectPath` | string | нет | Путь к директории проекта |

### Возвращает

```typescript
{
  swaggerFiles: Array<{
    filePath: string;
    isActive: boolean;
    usageConfidence: number;
  }>;
  affectedEntities: Array<{
    entityId: string;
    name: string;
    filePath: string;
    role: "producer" | "consumer" | "generated_type";
    relationship: "produces_api" | "consumes_api" | "generated_from";
  }>;
  breakingChangeRisk: "low" | "medium" | "high";
  summary: string;
}
```

### Примеры

**Полный анализ swagger-влияния:**
```
analyze_swagger_impact()
```

**Влияние изменения конкретной schema:**
```
analyze_swagger_impact({
  schemaName: "User"
})
```

**Влияние изменения endpoint:**
```
analyze_swagger_impact({
  endpointPath: "GET /api/users"
})
```

---

## Обогащение существующих инструментов

### analyze_code_impact — Contract Impact

Когда затронутая сущность имеет связи `produces_api`, `consumes_api` или `generated_from`, `analyze_code_impact` включает секцию `contractImpact`:

```typescript
{
  // ...существующие поля...
  contractImpact: {
    affectsApiContract: true,
    affectedEndpoints: ["GET /api/users", "POST /api/users"],
    affectedSchemas: ["User", "CreateUserRequest"],
    breakingChangeRisk: "high",
    consumers: ["frontend-client"],
    warning: "Изменения затрагивают внешний API-контракт — потребители могут сломаться"
  }
}
```

### modify_code — Swagger-предупреждения

При модификации сущности, связанной со swagger, ответ включает секцию `swaggerImpact`:

```typescript
{
  // ...существующие поля...
  swaggerImpact: {
    affectsContract: true,
    contractBreaks: [{
      rule: "controller-modified",
      change: "unknown",
      endpoint: "GET /api/users/{id}",
      message: "API-контракт может быть затронут"
    }],
    isGeneratedCode: false
  }
}
```

При модификации сгенерированного кода:
> "Этот файл сгенерирован из swagger — ручные изменения будут перезаписаны при следующей генерации"

### trace_flow / trace_backwards — Аннотации границ API

Шаги трассировки, проходящие через swagger-сущности, аннотируются:

```typescript
{
  // ...существующие поля шага...
  crossesApiContract: true,
  contractInfo: {
    type: "swagger",
    swaggerType: "endpoint",
    endpoint: "GET /api/users",
    schemaName: undefined
  }
}
```

Предупреждение на уровне пути: `"Путь пересекает границу API-контракта — изменения могут затронуть внешних потребителей"`

### get_graph_health — Детекция устаревшего swagger

Проверка состояния теперь сообщает, когда сгенерированный код может быть рассинхронизирован со swagger:

```typescript
{
  // ...существующие поля...
  swaggerHealth: {
    swaggerFilesFound: 2,
    activeContracts: 1,
    staleWarnings: [
      "Сгенерированный код может быть рассинхронизирован: swagger.json обновлён после src/generated/api-client.ts"
    ]
  }
}
```

---

## Детекция использования

UltraCode определяет, какие swagger-файлы "активно используются", через многосигнальную оценку:

| Сигнал | Вес | Метод |
|--------|-----|-------|
| Код импортирует из generated-путей | 0.4 | Анализ `IMPORTS` relationships в графе |
| В package.json есть codegen-скрипт | 0.3 | Проверка наличия openapi-generator, nswag и т.д. |
| Есть config генератора | 0.2 | Поиск `nswag.json`, `openapitools.json` и т.д. |
| Есть generated-файлы с маркерами | 0.1 | Проверка маркеров `/* auto-generated */` |

Swagger-файл считается **активным** при score >= 0.3.

Результаты сохраняются как `metadata.usageConfidence` и `metadata.isActiveContract` на swagger-сущностях.

---

## Нулевой overhead для проектов без Swagger

Вся обработка swagger lazy-loaded и защищена проверками наличия swagger-сущностей в графе. Проекты без swagger-файлов имеют **нулевой overhead по производительности**.

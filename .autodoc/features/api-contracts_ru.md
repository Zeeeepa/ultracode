# Анализ API-контрактов (Protobuf, GraphQL, Swagger)

**Language**: [EN](./api-contracts.md) | [RU]

---

Инструменты для понимания связи API-контрактов (Swagger/OpenAPI, Protobuf/gRPC, GraphQL) с кодом — серверами, резолверами, сгенерированными клиентами и типами. Автоматически обнаруживает границы API-контрактов и предупреждает о breaking changes.

---

## Как это работает

Когда в проекте есть файлы `.proto`, `.graphql`/`.gql` или Swagger JSON, UltraCode автоматически:

1. **Парсит API-спецификации** в сущности графа с типовыми маркерами
2. **Связывает спецификации с кодом** — соединяет серверы/резолверы (producers), клиенты/hooks (consumers) и сгенерированные типы с их источниками
3. **Определяет активные контракты** — многосигнальная оценка определяет, какие спецификации реально используются
4. **Аннотирует границы API** в результатах трассировки и анализа влияния

### Поддерживаемые экосистемы

#### Protobuf / gRPC

| Роль | Фреймворки / Инструменты |
|------|--------------------------|
| **gRPC серверы** | @grpc/grpc-js, grpc-go, grpc-java, grpc-dotnet, tonic (Rust) |
| **Кодогенераторы** | protoc, protobuf-ts, grpc-tools, buf, ts-proto |

**Извлекаемые сущности:**
- Сервисы и RPC (unary, server/client/bidirectional streaming)
- Сообщения (вложенные, oneof, map-поля)
- Enum с значениями
- Пакеты
- HTTP-аннотации (`google.api.http`)

#### GraphQL

| Роль | Фреймворки / Инструменты |
|------|--------------------------|
| **Серверы** | Apollo Server, type-graphql, Nexus, Pothos, graphql-yoga, Ariadne, Strawberry, gqlgen |
| **Клиенты** | Apollo Client, urql, graphql-request, relay |
| **Кодогенераторы** | graphql-codegen, graphql-code-generator, genql |

**Извлекаемые сущности:**
- Типы, интерфейсы, inputs, enums, unions, scalars
- Директивы (включая `@auth`, `@deprecated`, `@cacheControl`)
- Корневые типы Query, Mutation, Subscription
- Аргументы полей с типами
- Декларации `extend type`

### Новые типы связей

| Связь | Направление | Значение |
|-------|-------------|----------|
| `produces_api` | Сервер/Резолвер → Спецификация | Реализация обслуживает этот API |
| `consumes_api` | Клиент/Hook → Спецификация | Клиент вызывает этот API |
| `generated_from` | Сгенерированный тип → Спецификация | Код сгенерирован из этой спецификации |

---

## analyze_api_impact

Унифицированный анализ влияния по всем типам API-контрактов. Автоопределяет тип контракта или фильтруйте явно.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `contractType` | enum | нет | `swagger`, `protobuf`, `graphql` или `auto` (по умолчанию: `auto`) |
| `specFile` | string | нет | Путь к файлу спецификации (авто-определяется если не указан) |
| `schemaName` | string | нет | Конкретная schema/message/тип для анализа |
| `endpointPath` | string | нет | Конкретный endpoint: `GET /api/users` или имя rpc |
| `projectPath` | string | нет | Путь к директории проекта |

### Возвращает

```typescript
{
  contracts: Array<{
    type: "swagger" | "protobuf" | "graphql";
    filePath: string;
    isActive: boolean;
    usageConfidence: number;
    entitiesFound: number;
  }>;
  affectedEntities: Array<{
    entityId: string;
    name: string;
    filePath: string;
    role: "producer" | "consumer" | "generated_type";
    relationship: "produces_api" | "consumes_api" | "generated_from";
    contractType: "swagger" | "protobuf" | "graphql";
  }>;
  breakingChangeRisk: "low" | "medium" | "high";
  summary: string;
}
```

### Примеры

**Полный анализ влияния по всем типам контрактов:**
```
analyze_api_impact()
```

**Только Protobuf:**
```
analyze_api_impact({
  contractType: "protobuf",
  schemaName: "UserService"
})
```

**Влияние типа GraphQL:**
```
analyze_api_impact({
  contractType: "graphql",
  schemaName: "User"
})
```

**Конкретный endpoint:**
```
analyze_api_impact({
  endpointPath: "GetUser"
})
```

---

## Обогащение существующих инструментов

### taint_analysis — категория missing_auth

Категория `missing_auth` обнаруживает API-эндпоинты (REST-контроллеры, gRPC-обработчики, GraphQL-резолверы), которые достигают чувствительных операций (запись в БД, доступ к файлам, внешние вызовы) без прохождения проверок авторизации.

```ts
taint_analysis({ category: "missing_auth" })
```

Подробнее в [security_ru.md](security_ru.md).

### trace_flow / trace_backwards — Аннотации границ API

Шаги трассировки, проходящие через любые API-контрактные сущности (Swagger, Protobuf или GraphQL), аннотируются:

```typescript
{
  crossesApiContract: true,
  contractInfo: {
    type: "protobuf" | "graphql" | "swagger",
    swaggerType?: "endpoint" | "schema",
    endpoint?: string,
    schemaName?: string
  }
}
```

---

## Детекция использования

UltraCode определяет, какие API-спецификации "активно используются", через многосигнальную оценку:

| Сигнал | Вес | Метод |
|--------|-----|-------|
| Код импортирует из generated-путей | 0.4 | Анализ `IMPORTS` relationships в графе |
| В package.json/build-конфиге есть codegen-скрипт | 0.3 | Проверка наличия protoc, graphql-codegen и т.д. |
| Есть config генератора | 0.2 | Поиск `buf.yaml`, `codegen.yml` и т.д. |
| Есть generated-файлы с маркерами | 0.1 | Проверка маркеров auto-generated |

Спецификация считается **активной** при score >= 0.3.

---

## Нулевой overhead для проектов без API

Вся обработка API lazy-loaded и защищена проверками наличия spec-сущностей в графе. Проекты без файлов спецификаций имеют **нулевой overhead по производительности**.

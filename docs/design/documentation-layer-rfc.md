# RFC: AutoDoc — Semantic Documentation Layer

**Status**: Draft
**Author**: AI Assistant
**Created**: 2025-12-06
**Target**: UltraScript Tools MCP v3.0

> **AutoDoc** — автоматическая документация кода с семантическим поиском.
> Название подчёркивает: за синхронизацию отвечает автоматика.

---

## 1. Обзор и Мотивация

### 1.1 Проблема
- Документация кода отдельна от самого кода и быстро устаревает
- AI-ассистенты тратят много токенов на понимание контекста
- Нет семантического поиска по документации
- Ссылки между документацией и кодом не поддерживаются автоматически

### 1.2 Решение
Семантический слой документации с:
- **Embeddings в БД** для мгновенного семантического поиска
- **MD-файлы на диске** для человекочитаемой формы и версионирования
- **Двунаправленные ссылки** между документацией, кодом и комментариями
- **Unified Reference Tracking** — автообновление всех ссылок при перемещении кода
- **Автоматическая синхронизация** при изменении кода

### 1.3 Разграничение: Документация vs Комментарии

| Аспект | Комментарии в коде | Документация в MD |
|--------|-------------------|-------------------|
| **Уровень** | Локальный (строка/блок) | Глобальный (процесс/flow) |
| **Вопрос** | "Как это работает?" | "Зачем? Кем используется? В каких сценариях?" |
| **Контекст** | Технический | Бизнес-логика + архитектура |
| **Читатель** | Разработчик в IDE | AI + Разработчик ищущий понимание |
| **Пример** | `// Retry 3 times with exponential backoff` | "Этот сервис участвует в flow регистрации пользователя и вызывается из API Gateway" |

**Правило**: Комментарии объясняют КАК, документация объясняет ЗАЧЕМ и ГДЕ ИСПОЛЬЗУЕТСЯ.

Комментарии могут содержать ссылки на документацию:
```typescript
// Implements user registration flow
// @see docs://PROCESSES.md#user-registration
// @see docs://src/services/auth/README.md#registration
async registerUser(data: UserData): Promise<User> {
```

### 1.4 Целевая Аудитория
- **80% AI**: Быстрое получение контекста через MCP
- **20% Люди**: Навигация в больших проектах

---

## 2. Unified Reference System

### 2.1 Проблема ссылок
При перемещении/рефакторинге кода ломаются ссылки в:
- Документации (MD файлы)
- Комментариях в коде (`@see`, `// see:`)
- Других местах кода (JSDoc `{@link}`)

### 2.2 Решение: Reference Registry

Все ссылки хранятся в единой таблице и обновляются атомарно:

```typescript
interface Reference {
  id: string;                      // UUID
  sourceType: 'doc' | 'comment' | 'code';
  sourceLocation: {
    filePath: string;
    lineStart: number;
    lineEnd: number;
    charStart?: number;
    charEnd?: number;
  };

  targetType: 'entity' | 'doc' | 'line_range' | 'commit';
  targetId: string;                // Entity ID, Doc ID, или file:L1-L50

  // Для быстрого поиска по target
  targetEntityId?: string;         // Normalized entity ID
  targetFilePath?: string;
  targetLineStart?: number;
  targetLineEnd?: number;

  // Метаданные
  refSyntax: string;               // Оригинальный синтаксис ссылки
  createdAt: number;
  updatedAt: number;
}
```

### 2.3 Типы ссылок

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Reference Types                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FROM Documentation:                                                │
│  ─────────────────────────────────────────────────────────────────  │
│  [→ file.ts:25-50](file.ts#L25-L50)     → Line range ref           │
│  [→ entity:Class.method](...)            → Entity ref               │
│  [→ OtherDoc](./other.md#section)        → Doc-to-doc ref          │
│                                                                     │
│  FROM Code Comments:                                                │
│  ─────────────────────────────────────────────────────────────────  │
│  // @see docs://PROCESSES.md#flow        → Comment-to-doc ref      │
│  /** @link {AuthService} */              → Comment-to-entity ref   │
│  // Part of: user-registration-flow      → Tag ref (indexed)       │
│                                                                     │
│  FROM Code (semantic):                                              │
│  ─────────────────────────────────────────────────────────────────  │
│  Import statements                       → Auto-detected            │
│  Function calls                          → Auto-detected            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.4 Auto-Update Algorithm

```
┌─────────────────────────────────────────────────────────────────────┐
│            Reference Update on Code Change                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Code change detected (move/rename/line shift)                   │
│           │                                                         │
│           ▼                                                         │
│  2. RefTracker calculates delta:                                    │
│     - Entity moved: AuthService → auth/AuthService                  │
│     - Lines shifted: +15 lines after line 100                       │
│           │                                                         │
│           ▼                                                         │
│  3. Query all references pointing to affected targets:              │
│     SELECT * FROM references                                        │
│     WHERE target_file_path = 'auth.service.ts'                      │
│       AND target_line_start >= 100                                  │
│           │                                                         │
│           ▼                                                         │
│  4. Update references in batch:                                     │
│     - Recalculate target line numbers                               │
│     - Update target entity IDs if renamed                           │
│           │                                                         │
│           ▼                                                         │
│  5. Apply changes to source files:                                  │
│     - Rewrite MD files with new line numbers                        │
│     - Rewrite code comments with new refs                           │
│     - Queue for re-embedding (if content changed)                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.5 Embedding Strategy

Вся документация + комментарии индексируются в единую векторную базу:

```typescript
// Embedding sources
type EmbeddingSource =
  | { type: 'code_entity'; entityId: string; content: string }
  | { type: 'doc_section'; docId: string; section: string; content: string }
  | { type: 'comment_block'; filePath: string; lineStart: number; content: string };

// All stored with unified prefix system
const embeddingId =
  source.type === 'code_entity' ? `code::${source.entityId}` :
  source.type === 'doc_section' ? `doc::${source.docId}::${source.section}` :
  `comment::${source.filePath}::${source.lineStart}`;
```

**Semantic Search объединяет все источники:**
```typescript
// Один запрос — результаты из кода, документации и комментариев
const results = await semanticSearch({
  query: "user authentication flow",
  sources: ['code', 'docs', 'comments'],  // или 'all'
  limit: 20
});

// Results ranked by relevance across all sources
[
  { type: 'doc', id: 'PROCESSES.md#auth-flow', score: 0.95 },
  { type: 'code', id: 'AuthService.login', score: 0.89 },
  { type: 'comment', id: 'auth.service.ts:25', score: 0.85 },
  ...
]
```

---

## 3. Архитектура Системы

### 3.1 Высокоуровневая Схема

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Documentation Layer                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │  MD Files   │◄──►│  Doc Index  │◄──►│  Embeddings (Vector DB) │ │
│  │  (on disk)  │    │  (SQLite)   │    │  (Same as code embeds)  │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│         │                  │                       │               │
│         └──────────────────┼───────────────────────┘               │
│                            │                                        │
│                    ┌───────▼───────┐                               │
│                    │  DocSyncAgent │                               │
│                    │  (new agent)  │                               │
│                    └───────┬───────┘                               │
│                            │                                        │
├────────────────────────────┼────────────────────────────────────────┤
│                            │                                        │
│         ┌──────────────────┼──────────────────┐                    │
│         ▼                  ▼                  ▼                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │ Code Index  │    │ Change Log  │    │ Task Index  │            │
│  │  (existing) │    │   (new)     │    │   (new)     │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Компоненты

#### 3.2.1 DocEntity (Новый тип сущности)
```typescript
interface DocEntity {
  id: string;                    // doc::{filePath}::{sectionId}
  type: 'doc_overview' | 'doc_module' | 'doc_entity' | 'doc_changelog' | 'doc_task';
  filePath: string;              // Путь к .md файлу
  section: string;               // Секция внутри файла
  content: string;               // Текст секции

  // Ссылки на код
  codeRefs: CodeReference[];

  // Метаданные
  metadata: {
    title: string;
    tags: string[];
    lastUpdated: number;
    autoGenerated: boolean;      // Сгенерировано AI vs написано вручную
    confidence: number;          // 0-1, уверенность AI в актуальности
  };

  // Для embeddings
  embedding?: number[];
}

interface CodeReference {
  entityId: string;              // ID сущности в code index
  filePath: string;
  lineStart: number;
  lineEnd: number;
  refType: 'describes' | 'depends' | 'example' | 'test';
}
```

#### 3.2.2 ChangeLogEntry (Журнал изменений)
```typescript
interface ChangeLogEntry {
  id: string;
  timestamp: number;
  commitHash?: string;
  branch: string;

  changes: {
    entityId: string;
    changeType: 'added' | 'modified' | 'deleted' | 'moved';
    summary: string;             // AI-generated краткое описание
    diffHighlights: string[];    // Ключевые изменения
  }[];

  impactedDocs: string[];        // ID документов требующих обновления
}
```

#### 3.2.3 TaskEntry (Задачи)
```typescript
interface TaskEntry {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';

  // Связи
  relatedEntities: string[];     // ID кода
  relatedDocs: string[];         // ID документации
  blockedBy: string[];           // ID других задач

  // Трекинг
  createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // AI метаданные
  estimatedComplexity?: number;
  suggestedApproach?: string;
}
```

### 3.3 DocSyncAgent (Новый агент)

```typescript
class DocSyncAgent extends BaseAgent {
  // Отслеживание изменений
  async onCodeChange(event: CodeChangeEvent): Promise<void>;

  // Генерация/обновление документации
  async generateDocForEntity(entityId: string): Promise<DocEntity>;
  async updateDocSection(docId: string, section: string): Promise<void>;

  // Синхронизация ссылок
  async validateCodeRefs(docId: string): Promise<RefValidationResult>;
  async updateBrokenRefs(docId: string): Promise<void>;

  // Changelog
  async recordChange(change: ChangeLogEntry): Promise<void>;
  async generateChangelogSummary(since: number): Promise<string>;
}
```

---

## 4. Формат MD-файлов

### 4.1 Хранение и Иерархия

#### Где хранятся данные

**AutoDoc документация** — в папке `.autodoc/` в проекте (версионируется с кодом):

```
project-root/
├── .autodoc/                           # ← Вся автодокументация здесь
│   │
│   │  # === ВЕРХНЕУРОВНЕВЫЕ ===
│   ├── ARCHITECTURE.md                 # Архитектура системы (компоненты)
│   ├── FLOW.md                         # Бизнес-сценарии (user stories)
│   ├── PROCESSES.md                    # Технические процессы (как работает)
│   ├── DEPENDENCIES.md                 # Зависимости (пакеты, API, сервисы)
│   ├── DEPLOYMENT.md                   # Сборка, CI/CD, ENV, публикация
│   ├── GLOSSARY.md                     # Термины и определения
│   │
│   ├── src/                            # Зеркалит структуру проекта
│   │   ├── _index.md                   # Обзор src директории
│   │   ├── core/
│   │   │   ├── _index.md               # Документация core модуля
│   │   │   └── engine.md               # Детальная документация engine
│   │   └── services/
│   │       └── auth/
│   │           ├── _index.md           # Документация auth модуля
│   │           └── auth.service.md     # Детали сервиса
│   │
│   └── decisions/                      # ADR (Architecture Decision Records)
│       └── 001-sqlite.md
│
├── src/                                # Исходный код (не трогаем)
│   └── ...
│
└── docs/                               # Ручная документация пользователя (не трогаем!)
    └── ...
```

**Почему `.autodoc/`:**
- Чётко отделено от ручной документации (`docs/`)
- Точка в начале — можно добавить в `.gitignore` если не нужно версионировать
- Название говорит само за себя — автоматическая документация
- Структура зеркалит код — легко найти документацию для файла

**Индексы и метаданные** — в папке инструмента (НЕ в проекте):
```
~/.local/share/ultrascript-tools/       # или AppData на Windows
├── projects/
│   ├── {project-hash}/                 # Хэш пути проекта
│   │   ├── .autodoc                    # Маркер + настройки документации
│   │   ├── main/                       # Ветка
│   │   │   ├── docs.db                 # SQLite: doc entities, refs, metadata
│   │   │   ├── changelog.db            # История изменений
│   │   │   └── tasks.db                # Задачи
│   │   ├── feature-auth/
│   │   │   └── ...
│   │   └── ...
│   └── ...
└── ...
```

### Файл `.autodoc`

Маркер включения документации + настройки. Хранится в нашей папке, НЕ в проекте пользователя.

```yaml
# ~/.local/share/ultrascript-tools/projects/{hash}/.autodoc
enabled: true
language: auto          # auto | en | ru | zh
created: 2025-12-06
project_path: /path/to/project
```

**Управление через MCP:**
```typescript
tool('autodoc_init', {
  language: z.enum(['en', 'ru', 'zh']),  // обязательный!
  createTemplates: z.boolean().default(true)
});
// → создаёт .autodoc папку в проекте
// → создаёт маркер в нашей папке
// → возвращает план работ для AI

tool('autodoc_disable', {});
// → удаляет маркер (папка .autodoc остаётся)

tool('autodoc_status', {});
// → возвращает: enabled/disabled, language, stats, outdated docs
```

**Логика определения:**
```typescript
function isDocumentationEnabled(projectPath: string): boolean {
  const hash = hashPath(projectPath);
  const autodocPath = `${DATA_DIR}/projects/${hash}/.autodoc`;
  return fs.existsSync(autodocPath);
}
```

**Принцип**: MD-файлы — для людей и Git. Метаданные и настройки — только в нашей папке.

### 4.2 Стандартизованный Формат Файла

**Принцип**: Чистый Markdown без служебных тегов. Секции определяются по заголовкам (headings).
Метаданные хранятся только в БД, не в файлах.

#### 4.2.1 ARCHITECTURE.md — архитектура системы

```markdown
# Project Name Architecture

## Overview

Brief description of the project's purpose and main functionality.

**Key Capabilities:**
- Capability 1
- Capability 2

## Core Components

### Component A

[→ src/core/engine.ts:1-50](src/core/engine.ts#L1-L50)

Description of Component A and its role in the system.
Why it exists, what business problem it solves.

**Dependencies:**
- [Component B](#component-b) — for X functionality
- [External: lodash](https://lodash.com) — utility functions

### Component B

[→ src/services/auth/](src/services/auth/)

Description of Component B.

## Data Flow

```mermaid
graph LR
    A[Input] --> B[Processor]
    B --> C[Output]
```

## Key Decisions

| Decision | Rationale | ADR |
|----------|-----------|-----|
| Use SQLite | Simplicity, no external deps | [ADR-001](docs/decisions/001-sqlite.md) |
```

**Как система определяет секции:**
- `# H1` — название документа
- `## H2` — основные секции (Overview, Components, Data Flow...)
- `### H3` — подсекции (конкретные компоненты)
- Имена секций распознаются семантически (Overview, Purpose, Components, Dependencies...)

#### 4.2.2 FLOW.md — бизнес-сценарии

**Что описывает**: Пользовательские сценарии, use cases, user stories.
**Язык**: С точки зрения пользователя/бизнеса.

```markdown
# User Flows

## Регистрация пользователя

**Актор**: Новый пользователь
**Цель**: Создать аккаунт в системе

### Основной сценарий

1. Пользователь открывает страницу регистрации
2. Вводит email и пароль
3. Нажимает "Зарегистрироваться"
4. Получает письмо с подтверждением
5. Переходит по ссылке из письма
6. Аккаунт активирован, редирект на главную

### Альтернативные сценарии

**Email уже занят:**
- Система показывает ошибку "Email уже используется"
- Предлагает восстановить пароль

**Слабый пароль:**
- Система показывает требования к паролю
- Пользователь исправляет

### Связанные компоненты

- [→ AuthService](.autodoc/src/services/auth/auth.service.md) — регистрация
- [→ EmailService](.autodoc/src/services/email/email.service.md) — отправка писем

---

## Оформление заказа

**Актор**: Авторизованный пользователь
**Цель**: Купить товары из корзины

### Основной сценарий

1. Пользователь открывает корзину
2. Проверяет состав заказа
3. Нажимает "Оформить заказ"
4. Выбирает способ доставки
5. Выбирает способ оплаты
6. Подтверждает заказ
7. Получает номер заказа и чек на email

### Бизнес-правила

- Минимальная сумма заказа: 500 руб
- Бесплатная доставка от 3000 руб
- Товары резервируются на 30 минут

### Связанные компоненты

- [→ CartService](.autodoc/src/services/cart/cart.service.md)
- [→ OrderService](.autodoc/src/services/order/order.service.md)
- [→ PaymentService](.autodoc/src/services/payment/payment.service.md)
```

#### 4.2.3 PROCESSES.md — технические процессы

**Что описывает**: Как система технически реализует функциональность.
**Язык**: Технический, с точки зрения разработчика.

```markdown
# Technical Processes

## Процесс аутентификации

### JWT Token Flow

```
[Client] → POST /auth/login { email, password }
    ↓
[AuthService.login()]
    ↓
[UserService.findByEmail()] → [User | null]
    ↓
[bcrypt.compare()] → [valid | invalid]
    ↓
[TokenManager.generate()] → { accessToken, refreshToken }
    ↓
[Response] → 200 { tokens } | 401 { error }
```

### Token Refresh

```
[Client] → POST /auth/refresh { refreshToken }
    ↓
[TokenManager.verify(refreshToken)]
    ↓
[TokenManager.generate()] → { newAccessToken }
    ↓
[Response] → 200 { accessToken }
```

### Компоненты

| Компонент | Роль |
|-----------|------|
| [→ AuthService](src/services/auth/auth.service.md) | Оркестрация |
| [→ TokenManager](src/services/auth/token-manager.md) | JWT операции |
| [→ Redis](src/infra/redis.md) | Session storage |

---

## Процесс синхронизации данных

### Event-Driven Sync

```
[Database Change] → [CDC Event]
    ↓
[Kafka Producer] → topic: entity.changes
    ↓
[Sync Consumer] → [Transform] → [External API]
    ↓
[Retry Queue] (on failure)
```

### Retry Strategy

- Exponential backoff: 1s, 2s, 4s, 8s, 16s
- Max retries: 5
- Dead letter queue после исчерпания попыток

### Мониторинг

- Метрика: `sync_lag_seconds`
- Alert: lag > 60s
```

#### 4.2.4 DEPENDENCIES.md — зависимости

**Что описывает**: Всё от чего зависит проект — пакеты, внешние API, микросервисы.

```markdown
# Dependencies

## Пакеты

### Runtime

| Пакет | Версия | Зачем |
|-------|--------|-------|
| express | ^4.18.0 | HTTP сервер |
| jsonwebtoken | ^9.0.0 | JWT токены |
| bcrypt | ^5.1.0 | Хеширование паролей |
| ioredis | ^5.3.0 | Redis клиент |

### Dev

| Пакет | Версия | Зачем |
|-------|--------|-------|
| typescript | ^5.0.0 | Типизация |
| jest | ^29.0.0 | Тестирование |
| eslint | ^8.0.0 | Линтинг |

## Внешние API

### Stripe API

- **URL**: `https://api.stripe.com/v1`
- **Назначение**: Обработка платежей
- **Аутентификация**: Bearer token (env: `STRIPE_SECRET_KEY`)
- **Rate limits**: 100 req/sec
- **Документация**: [stripe.com/docs](https://stripe.com/docs)
- **Используется в**: [→ PaymentService](src/services/payment/payment.service.md)

### SendGrid API

- **URL**: `https://api.sendgrid.com/v3`
- **Назначение**: Отправка email
- **Аутентификация**: API Key (env: `SENDGRID_API_KEY`)
- **Используется в**: [→ EmailService](src/services/email/email.service.md)

## Внутренние сервисы

### User Service (микросервис)

- **URL**: `http://user-service:3001` (internal)
- **Протокол**: REST / gRPC
- **Назначение**: Управление пользователями
- **Health check**: `GET /health`
- **Используется в**: [→ AuthService](src/services/auth/auth.service.md)

### Analytics Service

- **URL**: `http://analytics:3002`
- **Протокол**: Kafka events
- **Topic**: `analytics.events`

## Инфраструктура

| Сервис | Назначение | Connection string |
|--------|------------|-------------------|
| PostgreSQL | Основная БД | `DATABASE_URL` |
| Redis | Кеш, сессии | `REDIS_URL` |
| Kafka | Event bus | `KAFKA_BROKERS` |
| S3 | Файловое хранилище | `AWS_S3_BUCKET` |
```

#### 4.2.5 DEPLOYMENT.md — сборка и публикация

**Что описывает**: Как собирать, тестировать, деплоить проект.

```markdown
# Deployment

## Сборка

### Локальная разработка

```bash
npm install
npm run dev         # http://localhost:3000
```

### Production сборка

```bash
npm run build       # → dist/
npm run start:prod
```

### Docker

```bash
docker build -t myapp:latest .
docker run -p 3000:3000 myapp:latest
```

## Платформы

| Платформа | Статус | Особенности |
|-----------|--------|-------------|
| Linux (x64) | ✅ Primary | Основная платформа |
| Linux (arm64) | ✅ Supported | AWS Graviton |
| macOS | ✅ Dev only | Для разработки |
| Windows | ⚠️ Limited | Только через WSL |

## CI/CD

### GitHub Actions

**Workflows:**
- `ci.yml` — тесты на каждый PR
- `release.yml` — сборка и публикация на теги
- `deploy-staging.yml` — деплой в staging

**Secrets:**
- `DOCKER_TOKEN` — Docker Hub
- `AWS_ACCESS_KEY_ID` — AWS credentials
- `STRIPE_SECRET_KEY` — Stripe (для тестов)

### Пайплайн

```
PR → Lint → Test → Build → [Merge]
                              ↓
                    [Tag] → Release → Deploy Staging
                              ↓
                    [Approve] → Deploy Production
```

## Environment Variables

### Required

| Variable | Описание | Пример |
|----------|----------|--------|
| `DATABASE_URL` | PostgreSQL connection | `postgres://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `JWT_SECRET` | Секрет для JWT | 32+ символов |
| `STRIPE_SECRET_KEY` | Stripe API key | `sk_live_...` |

### Optional

| Variable | Default | Описание |
|----------|---------|----------|
| `PORT` | `3000` | HTTP порт |
| `LOG_LEVEL` | `info` | Уровень логов |
| `NODE_ENV` | `development` | Окружение |

### По окружениям

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `LOG_LEVEL` | `debug` | `info` | `warn` |
| `RATE_LIMIT` | `1000` | `100` | `50` |

## Мониторинг

- **Logs**: Datadog / CloudWatch
- **Metrics**: Prometheus + Grafana
- **Alerts**: PagerDuty
- **APM**: New Relic

## Rollback

```bash
# Откат на предыдущую версию
kubectl rollout undo deployment/myapp

# Откат на конкретную версию
kubectl rollout undo deployment/myapp --to-revision=3
```
```

#### 4.2.6 Модульные _index.md

```markdown
# Auth Module

## Purpose

Handles user authentication and authorization.

**Use Cases:**
- User login/logout
- Token refresh
- Permission checking

## Public API

### AuthService

[→ auth.service.ts:15-120](auth.service.ts#L15-L120)

| Method | Description | Returns |
|--------|-------------|---------|
| `login(credentials)` | Authenticates user | `Promise<AuthResult>` |
| `logout()` | Ends session | `Promise<void>` |
| `refresh()` | Refreshes token | `Promise<Token>` |

## Dependencies

**Internal:**
- [→ UserService](../users/README.md) — user data access
- [→ CryptoUtil](../../utils/crypto.md) — password hashing

**External:**
- `jsonwebtoken` — JWT handling
- `bcrypt` — password hashing

## Processes

This module participates in:
- [→ User Registration Flow](../../PROCESSES.md#user-registration)
- [→ API Authentication](../../PROCESSES.md#api-auth)

## Notes

- Tokens expire after 1 hour
- Refresh tokens valid for 7 days
- Rate limiting: 5 attempts per minute
```

#### 4.2.7 Entity-level файлы (*.md для конкретных сущностей)

**ВАЖНО**: Entity-level документация НЕ дублирует комментарии в коде!
Она отвечает на вопросы: **ЗАЧЕМ**, **КЕМ ИСПОЛЬЗУЕТСЯ**, **В КАКИХ ПРОЦЕССАХ**.

```markdown
# AuthService

[→ auth.service.ts:15-120](auth.service.ts#L15-L120)

## Роль в системе

**Зачем нужен**: Единая точка управления аутентификацией для всех клиентов
(web, mobile, API). Централизует логику безопасности.

**Бизнес-ценность**: Обеспечивает защиту данных пользователей и соответствие
требованиям безопасности (SOC 2, GDPR).

## Кто использует

| Потребитель | Как использует | Контекст |
|-------------|----------------|----------|
| [→ API Gateway](../../gateway/README.md) | Проверка токенов | Каждый API-запрос |
| [→ WebSocket Handler](../../ws/README.md) | Аутентификация соединений | При подключении |
| [→ Admin Panel](../../admin/README.md) | Логин администраторов | Отдельный flow |
| [→ Mobile App SDK](../../../mobile/auth.md) | OAuth flow | Native apps |

**Вызывается из**:
- `middleware/auth.ts:45` — Express middleware
- `graphql/context.ts:23` — GraphQL context builder
- `ws/connection-handler.ts:78` — WebSocket auth

## Участие в процессах

### User Registration Flow

[→ PROCESSES.md#user-registration](../../PROCESSES.md#user-registration)

```
[Sign Up Form] → [Validation] → [AuthService.register()] → [Email Service]
                                       ↓
                              [Token Generation]
```

### API Authentication Flow

[→ PROCESSES.md#api-auth](../../PROCESSES.md#api-auth)

```
[Request] → [Gateway] → [AuthService.verify()] → [Authorized Request]
                              ↓ (fail)
                         [401 Response]
```

### Password Reset Flow

[→ PROCESSES.md#password-reset](../../PROCESSES.md#password-reset)

## Бизнес-инварианты

- **Один активный токен** — при новом логине старые токены инвалидируются
- **Rate limiting** — максимум 5 попыток логина в минуту (per IP)
- **Session timeout** — access token: 1 час, refresh token: 7 дней
- **Audit logging** — все операции логируются в [→ AuditService](../audit/README.md)

## Критические зависимости

| Зависимость | Влияние при отказе |
|-------------|-------------------|
| [→ Redis](../../infra/redis.md) | Session storage недоступен → fallback на DB |
| [→ UserService](../users/README.md) | Невозможно проверить credentials |
| [→ CryptoUtil](../../utils/crypto.md) | Невозможно хэшировать пароли |

**Circuit breaker**: Да, см. [→ Resilience config](../../config/resilience.md#auth)

## Known Issues

- **Concurrent login race**: При одновременном логине с двух устройств
  может создаться два токена. Решение: distributed lock на userId
  [→ Issue #234](https://github.com/org/repo/issues/234)

- **Clock skew**: JWT validation может fail при рассинхронизации времени >30s.
  Решение: используем `nbf` claim с допуском.
```

**Связь файла с кодом**: Система определяет по имени файла + первой ссылке.
`auth.service.md` рядом с `auth.service.ts` → автоматическая связь.

### 4.3 Синтаксис Ссылок

```markdown
# Ссылки на файлы и строки
[→ file.ts](path/to/file.ts)
[→ file.ts:25](path/to/file.ts#L25)
[→ file.ts:25-50](path/to/file.ts#L25-L50)

# Ссылки на сущности (AST)
[→ entity:ClassName](ultrascript://entity/namespace.ClassName)
[→ entity:ClassName.method](ultrascript://entity/namespace.ClassName.method)

# Ссылки на документацию
[→ ModuleName](./path/to/README.md)
[→ ModuleName#section](./path/to/README.md#section-name)

# Ссылки на коммиты
[abc123](commit:abc123)

# Ссылки на задачи
[TASK-123](task:TASK-123)
```

### 4.4 Ссылки в комментариях кода

Комментарии в коде могут содержать ссылки на документацию и другие сущности.
Эти ссылки также индексируются и обновляются автоматически при изменениях.

```typescript
/**
 * User authentication service.
 *
 * @see docs://src/services/auth/README.md — полная документация модуля
 * @see docs://PROCESSES.md#user-registration — flow регистрации
 * @see docs://PROCESSES.md#api-auth — flow аутентификации API
 *
 * @flow user-registration, api-auth, password-reset
 */
export class AuthService {
  /**
   * Authenticates user with credentials.
   *
   * Part of: user-login-flow
   * @see docs://PROCESSES.md#user-login — описание flow
   * @see entity:UserService.findByEmail — поиск пользователя
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    // Implementation...
  }
}
```

**Поддерживаемый синтаксис в комментариях:**

| Синтаксис | Описание | Пример |
|-----------|----------|--------|
| `@see docs://path` | Ссылка на MD-документацию | `@see docs://README.md` |
| `@see entity:FQN` | Ссылка на AST-сущность | `@see entity:AuthService.login` |
| `@flow name1, name2` | Теги участия в процессах | `@flow user-registration` |
| `Part of: flow-name` | Inline тег процесса | `Part of: api-auth` |

**Индексация комментариев:**

```typescript
interface CommentRef {
  id: string;                    // comment::{filePath}::{lineStart}
  filePath: string;
  lineStart: number;
  lineEnd: number;
  content: string;               // Текст комментария
  parentEntityId?: string;       // К какой сущности относится

  // Извлеченные ссылки
  docRefs: string[];             // IDs документов
  entityRefs: string[];          // IDs сущностей
  flowTags: string[];            // Теги процессов

  // Для embeddings
  embedding?: number[];
}
```

**Автообновление ссылок в комментариях:**

При перемещении/переименовании документации или сущности:

```
BEFORE: @see docs://src/services/auth/README.md
        ↓ (auth module moved to src/modules/auth/)
AFTER:  @see docs://src/modules/auth/README.md
```

Это происходит автоматически через Reference Registry (см. секцию 2.4).

---

## 5. Storage Schema

### 5.1 SQLite Tables

```sql
-- Документация
CREATE TABLE doc_entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    section TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,                    -- JSON array
    auto_generated INTEGER,
    confidence REAL,
    last_sync INTEGER,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE INDEX idx_doc_file ON doc_entities(file_path);
CREATE INDEX idx_doc_type ON doc_entities(type);

-- Ссылки документация -> код
CREATE TABLE doc_code_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    entity_id TEXT,               -- NULL если ссылка на файл/строки
    file_path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    ref_type TEXT NOT NULL,       -- describes, depends, example, test
    valid INTEGER DEFAULT 1,      -- Флаг актуальности ссылки
    FOREIGN KEY (doc_id) REFERENCES doc_entities(id)
);

CREATE INDEX idx_ref_doc ON doc_code_refs(doc_id);
CREATE INDEX idx_ref_entity ON doc_code_refs(entity_id);

-- Changelog
CREATE TABLE changelog (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    commit_hash TEXT,
    branch TEXT NOT NULL,
    summary TEXT,
    changes TEXT NOT NULL,        -- JSON array
    impacted_docs TEXT            -- JSON array of doc IDs
);

CREATE INDEX idx_changelog_time ON changelog(timestamp);
CREATE INDEX idx_changelog_commit ON changelog(commit_hash);

-- Tasks
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    related_entities TEXT,        -- JSON array
    related_docs TEXT,            -- JSON array
    blocked_by TEXT,              -- JSON array
    created_at INTEGER,
    updated_at INTEGER,
    completed_at INTEGER
);

CREATE INDEX idx_tasks_status ON tasks(status);
```

### 5.2 Vector Storage

Embeddings документации хранятся в той же `embeddings.db` с prefix `doc::`:

```typescript
// Embedding ID format
const docEmbeddingId = `doc::${docEntity.id}`;

// Stored alongside code embeddings
vectorStore.upsert({
  id: docEmbeddingId,
  vector: embedding,
  metadata: {
    type: 'documentation',
    docType: docEntity.type,
    filePath: docEntity.filePath,
    section: docEntity.section,
    tags: docEntity.metadata.tags
  }
});
```

---

## 6. MCP Tools

### 6.1 Новые инструменты

```typescript
// === УПРАВЛЕНИЕ ===

tool('autodoc_init', {
  language: z.enum(['en', 'ru', 'zh']),  // обязательный
  createTemplates: z.boolean().default(true)
});
// → создаёт .autodoc/, возвращает план работ для AI

tool('autodoc_disable', {});
tool('autodoc_status', {});

// === ПОИСК ===

tool('autodoc_search', {
  query: z.string(),
  scope: z.enum(['all', 'code', 'docs']).default('all'),
  limit: z.number().default(10)
});
// → семантический поиск по коду + документации

// === КОНТЕКСТ ДЛЯ AI ===

tool('autodoc_get_context', {
  entityId: z.string(),
  includeCode: z.boolean().default(true),
  includeCallers: z.boolean().default(true)
});
// → возвращает всё что нужно AI для написания документации

tool('autodoc_get_outdated', {
  limit: z.number().default(10)
});
// → список документов требующих обновления + причины

tool('autodoc_get_todo', {
  priority: z.enum(['all', 'high', 'medium', 'low']).default('all'),
  limit: z.number().default(20)
});
// → список секций для заполнения AI

// === СОХРАНЕНИЕ ОТ AI ===

tool('autodoc_save', {
  filePath: z.string(),        // относительно .autodoc/
  content: z.string(),         // полный MD контент
  entityId: z.string().optional()
});
// → сохраняет, парсит ссылки, embeddings, валидация

tool('autodoc_save_section', {
  filePath: z.string(),
  section: z.string(),         // "## Роль в системе"
  content: z.string()
});
// → обновляет одну секцию в файле

// === CHANGELOG ===

tool('autodoc_changelog', {
  since: z.string().optional(),  // ISO date or commit hash
  entityId: z.string().optional(),
  limit: z.number().default(20)
});

// === ВАЛИДАЦИЯ ===

tool('autodoc_validate', {
  fixBrokenRefs: z.boolean().default(false)
});
// → проверяет все ссылки, опционально исправляет
```

### 6.2 Расширение существующих инструментов

```typescript
// semantic_search - добавить scope
tool('semantic_search', {
  query: z.string(),
  scope: z.enum(['code', 'docs', 'all']).default('code'),  // NEW
  // ... existing params
});

// get_members - включить связанную документацию
tool('get_members', {
  filePath: z.string(),
  includeDocumentation: z.boolean().default(false),  // NEW
});

// analyze_code_impact - показать затронутую документацию
tool('analyze_code_impact', {
  entityId: z.string(),
  includeDocImpact: z.boolean().default(true),  // NEW
});
```

---

## 7. Workflow синхронизации

### 7.1 При изменении кода

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Code Change Detection                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. FileWatcher detects change                                      │
│           │                                                         │
│           ▼                                                         │
│  2. IndexerAgent parses & updates code index                        │
│           │                                                         │
│           ▼                                                         │
│  3. KnowledgeBus publishes 'entity:modified' event                  │
│           │                                                         │
│           ▼                                                         │
│  4. DocSyncAgent receives event                                     │
│           │                                                         │
│           ├──► 4a. Find affected documentation                      │
│           │         (via doc_code_refs table)                       │
│           │                                                         │
│           ├──► 4b. Validate existing refs                           │
│           │         (update line numbers if shifted)                │
│           │                                                         │
│           ├──► 4c. Mark docs needing update                         │
│           │         (set confidence < threshold)                    │
│           │                                                         │
│           └──► 4d. Queue for AI regeneration                        │
│                     (if auto_update enabled)                        │
│                                                                     │
│  5. Background: AI updates documentation                            │
│           │                                                         │
│           ▼                                                         │
│  6. Update MD files + re-embed                                      │
│           │                                                         │
│           ▼                                                         │
│  7. Record in changelog                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 При запросе документации (AI workflow)

```typescript
// AI запрашивает контекст для задачи
const docs = await mcp.call('doc_search', {
  query: 'authentication flow',
  scope: 'all'
});

// Получает структурированный ответ
{
  results: [
    {
      id: 'doc::src/services/auth/README.md::purpose',
      title: 'Auth Module - Purpose',
      content: 'Handles user authentication...',
      confidence: 0.95,
      codeRefs: [
        {
          entityId: 'src.services.auth.AuthService',
          filePath: 'src/services/auth/auth.service.ts',
          lineStart: 15,
          lineEnd: 120,
          refType: 'describes'
        }
      ],
      relatedDocs: ['doc::PROCESSES.md::user-registration']
    }
  ]
}

// AI может сразу перейти к коду по точным координатам
```

---

## 8. Конфигурация

```yaml
# .mcp-config.yaml
documentation:
  enabled: true

  # Автоматическое обновление
  auto_sync: true
  sync_on_commit: true

  # AI генерация
  ai_generation:
    enabled: true
    model: 'ollama/llama3.2'  # Локальная модель
    confidence_threshold: 0.7  # Ниже - помечаем как устаревшее

  # Формат файлов
  format:
    use_frontmatter: true
    section_markers: true

  # Исключения
  exclude_patterns:
    - '**/node_modules/**'
    - '**/dist/**'
    - '**/*.test.ts'

  # Changelog
  changelog:
    enabled: true
    group_by_commit: true

  # Tasks
  tasks:
    enabled: true
    sync_with_github_issues: false
```

---

## 9. Примеры использования

### 9.1 AI инициализирует AutoDoc

```
User: "Задокументируй этот проект"

AI workflow:
1. autodoc_init({ language: 'ru' })
   → Создаётся .autodoc/ с шаблонами
   → Возвращается план: 78 секций для заполнения

2. autodoc_get_todo({ priority: 'high' })
   → Получает список приоритетных секций

3. Для каждой секции:
   autodoc_get_context({ entityId: 'AuthService' })
   → Получает код, callers, dependencies
   → Пишет документацию
   autodoc_save_section({ file, section, content })

4. autodoc_status()
   → Проверяет прогресс: 45/78 секций заполнено
```

### 9.2 AI работает с существующей документацией

```
User: "Добавь rate limiting в AuthService"

AI workflow:
1. autodoc_search("AuthService rate limiting")
   → Получает документацию + код с точными ссылками

2. autodoc_get_context("src.services.auth.AuthService")
   → Полный контекст для понимания

3. Реализует фичу...

4. autodoc_get_outdated()
   → Видит: "auth.service.md needs update: method added"

5. autodoc_save_section({
     file: 'src/services/auth/auth.service.md',
     section: '## Бизнес-инварианты',
     content: '... + rate limiting ...'
   })
```

### 9.3 Разработчик изучает проект

```
Developer: "Как работает аутентификация?"

1. Открывает .autodoc/ARCHITECTURE.md → видит общую картину
2. Переходит по ссылке на .autodoc/src/services/auth/_index.md
3. Видит: роль модуля, кто использует, участие в процессах
4. По ссылкам [→ auth.service.ts:15-120] переходит к коду
5. Детали реализации — в .autodoc/src/services/auth/auth.service.md
```

---

## 10. План реализации

### Phase 1: Core — Storage & Parsing (1-2 недели)

**Цель**: Базовая инфраструктура для хранения и парсинга документации.

```
src/autodoc/
├── storage/
│   ├── doc-storage.ts          # DocEntity CRUD
│   ├── ref-storage.ts          # Reference Registry
│   └── schema.sql              # SQLite таблицы
├── parser/
│   ├── md-parser.ts            # Парсинг MD → секции
│   ├── link-extractor.ts       # Извлечение [→ ссылок]
│   └── section-detector.ts     # Определение секций по H1-H6
└── types.ts                    # DocEntity, Reference, etc.
```

**Задачи:**
- [ ] **1.1** SQLite схема: `doc_entities`, `references`, `doc_changelog`
- [ ] **1.2** `DocStorage` класс — CRUD для документов
- [ ] **1.3** `RefStorage` класс — Reference Registry
- [ ] **1.4** MD Parser — извлечение секций по заголовкам
- [ ] **1.5** Link Extractor — парсинг `[→ text](path#L1-L50)`
- [ ] **1.6** Интеграция с существующим `GraphStorage`

**Результат**: Можно сохранять/читать документацию и ссылки.

---

### Phase 2: Init & Basic Tools (1 неделя)

**Цель**: `autodoc_init` создаёт структуру, базовые tools работают.

```
src/autodoc/
├── init/
│   ├── scaffold.ts             # Создание .autodoc/ структуры
│   ├── templates.ts            # Шаблоны файлов
│   └── auto-fill.ts            # Автозаполнение из AST
├── tools/
│   ├── autodoc-init.ts
│   ├── autodoc-status.ts
│   ├── autodoc-save.ts
│   └── autodoc-save-section.ts
└── config.ts                   # .autodoc marker в нашей папке
```

**Задачи:**
- [ ] **2.1** `autodoc_init` — создание `.autodoc/` + шаблоны
- [ ] **2.2** Автозаполнение DEPENDENCIES.md из package.json/requirements.txt
- [ ] **2.3** Автозаполнение списков компонентов из AST
- [ ] **2.4** `autodoc_status` — статус, прогресс
- [ ] **2.5** `autodoc_save` — сохранение файла + парсинг ссылок
- [ ] **2.6** `autodoc_save_section` — обновление одной секции
- [ ] **2.7** `.autodoc` marker в `~/.local/share/ultrascript-tools/`

**Результат**: AI может инициализировать и заполнять документацию.

---

### Phase 3: Search & Embeddings (1 неделя)

**Цель**: Семантический поиск по документации.

```
src/autodoc/
├── search/
│   ├── doc-embeddings.ts       # Генерация embeddings для docs
│   ├── hybrid-search.ts        # code + docs поиск
│   └── context-builder.ts      # Сборка контекста для AI
└── tools/
    ├── autodoc-search.ts
    ├── autodoc-get-context.ts
    └── autodoc-get-todo.ts
```

**Задачи:**
- [ ] **3.1** Embeddings для документации (prefix `doc::`)
- [ ] **3.2** Embeddings для комментариев (prefix `comment::`)
- [ ] **3.3** `autodoc_search` — unified search code + docs
- [ ] **3.4** `autodoc_get_context` — полный контекст для AI
- [ ] **3.5** `autodoc_get_todo` — список секций для заполнения
- [ ] **3.6** Ranking: docs выше при запросах про "зачем", "кто использует"

**Результат**: AI находит информацию в документации семантически.

---

### Phase 4: Sync & Validation (1-2 недели)

**Цель**: Автоматическая синхронизация при изменении кода.

```
src/autodoc/
├── sync/
│   ├── doc-sync-agent.ts       # Новый агент
│   ├── change-detector.ts      # Детекция изменений
│   ├── line-tracker.ts         # Отслеживание сдвига строк
│   └── ref-updater.ts          # Обновление ссылок
├── validation/
│   ├── link-validator.ts       # Проверка ссылок
│   └── ref-fixer.ts            # Автоисправление
└── tools/
    ├── autodoc-get-outdated.ts
    └── autodoc-validate.ts
```

**Задачи:**
- [ ] **4.1** `DocSyncAgent` — подписка на `entity:modified` events
- [ ] **4.2** Change Detector — какие docs затронуты изменением кода
- [ ] **4.3** Line Tracker — интеллектуальный поиск сдвинутых строк
- [ ] **4.4** `autodoc_get_outdated` — список docs для обновления
- [ ] **4.5** `autodoc_validate` — проверка всех ссылок
- [ ] **4.6** Auto-fix broken refs (номера строк)
- [ ] **4.7** FileWatcher для `.autodoc/` — человек редактирует вручную

**Результат**: Документация остаётся актуальной при изменениях кода.

---

### Phase 5: Changelog & Comments (1 неделя)

**Цель**: История изменений + ссылки в комментариях кода.

```
src/autodoc/
├── changelog/
│   ├── changelog-storage.ts
│   ├── change-recorder.ts
│   └── summary-generator.ts    # Краткое описание (локальная модель)
├── comments/
│   ├── comment-parser.ts       # @see docs://, @flow
│   └── comment-indexer.ts
└── tools/
    └── autodoc-changelog.ts
```

**Задачи:**
- [ ] **5.1** Changelog storage — записи об изменениях
- [ ] **5.2** Автозапись при изменениях (привязка к commits)
- [ ] **5.3** `autodoc_changelog` — история изменений
- [ ] **5.4** Парсинг `@see docs://` в комментариях
- [ ] **5.5** Парсинг `@flow` тегов
- [ ] **5.6** Индексация комментариев в embeddings

**Результат**: Полная трассировка изменений + связь код↔документация.

---

### Phase 6: Language Detection & Git Hooks (3-5 дней)

**Цель**: Мультиязычность + pre-commit проверки.

```
src/autodoc/
├── i18n/
│   ├── language-detector.ts    # По комментариям в коде
│   └── section-names.ts        # Локализованные имена секций
└── hooks/
    ├── pre-commit-check.ts
    └── hook-installer.ts
```

**Задачи:**
- [ ] **6.1** Детекция языка по не-латинским символам в комментариях
- [ ] **6.2** Локализованные имена секций (Роль в системе / Role in system)
- [ ] **6.3** Git pre-commit hook — проверка актуальности ссылок
- [ ] **6.4** Hook installer — `autodoc_install_hooks`

**Результат**: Поддержка русского/английского/китайского + Git интеграция.

---

### Phase 7: Polish & Integration (1 неделя)

**Цель**: Интеграция, документация, тесты.

**Задачи:**
- [ ] **7.1** Интеграция всех tools в `src/index.ts`
- [ ] **7.2** MCP prompts: обновить `autodoc-guide`
- [ ] **7.3** Тесты: unit + integration
- [ ] **7.4** Документация: обновить README, CLAUDE.md
- [ ] **7.5** Performance: batch operations, lazy loading
- [ ] **7.6** Error handling & logging

---

## Сводная таблица

| Phase | Название | Срок | Приоритет |
|-------|----------|------|-----------|
| 1 | Core — Storage & Parsing | 1-2 нед | 🔴 Critical |
| 2 | Init & Basic Tools | 1 нед | 🔴 Critical |
| 3 | Search & Embeddings | 1 нед | 🔴 Critical |
| 4 | Sync & Validation | 1-2 нед | 🟡 High |
| 5 | Changelog & Comments | 1 нед | 🟡 High |
| 6 | Language & Git Hooks | 3-5 дней | 🟢 Medium |
| 7 | Polish & Integration | 1 нед | 🟢 Medium |

**Общий срок: 7-10 недель**

---

## MVP (Phases 1-3)

Минимально работающий AutoDoc за ~3-4 недели:

```
✅ autodoc_init()        — создаёт структуру
✅ autodoc_save()        — сохраняет документацию
✅ autodoc_search()      — ищет по docs + code
✅ autodoc_get_context() — контекст для AI
✅ autodoc_get_todo()    — что заполнить
✅ autodoc_status()      — прогресс
```

AI уже может:
- Инициализировать AutoDoc
- Заполнять документацию
- Искать по документации
- Понимать контекст проекта

---

## Зависимости от существующего кода

| Компонент | Использует |
|-----------|------------|
| DocStorage | `SQLiteManager`, `GraphStorage` patterns |
| Embeddings | `SemanticAgent`, `VectorStore` |
| FileWatcher | Существующий `LayeredIndexManager.fileWatcher` |
| Sync Events | `KnowledgeBus` (`entity:modified`) |
| AST data | `GraphStorage.getEntity()` |
| Language detection | Существующий код из парсеров |

---

## 11. Решения по открытым вопросам

| Вопрос | Решение |
|--------|---------|
| **Гранулярность** | AI документирует что сочтёт нужным. Люди редактируют вручную — система принимает. |
| **Язык документации** | Мультиязычный. Определяется по языку комментариев в коде (детекция не-латиницы). |
| **Конфликты при merge** | Всегда в пользу новых данных. Номера строк — интеллектуальная коррекция при индексации. |
| **Размер embeddings** | 8K токенов минимум (требование). Ждём более продвинутые модели. |
| **Git hooks** | Да! Pre-commit проверка актуальности ссылок и документации. |

### 11.1 Детекция языка комментариев

Используем существующий код для определения языка по не-латинским символам в комментариях:

```typescript
// Определяем язык документации по комментариям в коде
function detectDocLanguage(comments: string[]): 'en' | 'ru' | 'zh' | 'other' {
  const nonLatinRatio = calculateNonLatinRatio(comments);
  if (nonLatinRatio > 0.3) {
    // Определяем конкретный язык по unicode ranges
    return detectSpecificLanguage(comments);
  }
  return 'en';
}
```

### 11.2 Обработка ручных правок

```
┌─────────────────────────────────────────────────────────────────────┐
│              Human Edits to Documentation                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Human edits auth.service.md manually                            │
│           │                                                         │
│           ▼                                                         │
│  2. FileWatcher detects MD file change                              │
│           │                                                         │
│           ▼                                                         │
│  3. DocSyncAgent:                                                   │
│     a) Parse new content                                            │
│     b) Extract all links [→ file.ts:25]                             │
│     c) Validate links against current code state                    │
│           │                                                         │
│           ├──► Links valid? Accept as-is                            │
│           │                                                         │
│           └──► Links broken? Auto-fix silently                      │
│                (update line numbers, entity refs)                   │
│           │                                                         │
│           ▼                                                         │
│  4. Re-embed updated content                                        │
│  5. Update refs in Reference Registry                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.3 Интеллектуальная коррекция номеров строк

При сдвиге строк после merge/edit:

```typescript
interface LineShiftDetection {
  // Ищем контекст вокруг старой позиции
  findNewLineNumber(
    filePath: string,
    oldLineNumber: number,
    contextBefore: string[],  // 3-5 строк до
    contextAfter: string[]    // 3-5 строк после
  ): number | null;
}

// Алгоритм:
// 1. Ищем точное совпадение контекста
// 2. Если не найдено — fuzzy match с tolerance
// 3. Если всё ещё не найдено — помечаем ссылку как broken
```

---

## Appendix A: Сравнение с существующими решениями

| Feature | JSDoc/TSDoc | Docusaurus | Our Solution |
|---------|-------------|------------|--------------|
| AI-first | ❌ | ❌ | ✅ |
| Semantic search | ❌ | ❌ | ✅ |
| Auto-sync with code | ❌ | ❌ | ✅ |
| Precise code refs | ❌ | ❌ | ✅ |
| Changelog tracking | ❌ | ❌ | ✅ |
| Task integration | ❌ | ❌ | ✅ |
| Human readable | ✅ | ✅ | ✅ |
| Version control | ✅ | ✅ | ✅ |

## Appendix B: MD Format Cheatsheet

**Принцип**: Чистый Markdown. Никаких frontmatter, тегов, метаданных.

```markdown
# Title

## Section Name

Content with links:
- [→ file.ts:25-50](file.ts#L25-L50) — code ref
- [→ OtherDoc](./other.md#section) — doc ref

## Another Section

More content...
```

**Рекомендуемые секции для entity-level docs:**
- `## Роль в системе` — зачем существует
- `## Кто использует` — потребители
- `## Участие в процессах` — flows
- `## Бизнес-инварианты` — правила
- `## Критические зависимости` — от чего зависит
- `## Known Issues` — граничные случаи

**Система определяет секции по заголовкам автоматически.**

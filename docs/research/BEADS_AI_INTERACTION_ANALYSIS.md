# Анализ архитектуры Beads: Паттерны взаимодействия с AI

Этот документ анализирует, как beads организует хранение и поиск данных для AI-агентов, и извлекает паттерны для проектирования AI-friendly систем.

## 1. Архитектура потока данных

```
┌─────────────────┐
│   AI Agent      │  ← Claude, GPT, другие
│   (LLM)         │
└────────┬────────┘
         │ Structured JSON
    ┌────▼────────┐
    │ MCP Server  │  ← Python FastMCP (опционально)
    │ или CLI     │
    └────┬────────┘
         │ JSON output
    ┌────▼──────────────┐
    │  CLI (bd)         │  ← Go binary
    │  --json флаг      │
    └────┬──────────────┘
         │ SQL queries
    ┌────▼──────────────┐
    │  SQLite Storage   │  ← Быстрый поиск, индексы
    │  (runtime cache)  │
    └────┬──────────────┘
         │ Serialization
    ┌────▼──────────────┐
    │  JSONL Export     │  ← .beads/issues.jsonl
    │  (git-committed)  │     Распределенная синхронизация
    └───────────────────┘
```

## 2. Форматы данных по слоям

### 2.1 CLI ↔ AI: JSON

**Почему JSON:**
- Стандарт для LLM — все модели умеют парсить
- Типизированные поля (string, int, array)
- Вложенные структуры (dependencies, comments)

**Пример вывода `bd ready --json`:**
```json
[
  {
    "id": "bd-a1b2",
    "title": "Fix authentication bug",
    "status": "open",
    "priority": 1,
    "issue_type": "bug",
    "description": "Users can't login after...",
    "created_at": "2025-01-09T10:30:00Z",
    "dependencies": [],
    "labels": ["auth", "urgent"]
  }
]
```

**Ключевой паттерн:** Каждая команда поддерживает `--json`:
```bash
bd create "..." --json    # Возвращает созданный Issue
bd update <id> --json     # Возвращает обновленный Issue
bd close <id> --json      # Возвращает закрытый Issue
bd list --json            # Возвращает []*Issue
bd show <id> --json       # Возвращает Issue с деталями
```

### 2.2 Синхронизация: JSONL (JSON Lines)

**Почему JSONL, а не JSON:**
- Потоковая обработка — не нужно парсить весь файл
- Git-friendly — изменение одной строки = один diff
- Append-only логика — легко добавлять
- Параллельная обработка — каждая строка независима

**Формат `.beads/issues.jsonl`:**
```jsonl
{"id":"bd-a1b2","title":"Fix auth","status":"open","priority":1,...}
{"id":"bd-c3d4","title":"Add tests","status":"in_progress",...}
{"id":"bd-e5f6","title":"Update docs","status":"closed",...}
```

**Правила экспорта:**
- Исключаются ephemeral issues (`Ephemeral: true`)
- Исключаются internal поля (`ContentHash`)
- Включаются все зависимости и комментарии

### 2.3 Runtime: SQLite

**Почему SQLite:**
- Быстрый поиск по индексам
- Сложные запросы (граф зависимостей)
- Атомарные транзакции
- Не требует сервера

**Ключевые таблицы:**
```sql
-- Основная таблица
CREATE TABLE issues (
    id TEXT PRIMARY KEY,          -- Hash-based: "bd-xxxx"
    title TEXT NOT NULL,
    description TEXT,
    status TEXT,                  -- open|in_progress|blocked|closed
    priority INTEGER,             -- 0-4
    issue_type TEXT,              -- bug|feature|task|epic
    created_at TIMESTAMP,
    due_at TIMESTAMP,             -- Когда должно быть готово
    defer_until TIMESTAMP,        -- Скрыть из ready до
    deleted_at TIMESTAMP          -- Soft delete (tombstone)
);

-- Граф зависимостей
CREATE TABLE dependencies (
    issue_id TEXT,
    depends_on_id TEXT,
    type TEXT                     -- blocks|parent-child|discovered-from
);

-- Индексы для ready-запросов
CREATE INDEX idx_status_priority ON issues(status, priority);
CREATE INDEX idx_deps ON dependencies(issue_id, depends_on_id);
```

## 3. Главные абстракции для AI

### 3.1 Ready Work (bd ready)

**Проблема:** AI не должен сам анализировать граф зависимостей.

**Решение:** Команда `bd ready` возвращает только задачи без блокировок:

```bash
bd ready --json --limit 5
```

**Что проверяется внутри:**
1. Статус = open или in_progress
2. Нет входящих зависимостей типа `blocks`
3. Все родительские задачи закрыты (для subtasks)
4. `defer_until` не в будущем (или `--include-deferred`)

**Паттерн:** Скрыть сложность графа за простым API.

### 3.2 Dependency Discovery

**Проблема:** AI находит новые задачи во время работы.

**Решение:** Связь `discovered-from`:

```bash
# AI работает над bd-parent
# Находит баг
bd create "Found SQL injection" -t bug -p 0 --json
# Результат: {"id": "bd-newbug", ...}

# Связать с родительской задачей
bd dep add bd-newbug bd-parent --type discovered-from
```

**Паттерн:** Захват контекста открытий для audit trail.

### 3.3 Context Compaction

**Проблема:** Большие списки переполняют контекст LLM.

**Решение в MCP-сервере:**
```python
COMPACTION_THRESHOLD = 20

if len(issues) > COMPACTION_THRESHOLD:
    # Вернуть краткую модель
    return [IssueMinimal(id, title, status, priority) for i in issues[:5]]
    # + summary: "Showing 5 of 47 issues. Use filters."
else:
    return issues  # Полные объекты
```

**Краткая модель:**
```python
class IssueMinimal:
    id: str
    title: str
    status: str
    priority: int
    # Только 4 поля вместо 50+
```

**Паттерн:** Адаптивная детализация в зависимости от объема.

## 4. Типичный workflow AI-агента

```
┌──────────────────────────────────────────────────────────────────┐
│  1. FIND WORK                                                    │
│     bd ready --json --limit 1                                    │
│     → Получить первую незаблокированную задачу                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. CLAIM TASK                                                   │
│     bd update bd-a1b2 --status in_progress --json                │
│     → Пометить как "в работе"                                    │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. WORK                                                         │
│     - Читать код                                                 │
│     - Писать код                                                 │
│     - Тестировать                                                │
│     - Обнаруживать новые задачи                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. REPORT DISCOVERIES                                           │
│     bd create "Found bug in auth" -t bug -p 1 --json             │
│     bd dep add bd-newbug bd-a1b2 --type discovered-from          │
│     → Захватить новые задачи с контекстом                        │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. COMPLETE                                                     │
│     bd close bd-a1b2 --reason "Fixed auth bug" --json            │
│     → Закрыть с причиной для audit                               │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  6. SYNC                                                         │
│     bd export -o .beads/issues.jsonl                             │
│     git add .beads/issues.jsonl && git commit                    │
│     → Сохранить состояние в git                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 5. Паттерны для проектирования AI-friendly систем

### 5.1 JSON-first API

```
❌ Плохо: Текстовый вывод, требующий парсинга
   $ tool list
   ID: 123  Title: Fix bug  Status: open

✅ Хорошо: Структурированный JSON
   $ tool list --json
   [{"id": 123, "title": "Fix bug", "status": "open"}]
```

### 5.2 Абстракции вместо сырых данных

```
❌ Плохо: Дать AI весь граф зависимостей для анализа
   "Вот 500 задач с 2000 связями, найди готовую работу"

✅ Хорошо: Готовый результат
   bd ready --json  → [только готовые задачи]
```

### 5.3 Контекстная компрессия

```
❌ Плохо: Всегда возвращать полные объекты
   50+ полей × 100 задач = переполнение контекста

✅ Хорошо: Адаптивная детализация
   < 20 задач → полные объекты
   > 20 задач → краткие модели + фильтры
```

### 5.4 Hash-based ID для распределенной работы

```
❌ Плохо: Автоинкремент ID
   Agent A создает #101, Agent B создает #101 → конфликт

✅ Хорошо: Детерминированный hash
   ID = hash(title + content) → "bd-a1b2"
   Одинаковый контент = одинаковый ID, без конфликтов
```

### 5.5 Связь открытий с контекстом

```
❌ Плохо: Создать задачу без связи
   bd create "Bug in auth"
   → Откуда это? Кто нашел? При работе над чем?

✅ Хорошо: discovered-from связь
   bd create "Bug in auth" --json
   bd dep add bd-newbug bd-parent --type discovered-from
   → Полный audit trail
```

### 5.6 Git-backed синхронизация

```
❌ Плохо: Центральный сервер
   - Нужен uptime
   - Сложная синхронизация
   - Vendor lock-in

✅ Хорошо: JSONL в git
   - Работает offline
   - Git merge для коллизий
   - Любой хостинг
```

## 6. Структура Issue (полная схема)

```go
type Issue struct {
    // === ИДЕНТИФИКАЦИЯ ===
    ID          string    // "bd-xxxx" - hash-based
    ContentHash string    // SHA256 контента (internal, не экспортируется)

    // === СОДЕРЖАНИЕ ===
    Title              string  // Обязательно, краткое описание
    Description        string  // Markdown, детали
    Design             string  // Технический дизайн
    AcceptanceCriteria string  // Definition of done
    Notes              string  // Дополнительные заметки

    // === WORKFLOW ===
    Status    string  // open | in_progress | blocked | deferred | closed | tombstone
    Priority  int     // 0=critical, 1=high, 2=medium, 3=low, 4=backlog
    IssueType string  // bug | feature | task | epic | chore

    // === НАЗНАЧЕНИЕ ===
    Assignee         string  // Кто работает
    EstimatedMinutes *int    // Оценка времени

    // === ВРЕМЕННЫЕ МЕТКИ ===
    CreatedAt   time.Time
    CreatedBy   string      // Кто создал (agent ID)
    UpdatedAt   time.Time
    ClosedAt    *time.Time
    CloseReason string      // Почему закрыто

    // === ПЛАНИРОВАНИЕ ===
    DueAt      *time.Time  // Дедлайн
    DeferUntil *time.Time  // Скрыть из ready до

    // === СВЯЗИ ===
    Labels       []string       // Теги для фильтрации
    Dependencies []*Dependency  // Граф зависимостей
    Comments     []*Comment     // Обсуждение

    // === SOFT DELETE ===
    DeletedAt    *time.Time
    DeletedBy    string
    DeleteReason string

    // === AI-SPECIFIC ===
    Ephemeral bool  // true = не экспортировать в JSONL
    Sender    string // Для message-типа
}

type Dependency struct {
    ID          string  // ID связи
    IssueID     string  // От какой задачи
    DependsOnID string  // К какой задаче
    Type        string  // blocks | parent-child | related | discovered-from
    Metadata    string  // JSON для сложных типов
}
```

## 7. Типы зависимостей и их влияние

| Тип | Влияние на ready | Описание |
|-----|-----------------|----------|
| `blocks` | ✅ Блокирует | A должна быть закрыта перед B |
| `parent-child` | ✅ Блокирует | Подзадача требует закрытия родителя |
| `discovered-from` | ❌ Не влияет | B найдена при работе над A |
| `related` | ❌ Не влияет | Мягкая связь для контекста |
| `conditional-blocks` | ⚡ Условно | B запускается только если A failed |
| `waits-for` | ⏳ Динамически | Fanout gate для параллельных задач |

## 8. Фильтрация и поиск

### CLI фильтры

```bash
# По статусу
bd list --status open --json
bd list --status open,in_progress --json

# По приоритету
bd list --priority 0 --json              # Только P0
bd list --priority-min 0 --priority-max 2 --json

# По типу
bd list --type bug --json
bd list --type bug,feature --json

# По тегам
bd list --label urgent --json            # Все теги должны быть
bd list --label-any backend,frontend     # Хотя бы один

# По времени
bd list --due-before=+2d --json          # Дедлайн в ближайшие 2 дня
bd list --defer-after=tomorrow --json    # Отложены на после завтра
bd list --overdue --json                 # Просроченные

# По назначению
bd list --assignee alice --json

# Комбинации
bd list --status open --priority 0 --type bug --json
```

### Экспорт с фильтрами

```bash
# Только открытые высокоприоритетные
bd export --status open --priority-max 1 -o urgent.jsonl

# Все кроме backlog
bd export --priority-max 3 -o active.jsonl
```

## 9. Обработка конфликтов

### Git merge конфликты в JSONL

```jsonl
<<<<<<< HEAD
{"id":"bd-a1b2","title":"Fix auth","status":"closed",...}
=======
{"id":"bd-a1b2","title":"Fix auth bug","status":"open",...}
>>>>>>> feature-branch
```

**Автоматическое разрешение:**
```bash
bd import -i .beads/issues.jsonl --auto-merge
```

Логика:
1. Парсить обе версии
2. Взять более новую по `updated_at`
3. Merge поля (closed > open > blocked)

### Коллизии ID

Если два агента создают задачу с одинаковым hash:
- Одинаковый контент = дедупликация (OK)
- Разный контент = новый ID через rehash

## 10. MCP-сервер: Оптимизации для контекста

### Lazy loading инструментов

```python
@mcp.tool()
def discover_tools():
    """Возвращает список инструментов без загрузки всех."""
    return [
        {"name": "ready_work", "description": "Find ready issues"},
        {"name": "create_issue", "description": "Create new issue"},
        # ... краткий список
    ]

@mcp.tool()
def get_tool_info(name: str):
    """Детали конкретного инструмента."""
    return TOOL_DETAILS[name]  # Полная документация
```

### Workspace context

```python
# Установить workspace один раз
context(workspace="/path/to/repo")

# Все последующие вызовы используют его
ready_work()  # Работает с /path/to/repo
```

### Минимальные модели

```python
# Полная модель (50+ полей)
class Issue:
    id, title, description, status, priority, type,
    created_at, updated_at, closed_at, close_reason,
    due_at, defer_until, assignee, labels, dependencies,
    comments, design, acceptance_criteria, notes, ...

# Минимальная модель (4 поля)
class IssueMinimal:
    id: str
    title: str
    status: str
    priority: int
```

## 11. Рекомендации по проектированию AI-friendly систем

### Обязательно

1. **JSON API** — все команды должны возвращать структурированные данные
2. **Ready-work абстракция** — скрыть сложность за простым запросом
3. **Связь открытий** — захватывать контекст новых задач
4. **Компактные модели** — адаптивная детализация
5. **Детерминированные ID** — избежать коллизий

### Рекомендуется

1. **JSONL для синхронизации** — git-friendly, потоковый
2. **Soft delete** — audit trail вместо удаления
3. **Фильтры на CLI** — не тянуть все данные в LLM
4. **Dry-run режим** — превью перед изменениями
5. **MCP интеграция** — нативная поддержка Claude

### Избегать

1. ❌ Текстовый вывод для парсинга
2. ❌ Автоинкремент ID
3. ❌ Центральный сервер без offline
4. ❌ Полные объекты для больших списков
5. ❌ Удаление без tombstone

## 12. Контроль приоритизации: как AI выбирает задачу

### 12.1 Политики сортировки

beads **сам решает** порядок задач в `bd ready`:

```bash
# По умолчанию: hybrid
bd ready --json

# Строго по приоритету (для автономной работы)
bd ready --sort priority --json

# Старые первыми (чистка бэклога)
bd ready --sort oldest --json
```

**Hybrid логика (по умолчанию):**
```sql
ORDER BY
  -- Сначала свежие задачи (< 48 часов)
  CASE WHEN created_at >= now - 48h THEN 0 ELSE 1 END,
  -- Свежие сортируем по приоритету
  CASE WHEN created_at >= now - 48h THEN priority END,
  -- Старые сортируем по возрасту
  CASE WHEN created_at < now - 48h THEN created_at END
```

### 12.2 Автоматическая фильтрация в bd ready

```
Все задачи (100+)
      ↓
─────────────────────────────────
Исключить:
  • status = closed/tombstone
  • status = blocked (есть blockers)
  • defer_until > now (отложены)
  • pinned = true (якоря, не работа)
  • ephemeral = true (временные)
  • type = gate/molecule/message (внутренние)
  • Есть открытые blocks-зависимости
─────────────────────────────────
      ↓
Готовая работа (5-10 задач)
```

**Ключевой принцип:** AI не принимает решения о приоритизации — это делает beads.

### 12.3 Дополнительные фильтры для AI

```bash
# Только P0-P1
bd ready --priority 0 --json

# Только баги
bd ready --type bug --json

# С определённым тегом
bd ready --label backend --json

# Только неназначенные
bd ready --unassigned --json

# В рамках эпика
bd ready --parent bd-epic-123 --json

# Включая отложенные
bd ready --include-deferred --json
```

## 13. Координация нескольких AI-агентов

### 13.1 Проблема: Race Condition

По умолчанию любой запуск AI берёт любую задачу из `bd ready`.

### 13.2 Механизм --claim (атомарный захват)

```bash
# Атомарно: проверить что свободна + занять
bd update bd-a1b2 --claim --json
```

Если уже занята другим агентом:
```
Error claiming bd-a1b2: already claimed by alice
```

**Что делает --claim:**
1. Проверяет что `assignee` пустой
2. Устанавливает `assignee = текущий актор`
3. Устанавливает `status = in_progress`

### 13.3 Фильтрация по assignee

```bash
# Показать только МОИ задачи
bd ready --assignee claude-session-xyz --json

# Показать только СВОБОДНЫЕ задачи
bd ready --unassigned --json
```

### 13.4 Agent State (для продвинутых сценариев)

```bash
# Агент регистрирует себя
bd agent state gt-emma working

# Heartbeat (я ещё жив)
bd agent heartbeat gt-emma

# Показать состояние агента
bd agent show gt-emma
```

Состояния агента:
- `idle` — ждёт работу
- `spawning` — запускается
- `running` — выполняет
- `working` — активно работает
- `stuck` — заблокирован, нужна помощь
- `done` — завершил работу
- `stopped` — чисто остановлен
- `dead` — умер без shutdown

### 13.5 Рекомендуемый паттерн для multi-agent

```bash
# 1. Проверить есть ли МОЯ работа (не завершённая)
MY_WORK=$(bd list --assignee $AGENT_ID --status in_progress --json)
if [ "$MY_WORK" != "[]" ]; then
    # Продолжить работу над существующей задачей
    exit 0
fi

# 2. Если нет - взять новую АТОМАРНО
TASK=$(bd ready --unassigned --limit 1 --json | jq -r '.[0].id')
bd update $TASK --claim --json
```

## 14. Связь с файлами и кодом

### 14.1 Отсутствие структурированных ссылок

**В beads НЕТ полей для связи с файлами/строками кода:**
- Нет `file_path`
- Нет `line_number`
- Нет `code_ref`

### 14.2 Как связывать с кодом

**Вариант 1: В тексте description/notes**
```markdown
## Description
Bug in authentication flow.

See `src/auth/login.go:142` - the token validation is wrong.
```

**Вариант 2: Через labels**
```bash
bd create "Fix auth" --label "file:src/auth/login.go"
```

**Вариант 3: External ref для коммитов**
```json
{
  "external_ref": "commit:abc123"
}
```

### 14.3 Почему нет структурированных ссылок

beads — это **трекер задач**, а не система code review.
- Отвечает на вопрос "что делать", а не "где в коде"
- Связь issue ↔ код через git commits (`fixes bd-a1b2`)
- Интеграция с GitHub/Jira через `external_ref`

## 15. Внутренняя структура задач: Flat vs Workflow

### 15.1 Одиночная задача (Issue) — Flat

```json
{
  "id": "bd-a1b2",
  "title": "Fix auth bug",
  "description": "Markdown описание...",
  "acceptance_criteria": "Текст критериев приёмки",
  "notes": "Заметки",
  "status": "open"
}
```

**Особенности:**
- Единственный статус на всю задачу
- Нет внутренних фаз/чеклистов
- Нет артефактов (только текст)
- `acceptance_criteria` — просто текстовое поле

### 15.2 Многошаговый Workflow (Formula → Molecule)

```json
{
  "formula": "mol-feature",
  "type": "workflow",
  "vars": {
    "component": {"required": true}
  },
  "steps": [
    {"id": "design", "title": "Design {{component}}"},
    {"id": "implement", "title": "Implement", "depends_on": ["design"]},
    {"id": "test", "title": "Test", "depends_on": ["implement"]},
    {"id": "review", "title": "Review", "depends_on": ["test"],
     "gate": {"type": "human", "timeout": "24h"}}
  ]
}
```

При "cooking" создаётся **граф задач**:
```
bd-feature-design ──blocks──> bd-feature-implement ──blocks──> bd-feature-test
                                                                      │
                                                              ──blocks──> bd-feature-review
                                                                      │
                                                              (gate: ждёт human approval)
```

### 15.3 Возможности Formula

| Возможность | Описание |
|-------------|----------|
| **Steps** | Шаги с зависимостями `depends_on` |
| **Variables** | `{{component}}` подставляются при создании |
| **Gates** | Async ожидание (human approval, timer, GitHub PR) |
| **Loops** | Повторение шагов `count`, `range`, `until` |
| **Branches** | Параллельные пути с fork-join |
| **Bond points** | Точки расширения для композиции |
| **Conditions** | Условные шаги `"condition": "{{env}} == prod"` |
| **OnComplete** | Runtime expansion по результату шага |

### 15.4 Чего нет внутри одиночной задачи

| Отсутствует | Альтернатива |
|-------------|--------------|
| Чеклисты | Текст в `description` или child issues |
| Артефакты (файлы) | Текст в `notes` или внешние системы |
| Фазы выполнения | Molecule с шагами |
| Прогресс % | `MoleculeProgressStats` (для молекул) |

## 16. Хранение общения и результатов

### 16.1 Comments (комментарии к задаче)

```bash
# Добавить комментарий
bd comments add bd-a1b2 "Нашёл проблему в auth модуле"

# Посмотреть комментарии
bd comments bd-a1b2 --json
```

```json
[
  {
    "id": 1,
    "issue_id": "bd-a1b2",
    "author": "claude-session-xyz",
    "text": "Нашёл проблему в auth модуле",
    "created_at": "2025-01-09T10:30:00Z"
  }
]
```

### 16.2 Messages (межагентная коммуникация)

```bash
# Создать сообщение (тип message)
bd create "Вопрос по архитектуре" -t message --sender polecat-alice
```

### 16.3 Threads (цепочки сообщений)

Thread через `replies-to` зависимость:
```
msg-001 (root)
    ↑ replies-to
msg-002 (reply)
    ↑ replies-to
msg-003 (reply to reply)
```

```bash
# Показать тред
bd show msg-003 --thread
```

### 16.4 Чего НЕТ в beads

| Не хранится | Почему |
|-------------|--------|
| История чата LLM ↔ пользователь | Ответственность IDE/терминала |
| Промпты и ответы Claude | beads не знает о Claude |
| Артефакты/файлы | Только текст |
| Результаты выполнения кода | Только description/notes |

### 16.5 Паттерн сохранения результатов общения

```bash
# 1. Добавить комментарий к задаче
bd comments add bd-a1b2 "Обсудили: решено использовать JWT"

# 2. Обновить notes задачи
bd update bd-a1b2 --notes "Решение: JWT, refresh каждые 15 мин"

# 3. Создать отдельное сообщение (для длинных обсуждений)
bd create "Архитектурное решение: Auth" -t message -d "Полный текст..."
```

## 17. Механизмы интеграции AI с beads

### 17.1 CLAUDE.md — "доверительная система"

```markdown
# В CLAUDE.md проекта:
### Workflow
1. Check for ready work: Run `bd ready`
2. Claim your task: `bd update <id> --status in_progress`
3. Work on it: Implement, test, document
4. Discover new work: Create issues, link with discovered-from
5. Complete: `bd close <id> --reason "..."`
6. Export: Run `bd export` before committing
```

**Это просто инструкции.** AI читает их и "должен" следовать. Нет принудительного механизма.

### 17.2 Git Hooks — автоматизация экспорта

```bash
# pre-commit hook
#!/bin/sh
bd sync --flush-only          # Экспортировать изменения
git add .beads/beads.jsonl    # Автостейдж
```

**Гарантирует:** JSONL синхронизирован с SQLite перед коммитом.
**НЕ гарантирует:** что AI вообще использовал bd.

### 17.3 Программный агент — wrapper вокруг AI

```python
class BeadsAgent:
    def run_once(self):
        # 1. Найти работу
        issue = self.run_bd("ready", "--limit", "1")

        # 2. Занять
        self.run_bd("update", issue["id"], "--status", "in_progress")

        # 3. Работать (здесь вызывается LLM)
        self.do_work(issue)

        # 4. Закрыть
        self.run_bd("close", issue["id"], "--reason", "Done")
```

**Гарантирует:** bd вызывается в правильном порядке.
**Минус:** AI заключён внутри wrapper'а.

### 17.4 Сравнение механизмов

| Механизм | Гарантия | Кто контролирует |
|----------|----------|------------------|
| **CLAUDE.md** | Никакая | AI сам решает следовать или нет |
| **Git hooks** | Только export | Git, не AI |
| **MCP сервер** | Удобство | AI может игнорировать |
| **Wrapper агент** | Полная | Код, AI внутри sandbox |

### 17.5 Честная оценка

```
┌─────────────────────────────────────────────────────────────┐
│  CLAUDE.md говорит:                                         │
│  "Используй bd ready, bd create, bd close..."               │
│                                                             │
│  Claude читает это и ДОЛЖЕН следовать.                      │
│  Но НИЧЕГО не проверяет, что он это делает.                 │
└─────────────────────────────────────────────────────────────┘
```

**Текущая модель beads — advisory, не enforcement.**

### 17.6 Как сделать надёжнее

**Вариант 1: Claude Code Hooks**
```yaml
# .claude/hooks.yaml
post_tool_call:
  - pattern: "Edit|Write"
    command: "bd sync --flush-only"
```

**Вариант 2: MCP с обязательными вызовами**

MCP сервер может требовать `bd update --status in_progress` перед разрешением работы.

**Вариант 3: Wrapper агент**
```python
agent = BeadsAgent()
agent.work_on(issue_id)  # Внутри: claim → LLM → close
```

**Вариант 4: Валидация в CI**
```bash
# Проверять:
# - Нет открытых in_progress без активности
# - Все коммиты имеют связанный issue
# - Нет TODOs в коде без bd issue
```

## 18. Итоговая архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ИНТЕГРАЦИЯ AI                                │
├─────────────────────────────────────────────────────────────────────┤
│  CLAUDE.md          │  Git Hooks         │  Wrapper Agent          │
│  (инструкции)       │  (auto-export)     │  (enforcement)          │
│  ↓ advisory         │  ↓ partial         │  ↓ full control         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI / MCP                                   │
├─────────────────────────────────────────────────────────────────────┤
│  bd ready --json        │  bd create --json   │  bd close --json    │
│  bd update --claim      │  bd dep add         │  bd comments add    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ХРАНЕНИЕ ДАННЫХ                                │
├─────────────────────────────────────────────────────────────────────┤
│  SQLite (runtime)       │  JSONL (sync)       │  Git (distribution) │
│  - Быстрый поиск        │  - Git-friendly     │  - Offline-first    │
│  - Граф зависимостей    │  - Потоковый        │  - Merge conflicts  │
│  - blocked_cache        │  - 1 issue = 1 line │  - Audit trail      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      СТРУКТУРА ДАННЫХ                               │
├─────────────────────────────────────────────────────────────────────┤
│  Issue (flat)           │  Formula (workflow) │  Comments/Messages  │
│  - title, description   │  - steps[]          │  - author, text     │
│  - status, priority     │  - depends_on       │  - replies-to       │
│  - acceptance_criteria  │  - gates, loops     │  - threads          │
│  - NO file refs         │  - variables        │  - ephemeral        │
└─────────────────────────────────────────────────────────────────────┘
```

## 19. Заключение

**beads** демонстрирует паттерны AI-friendly системы:

| Аспект | Реализация |
|--------|------------|
| Формат данных | JSON (API), JSONL (sync), SQLite (storage) |
| Поиск | SQL индексы + CLI фильтры |
| Контекст | Адаптивная компрессия, минимальные модели |
| Синхронизация | Git-backed JSONL |
| Зависимости | Граф с типами (blocks, discovered-from) |
| Абстракции | `bd ready` скрывает сложность графа |
| Координация | --claim для атомарного захвата, agent state |
| Интеграция AI | CLAUDE.md (advisory), hooks, wrapper agents |
| Общение | Comments, messages, threads (НЕ chat history) |
| Связь с кодом | Нет структурированных ссылок (только текст) |

### Ключевые ограничения

1. **Advisory, не enforcement** — AI должен сам следовать инструкциям
2. **Нет связи с кодом** — только текстовые ссылки в description
3. **Нет chat history** — только comments к задачам
4. **Flat задачи** — для workflow нужны формулы/молекулы

Эти паттерны можно применить к любой системе, которая должна эффективно взаимодействовать с AI-агентами.

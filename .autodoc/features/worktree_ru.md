# Мульти-агентная работа через Worktree

UltraCode поддерживает параллельную работу нескольких AI-агентов, каждый в своём git worktree на отдельной ветке. Сервер определяет, что все worktree принадлежат одному репозиторию, и разделяет базовый индекс.

## Основные концепции

### repoIdentity

Стабильный хеш (`xxHash32(gitCommonDir)`), одинаковый для всех worktree одного репозитория. Обеспечивает:
- Общий индекс базы данных (без дублирования)
- Обнаружение сессий между worktree
- Координацию блокировок индексирования

### Определение Worktree

UltraCode использует `git rev-parse --git-common-dir` для определения worktree:
- Основной worktree: `.git` — директория → `gitCommonDir = .git`
- Linked worktree: `.git` — файл с содержимым `gitdir: ...` → разрешается в общий `.git`

### Протокол инициализации v3.0

comm.c отправляет JSON-сообщение при подключении:
```
ULTRACODE_INIT:{"cwd":"/path/to/worktree","branch":"feature-x","agentId":"agent-1"}\n
```

## Инструменты

### spawn_agent_worktree

Создать git worktree для новой ветки и подготовить подключение агента.

```typescript
spawn_agent_worktree({
  branch: "feature/auth",      // Имя ветки
  baseBranch: "main",          // Базовая ветка (по умолчанию: HEAD)
  agentId: "auth-agent",       // Идентификатор агента
  directory: "../wt-auth"      // Путь (по умолчанию: ../wt-{branch})
})
```

**Возвращает**: путь worktree, ветку, agentId, repoIdentity, инструкции подключения.

### list_worktree_agents

Список всех worktree и активных сессий агентов для текущего репозитория.

```typescript
list_worktree_agents({
  includeInactive: true   // Включить worktree без активных сессий
})
```

**Возвращает**: repoIdentity, общее число worktree, активные сессии, детали по каждому worktree.

### cleanup_worktree

Удалить git worktree по имени ветки.

```typescript
cleanup_worktree({
  branch: "feature/auth",   // Ветка для удаления
  force: false              // Принудительное удаление при наличии изменений
})
```

### get_worktree_info

Получить детальную информацию о топологии репозитория.

```typescript
get_worktree_info({
  directory: "/path/to/project"   // Опционально, по умолчанию — текущий проект
})
```

**Возвращает**:
- Информация о worktree: isWorktree, mainRepo, repoIdentity, worktreeName
- Соседние worktree со статусом активных сессий
- Обнаруженные submodules (path, url, branch, commit)
- Обнаруженные subtrees (prefix, lastMergeCommit)

## Определение Submodule

Submodules определяются через `.gitmodules` и `git submodule status --recursive`. Каждый submodule получает собственный `repoIdentity` (отличный от родительского).

## Определение Subtree

Subtrees определяются через `git log --grep="git-subtree-dir:"` — поиск merge-коммитов, оставленных `git subtree`.

## Архитектура

### Ключевые файлы

| Файл | Назначение |
|------|------------|
| `src/shared/git-worktree.ts` | Определение worktree/submodule/subtree |
| `src/shared/storage-paths.ts` | `hashProjectPath()` → repoIdentity |
| `src/core/client-session.ts` | Сессия с repoIdentity + agentId |
| `src/core/pipe-transport.ts` | JSON-протокол инициализации v3.0 |
| `src/core/git-watcher.ts` | Worktree-aware отслеживание HEAD |
| `src/agents/indexer-agent.ts` | Координация блокировок индексирования |
| `src/tools/handlers/worktree-tool-handlers.ts` | Обработчики MCP-инструментов |
| `src/comm/comm.c` | CLI аргументы: --directory, --branch, --agent-id |

### Координация блокировок индексирования

Когда несколько worktree пытаются одновременно индексировать одну ветку, `acquireIndexLockForProject()` предотвращает дублирование:
- Ключ блокировки: `repoIdentity:branch`
- Если блокировка занята: ожидание завершения, затем пропуск (данные актуальны)
- Разные ветки одного репо: индексация параллельно (разные блокировки)

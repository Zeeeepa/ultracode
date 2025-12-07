# AutoDoc Guide

AutoDoc — система автоматической документации кода с семантическим поиском.

## Концепция

**AutoDoc ≠ комментарии в коде**

| Комментарии | AutoDoc |
|-------------|---------|
| КАК работает код | ЗАЧЕМ, КЕМ используется, В КАКИХ сценариях |
| Локальный контекст | Бизнес-контекст + архитектура |
| Для разработчика в IDE | Для AI + понимания системы |

## Структура `.autodoc/`

```
.autodoc/
├── ARCHITECTURE.md     # Компоненты системы
├── FLOW.md            # Бизнес-сценарии (user stories)
├── PROCESSES.md       # Технические процессы
├── DEPENDENCIES.md    # Пакеты, API, микросервисы
├── DEPLOYMENT.md      # Сборка, CI/CD, ENV
├── GLOSSARY.md        # Термины
│
└── src/               # Зеркалит структуру кода
    ├── _index.md      # Обзор директории
    ├── module/
    │   ├── _index.md  # Документация модуля
    │   └── file.md    # Документация сущности
    └── ...
```

## MCP Tools

### Инициализация и статус

```
autodoc_init({ enabled: true, language: 'ru' | 'en' | 'zh', docsDir?: string })
```
Инициализирует AutoDoc. Устанавливает язык документации.

```
autodoc_status()
```
Статус: включено/выключено, статистика (docs, sections, refs).

```
autodoc_detect_language({ scope: 'all' | 'comments' | 'docs', sampleSize?: number })
```
Автоматическое определение языка по комментариям в коде и существующей документации.

### Поиск и чтение

```
autodoc_search({ query: "...", scope: 'all' | 'code' | 'docs', mode: 'text' | 'semantic' | 'hybrid' })
```
Семантический поиск по коду + документации.
**Используй вместо обычного поиска** — даёт контекст!

```
autodoc_get({ filePath: "...", section?: "..." })
```
Получить документацию по пути. Если указана секция — только её.

### Сохранение

```
autodoc_save({ filePath: "...", content: "..." })
```
Сохраняет документ. Автоматически:
- Парсит ссылки
- Генерирует embeddings для семантического поиска
- Извлекает секции

### Валидация и синхронизация

```
autodoc_validate({ fixBrokenRefs: false | true })
```
Проверяет все ссылки, опционально исправляет.

```
autodoc_sync({ scope: 'all' | 'outdated' | 'file', filePath?: string })
```
Синхронизирует документацию с изменениями кода.
Находит устаревшие документы и невалидные ссылки.

### История изменений

```
autodoc_changelog({ since?: timestamp, limit?: number, branch?: string })
```
Просмотр истории изменений документации.
Показывает что изменилось после изменения кода.

### Git Integration

```
autodoc_install_hooks({ action: 'install' | 'uninstall' | 'status' })
```
Установка pre-commit hook для валидации ссылок перед коммитом.

## Workflows

### 1. Инициализация проекта

```
User: "Задокументируй проект"

1. autodoc_detect_language({ scope: 'comments' })
   → Определяет язык проекта по комментариям

2. autodoc_init({ enabled: true, language: 'ru' })
   → Инициализирует AutoDoc

3. autodoc_status()
   → Показывает текущее состояние

4. Создаёшь .autodoc/ директорию с документацией
   autodoc_save({ filePath: 'ARCHITECTURE.md', content: '...' })
```

### 2. Понимание существующего проекта

```
User: "Как работает авторизация?"

1. autodoc_search({ query: "авторизация аутентификация", mode: 'semantic' })
   → Находит документацию + код

2. autodoc_get({ filePath: 'FLOW.md', section: 'регистрация' })
   → Бизнес-сценарий

3. autodoc_get({ filePath: 'PROCESSES.md', section: 'auth-flow' })
   → Техническая реализация
```

### 3. После изменения кода

```
User: "Добавил rate limiting в AuthService"

1. autodoc_sync({ scope: 'outdated' })
   → Находит устаревшие документы

2. autodoc_validate()
   → Проверяет ссылки

3. autodoc_save({
     filePath: 'src/services/auth/auth.service.md',
     content: '...'
   })

4. autodoc_changelog({ limit: 5 })
   → Показывает последние изменения
```

### 4. Настройка Git Hooks

```
1. autodoc_install_hooks({ action: 'status' })
   → Проверяет установлены ли хуки

2. autodoc_install_hooks({ action: 'install' })
   → Устанавливает pre-commit hook

3. При коммите автоматически проверяются ссылки в .md файлах
```

## Формат Entity-level документации

**НЕ дублируй комментарии!** Пиши про:
- Роль в системе (ЗАЧЕМ)
- Кто использует (КЕМ)
- Участие в процессах (ГДЕ)
- Бизнес-инварианты
- Критические зависимости
- Known issues

```markdown
# AuthService

[→ auth.service.ts:15-120](auth.service.ts#L15-L120)

## Роль в системе

**Зачем нужен**: Единая точка управления аутентификацией...

## Кто использует

| Потребитель | Как использует |
|-------------|----------------|
| [→ API Gateway](../../gateway/README.md) | Проверка токенов |

## Участие в процессах

- [→ FLOW.md#регистрация](../../FLOW.md#регистрация)
- [→ PROCESSES.md#auth-flow](../../PROCESSES.md#auth-flow)

## Бизнес-инварианты

- Один активный токен на пользователя
- Rate limiting: 5 попыток/мин
```

## Синтаксис ссылок

```markdown
[→ file.ts:25-50](file.ts#L25-L50)     # На строки кода
[→ ModuleName](./_index.md)             # На документацию
[→ FLOW.md#сценарий](../../FLOW.md#сценарий)  # На секцию
```

В комментариях кода:
```typescript
/**
 * @see docs://.autodoc/PROCESSES.md#auth-flow
 * @flow user-registration, api-auth
 */
```

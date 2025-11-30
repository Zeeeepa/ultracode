# Tree-sitter Node.js 24 Compatibility Issue

Отслеживание проблемы совместимости tree-sitter с Node.js 24 и статуса upstream fix.

## Проблемы

### 1. C++20 vs C++17

Node.js 24 использует V8 12.x, который требует **C++20** для компиляции native addons. Однако `tree-sitter` и все языковые грамматики (`tree-sitter-javascript`, `tree-sitter-python`, и т.д.) указывают **C++17** в `binding.gyp`.

### 2. Peer Dependency Conflicts

Языковые грамматики имеют несовместимые peer dependencies на tree-sitter:

```
tree-sitter-kotlin:     peerDependency tree-sitter@^0.21.0
tree-sitter-typescript: peerDependency tree-sitter@^0.21.0
tree-sitter-c-sharp:    peerDependency tree-sitter@^0.21.1
tree-sitter-cpp:        peerDependency tree-sitter@^0.21.1
tree-sitter-html:       peerDependency tree-sitter@^0.21.1
tree-sitter-java:       peerDependency tree-sitter@^0.21.1
tree-sitter-swift:      peerDependency tree-sitter@^0.22.1
tree-sitter-rust:       peerDependency tree-sitter@^0.22.1
tree-sitter-c:          peerDependency tree-sitter@^0.22.4

Мы используем:          tree-sitter@^0.25.0
```

При установке npm показывает warnings:

```
npm warn ERESOLVE overriding peer dependency
npm warn Could not resolve dependency:
npm warn peerOptional tree-sitter@"^0.21.0" from tree-sitter-kotlin@0.3.8
```

**Это безопасно игнорировать** — установка проходит успешно, API совместим.

Для подавления warnings:
```bash
npm install ultrascript-tools-mcp --legacy-peer-deps
```

### Ошибка компиляции при установке

```
npm install tree-sitter

gyp ERR! build error
error C7555: use of designated initializers requires at least '/std:c++20'
```

### Затронутые пакеты

| Пакет | Версия в npm | Статус |
|-------|--------------|--------|
| tree-sitter | 0.25.0 | C++17, требует компиляции |
| tree-sitter-javascript | 0.23.x | C++17, требует компиляции |
| tree-sitter-typescript | 0.23.x | C++17, требует компиляции |
| tree-sitter-python | 0.23.x | C++17, требует компиляции |
| tree-sitter-go | 0.23.x | C++17, требует компиляции |
| tree-sitter-rust | 0.23.x | C++17, требует компиляции |
| tree-sitter-c | 0.23.x | C++17, требует компиляции |
| tree-sitter-cpp | 0.23.x | C++17, требует компиляции |
| tree-sitter-java | 0.23.x | C++17, требует компиляции |
| tree-sitter-kotlin | 0.23.x | C++17, требует компиляции |
| tree-sitter-swift | 0.23.x | C++17, требует компиляции |
| tree-sitter-c-sharp | 0.23.x | C++17, требует компиляции |
| tree-sitter-bash | 0.23.x | C++17, требует компиляции |
| tree-sitter-json | 0.24.x | C++17, требует компиляции |
| tree-sitter-yaml | 0.23.x | C++17, требует компиляции |
| tree-sitter-html | 0.23.x | C++17, требует компиляции |
| tree-sitter-css | 0.23.x | C++17, требует компиляции |

## Upstream Status

### GitHub Issues

- **[node-tree-sitter#238](https://github.com/tree-sitter/node-tree-sitter/issues/238)** - "Install fails with Node v23, due to `-std=c++17`"
  - Статус: **ОТКРЫТ**
  - Открыт: 1 марта 2025

### Pull Requests

- **[node-tree-sitter#240](https://github.com/tree-sitter/node-tree-sitter/pull/240)** - "update binding.gyp to compile with cpp20"
  - Статус: **ОТКРЫТ, НЕ СМЕРЖЕН**
  - Автор: MaximusSeniorem
  - Открыт: 6 марта 2025
  - Изменение: `c++17` → `c++20` в `binding.gyp`

- **[node-tree-sitter#258](https://github.com/tree-sitter/node-tree-sitter/pull/258)** - "Proper tree-sitter 0.25 support"
  - Статус: **DRAFT** (7/10 задач выполнено)
  - Может включать fix для C++20

### Версии

| Репозиторий | npm версия | GitHub версия | Разница |
|-------------|------------|---------------|---------|
| tree-sitter (core) | 0.25.10 | 0.25.10 | синхронизированы |
| node-tree-sitter | 0.25.0 | 0.22.4 | npm новее (?) |

## Альтернативы

### 1. Форк @keqingmoe/tree-sitter

Сообщество создало форк с prebuilds:

```bash
npm install @keqingmoe/tree-sitter
```

**Плюсы:**
- Включает prebuilds для всех платформ (win32, linux, darwin x64/arm64)
- Версия 0.26.2 (новее официального)
- Размер 4.2 MB

**Минусы:**
- Только runtime, языковые грамматики не форкнуты
- Нужно менять imports
- Неофициальный, может отстать от upstream

### 2. Наше решение: Prebuilds

Мы собираем prebuilds для всех 17 пакетов и включаем в npm:

```
external-libs/
├── tree-sitter-win32-x64/      # 17 .node файлов
├── tree-sitter-linux-x64/
├── tree-sitter-darwin-arm64/
└── tree-sitter-darwin-x64/
```

**Плюсы:**
- Полный контроль
- Покрывает все языковые грамматики
- Не требует изменения imports
- Fallback на npm для старых Node.js

**Минусы:**
- ~26 MB на платформу
- Нужно пересобирать при обновлении tree-sitter

## Что мы ожидаем от PR #240

После мержа PR #240:

1. **Официальный tree-sitter** будет компилироваться на Node.js 24+
2. **Языковые грамматики** потребуют аналогичных PR в своих репозиториях
3. **Мы сможем удалить prebuilds** из npm пакета (экономия ~100 MB)
4. **Пользователям всё равно понадобятся** build tools (VS Build Tools, Xcode CLT, GCC)

### Идеальный сценарий

Официальный tree-sitter начнёт публиковать prebuilds (как `better-sqlite3`, `sharp`):

```json
{
  "optionalDependencies": {
    "@tree-sitter/win32-x64": "0.26.0",
    "@tree-sitter/linux-x64": "0.26.0",
    "@tree-sitter/darwin-arm64": "0.26.0"
  }
}
```

Это устранит необходимость:
- Компиляции на машине пользователя
- Установки build tools
- Наших собственных prebuilds

## Мониторинг

Проверять периодически:

- [ ] [PR #240](https://github.com/tree-sitter/node-tree-sitter/pull/240) статус
- [ ] [PR #258](https://github.com/tree-sitter/node-tree-sitter/pull/258) статус
- [ ] Новые релизы node-tree-sitter на npm
- [ ] Аналогичные PR в репозиториях языковых грамматик

## Временная шкала

| Дата | Событие |
|------|---------|
| 2024-10 | Node.js 23 выпущен (первые проблемы с C++20) |
| 2025-03-01 | Issue #238 открыт |
| 2025-03-06 | PR #240 открыт |
| 2025-11-30 | Текущий статус: PR не смержен |
| ??? | Ожидаемый мерж PR #240 |
| ??? | Публикация npm с фиксом |

---

**Последнее обновление:** 2025-11-30

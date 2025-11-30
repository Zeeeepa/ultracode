# NPM Publishing Guide

Полное руководство по упаковке, публикации и обновлению пакета `ultrascript-tools-mcp` в npm.

## Содержание

- [Подготовка к публикации](#подготовка-к-публикации)
- [Упаковка пакета](#упаковка-пакета)
- [Первая публикация](#первая-публикация)
- [Обновление версии](#обновление-версии)
- [Публикация обновлений](#публикация-обновлений)
- [Тестирование перед публикацией](#тестирование-перед-публикацией)
- [Откат изменений](#откат-изменений)
- [Автоматизация CI/CD](#автоматизация-cicd)

---

## Подготовка к публикации

### 1. Проверка package.json

Убедитесь, что все поля заполнены корректно:

```json
{
  "name": "ultrascript-tools-mcp",
  "version": "1.0.0",
  "description": "Multi-agent LiteRAG MCP server for advanced code graph analysis",
  "license": "MIT",
  "author": "faxen",
  "homepage": "https://github.com/faxenoff/ultrascript-tools-mcp#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/faxenoff/ultrascript-tools-mcp.git"
  },
  "keywords": [
    "mcp",
    "code-analysis",
    "graph",
    "rag",
    "llm"
  ]
}
```

**Важные поля:**
- `name` - уникальное имя в npm (проверьте доступность на https://www.npmjs.com)
- `version` - следует [semver](https://semver.org/) (semantic versioning)
- `description` - краткое описание (появится в поиске npm)
- `keywords` - теги для поиска в npm
- `license` - лицензия (MIT, Apache-2.0, etc.)
- `repository` - ссылка на GitHub
- `files` - список файлов для публикации

### 2. Проверка файлов для публикации

Файлы, которые войдут в пакет, определяются в секции `files`:

```json
"files": [
  "dist",
  "src",
  "external-tools/README.md",
  "external-tools/wasm/*/src/**/*.rs",
  "external-tools/wasm/*/Cargo.toml",
  "external-tools/native/cuda/src/**/*.{cpp,cu,cuh}",
  "external-tools/native/cuda/CMakeLists.txt",
  "scripts/postinstall.js",
  "scripts/setup-embeddings.cmd",
  "config",
  "README.md",
  "GETTING_STARTED.md",
  "LICENSE"
]
```

Исключения настраиваются в `.npmignore` (dev-файлы, build артефакты, тесты).

### 3. Сборка проекта

Перед упаковкой соберите проект:

```bash
# Windows
.\scripts\build.cmd

# Linux/macOS
npm run build
```

Проверьте, что созданы:
- `dist/index.js` - основной файл
- `dist/external-tools/wasm/` - WASM модули
- `dist/native/cuda/` - CUDA модуль (опционально)
- `external-libs/tree-sitter-*/*.node` - tree-sitter prebuilds (для Node.js 24+)

### 4. Tree-sitter Prebuilds (Node.js 24+)

Node.js 24 требует C++20, но tree-sitter компилируется с C++17. Это вызывает ошибки при `npm install`.

**Решение:** Прекомпилированные `.node` файлы включаются в npm-пакет.

```powershell
# Сборка prebuilds (автоматически выполняется pack-npm.ps1)
npm run build:tree-sitter

# Проверить наличие prebuilds
dir external-libs\tree-sitter-win32-x64\*.node
# Должно быть 17 файлов (~26 MB)
```

Структура prebuilds:
```
external-libs/
├── tree-sitter-win32-x64/      # Windows x64
├── tree-sitter-linux-x64/      # Linux x64
├── tree-sitter-darwin-arm64/   # macOS Apple Silicon
└── tree-sitter-darwin-x64/     # macOS Intel
```

> **Примечание:** Скрипт `pack-npm.ps1 -Apply` автоматически собирает tree-sitter prebuilds если они отсутствуют.

---

## Упаковка пакета

### Предпросмотр (Dry Run)

Посмотрите, что войдет в пакет без реальной упаковки:

```powershell
# PowerShell скрипт с проверками
.\scripts\pack-npm.ps1

# Или напрямую через npm
npm pack --dry-run
```

Скрипт покажет:
- ✅ Список файлов для публикации
- ✅ Размер пакета (~30-35 MB с tree-sitter prebuilds)
- ✅ Проверку обязательных файлов

### Реальная упаковка

```powershell
# Создаст .tgz файл в ./dist-packages/
.\scripts\pack-npm.ps1 -Apply
```

Результат:
- Создается backup в `_bak/MMddHHmm_pack-npm/`
- Генерируется `ultrascript-tools-mcp-1.0.0.tgz`
- Файл перемещается в `./dist-packages/`

### Проверка содержимого пакета

```bash
# Посмотреть список файлов в .tgz
tar -tzf dist-packages/ultrascript-tools-mcp-1.0.0.tgz

# Распаковать для проверки
tar -xzf dist-packages/ultrascript-tools-mcp-1.0.0.tgz
cd package
ls -la
```

---

## Первая публикация

### 1. Регистрация в npm

Если у вас нет аккаунта:

1. Перейдите на https://www.npmjs.com/signup
2. Создайте аккаунт
3. Подтвердите email

### 2. Вход в npm

```bash
npm login
```

Введите:
- Username
- Password
- Email (публичный)
- One-time password (если включена 2FA)

Проверка:
```bash
npm whoami
```

### 3. Проверка имени пакета

Убедитесь, что имя свободно:

```bash
npm view ultrascript-tools-mcp
# Должно вернуть: npm ERR! 404 'ultrascript-tools-mcp@latest' is not in this registry.
```

### 4. Публикация

```bash
# Публикация из .tgz файла
npm publish ./dist-packages/ultrascript-tools-mcp-1.0.0.tgz --access public

# Или напрямую из директории
npm publish --access public
```

**Флаги:**
- `--access public` - для публичных пакетов (обязательно для scoped пакетов)
- `--tag beta` - публикация в beta канал (npm install package@beta)
- `--dry-run` - предпросмотр без реальной публикации

### 5. Проверка публикации

```bash
# Просмотр на npm
npm view ultrascript-tools-mcp

# Установка для теста
npm install ultrascript-tools-mcp
```

Или откройте в браузере:
```
https://www.npmjs.com/package/ultrascript-tools-mcp
```

---

## Обновление версии

### Семантическое версионирование (semver)

Формат: `MAJOR.MINOR.PATCH` (например, `1.2.3`)

- **MAJOR** (1.0.0 → 2.0.0) - breaking changes (несовместимые изменения API)
- **MINOR** (1.0.0 → 1.1.0) - новые фичи (обратно совместимые)
- **PATCH** (1.0.0 → 1.0.1) - багфиксы (обратно совместимые)

### Автоматическое обновление версии

```bash
# Patch: 1.0.0 → 1.0.1 (багфикс)
npm version patch

# Minor: 1.0.0 → 1.1.0 (новая фича)
npm version minor

# Major: 1.0.0 → 2.0.0 (breaking change)
npm version major

# Prerelease: 1.0.0 → 1.0.1-0
npm version prerelease

# Конкретная версия
npm version 1.2.3
```

Эти команды автоматически:
1. Обновляют `package.json`
2. Создают git commit: `"1.0.1"`
3. Создают git tag: `v1.0.1`

**Опции:**
```bash
# Без git commit и tag
npm version patch --no-git-tag-version

# С кастомным сообщением
npm version patch -m "Release v%s: Fixed critical bug"
```

### Ручное обновление версии

Просто отредактируйте `package.json`:

```json
{
  "version": "1.0.1"
}
```

Затем создайте commit и tag вручную:

```bash
git add package.json
git commit -m "chore: bump version to 1.0.1"
git tag v1.0.1
git push origin main --tags
```

---

## Публикация обновлений

### Стандартный процесс

```bash
# 1. Убедитесь, что все изменения закоммичены
git status

# 2. Обновите версию
npm version patch  # или minor/major

# 3. Соберите проект
.\scripts\build.cmd

# 4. Упакуйте (опционально, для проверки)
.\scripts\pack-npm.ps1 -Apply

# 5. Опубликуйте
npm publish

# 6. Отправьте изменения в Git
git push origin main --tags
```

### Публикация beta-версии

Для тестирования перед релизом:

```bash
# 1. Создайте prerelease версию
npm version prerelease --preid=beta
# Результат: 1.0.1-beta.0

# 2. Опубликуйте с тегом beta
npm publish --tag beta

# 3. Установка beta-версии
npm install ultrascript-tools-mcp@beta
```

Чтобы сделать beta стабильной:

```bash
# Промоутнуть beta в latest
npm dist-tag add ultrascript-tools-mcp@1.0.1-beta.0 latest
```

### Публикация канареечной версии (canary)

Для CI/CD при каждом коммите:

```bash
# Версия с коммит-хешем
npm version 1.0.1-canary.$(git rev-parse --short HEAD)
npm publish --tag canary
```

---

## Тестирование перед публикацией

### 1. Локальная установка из .tgz

```bash
# Упакуйте пакет
.\scripts\pack-npm.ps1 -Apply

# Установите в тестовый проект
cd /path/to/test-project
npm install /path/to/ultrascript-tools-mcp/dist-packages/ultrascript-tools-mcp-1.0.0.tgz

# Проверьте, что postinstall отработал
# Должно показать welcome message
```

### 2. Локальная установка через npm link

```bash
# В директории пакета
cd D:\_mcp\ultrascript-tools-mcp
npm link

# В тестовом проекте
cd /path/to/test-project
npm link ultrascript-tools-mcp

# Отвязать после тестирования
npm unlink ultrascript-tools-mcp
```

### 3. Тестирование в изолированной среде

```bash
# Создайте временную директорию
mkdir /tmp/test-install
cd /tmp/test-install

# Установите из .tgz
npm init -y
npm install /path/to/dist-packages/ultrascript-tools-mcp-1.0.0.tgz

# Проверьте структуру
ls node_modules/ultrascript-tools-mcp/

# Проверьте, что скрипты работают
node node_modules/ultrascript-tools-mcp/scripts/postinstall.js
```

### 4. Проверка на разных платформах

Используйте Docker для тестирования на Linux:

```dockerfile
# Dockerfile.test
FROM node:24-alpine
WORKDIR /app
COPY dist-packages/ultrascript-tools-mcp-1.0.0.tgz .
RUN npm install ultrascript-tools-mcp-1.0.0.tgz
CMD ["node", "node_modules/ultrascript-tools-mcp/dist/index.js"]
```

```bash
docker build -f Dockerfile.test -t test-mcp .
docker run --rm test-mcp
```

---

## Откат изменений

### Отозвать версию из npm

**Внимание:** Нельзя удалить версию в течение 72 часов после публикации, если есть скачивания.

```bash
# Удалить конкретную версию (только в первые 72 часа)
npm unpublish ultrascript-tools-mcp@1.0.1

# Удалить весь пакет (осторожно!)
npm unpublish ultrascript-tools-mcp --force
```

### Deprecate версии

Если нужно пометить версию как устаревшую:

```bash
# Пометить конкретную версию
npm deprecate ultrascript-tools-mcp@1.0.1 "Critical security bug, use 1.0.2+"

# Пометить диапазон версий
npm deprecate ultrascript-tools-mcp@"< 1.0.2" "Security vulnerability fixed in 1.0.2"
```

Пользователи увидят warning при установке:
```
npm WARN deprecated ultrascript-tools-mcp@1.0.1: Critical security bug, use 1.0.2+
```

### Git откат

Если вы ошиблись с git tag:

```bash
# Удалить локальный tag
git tag -d v1.0.1

# Удалить удаленный tag
git push origin :refs/tags/v1.0.1

# Пересоздать tag на другом коммите
git tag v1.0.1 <commit-hash>
git push origin v1.0.1
```

---

## Автоматизация CI/CD

### GitHub Actions для автоматической публикации

Создайте `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Publish to npm
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Настройка:**

1. Создайте npm token:
   - Откройте https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Нажмите "Generate New Token" → "Automation"
   - Скопируйте token

2. Добавьте token в GitHub Secrets:
   - Откройте настройки репозитория → Secrets and variables → Actions
   - New repository secret: `NPM_TOKEN` = ваш token

3. Публикация через tag:
   ```bash
   npm version patch
   git push origin main --tags
   ```

### Workflow с ручным триггером

`.github/workflows/publish-manual.yml`:

```yaml
name: Manual Publish

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version bump type'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'

      - name: Configure Git
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"

      - name: Bump version
        run: npm version ${{ github.event.inputs.version }}

      - name: Install & Build
        run: |
          npm ci
          npm run build

      - name: Publish to npm
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Push changes
        run: git push origin main --tags
```

---

## Полезные команды

### Просмотр информации о пакете

```bash
# Посмотреть метаданные пакета
npm view ultrascript-tools-mcp

# Посмотреть все версии
npm view ultrascript-tools-mcp versions

# Посмотреть dist-tags
npm dist-tag ls ultrascript-tools-mcp

# Посмотреть размер пакета
npm view ultrascript-tools-mcp dist.tarball
```

### Управление dist-tags

```bash
# Добавить тег
npm dist-tag add ultrascript-tools-mcp@1.0.1 stable

# Удалить тег
npm dist-tag rm ultrascript-tools-mcp stable

# Список тегов
npm dist-tag ls ultrascript-tools-mcp
```

### Статистика скачиваний

```bash
# Скачивания за последнюю неделю
npm view ultrascript-tools-mcp

# Через npms.io API
curl https://api.npmjs.org/downloads/point/last-week/ultrascript-tools-mcp
```

---

## Чеклист перед публикацией

- [ ] Все тесты проходят (`npm test`)
- [ ] Код собирается без ошибок (`npm run build`)
- [ ] `package.json` содержит корректные данные
- [ ] `README.md` обновлен
- [ ] `CHANGELOG.md` содержит описание изменений (если есть)
- [ ] Версия обновлена корректно (`npm version`)
- [ ] Tree-sitter prebuilds собраны (`npm run build:tree-sitter`)
- [ ] Пакет упакован и проверен (`.\scripts\pack-npm.ps1`)
- [ ] Размер пакета приемлемый (~30-35 MB с prebuilds)
- [ ] Проверена локальная установка из .tgz
- [ ] Git изменения закоммичены
- [ ] Git tag создан (`v1.0.0`)
- [ ] Вы вошли в npm (`npm whoami`)
- [ ] Опубликовано (`npm publish`)
- [ ] Изменения отправлены в GitHub (`git push --tags`)

---

## Troubleshooting

### Ошибка: "You do not have permission to publish"

Решение:
```bash
# Войдите заново
npm logout
npm login

# Проверьте владельца пакета
npm owner ls ultrascript-tools-mcp
```

### Ошибка: "Package name too similar to existing package"

npm блокирует имена, похожие на популярные пакеты (typosquatting protection).

Решение: Выберите другое уникальное имя.

### Ошибка: "Cannot publish over existing version"

Вы пытаетесь опубликовать версию, которая уже существует.

Решение:
```bash
npm version patch
npm publish
```

### Пакет слишком большой (>155 MB)

Проверьте `.npmignore` и секцию `files` в `package.json`.

Решение:
```bash
# Посмотреть, что включается
npm pack --dry-run

# Проверить размер
npm view . dist.tarball
```

### postinstall не запускается у пользователей

Некоторые пользователи используют `npm install --ignore-scripts`.

Решение: Документируйте ручной запуск в README:
```bash
node node_modules/ultrascript-tools-mcp/scripts/postinstall.js
```

### Ошибка tree-sitter при установке на Node.js 24

```
error C7555: use of designated initializers requires at least '/std:c++20'
```

Решение: Пакет включает прекомпилированные prebuilds. Если ошибка возникает:

1. Проверьте, что prebuilds включены в npm-пакет:
```bash
tar -tzf ultrascript-tools-mcp-*.tgz | grep tree-sitter
```

2. Если prebuilds отсутствуют, повторите сборку:
```powershell
npm run build:tree-sitter
.\scripts\pack-npm.ps1 -Apply
```

---

## Ссылки

- [npm Documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [npm package.json reference](https://docs.npmjs.com/cli/v10/configuring-npm/package-json)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [GitHub Actions for npm](https://docs.github.com/en/actions/publishing-packages/publishing-nodejs-packages)

---

**Автор:** faxen
**Проект:** ultrascript-tools-mcp
**Дата:** 2025-01-18

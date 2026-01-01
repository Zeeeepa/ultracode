# macOS Build Quick Start - Для разработчиков с Mac

> Если вы разработчик **без macOS**, пропустите этот файл. Windows и Linux бинарники уже собраны.

## Быстрый старт (5 команд)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/faxenoff/ultrascript-tools-mcp.git
cd ultrascript-tools-mcp

# 2. Установить зависимости (если еще нет)
brew install openblas cmake node@24
brew link node@24 --force

# 3. Собрать FAISS для macOS
npm run build:faiss:macos

# 4. Проверить что работает
node -e "require('./external-libs/faiss-darwin-arm64/faiss-node.node'); console.log('✓ Success')"

# 5. Закоммитить и отправить
git add external-libs/faiss-darwin-*/
git commit -m "feat: add FAISS prebuilt binary for macOS"
git push
```

## Что происходит при сборке?

1. **Определение архитектуры:**
   - M1/M2/M3 → `faiss-darwin-arm64`
   - Intel → `faiss-darwin-x64`

2. **Установка зависимостей через Homebrew:**
   - OpenBLAS (BLAS/LAPACK)
   - CMake

3. **Сборка FAISS:**
   - Клонирует faiss-node в `.build-cache/`
   - Компилирует C++ код (10-20 минут)
   - Создает `faiss-node.node`

4. **Результат:**
   - `external-libs/faiss-darwin-arm64/faiss-node.node` (Apple Silicon)
   - или `external-libs/faiss-darwin-x64/faiss-node.node` (Intel)

## Если у вас НЕТ Homebrew

```bash
# Установить Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Следовать инструкциям в терминале
# Обычно нужно добавить Homebrew в PATH
```

## Если нужен Node 24

```bash
# Установить Node 24
brew install node@24

# Сделать его default (ВАЖНО!)
brew link node@24 --force

# Проверить версию
node --version  # должно быть v24.x.x
```

## Если нет Xcode Command Line Tools

```bash
# Установить
xcode-select --install

# Появится диалог - нажать "Install"
# Дождаться завершения установки
```

## Первый раз собираете?

**Ожидаемое время:**
- Установка Homebrew: ~5 минут
- Установка зависимостей: ~3 минуты
- Сборка FAISS: ~15 минут
- **Итого:** ~25 минут

**Последующие сборки:**
- ~10 минут (зависимости уже установлены)

## Troubleshooting

### Error: "Homebrew not found"

```bash
# Проверить установлен ли Homebrew
which brew

# Если нет - установить
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Error: "node: command not found"

```bash
# Установить Node 24
brew install node@24
brew link node@24 --force

# Если не помогло - перезапустить терминал
```

### Error: "xcode-select: error: tool 'xcodebuild' requires Xcode"

```bash
# Установить Xcode Command Line Tools
xcode-select --install

# Дождаться завершения установки
```

### Build fails with OpenBLAS errors

```bash
# Переустановить OpenBLAS
brew reinstall openblas

# Попробовать снова
npm run build:faiss:macos
```

### "Architecture not detected correctly"

Скрипт автоматически определяет:
- `uname -m` → `arm64` (Apple Silicon) или `x86_64` (Intel)

Если что-то не так, проверьте вывод:
```bash
uname -m
```

## Дополнительная информация

**Полная документация:**
- `docs/FAISS_BUILD_GUIDE.md` - подробное руководство
- `scripts/FAISS_QUICKSTART.md` - краткий гайд

**Репозиторий:**
- GitHub: https://github.com/faxenoff/ultrascript-tools-mcp

**Вопросы?**
- Создайте issue в GitHub
- Или спросите коллег с Windows/Linux - у них уже есть бинарники

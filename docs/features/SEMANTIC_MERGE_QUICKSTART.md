# Semantic Merge - Quick Start (5 минут)

## ⚡ Моментальный старт

### Вариант 1: Автоматическая установка (рекомендуется)

**Windows:**
```powershell
.\scripts\setup-merge-phase1.ps1
```

**Linux/macOS:**
```bash
chmod +x ./scripts/setup-merge-phase1.sh
./scripts/setup-merge-phase1.sh
```

### Вариант 2: Ручная установка

```bash
# 1. Создать директории
mkdir -p src/merge/{models,indexing,matching,analysis,engine,integration}
mkdir -p src/merge/{models,indexing,matching}/__tests__

# 2. Создать feature branch
git checkout -b feature/semantic-merge

# 3. Открыть в редакторе
code src/merge/
```

---

## 📚 Что дальше?

### Для быстрого старта (1 день):

1. **Прочитать** `SEMANTIC_MERGE_STEP_BY_STEP.md` - детальный план
2. **Реализовать** Phase 1 (День 1):
   - `src/merge/models/code-unit.ts` (1 час)
   - `src/merge/models/versioned-index.ts` (30 мин)
   - `src/merge/models/merge-result.ts` (30 мин)
   - `src/merge/indexing/content-normalizer.ts` (2 часа)

### Для полного понимания (2-3 часа чтения):

1. **Architecture** `SEMANTIC_MERGE_ARCHITECTURE.md` - как работает система
2. **Comparison** `SEMANTIC_MERGE_COMPARISON.md` - что берём из SharpToolsMCP
3. **Roadmap** `SEMANTIC_MERGE_ROADMAP.md` - полный plan на 20-27 дней

---

## 🎯 Phase 1 Checklist (День 1-3)

- [ ] **День 1**: Базовые модели
  - [ ] CodeUnit interface (1 час)
  - [ ] VersionedIndex model (30 мин)
  - [ ] MergeResult models (30 мин)
  - [ ] ContentNormalizer (2 часа)

- [ ] **День 2**: Normalization
  - [ ] ContentNormalizer tests (1 час)
  - [ ] StructuralNormalizer (2 часа)
  - [ ] StructuralNormalizer tests (1 час)

- [ ] **День 3**: Exports & Integration
  - [ ] Создать index.ts exports (30 мин)
  - [ ] Запустить все тесты (30 мин)
  - [ ] Commit Phase 1 (30 мин)

---

## 🧪 Тестирование

```bash
# Запустить все merge тесты
npm test -- src/merge/

# Только Phase 1 тесты
npm test -- src/merge/models/
npm test -- src/merge/indexing/

# Watch mode
npm test -- --watch src/merge/

# Проверить типы
npm run typecheck

# Lint
npm run lint
```

---

## 📊 Прогресс

| Фаза | Статус | Время |
|------|--------|-------|
| Phase 1: Foundation | ⏳ TODO | 2-3 дня |
| Phase 2: Fast Path | ⏳ TODO | 2-3 дня |
| Phase 3: Semantic | ⏳ TODO | 3-4 дня |
| Phase 4: Multi-Version | ⏳ TODO | 2-3 дня |
| Phase 5: Merge Engine | ⏳ TODO | 4-5 дней |
| Phase 6: Agent Integration | ⏳ TODO | 2-3 дня |
| Phase 7: MCP Tools | ⏳ TODO | 2-3 дня |

**Итого**: 20-27 дней для полной реализации

---

## 💡 Полезные ссылки

- 📖 **Step-by-step guide**: `SEMANTIC_MERGE_STEP_BY_STEP.md`
- 🏗️ **Architecture**: `SEMANTIC_MERGE_ARCHITECTURE.md`
- 🗺️ **Full roadmap**: `SEMANTIC_MERGE_ROADMAP.md`
- 🆚 **Comparison**: `SEMANTIC_MERGE_COMPARISON.md`
- 📂 **SharpToolsMCP source**: `D:/_mcp/SharpToolsMCP/` (для reference)

---

## 🚀 Быстрые команды

```bash
# Setup Phase 1
./scripts/setup-merge-phase1.sh  # Linux/macOS
.\scripts\setup-merge-phase1.ps1 # Windows

# Development
npm test -- --watch src/merge/   # Watch tests
npm run typecheck                # Type check
npm run lint                     # Lint

# Git workflow
git checkout -b feature/semantic-merge
git add src/merge/
git commit -m "feat(merge): Phase 1 - Foundation"
git push origin feature/semantic-merge
```

---

## 📝 Template: First commit

После завершения Phase 1, создайте первый коммит:

```bash
git add src/merge/
git commit -m "feat(merge): Phase 1 - Foundation models and normalizers

- Add CodeUnit, VersionedIndex, MergeResult models
- Add ContentNormalizer (encoding, BOM, line endings)
- Add StructuralNormalizer (AST normalization)
- Add unit tests for all components
- Fast Path foundation ready for Phase 2

Related: #<issue-number>
"
git push origin feature/semantic-merge
```

---

## ❓ FAQ

**Q: С чего начать если я новичок в проекте?**
A: Начните с `SEMANTIC_MERGE_STEP_BY_STEP.md`, там пошаговая инструкция с кодом.

**Q: Сколько времени займёт реализация?**
A: MVP (базовый merge) - 10-15 дней. Полная реализация - 20-27 дней.

**Q: Можно ли делать Phase 2 параллельно с Phase 1?**
A: Нет, Phase 2 зависит от Phase 1. Делайте последовательно.

**Q: Где посмотреть примеры кода из SharpToolsMCP?**
A: `D:/_mcp/SharpToolsMCP/SharpTools.Tools/Merge/` - полная реализация на C#.

**Q: Как тестировать на реальном коде?**
A: Создайте test fixtures в `src/merge/__tests__/fixtures/` с примерами кода.

---

**Ready?** Запустите setup скрипт и начинайте с Phase 1! 🚀

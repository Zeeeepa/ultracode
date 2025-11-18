# Semantic Merge - Пошаговый план реализации

## 🎯 Цель: Реализовать Semantic Merge за 20-27 дней

**Статус**: Готов к началу Phase 1
**Документация**: `docs/SEMANTIC_MERGE_ARCHITECTURE.md`, `docs/SEMANTIC_MERGE_ROADMAP.md`

---

## ⚡ Quick Start (День 1)

### Шаг 0: Подготовка (30 минут)

```bash
cd D:/OneDrive/_mcp/ultrascript-tools-mcp

# Создать директории
mkdir -p src/merge/{models,indexing,matching,analysis,engine,integration}
mkdir -p src/merge/{models,indexing,matching,analysis,engine}/__tests__

# Создать feature branch
git checkout -b feature/semantic-merge

# Обновить .gitignore если нужно
echo "# Semantic Merge temporary files" >> .gitignore
echo "src/merge/**/*.test.ts.snap" >> .gitignore
```

---

## 📅 PHASE 1: Foundation (День 1-3) ⭐ START HERE

### День 1: Базовые модели (4-6 часов)

#### Задача 1.1: CodeUnit model (1 час)

**Создать**: `src/merge/models/code-unit.ts`

```typescript
/**
 * Универсальная единица кода для semantic merge.
 */
export interface CodeUnit {
  // Identity
  id: string;                    // Stable ID (SHA256 от FQN)
  type: CodeUnitType;            // File, Class, Function, etc.

  // Location
  filePath: string;              // Relative path
  name: string;                  // Simple name
  fullyQualifiedName: string;    // Full namespace.class.method
  startLine: number;             // 1-based
  endLine: number;               // 1-based

  // Content
  content: string;               // Source code
  contentHash: string;           // SHA256 (Fast Path)
  structuralHash: string;        // AST hash (ignores whitespace)
  signature?: string;            // FQN + params (for functions)

  // Semantic (lazy)
  embedding?: Float32Array;      // Generated on-demand

  // Structure
  structure?: CodeStructure;     // AST metadata

  // Hierarchy
  parentId?: string;             // Parent unit ID
  childIds: string[];            // Child unit IDs

  // Metadata
  language: string;              // TypeScript, Python, etc.
  metadata: Record<string, any>; // Extra data
}

export enum CodeUnitType {
  File = 'file',
  Module = 'module',
  Class = 'class',
  Interface = 'interface',
  Function = 'function',
  Method = 'method',
  Property = 'property',
  Block = 'block',
  Statement = 'statement',
}

export interface CodeStructure {
  normalizedAst: string;         // Normalized AST
  identifiers: Set<string>;      // All identifiers
  imports: Set<string>;          // All imports
  exports: Set<string>;          // All exports
  complexityMetrics?: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    branchCount: number;
    loopCount: number;
  };
}
```

**Чеклист**:
- [ ] Создать файл
- [ ] Добавить все типы
- [ ] Экспортировать из `src/merge/models/index.ts`

---

#### Задача 1.2: VersionedIndex model (30 минут)

**Создать**: `src/merge/models/versioned-index.ts`

```typescript
import type { CodeUnit } from './code-unit.js';

/**
 * Индекс для одной версии кода (base/branchA/branchB).
 */
export interface VersionedIndex {
  // Version info
  branch: string;                // Branch name
  commit?: string;               // Git commit hash
  indexedAt: Date;               // When indexed

  // Code units
  units: Map<string, CodeUnit>;  // ID → CodeUnit

  // Lookups (для Fast Path)
  contentHashIndex: Map<string, string[]>;      // contentHash → unitIds
  structuralHashIndex: Map<string, string[]>;   // structuralHash → unitIds
  signatureIndex: Map<string, string[]>;        // signature → unitIds
  filePathIndex: Map<string, string[]>;         // filePath → unitIds

  // Statistics
  stats: {
    totalUnits: number;
    byType: Map<CodeUnitType, number>;  // Type → count
    byLanguage: Map<string, number>;    // Language → count
    byFile: Map<string, number>;        // File → count
  };
}

/**
 * Создать пустой индекс.
 */
export function createVersionedIndex(branch: string): VersionedIndex {
  return {
    branch,
    indexedAt: new Date(),
    units: new Map(),
    contentHashIndex: new Map(),
    structuralHashIndex: new Map(),
    signatureIndex: new Map(),
    filePathIndex: new Map(),
    stats: {
      totalUnits: 0,
      byType: new Map(),
      byLanguage: new Map(),
      byFile: new Map(),
    },
  };
}

/**
 * Добавить CodeUnit в индекс.
 */
export function addUnitToIndex(index: VersionedIndex, unit: CodeUnit): void {
  index.units.set(unit.id, unit);

  // Update hash indexes
  addToMultiMap(index.contentHashIndex, unit.contentHash, unit.id);
  addToMultiMap(index.structuralHashIndex, unit.structuralHash, unit.id);

  if (unit.signature) {
    addToMultiMap(index.signatureIndex, unit.signature, unit.id);
  }

  addToMultiMap(index.filePathIndex, unit.filePath, unit.id);

  // Update stats
  index.stats.totalUnits++;
  incrementMapValue(index.stats.byType, unit.type);
  incrementMapValue(index.stats.byLanguage, unit.language);
  incrementMapValue(index.stats.byFile, unit.filePath);
}

function addToMultiMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key)!.push(value);
}

function incrementMapValue<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) || 0) + 1);
}
```

**Чеклист**:
- [ ] Создать файл
- [ ] Добавить helper functions
- [ ] Экспортировать из `src/merge/models/index.ts`

---

#### Задача 1.3: MergeResult models (30 минут)

**Создать**: `src/merge/models/merge-result.ts`

```typescript
import type { CodeUnit } from './code-unit.js';

/**
 * Результат semantic merge операции.
 */
export interface MergeResult {
  // Actions to perform
  actions: MergeAction[];

  // Conflicts requiring manual resolution
  conflicts: SemanticConflict[];

  // Statistics
  statistics: MergeStatistics;

  // Metadata
  timestamp: Date;
  branches: {
    base: string;
    branchA: string;
    branchB: string;
  };
}

/**
 * Действие для выполнения merge.
 */
export interface MergeAction {
  type: MergeActionType;
  filePath: string;
  unitId: string;
  description: string;
  autoMerged: boolean;         // Может ли быть применено автоматически
  confidence: number;          // 0.0-1.0

  // Source units
  baseUnit?: CodeUnit;
  unitA?: CodeUnit;
  unitB?: CodeUnit;

  // Merged result
  mergedContent?: string;
}

export enum MergeActionType {
  Create = 'create',           // Новый код (только в A или B)
  Update = 'update',           // Изменён в одной ветке
  Delete = 'delete',           // Удалён в одной ветке
  Move = 'move',               // Перемещён (file/class change)
  Rename = 'rename',           // Переименован
  Combine = 'combine',         // Объединить изменения из обеих веток
  Conflict = 'conflict',       // Требует ручного разрешения
}

/**
 * Семантический конфликт.
 */
export interface SemanticConflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;

  // Location
  filePath: string;
  unitId: string;

  // Description
  description: string;

  // Conflicting units
  baseUnit?: CodeUnit;
  unitA: CodeUnit;
  unitB: CodeUnit;

  // Resolution suggestions
  suggestions: ResolutionSuggestion[];
}

export enum ConflictType {
  Semantic = 'semantic',           // Семантический конфликт (разная логика)
  Structural = 'structural',       // Структурный конфликт (разный AST)
  Intent = 'intent',               // Несовместимые намерения
  Signature = 'signature',         // Несовместимые signatures
  Movement = 'movement',           // Код переместился в разные места
}

export enum ConflictSeverity {
  Low = 'low',               // Можно автоматически разрешить
  Medium = 'medium',         // Нужен review
  High = 'high',             // Критично, требует ручного merge
}

export interface ResolutionSuggestion {
  priority: number;          // 1 = best suggestion
  description: string;
  strategy: ResolutionStrategy;
  previewContent?: string;   // Preview merged code
  confidence: number;        // 0.0-1.0
}

export enum ResolutionStrategy {
  KeepA = 'keep_a',              // Использовать версию из branchA
  KeepB = 'keep_b',              // Использовать версию из branchB
  CombineBoth = 'combine_both',  // Объединить обе версии
  KeepBase = 'keep_base',        // Откатить к base (discard both)
  Manual = 'manual',             // Требует ручного редактирования
}

/**
 * Статистика merge операции.
 */
export interface MergeStatistics {
  // Indexing
  totalUnits: number;
  indexedA: number;
  indexedB: number;

  // Matching
  fastPathMatches: number;
  semanticMatches: number;
  fastPathCoverage: number;    // 0.0-1.0

  // Actions
  autoMergedCount: number;
  conflictCount: number;

  // Timing
  indexingTimeMs: number;
  fastPathTimeMs: number;
  slowPathTimeMs: number;
  totalTimeMs: number;
}
```

**Чеклист**:
- [ ] Создать файл
- [ ] Добавить все enums
- [ ] Экспортировать из `src/merge/models/index.ts`

---

### День 2: ContentNormalizer (3-4 часа)

#### Задача 2.1: Основная реализация (2 часа)

**Создать**: `src/merge/indexing/content-normalizer.ts`

```typescript
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';

/**
 * Нормализует файлы перед сравнением: encoding, BOM, line endings.
 * КРИТИЧНО для корректного Fast Path matching.
 */
export class ContentNormalizer {
  /**
   * Нормализовать файл.
   */
  async normalize(filePath: string): Promise<NormalizedContent> {
    // 1. Прочитать raw bytes
    const rawBytes = await fs.readFile(filePath);

    // 2. Определить encoding и BOM
    const { encoding, hasBom } = this.detectEncoding(rawBytes);

    // 3. Декодировать в string
    let content = rawBytes.toString(encoding);

    // 4. Удалить BOM если есть (U+FEFF at start)
    if (hasBom && content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }

    // 5. Нормализовать line endings: CRLF/CR → LF
    content = this.normalizeLineEndings(content);

    // 6. Trim trailing whitespace на каждой строке
    content = this.trimTrailingWhitespace(content);

    // 7. Удалить trailing empty lines в конце файла
    content = content.replace(/\n+$/, '\n');

    return {
      content,
      originalEncoding: encoding,
      hadBom: hasBom,
    };
  }

  /**
   * Вычислить SHA256 hash контента.
   */
  computeContentHash(content: string): string {
    return createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');
  }

  /**
   * Определить encoding через BOM detection.
   */
  private detectEncoding(bytes: Buffer): { encoding: BufferEncoding; hasBom: boolean } {
    // UTF-8 BOM: EF BB BF
    if (bytes.length >= 3 &&
        bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { encoding: 'utf8', hasBom: true };
    }

    // UTF-16 LE BOM: FF FE
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { encoding: 'utf16le', hasBom: true };
    }

    // UTF-16 BE BOM: FE FF (Node.js doesn't have utf16be, use utf16le)
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { encoding: 'utf16le', hasBom: true };
    }

    // Default: UTF-8 no BOM
    return { encoding: 'utf8', hasBom: false };
  }

  /**
   * Нормализовать line endings.
   */
  private normalizeLineEndings(content: string): string {
    // CRLF → LF
    content = content.replace(/\r\n/g, '\n');
    // CR → LF
    content = content.replace(/\r/g, '\n');
    return content;
  }

  /**
   * Удалить trailing whitespace.
   */
  private trimTrailingWhitespace(content: string): string {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      lines[i] = lines[i].replace(/[ \t]+$/, '');
    }
    return lines.join('\n');
  }
}

export interface NormalizedContent {
  content: string;
  originalEncoding: string;
  hadBom: boolean;
}
```

**Чеклист**:
- [ ] Создать файл
- [ ] Реализовать все методы
- [ ] Экспортировать из `src/merge/indexing/index.ts`

---

#### Задача 2.2: Unit tests (1-2 часа)

**Создать**: `src/merge/indexing/__tests__/content-normalizer.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ContentNormalizer } from '../content-normalizer.js';

describe('ContentNormalizer', () => {
  let normalizer: ContentNormalizer;
  let tempDir: string;

  beforeEach(async () => {
    normalizer = new ContentNormalizer();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should normalize UTF-8 with BOM', async () => {
    const filePath = path.join(tempDir, 'utf8-bom.txt');
    // UTF-8 BOM + content
    const content = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    await fs.writeFile(filePath, content);

    const result = await normalizer.normalize(filePath);

    expect(result.hadBom).toBe(true);
    expect(result.content).toBe('Hello');
  });

  it('should normalize UTF-8 without BOM', async () => {
    const filePath = path.join(tempDir, 'utf8.txt');
    await fs.writeFile(filePath, 'Hello', 'utf8');

    const result = await normalizer.normalize(filePath);

    expect(result.hadBom).toBe(false);
    expect(result.content).toBe('Hello');
  });

  it('should normalize CRLF to LF', async () => {
    const filePath = path.join(tempDir, 'crlf.txt');
    await fs.writeFile(filePath, 'Line1\r\nLine2\r\nLine3');

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe('Line1\nLine2\nLine3\n');
  });

  it('should trim trailing whitespace', async () => {
    const filePath = path.join(tempDir, 'trailing.txt');
    await fs.writeFile(filePath, 'Line1  \nLine2\t\t\nLine3   ');

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe('Line1\nLine2\nLine3\n');
  });

  it('should compute same hash for normalized content', async () => {
    const file1 = path.join(tempDir, 'file1.txt');
    const file2 = path.join(tempDir, 'file2.txt');

    // Same content, different line endings
    await fs.writeFile(file1, 'Hello\r\nWorld');
    await fs.writeFile(file2, 'Hello\nWorld');

    const norm1 = await normalizer.normalize(file1);
    const norm2 = await normalizer.normalize(file2);

    const hash1 = normalizer.computeContentHash(norm1.content);
    const hash2 = normalizer.computeContentHash(norm2.content);

    expect(hash1).toBe(hash2);
  });
});
```

**Чеклист**:
- [ ] Создать тесты
- [ ] Запустить: `npm test -- src/merge/indexing/__tests__/content-normalizer.test.ts`
- [ ] Убедиться что все проходят

---

### День 3: Structural Normalizer (3-4 часа)

#### Задача 3.1: StructuralNormalizer (2 часа)

**Создать**: `src/merge/indexing/structural-normalizer.ts`

```typescript
/**
 * Нормализует AST для structural hash.
 * Игнорирует: whitespace, comments, formatting.
 * Сохраняет: structure, identifiers, control flow.
 */
export class StructuralNormalizer {
  /**
   * Нормализовать код для structural comparison.
   */
  normalizeCode(code: string, language: string): string {
    // Remove comments
    let normalized = this.removeComments(code, language);

    // Normalize whitespace
    normalized = this.normalizeWhitespace(normalized);

    // Remove trailing semicolons (optional in TS/JS)
    if (language === 'typescript' || language === 'javascript') {
      normalized = this.removeTrailingSemicolons(normalized);
    }

    return normalized.trim();
  }

  /**
   * Вычислить structural hash.
   */
  computeStructuralHash(normalizedCode: string): string {
    return createHash('sha256')
      .update(normalizedCode, 'utf8')
      .digest('hex');
  }

  /**
   * Удалить комментарии.
   */
  private removeComments(code: string, language: string): string {
    // Simple regex-based (для полного AST использовать ParserAgent)

    // C-style comments (// and /* */)
    if (language === 'typescript' || language === 'javascript' ||
        language === 'c' || language === 'cpp' || language === 'csharp' ||
        language === 'go' || language === 'rust' || language === 'java') {
      // Remove single-line comments
      code = code.replace(/\/\/.*$/gm, '');
      // Remove multi-line comments
      code = code.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    // Python comments (#)
    if (language === 'python') {
      code = code.replace(/#.*$/gm, '');
    }

    return code;
  }

  /**
   * Нормализовать whitespace.
   */
  private normalizeWhitespace(code: string): string {
    // Replace multiple spaces with single space
    code = code.replace(/[ \t]+/g, ' ');
    // Remove empty lines
    code = code.replace(/\n\s*\n/g, '\n');
    // Trim each line
    code = code.split('\n').map(line => line.trim()).join('\n');
    return code;
  }

  /**
   * Удалить trailing semicolons.
   */
  private removeTrailingSemicolons(code: string): string {
    return code.replace(/;(\s*\n)/g, '$1');
  }
}
```

**Чеклист**:
- [ ] Создать файл
- [ ] Реализовать методы
- [ ] Экспортировать из `src/merge/indexing/index.ts`

---

#### Задача 3.2: Tests + экспорты (1 час)

**Создать**: `src/merge/indexing/__tests__/structural-normalizer.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { StructuralNormalizer } from '../structural-normalizer.js';

describe('StructuralNormalizer', () => {
  let normalizer: StructuralNormalizer;

  beforeEach(() => {
    normalizer = new StructuralNormalizer();
  });

  it('should normalize TypeScript code', () => {
    const code1 = `
      // Comment
      function   foo(  x  :  number  )  {
        return   x   +   1  ;
      }
    `;

    const code2 = `
      function foo(x: number) {
        return x + 1
      }
    `;

    const norm1 = normalizer.normalizeCode(code1, 'typescript');
    const norm2 = normalizer.normalizeCode(code2, 'typescript');

    expect(norm1).toBe(norm2);
  });

  it('should compute same hash for equivalent code', () => {
    const code1 = 'function foo() { return 1; }';
    const code2 = 'function   foo  (  )   {   return   1   ;   }';

    const norm1 = normalizer.normalizeCode(code1, 'typescript');
    const norm2 = normalizer.normalizeCode(code2, 'typescript');

    const hash1 = normalizer.computeStructuralHash(norm1);
    const hash2 = normalizer.computeStructuralHash(norm2);

    expect(hash1).toBe(hash2);
  });
});
```

**Создать**: `src/merge/models/index.ts`, `src/merge/indexing/index.ts`

```typescript
// src/merge/models/index.ts
export * from './code-unit.js';
export * from './versioned-index.js';
export * from './merge-result.js';

// src/merge/indexing/index.ts
export * from './content-normalizer.js';
export * from './structural-normalizer.js';
```

**Чеклист**:
- [ ] Создать тесты
- [ ] Создать index exports
- [ ] Запустить все тесты: `npm test -- src/merge/`
- [ ] Убедиться что всё работает

---

## ✅ Phase 1 Checkpoint

После завершения Phase 1 (3 дня) у вас должно быть:

- ✅ `src/merge/models/` - все модели определены
- ✅ `src/merge/indexing/content-normalizer.ts` - работает и протестирован
- ✅ `src/merge/indexing/structural-normalizer.ts` - работает и протестирован
- ✅ Unit tests покрывают основные сценарии
- ✅ Exports настроены корректно

**Коммит**:
```bash
git add src/merge/
git commit -m "feat(merge): Phase 1 - Foundation models and normalizers"
git push origin feature/semantic-merge
```

---

## 📅 PHASE 2: Fast Path (День 4-6)

См. детальный roadmap в `SEMANTIC_MERGE_ROADMAP.md`, Phase 2

**Ключевые файлы**:
- `src/merge/matching/fast-path-matcher.ts` (главный)
- `src/merge/indexing/signature-generator.ts`
- `src/merge/matching/__tests__/fast-path-matcher.test.ts`

**Цель**: FastPathMatcher находит >90% matches через O(1) lookups

---

## 📅 PHASE 3: Semantic Matching (День 7-10)

**Ключевые файлы**:
- `src/merge/matching/semantic-matcher.ts`
- `src/merge/matching/movement-detector.ts`
- `src/merge/indexing/lazy-embedding-cache.ts`

**Цель**: Slow Path находит перемещённый/рефакторенный код

---

## 📅 PHASE 4-7: См. полный roadmap

Детальные задачи для каждой фазы в `SEMANTIC_MERGE_ROADMAP.md`:
- Phase 4: Multi-Version Indexing (День 11-13)
- Phase 5: Merge Engine (День 14-18) ⭐ CORE
- Phase 6: MergeAgent Integration (День 19-21)
- Phase 7: MCP Tools (День 22-24)

---

## 🚀 Быстрые команды

```bash
# Создать все директории
npm run setup:merge-dirs

# Запустить тесты для merge
npm test -- src/merge/

# Запустить только Phase 1 тесты
npm test -- src/merge/models/
npm test -- src/merge/indexing/

# Watch mode для разработки
npm test -- --watch src/merge/

# Проверить типы
npm run typecheck

# Lint
npm run lint
```

---

## 📊 Progress Tracking

| Phase | Задачи | Статус | Дни |
|-------|--------|--------|-----|
| **Phase 1** | Foundation | ⏳ TODO | 1-3 |
| Phase 2 | Fast Path | ⏳ TODO | 4-6 |
| Phase 3 | Semantic | ⏳ TODO | 7-10 |
| Phase 4 | Multi-Version | ⏳ TODO | 11-13 |
| Phase 5 | Merge Engine | ⏳ TODO | 14-18 |
| Phase 6 | Agent Integration | ⏳ TODO | 19-21 |
| Phase 7 | MCP Tools | ⏳ TODO | 22-24 |

**Update этот файл** по мере прогресса!

---

## 💡 Tips

1. **Начните с Phase 1** - она критична для всего остального
2. **Пишите тесты сразу** - они помогут найти баги раньше
3. **Коммитьте часто** - маленькие коммиты проще review
4. **Используйте TS strict mode** - поможет избежать ошибок
5. **Тестируйте на реальном коде** - создайте test fixtures

---

**Вопросы?** См. полную документацию:
- `docs/SEMANTIC_MERGE_ARCHITECTURE.md` - техническая архитектура
- `docs/SEMANTIC_MERGE_ROADMAP.md` - детальный roadmap
- `docs/SEMANTIC_MERGE_COMPARISON.md` - сравнение с SharpToolsMCP

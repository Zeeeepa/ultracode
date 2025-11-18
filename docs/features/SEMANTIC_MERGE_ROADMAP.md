# Semantic Merge - Implementation Roadmap

## 🎯 Цель

Реализовать систему интеллектуального слияния Git-веток с использованием semantic analysis для ultrascript-tools-mcp проекта.

## 📋 Quick Summary

**Что делаем**: Добавляем возможность semantic merge в MCP сервер
**Зачем**: Уменьшить конфликты при merge на 50-70%, автоматически находить перемещённый код
**Как**: Hybrid подход Fast Path (90%, hash matching) + Slow Path (10%, embeddings)
**Когда**: ~20-27 дней полной реализации

## 🏗️ Архитектура (кратко)

```
Layer 0: NORMALIZATION
  └─ ContentNormalizer (UTF-8, LF, no BOM)

Layer 1: FAST PATH (90%)
  └─ FastPathMatcher (hash/signature - O(1))

Layer 2: SLOW PATH (10%)
  └─ SemanticMatcher (embeddings + GPU)

Layer 3: MERGE
  └─ ThreeWayMerger (intent-based merging)
```

## 📅 Implementation Phases

### Phase 1: Foundation (2-3 дня) ⭐ START HERE

**Priority**: CRITICAL
**Цель**: Базовые модели и нормализация

#### Tasks
1. [ ] Create `src/merge/` directory structure
   ```bash
   mkdir -p src/merge/{models,indexing,matching,analysis,engine,integration}
   ```

2. [ ] Implement models (`src/merge/models/`)
   - [ ] `code-unit.ts` - универсальная единица кода
   - [ ] `versioned-index.ts` - индекс для версии
   - [ ] `merge-result.ts` - результат merge
   - [ ] `semantic-conflict.ts` - конфликт
   - [ ] `change-intent.ts` - намерение изменения

3. [ ] Implement `ContentNormalizer` (`src/merge/indexing/content-normalizer.ts`)
   - [ ] BOM detection (UTF-8, UTF-16)
   - [ ] Line endings normalization (CRLF/CR → LF)
   - [ ] Trailing whitespace trimming
   - [ ] Content hash computation (SHA256)

4. [ ] Unit tests
   - [ ] Test UTF-8 with BOM vs without
   - [ ] Test CRLF vs LF
   - [ ] Test hash stability

**Deliverable**: `ContentNormalizer` готов и протестирован

**Test command**:
```bash
npm test -- src/merge/indexing/__tests__/content-normalizer.test.ts
```

---

### Phase 2: Fast Path (2-3 дня)

**Priority**: HIGH
**Цель**: O(1) matching через hashes

#### Tasks
1. [ ] Implement `StructuralNormalizer` (`src/merge/indexing/structural-normalizer.ts`)
   - [ ] AST normalization (remove comments/whitespace)
   - [ ] Structural hash computation
   - [ ] Integration с `ParserAgent`

2. [ ] Implement `SignatureGenerator` (`src/merge/indexing/signature-generator.ts`)
   - [ ] FQN + parameters для functions
   - [ ] Type signatures для classes
   - [ ] Export signatures для modules

3. [ ] Implement `FastPathMatcher` (`src/merge/matching/fast-path-matcher.ts`)
   - [ ] 4 levels: ExactContent, Structural, Signature, ID
   - [ ] Bulk matching с O(1) lookups
   - [ ] Statistics collection

4. [ ] Benchmarks
   - [ ] Измерить Fast Path coverage (target >90%)
   - [ ] Измерить performance (target O(1) per unit)

**Deliverable**: FastPathMatcher находит >90% matches

**Test command**:
```bash
npm run benchmark -- fast-path
```

---

### Phase 3: Semantic Matching (3-4 дня)

**Priority**: HIGH
**Цель**: Slow Path через embeddings + GPU

#### Tasks
1. [ ] Implement `SemanticMatcher` (`src/merge/matching/semantic-matcher.ts`)
   - [ ] Integration с `SemanticAgent`
   - [ ] Vector similarity search через `VectorStore`
   - [ ] GPU acceleration (CUDA/WASM backend)
   - [ ] Combined score (vector 70% + structural 30%)

2. [ ] Implement `LazyEmbeddingCache` (`src/merge/indexing/lazy-embedding-cache.ts`)
   - [ ] Cache на диске (SQLite)
   - [ ] Генерация только для unmatched
   - [ ] Batch generation для эффективности

3. [ ] Implement `MovementDetector` (`src/merge/matching/movement-detector.ts`)
   - [ ] File moves detection
   - [ ] Class moves detection
   - [ ] Function moves detection

4. [ ] Integration tests
   - [ ] Test renamed file detection
   - [ ] Test moved function detection
   - [ ] Test refactored class detection

**Deliverable**: Semantic matching находит перемещённый код

**Test command**:
```bash
npm test -- src/merge/matching/__tests__/semantic-matcher.test.ts
```

---

### Phase 4: Multi-Version Indexing (2-3 дня)

**Priority**: MEDIUM
**Цель**: Индексация base + branchA + branchB

#### Tasks
1. [ ] Implement `MultiVersionIndexer` (`src/merge/indexing/multi-version-indexer.ts`)
   - [ ] Integration с `BranchManager`
   - [ ] Parallel indexing (3 ветки одновременно)
   - [ ] Incremental updates (только changed files)
   - [ ] Index caching на диск

2. [ ] Git integration (`src/merge/integration/git-integration.ts`)
   - [ ] Checkout веток
   - [ ] Detect changed files между ветками
   - [ ] Restore original branch после index

3. [ ] Tests
   - [ ] Test indexing 3 branches
   - [ ] Test incremental updates
   - [ ] Test cache loading

**Deliverable**: Можем индексировать 3 ветки параллельно

**Test command**:
```bash
npm test -- src/merge/indexing/__tests__/multi-version-indexer.test.ts
```

---

### Phase 5: Merge Engine (4-5 дней) ⭐ CORE LOGIC

**Priority**: CRITICAL
**Цель**: 3-way merge algorithm

#### Tasks
1. [ ] Implement `IntentClassifier` (`src/merge/analysis/intent-classifier.ts`)
   - [ ] BugFix detection (added try-catch, validation)
   - [ ] Refactoring detection (CFG preserved)
   - [ ] FeatureAddition detection (new methods/classes)
   - [ ] APIChange detection (signature changed)

2. [ ] Implement `ConflictDetector` (`src/merge/analysis/conflict-detector.ts`)
   - [ ] Overlapping changes detection
   - [ ] Intent compatibility check
   - [ ] Severity classification

3. [ ] Implement `ThreeWayMerger` (`src/merge/engine/three-way-merger.ts`)
   - [ ] Phase 1: Fast Path matching
   - [ ] Phase 2: Semantic matching
   - [ ] Phase 3: Intent classification
   - [ ] Phase 4: Conflict detection
   - [ ] Phase 5: Merge action generation

4. [ ] Implement `ConflictResolver` (`src/merge/engine/conflict-resolver.ts`)
   - [ ] Generate resolution suggestions
   - [ ] Confidence scoring
   - [ ] Preview merged code

5. [ ] Integration tests
   - [ ] Test auto-merge compatible changes
   - [ ] Test conflict detection
   - [ ] Test suggestion quality

**Deliverable**: Working 3-way merge algorithm

**Test command**:
```bash
npm test -- src/merge/engine/__tests__/three-way-merger.test.ts
```

---

### Phase 6: MergeAgent Integration (2-3 дня)

**Priority**: MEDIUM
**Цель**: Интеграция с multi-agent architecture

#### Tasks
1. [ ] Implement `MergeAgent` (`src/agents/merge-agent.ts`)
   - [ ] Extends `BaseAgent`
   - [ ] Lifecycle management
   - [ ] Error handling
   - [ ] Metrics collection

2. [ ] Register in DI (`src/core/agent-registry.ts`)
   ```typescript
   import { MergeAgent } from '../agents/merge-agent';

   export enum AgentType {
     // ...
     MERGE = 'merge',
   }

   export async function registerAllAgents(container: DIContainer) {
     // ...
     container.registerSingleton(
       AgentType.MERGE,
       () => new MergeAgent(conductor, config.merge),
     );
   }
   ```

3. [ ] KnowledgeBus integration
   - [ ] Publish `merge.started` event
   - [ ] Publish `merge.completed` event
   - [ ] Publish `merge.conflict_detected` event

4. [ ] Tests
   - [ ] Test agent lifecycle
   - [ ] Test event publishing
   - [ ] Test metrics

**Deliverable**: MergeAgent доступен через ConductorOrchestrator

**Test command**:
```bash
npm test -- src/agents/__tests__/merge-agent.test.ts
```

---

### Phase 7: MCP Tools (2-3 дня)

**Priority**: HIGH
**Цель**: API для использования в Claude Code

#### Tasks
1. [ ] Add MCP tools to `src/index.ts`:
   - [ ] `semantic_merge` - выполнить merge
   - [ ] `analyze_merge_conflicts` - проанализировать конфликты
   - [ ] `resolve_conflict` - разрешить конфликт
   - [ ] `get_merge_suggestions` - получить AI suggestions

2. [ ] Implement tools (`src/tools/semantic-merge-tools.ts`)
   ```typescript
   export async function handleSemanticMerge(
     args: SemanticMergeArgs,
     conductor: ConductorOrchestrator,
   ): Promise<MergeResult> {
     const mergeAgent = conductor.getAgent<MergeAgent>(AgentType.MERGE);
     return await mergeAgent.performSemanticMerge(
       args.baseBranch,
       args.branchA,
       args.branchB,
       args.options,
     );
   }
   ```

3. [ ] Add to MCP tool list in `src/index.ts`:
   ```typescript
   {
     name: 'semantic_merge',
     description: 'Perform semantic merge of branches using AI',
     inputSchema: { /* ... */ },
   }
   ```

4. [ ] Documentation
   - [ ] Update README.md
   - [ ] Add examples
   - [ ] Add troubleshooting guide

5. [ ] Integration tests
   - [ ] Test каждый MCP tool
   - [ ] Test error scenarios
   - [ ] Test large projects

**Deliverable**: Semantic merge работает через MCP API

**Test command**:
```bash
npm test -- src/tools/__tests__/semantic-merge-tools.test.ts
```

---

## 🚀 Quick Start (Phase 1)

### Step 1: Create directory structure

```bash
cd D:/OneDrive/_mcp/ultrascript-tools-mcp
mkdir -p src/merge/{models,indexing,matching,analysis,engine,integration}
mkdir -p src/merge/{models,indexing,matching,analysis,engine}/__tests__
```

### Step 2: Create base models

```bash
# Create CodeUnit model
cat > src/merge/models/code-unit.ts << 'EOF'
/**
 * Универсальная единица кода для semantic merge.
 */
export interface CodeUnit {
  id: string;                     // Stable ID (SHA256 of FQN)
  type: CodeUnitType;             // File, Class, Function, etc.
  filePath: string;               // Relative path
  name: string;                   // Simple name
  fullyQualifiedName: string;     // Full path
  startLine: number;              // 1-based
  endLine: number;                // 1-based
  content: string;                // Source code
  contentHash: string;            // SHA256 (Fast Path)
  structuralHash: string;         // AST hash
  signature?: string;             // FQN + params
  embedding?: Float32Array;       // Lazy generated
  language: string;               // Language
  parentId?: string;              // Parent unit ID
  childIds: string[];             // Child unit IDs
  metadata: Record<string, any>;  // Extra data
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
}
EOF
```

### Step 3: Create ContentNormalizer

```bash
cat > src/merge/indexing/content-normalizer.ts << 'EOF'
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';

export class ContentNormalizer {
  async normalize(filePath: string): Promise<NormalizedContent> {
    const rawBytes = await fs.readFile(filePath);
    const { encoding, hasBom } = this.detectEncoding(rawBytes);

    let content = rawBytes.toString(encoding);
    if (hasBom && content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }

    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    return {
      content,
      originalEncoding: encoding,
      hadBom: hasBom,
    };
  }

  computeContentHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private detectEncoding(bytes: Buffer): { encoding: BufferEncoding; hasBom: boolean } {
    // UTF-8 BOM
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { encoding: 'utf8', hasBom: true };
    }
    return { encoding: 'utf8', hasBom: false };
  }
}

export interface NormalizedContent {
  content: string;
  originalEncoding: string;
  hadBom: boolean;
}
EOF
```

### Step 4: Run tests

```bash
npm test -- src/merge/
```

---

## 📊 Success Metrics

### Coverage
- [ ] Fast Path coverage >90%
- [ ] Semantic matching accuracy >80%
- [ ] Auto-merge rate >60%

### Performance
- [ ] Indexing: <10 sec per 1000 methods
- [ ] Fast Path: O(1) per unit
- [ ] Slow Path: <50ms per embedding (TEI)
- [ ] Total merge: <30 sec for 100K LOC

### Quality
- [ ] False positive conflicts <5%
- [ ] Missed conflicts <2%
- [ ] Suggestion relevance >85%

---

## 🎯 Приоритеты

### Must Have (MVP)
1. ✅ ContentNormalizer
2. ✅ FastPathMatcher
3. ✅ ThreeWayMerger (basic)
4. ✅ semantic_merge MCP tool

### Should Have
1. ✅ SemanticMatcher (embeddings)
2. ✅ IntentClassifier
3. ✅ MovementDetector
4. ✅ Multi-version indexing

### Nice to Have
1. ⏳ ConflictResolver (AI suggestions)
2. ⏳ GPU acceleration optimization
3. ⏳ Incremental indexing
4. ⏳ Visual conflict diff

---

## 🔗 Dependencies

### Existing (Ready to Use ✅)
- Multi-agent architecture
- SemanticAgent + EmbeddingGenerator
- VectorStore + sqlite-vec
- ParserAgent (10 languages)
- BranchManager + GitWatcher
- GPU backends (CUDA, WASM, WebGPU)

### New (To Implement 🆕)
- MergeAgent
- CodeUnit model
- FastPathMatcher
- ContentNormalizer
- ThreeWayMerger
- MCP tools

---

## 📝 Next Steps

1. **Read documentation**: `docs/SEMANTIC_MERGE_ARCHITECTURE.md`
2. **Start Phase 1**: Create directory structure
3. **Implement models**: CodeUnit, VersionedIndex, etc.
4. **Implement ContentNormalizer**: Encoding, BOM, line endings
5. **Write tests**: Ensure correctness

**Estimated Timeline**: 20-27 days for full implementation
**MVP Timeline**: 10-15 days for basic functionality

---

**Questions?** См. полную документацию в `SEMANTIC_MERGE_ARCHITECTURE.md`

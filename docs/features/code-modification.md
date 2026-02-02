# План реализации функций модификации кода и расширенного анализа

**Дата создания:** 2025-01-17
**Версия:** 1.0
**Статус:** Черновик для утверждения

## Содержание

1. [Обзор](#обзор)
2. [Архитектурные принципы](#архитектурные-принципы)
3. [Технические требования](#технические-требования)
4. [Функция 1: Code Modification API](#функция-1-code-modification-api)
5. [Функция 2: Version Manager](#функция-2-version-manager)
6. [Функция 3: PreviewChanges](#функция-3-previewchanges)
7. [Функция 4: File Operations](#функция-4-file-operations)
8. [Функция 5: Technology Detection](#функция-5-technology-detection)
9. [Функция 6: Code Validator](#функция-6-code-validator)
10. [Функция 7: Pattern-based Search](#функция-7-pattern-based-search)
11. [Интеграция с существующими системами](#интеграция-с-существующими-системами)
12. [План реализации (Phases)](#план-реализации-phases)
13. [Метрики производительности](#метрики-производительности)

---

## Обзор

Данный документ описывает план реализации 7 новых функций для **ultrascript-tools-mcp**, расширяющих возможности сервера за пределы анализа кода в сторону его модификации, валидации и контроля версий.

**Цель:** Предоставить LLM-агентам безопасный, производительный и прозрачный способ модификации кодовой базы с автоматическим обновлением индексов, embeddings и валидацией.

**Ключевые приоритеты:**
- ✅ Безопасность (предпросмотр всех изменений)
- ✅ Производительность (SIMD, streaming, xxHash)
- ✅ Консистентность (автообновление embeddings)
- ✅ Совместимость с существующей инфраструктурой (layered indexing, branch manager)

---

## Архитектурные принципы

### 1. **Memory-Efficient Streaming**
Все операции с большими объёмами данных должны использовать streaming/pipelines вместо загрузки в память:
- Чтение файлов: `fs.createReadStream()` с `pipeline()`
- Парсинг: Incremental parsing с батчированием
- Векторные операции: Обработка по частям (chunks)

### 2. **SIMD-Accelerated Operations**
Использование SIMD-инструкций для ускорения:
- Векторные операции (сравнение, нормализация)
- Хеширование (xxHash уже поддерживает SIMD)
- Текстовые операции (pattern matching, diff)

**Реализация:**
- WASM-модули для cross-platform SIMD (WebAssembly SIMD)
- Native addons для Node.js (N-API) для максимальной производительности
- Fallback на JS-реализацию для совместимости

### 3. **xxHash для всех операций хеширования**
Уже используется в `graph-storage.ts` и `incremental-parser.ts`. Расширяем использование:
- Хеширование file content для change detection
- Хеширование embeddings для delta compression
- Хеширование pattern search queries

**Преимущества:**
- 10-15x быстрее SHA-256
- SIMD-оптимизирован
- Детерминированный (stable hashing)

### 4. **Embedding-Aware Architecture**
Все операции модификации кода должны учитывать embeddings:
- При изменении entity → пересчёт embedding только для изменённой entity
- При добавлении entity → создание нового embedding
- При удалении entity → удаление из vector store
- Incremental update вместо full reindex

---

## Технические требования

### Производительность

| Метрика | Требование | Реализация |
|---------|-----------|-----------|
| Batch processing | ≥50 files/batch | Существует в `semantic-agent.ts` |
| Stream processing | Используется для файлов >1MB | `fs.createReadStream()` + `pipeline()` |
| SIMD operations | Для vector ops, hashing, diff | WASM + Native addons |
| Memory usage | <200MB для 10K files | LRU cache + streaming |
| Embedding update | <500ms для single entity | Incremental только для изменённых |

### Совместимость

- ✅ Интеграция с `LayeredIndexManager` (Layer 0, 1, 2)
- ✅ Работа с `BranchManager` (git worktree aware)
- ✅ Обновление `GraphStorage` и `VectorStore`
- ✅ Поддержка всех языков из tree-sitter парсеров

### Безопасность

- ✅ Все деструктивные операции требуют `preview: true` по умолчанию
- ✅ Version Manager создаёт snapshots перед изменениями
- ✅ Rollback capability через git или `.backup/`
- ✅ Code Validator запускается автоматически после изменений

---

## Функция 1: Code Modification API

### Описание
Замена кода по сущностям (entity-based code replacement) с автоматическим обновлением embeddings и графа зависимостей.

### Use Cases
1. **Refactoring** - переименование функций/классов по всему проекту
2. **Bug fixing** - замена реализации метода с сохранением сигнатуры
3. **Pattern replacement** - замена всех использований `var` на `const/let`

### Архитектура

```typescript
// src/modification/code-modifier.ts

export interface CodeModificationRequest {
  entityId: string;              // ID сущности из graph
  newCode: string;               // Новый код для замены
  preserveComments?: boolean;    // Сохранить комментарии
  updateImports?: boolean;       // Обновить imports если изменилась сигнатура
  preview?: boolean;             // Предпросмотр (default: true)
}

export interface CodeModificationResult {
  success: boolean;
  filesModified: string[];
  entitiesUpdated: string[];
  embeddingsUpdated: number;
  relationshipsUpdated: number;
  preview?: DiffPreview;         // Если preview: true
  validationReport?: ValidationReport; // Авто-валидация
}

export class CodeModifier {
  constructor(
    private graphStorage: GraphStorage,
    private vectorStore: VectorStore,
    private versionManager: VersionManager,
    private validator: CodeValidator
  ) {}

  async modifyEntity(request: CodeModificationRequest): Promise<CodeModificationResult> {
    // Phase 1: Создание snapshot (Version Manager)
    const snapshotId = await this.versionManager.createSnapshot(
      `code-modification-${request.entityId}`
    );

    try {
      // Phase 2: Получение entity из graph
      const entity = await this.graphStorage.getEntity(request.entityId);
      if (!entity) throw new Error(`Entity ${request.entityId} not found`);

      // Phase 3: Preview (если enabled)
      if (request.preview !== false) {
        const preview = await this.generatePreview(entity, request.newCode);
        return { success: true, preview, filesModified: [], entitiesUpdated: [], embeddingsUpdated: 0, relationshipsUpdated: 0 };
      }

      // Phase 4: Валидация перед изменением
      const beforeValidation = await this.validator.validateFile(entity.filePath);

      // Phase 5: Модификация файла (streaming для больших файлов)
      const modified = await this.replaceEntityCode(entity, request.newCode);

      // Phase 6: Обновление entity в graph (incremental)
      await this.updateEntityInGraph(entity, request.newCode);

      // Phase 7: Обновление embedding (только для изменённой entity)
      const embeddingUpdated = await this.updateEntityEmbedding(entity, request.newCode);

      // Phase 8: Обновление relationships (если изменилась сигнатура)
      const relationshipsUpdated = request.updateImports
        ? await this.updateRelationships(entity)
        : 0;

      // Phase 9: Валидация после изменения
      const afterValidation = await this.validator.validateFile(entity.filePath);

      return {
        success: true,
        filesModified: [entity.filePath],
        entitiesUpdated: [entity.id],
        embeddingsUpdated: embeddingUpdated ? 1 : 0,
        relationshipsUpdated,
        validationReport: {
          before: beforeValidation,
          after: afterValidation
        }
      };
    } catch (error) {
      // Rollback через Version Manager
      await this.versionManager.rollback(snapshotId);
      throw error;
    }
  }

  // Streaming-based replacement для больших файлов
  private async replaceEntityCode(entity: Entity, newCode: string): Promise<void> {
    const filePath = entity.filePath;
    const { start, end } = entity.location;

    // Для файлов <1MB - в память, для >1MB - streaming
    const fileStats = await fs.stat(filePath);

    if (fileStats.size < 1024 * 1024) {
      // Small file - in-memory replacement
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const before = lines.slice(0, start.line - 1).join('\n');
      const after = lines.slice(end.line).join('\n');
      const updated = `${before}\n${newCode}\n${after}`;
      await fs.writeFile(filePath, updated, 'utf-8');
    } else {
      // Large file - streaming replacement
      await this.streamingReplacement(filePath, start.line, end.line, newCode);
    }
  }

  private async streamingReplacement(
    filePath: string,
    startLine: number,
    endLine: number,
    newCode: string
  ): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    const readStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const writeStream = fs.createWriteStream(tempPath, { encoding: 'utf-8' });

    let currentLine = 0;
    let replaced = false;

    await pipeline(
      readStream,
      new Transform({
        transform(chunk: string, encoding, callback) {
          const lines = chunk.split('\n');
          for (const line of lines) {
            currentLine++;
            if (currentLine < startLine || currentLine > endLine) {
              this.push(line + '\n');
            } else if (!replaced) {
              this.push(newCode + '\n');
              replaced = true;
            }
          }
          callback();
        }
      }),
      writeStream
    );

    // Replace original with temp
    await fs.rename(tempPath, filePath);
  }

  // Incremental embedding update (только изменённая entity)
  private async updateEntityEmbedding(entity: Entity, newCode: string): Promise<boolean> {
    const { CommentExtractor } = await import("../utils/comment-extractor.js");

    // Extract comments for enhanced embedding
    const fileContent = await fs.readFile(entity.filePath, 'utf-8');
    const commentsResult = CommentExtractor.extractComments(fileContent, entity.filePath);
    const associations = CommentExtractor.associateCommentsWithEntities(
      commentsResult.comments,
      [entity as any],
      commentsResult.leadingComments
    );

    const entityComments = associations.get(entity.id) || [];
    const enhancedContent = CommentExtractor.enhanceEntityContentWithComments(
      newCode,
      `${entity.type} ${entity.name}`,
      entityComments
    );

    // Update only this entity's embedding in vector store
    await this.vectorStore.updateEmbedding(entity.id, enhancedContent);
    return true;
  }
}
```

### MCP Tool Schema

```typescript
const ModifyCodeSchema = z.object({
  entityId: z.string().describe("Entity ID from graph"),
  newCode: z.string().describe("New code to replace entity"),
  preserveComments: z.boolean().optional().default(true),
  updateImports: z.boolean().optional().default(false),
  preview: z.boolean().optional().default(true).describe("Show preview before applying"),
});
```

### Performance Considerations

- **SIMD для diff**: Используется для быстрого вычисления diff между old и new code
- **xxHash для change detection**: Хеширование старого/нового кода для быстрой проверки изменений
- **Streaming для больших файлов**: Файлы >1MB обрабатываются через stream pipeline
- **Incremental embedding update**: Обновляется только embedding изменённой entity (не весь файл)

### Integration Points

1. **LayeredIndexManager** - обновление Layer 2 (working delta) при изменении
2. **VectorStore** - инкрементальное обновление embeddings
3. **GraphStorage** - обновление entity metadata и hash
4. **VersionManager** - создание snapshot перед изменением

---

## Функция 2: Version Manager

### Описание
Управление версиями с автоматическим выбором backend:
- **Git worktree** - для репозиториев с git
- **.backup/** - для проектов без git

### Архитектура

```typescript
// src/versioning/version-manager.ts

export interface SnapshotMetadata {
  id: string;
  timestamp: number;
  description: string;
  backend: 'git-worktree' | 'backup';
  filesAffected: string[];
  totalSizeBytes: number;
  hash: string; // xxHash of snapshot content
}

export class VersionManager {
  constructor(
    private workingDirectory: string,
    private backupDir: string = '.backup'
  ) {}

  async initialize(): Promise<void> {
    // Detect if git is available
    const hasGit = await this.detectGit();
    console.log(`[VersionManager] Backend: ${hasGit ? 'git-worktree' : 'backup'}`);
  }

  async createSnapshot(description: string, files?: string[]): Promise<string> {
    const hasGit = await this.detectGit();

    if (hasGit) {
      return this.createGitSnapshot(description, files);
    } else {
      return this.createBackupSnapshot(description, files);
    }
  }

  // Git Worktree Implementation
  private async createGitSnapshot(description: string, files?: string[]): Promise<string> {
    const timestamp = Date.now();
    const snapshotId = `snapshot-${timestamp}`;
    const worktreePath = join(this.workingDirectory, '.git', 'worktrees', snapshotId);

    // Create a stash or commit for snapshot
    try {
      // Option 1: Stash (для uncommitted changes)
      execSync('git stash push -m "' + description + '"', {
        cwd: this.workingDirectory,
        encoding: 'utf-8'
      });

      const stashRef = execSync('git rev-parse stash@{0}', {
        cwd: this.workingDirectory,
        encoding: 'utf-8'
      }).trim();

      // Save metadata
      const metadata: SnapshotMetadata = {
        id: snapshotId,
        timestamp,
        description,
        backend: 'git-worktree',
        filesAffected: files || [],
        totalSizeBytes: 0,
        hash: stashRef
      };

      await this.saveMetadata(snapshotId, metadata);
      return snapshotId;
    } catch (error) {
      throw new Error(`Failed to create git snapshot: ${error}`);
    }
  }

  // Backup Directory Implementation
  private async createBackupSnapshot(description: string, files?: string[]): Promise<string> {
    const timestamp = Date.now();
    const snapshotId = `snapshot-${timestamp}`;
    const snapshotDir = join(this.backupDir, snapshotId);

    await fs.mkdir(snapshotDir, { recursive: true });

    // Determine files to backup
    const filesToBackup = files || await this.getAllTrackedFiles();
    let totalSize = 0;

    // Streaming copy for large files
    for (const file of filesToBackup) {
      const sourcePath = join(this.workingDirectory, file);
      const targetPath = join(snapshotDir, file);

      // Create parent directories
      await fs.mkdir(dirname(targetPath), { recursive: true });

      // Stream copy
      const stats = await fs.stat(sourcePath);
      totalSize += stats.size;

      await pipeline(
        fs.createReadStream(sourcePath),
        fs.createWriteStream(targetPath)
      );
    }

    // Compute xxHash of snapshot for integrity
    const xxhashInstance = await xxhash();
    const hash = xxhashInstance.h64ToString(snapshotId + timestamp.toString());

    const metadata: SnapshotMetadata = {
      id: snapshotId,
      timestamp,
      description,
      backend: 'backup',
      filesAffected: filesToBackup,
      totalSizeBytes: totalSize,
      hash
    };

    await this.saveMetadata(snapshotId, metadata);
    return snapshotId;
  }

  async rollback(snapshotId: string): Promise<void> {
    const metadata = await this.loadMetadata(snapshotId);

    if (metadata.backend === 'git-worktree') {
      await this.rollbackGit(metadata);
    } else {
      await this.rollbackBackup(metadata);
    }
  }

  private async rollbackGit(metadata: SnapshotMetadata): Promise<void> {
    // Apply stash
    execSync(`git stash apply ${metadata.hash}`, {
      cwd: this.workingDirectory,
      encoding: 'utf-8'
    });
  }

  private async rollbackBackup(metadata: SnapshotMetadata): Promise<void> {
    const snapshotDir = join(this.backupDir, metadata.id);

    // Restore files from backup (streaming for large files)
    for (const file of metadata.filesAffected) {
      const sourcePath = join(snapshotDir, file);
      const targetPath = join(this.workingDirectory, file);

      await pipeline(
        fs.createReadStream(sourcePath),
        fs.createWriteStream(targetPath)
      );
    }
  }

  async listSnapshots(): Promise<SnapshotMetadata[]> {
    const metadataDir = join(this.backupDir, 'metadata');
    if (!existsSync(metadataDir)) return [];

    const files = await fs.readdir(metadataDir);
    const snapshots: SnapshotMetadata[] = [];

    for (const file of files) {
      const metadata = await this.loadMetadata(file.replace('.json', ''));
      snapshots.push(metadata);
    }

    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  }

  async cleanup(olderThan: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const snapshots = await this.listSnapshots();
    const now = Date.now();
    let deletedCount = 0;

    for (const snapshot of snapshots) {
      if (now - snapshot.timestamp > olderThan) {
        await this.deleteSnapshot(snapshot.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  private async detectGit(): Promise<boolean> {
    try {
      const gitDir = join(this.workingDirectory, '.git');
      return existsSync(gitDir);
    } catch {
      return false;
    }
  }

  private async saveMetadata(snapshotId: string, metadata: SnapshotMetadata): Promise<void> {
    const metadataDir = join(this.backupDir, 'metadata');
    await fs.mkdir(metadataDir, { recursive: true });
    const metadataPath = join(metadataDir, `${snapshotId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  private async loadMetadata(snapshotId: string): Promise<SnapshotMetadata> {
    const metadataPath = join(this.backupDir, 'metadata', `${snapshotId}.json`);
    const data = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(data);
  }

  private async deleteSnapshot(snapshotId: string): Promise<void> {
    const metadata = await this.loadMetadata(snapshotId);

    if (metadata.backend === 'backup') {
      const snapshotDir = join(this.backupDir, snapshotId);
      await fs.rm(snapshotDir, { recursive: true, force: true });
    }
    // Git snapshots (stashes) handled separately

    // Delete metadata
    const metadataPath = join(this.backupDir, 'metadata', `${snapshotId}.json`);
    await fs.unlink(metadataPath);
  }

  private async getAllTrackedFiles(): Promise<string[]> {
    // Get all files in working directory (exclude node_modules, .git, etc.)
    const excludePatterns = ['node_modules', '.git', 'dist', 'build', '.backup'];
    // Implementation omitted for brevity
    return [];
  }
}
```

### MCP Tool Schemas

```typescript
const CreateSnapshotSchema = z.object({
  description: z.string(),
  files: z.array(z.string()).optional().describe("Specific files to snapshot (default: all)")
});

const RollbackSchema = z.object({
  snapshotId: z.string().describe("Snapshot ID to rollback to")
});

const ListSnapshotsSchema = z.object({
  limit: z.number().optional().default(10)
});

const CleanupSnapshotsSchema = z.object({
  olderThanDays: z.number().optional().default(7)
});
```

### Performance Considerations

- **Streaming copy**: Все файлы копируются через `pipeline()` для минимизации памяти
- **xxHash для integrity**: Вычисление hash snapshot для проверки целостности
- **LRU cleanup**: Автоматическое удаление старых snapshots по LRU

---

## Функция 3: PreviewChanges

### Описание
Универсальный механизм предпросмотра для всех деструктивных операций.

### Архитектура

```typescript
// src/modification/preview-manager.ts

export interface DiffPreview {
  operation: string;
  filesAffected: string[];
  changes: FileDiff[];
  stats: {
    additions: number;
    deletions: number;
    modifications: number;
  };
  estimatedImpact: {
    entitiesAffected: number;
    embeddingsToUpdate: number;
    relationshipsAffected: number;
  };
}

export interface FileDiff {
  path: string;
  before: string;
  after: string;
  diff: string; // unified diff format
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export class PreviewManager {
  constructor(
    private graphStorage: GraphStorage,
    private vectorStore: VectorStore
  ) {}

  async previewCodeModification(
    entityId: string,
    newCode: string
  ): Promise<DiffPreview> {
    const entity = await this.graphStorage.getEntity(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);

    // Read current file content
    const currentContent = await fs.readFile(entity.filePath, 'utf-8');
    const lines = currentContent.split('\n');

    // Extract current entity code
    const oldCode = lines.slice(entity.location.start.line - 1, entity.location.end.line).join('\n');

    // Generate diff (SIMD-accelerated LCS algorithm)
    const diff = await this.computeDiff(oldCode, newCode);

    // Estimate impact
    const impact = await this.estimateImpact(entity, newCode);

    return {
      operation: 'code-modification',
      filesAffected: [entity.filePath],
      changes: [{
        path: entity.filePath,
        before: oldCode,
        after: newCode,
        diff,
        hunks: this.parseDiffHunks(diff)
      }],
      stats: {
        additions: newCode.split('\n').length - oldCode.split('\n').length,
        deletions: 0,
        modifications: 1
      },
      estimatedImpact: impact
    };
  }

  async previewFileOperation(
    operation: 'copy' | 'rename' | 'split' | 'synthesize',
    params: any
  ): Promise<DiffPreview> {
    switch (operation) {
      case 'copy':
        return this.previewCopy(params.source, params.target);
      case 'rename':
        return this.previewRename(params.oldPath, params.newPath);
      case 'split':
        return this.previewSplit(params.filePath, params.entityIds);
      case 'synthesize':
        return this.previewSynthesize(params.files, params.targetPath);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // SIMD-accelerated LCS (Longest Common Subsequence) для diff
  private async computeDiff(oldCode: string, newCode: string): Promise<string> {
    // Use WASM SIMD implementation if available
    try {
      const { computeDiffSIMD } = await import('../wasm/diff-simd.js');
      return computeDiffSIMD(oldCode, newCode);
    } catch {
      // Fallback to JS implementation
      return this.computeDiffFallback(oldCode, newCode);
    }
  }

  private computeDiffFallback(oldCode: string, newCode: string): string {
    // Myers diff algorithm (simplified)
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    let diff = '';

    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        diff += `+ ${newLine}\n`;
      } else if (newLine === undefined) {
        diff += `- ${oldLine}\n`;
      } else if (oldLine !== newLine) {
        diff += `- ${oldLine}\n`;
        diff += `+ ${newLine}\n`;
      } else {
        diff += `  ${oldLine}\n`;
      }
    }

    return diff;
  }

  private async estimateImpact(entity: Entity, newCode: string): Promise<{
    entitiesAffected: number;
    embeddingsToUpdate: number;
    relationshipsAffected: number;
  }> {
    // Check if signature changed (affects relationships)
    const signatureChanged = await this.detectSignatureChange(entity, newCode);

    // Count relationships
    const relationships = await this.graphStorage.getRelationshipsForEntity(entity.id);

    return {
      entitiesAffected: 1,
      embeddingsToUpdate: 1,
      relationshipsAffected: signatureChanged ? relationships.length : 0
    };
  }

  private async detectSignatureChange(entity: Entity, newCode: string): Promise<boolean> {
    // Parse new code and extract signature
    const { IncrementalParser } = await import('../parsers/incremental-parser.js');
    const parser = new IncrementalParser();
    await parser.initialize();

    const tempFilePath = `/tmp/${entity.id}.ts`;
    await fs.writeFile(tempFilePath, newCode, 'utf-8');

    const parseResult = await parser.parseFile(tempFilePath, newCode);
    const newEntity = parseResult.entities[0];

    // Compare signatures
    const oldSignature = entity.metadata.signature || '';
    const newSignature = newEntity?.metadata?.signature || '';

    await fs.unlink(tempFilePath);

    return oldSignature !== newSignature;
  }

  private parseDiffHunks(diff: string): DiffHunk[] {
    // Parse unified diff format into hunks
    const hunks: DiffHunk[] = [];
    const lines = diff.split('\n');
    let currentHunk: DiffHunk | null = null;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // New hunk
        const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
        if (match) {
          if (currentHunk) hunks.push(currentHunk);
          currentHunk = {
            oldStart: parseInt(match[1]),
            oldLines: parseInt(match[2]),
            newStart: parseInt(match[3]),
            newLines: parseInt(match[4]),
            lines: []
          };
        }
      } else if (currentHunk) {
        currentHunk.lines.push(line);
      }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
  }

  // Preview для других операций (копирование, переименование, и т.д.)
  private async previewCopy(source: string, target: string): Promise<DiffPreview> {
    const content = await fs.readFile(source, 'utf-8');
    return {
      operation: 'copy',
      filesAffected: [source, target],
      changes: [{
        path: target,
        before: '',
        after: content,
        diff: content,
        hunks: []
      }],
      stats: { additions: 1, deletions: 0, modifications: 0 },
      estimatedImpact: { entitiesAffected: 0, embeddingsToUpdate: 1, relationshipsAffected: 0 }
    };
  }

  private async previewRename(oldPath: string, newPath: string): Promise<DiffPreview> {
    return {
      operation: 'rename',
      filesAffected: [oldPath, newPath],
      changes: [],
      stats: { additions: 0, deletions: 0, modifications: 1 },
      estimatedImpact: { entitiesAffected: 0, embeddingsToUpdate: 0, relationshipsAffected: 0 }
    };
  }

  private async previewSplit(filePath: string, entityIds: string[]): Promise<DiffPreview> {
    // Implementation for file splitting preview
    return {
      operation: 'split',
      filesAffected: [filePath],
      changes: [],
      stats: { additions: entityIds.length, deletions: 0, modifications: 1 },
      estimatedImpact: { entitiesAffected: entityIds.length, embeddingsToUpdate: entityIds.length, relationshipsAffected: 0 }
    };
  }

  private async previewSynthesize(files: string[], targetPath: string): Promise<DiffPreview> {
    // Implementation for file synthesis preview
    return {
      operation: 'synthesize',
      filesAffected: [...files, targetPath],
      changes: [],
      stats: { additions: 1, deletions: files.length, modifications: 0 },
      estimatedImpact: { entitiesAffected: files.length, embeddingsToUpdate: 1, relationshipsAffected: 0 }
    };
  }
}
```

### WASM SIMD Implementation (diff algorithm)

```rust
// wasm/diff-simd/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn compute_diff_simd(old_code: &str, new_code: &str) -> String {
    // SIMD-accelerated Myers diff algorithm
    // Implementation using WASM SIMD intrinsics
    // ...
    String::new()
}
```

### MCP Tool Integration

Каждый деструктивный MCP tool должен иметь параметр `preview`:

```typescript
const ModifyCodeSchema = z.object({
  entityId: z.string(),
  newCode: z.string(),
  preview: z.boolean().optional().default(true) // DEFAULT TRUE!
});

// Tool handler
async function handleModifyCode(args: z.infer<typeof ModifyCodeSchema>) {
  if (args.preview !== false) {
    // Return preview
    const preview = await previewManager.previewCodeModification(args.entityId, args.newCode);
    return { content: [{ type: "text", text: JSON.stringify(preview, null, 2) }] };
  } else {
    // Apply changes
    const result = await codeModifier.modifyEntity(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
}
```

---

## Функция 4: File Operations

### Описание
Операции с файлами для экономии токенов LLM:
- **Copy** - копирование файлов/директорий
- **Rename** - переименование с обновлением imports
- **Split** - разделение файла по entities
- **Synthesize** - объединение нескольких файлов

### Архитектура

```typescript
// src/modification/file-operations.ts

export class FileOperations {
  constructor(
    private graphStorage: GraphStorage,
    private vectorStore: VectorStore,
    private previewManager: PreviewManager
  ) {}

  // Copy file or directory (streaming for large files)
  async copy(source: string, target: string, preview: boolean = true): Promise<FileOperationResult> {
    if (preview) {
      const previewData = await this.previewManager.previewCopy(source, target);
      return { success: true, preview: previewData };
    }

    // Check if source is directory
    const stats = await fs.stat(source);

    if (stats.isDirectory()) {
      return this.copyDirectory(source, target);
    } else {
      return this.copyFile(source, target);
    }
  }

  private async copyFile(source: string, target: string): Promise<FileOperationResult> {
    // Create parent directories
    await fs.mkdir(dirname(target), { recursive: true });

    // Streaming copy for large files
    const stats = await fs.stat(source);

    if (stats.size > 1024 * 1024) {
      // Large file - stream
      await pipeline(
        fs.createReadStream(source),
        fs.createWriteStream(target)
      );
    } else {
      // Small file - direct copy
      await fs.copyFile(source, target);
    }

    // Update graph: копируем entities в новый файл
    await this.duplicateEntitiesInGraph(source, target);

    // Update embeddings
    await this.duplicateEmbeddings(source, target);

    return {
      success: true,
      filesAffected: [source, target],
      operation: 'copy'
    };
  }

  // Rename file with automatic import updates
  async rename(oldPath: string, newPath: string, updateImports: boolean = true, preview: boolean = true): Promise<FileOperationResult> {
    if (preview) {
      const previewData = await this.previewManager.previewRename(oldPath, newPath);
      return { success: true, preview: previewData };
    }

    // Move file
    await fs.rename(oldPath, newPath);

    // Update graph: change filePath for all entities
    await this.updateFilePathInGraph(oldPath, newPath);

    // Update embeddings: change file path reference
    await this.updateEmbeddingsFilePath(oldPath, newPath);

    // Update imports in other files (if enabled)
    if (updateImports) {
      await this.updateImportsAcrossProject(oldPath, newPath);
    }

    return {
      success: true,
      filesAffected: [oldPath, newPath],
      operation: 'rename'
    };
  }

  // Split file into multiple files by entities
  async split(filePath: string, entityIds: string[], preview: boolean = true): Promise<FileOperationResult> {
    if (preview) {
      const previewData = await this.previewManager.previewSplit(filePath, entityIds);
      return { success: true, preview: previewData };
    }

    const entities = await Promise.all(
      entityIds.map(id => this.graphStorage.getEntity(id))
    );

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    const filesCreated: string[] = [];

    for (const entity of entities) {
      if (!entity) continue;

      // Extract entity code
      const entityCode = lines.slice(
        entity.location.start.line - 1,
        entity.location.end.line
      ).join('\n');

      // Determine new file path
      const newFilePath = join(
        dirname(filePath),
        `${entity.name}.${extname(filePath)}`
      );

      // Write entity to new file
      await fs.writeFile(newFilePath, entityCode, 'utf-8');

      // Update graph
      await this.graphStorage.updateEntity(entity.id, {
        filePath: newFilePath,
        location: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: entityCode.split('\n').length, column: 0, index: entityCode.length }
        }
      });

      filesCreated.push(newFilePath);
    }

    // Remove entities from original file
    await this.removeEntitiesFromFile(filePath, entityIds);

    return {
      success: true,
      filesAffected: [filePath, ...filesCreated],
      operation: 'split'
    };
  }

  // Synthesize multiple files into one
  async synthesize(files: string[], targetPath: string, preview: boolean = true): Promise<FileOperationResult> {
    if (preview) {
      const previewData = await this.previewManager.previewSynthesize(files, targetPath);
      return { success: true, preview: previewData };
    }

    // Read all files and combine
    const contents: string[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      contents.push(content);
    }

    const combined = contents.join('\n\n');

    // Write combined file
    await fs.writeFile(targetPath, combined, 'utf-8');

    // Update graph: merge entities
    await this.mergeEntitiesInGraph(files, targetPath);

    // Update embeddings: combine embeddings
    await this.mergeEmbeddings(files, targetPath);

    return {
      success: true,
      filesAffected: [...files, targetPath],
      operation: 'synthesize'
    };
  }

  // Helper: Update imports across project
  private async updateImportsAcrossProject(oldPath: string, newPath: string): Promise<void> {
    // Find all entities that import from oldPath
    const importers = await this.findImporters(oldPath);

    for (const importer of importers) {
      const content = await fs.readFile(importer.filePath, 'utf-8');
      const updated = content.replace(
        new RegExp(`from ['"]${oldPath}['"]`, 'g'),
        `from '${newPath}'`
      );
      await fs.writeFile(importer.filePath, updated, 'utf-8');
    }
  }

  private async findImporters(targetPath: string): Promise<Entity[]> {
    // Query graph for entities that import from targetPath
    const allEntities = await this.graphStorage.findEntities({
      type: 'entity',
      filters: { entityType: 'import' }
    });

    return allEntities.filter(entity =>
      entity.metadata.importData?.source === targetPath
    );
  }

  // Helper: Duplicate entities in graph
  private async duplicateEntitiesInGraph(source: string, target: string): Promise<void> {
    const entities = await this.graphStorage.findEntities({
      type: 'entity',
      filters: { filePath: source }
    });

    for (const entity of entities) {
      const newEntity = {
        ...entity,
        id: undefined as any, // Will be generated
        filePath: target,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await this.graphStorage.insertEntity(newEntity);
    }
  }

  // Helper: Update file path in graph
  private async updateFilePathInGraph(oldPath: string, newPath: string): Promise<void> {
    const entities = await this.graphStorage.findEntities({
      type: 'entity',
      filters: { filePath: oldPath }
    });

    for (const entity of entities) {
      await this.graphStorage.updateEntity(entity.id, { filePath: newPath });
    }
  }

  // Helper: Duplicate embeddings
  private async duplicateEmbeddings(source: string, target: string): Promise<void> {
    // Get all embeddings for source file
    const entities = await this.graphStorage.findEntities({
      type: 'entity',
      filters: { filePath: source }
    });

    for (const entity of entities) {
      const embedding = await this.vectorStore.getEmbedding(entity.id);
      if (embedding) {
        // Create new embedding for copied entity
        const newEntityId = await this.findNewEntityId(entity.name, target);
        if (newEntityId) {
          await this.vectorStore.insertEmbedding({
            ...embedding,
            id: newEntityId,
            entityId: newEntityId
          });
        }
      }
    }
  }

  private async findNewEntityId(name: string, filePath: string): Promise<string | null> {
    const entities = await this.graphStorage.findEntities({
      type: 'entity',
      filters: { filePath, name }
    });
    return entities[0]?.id || null;
  }
}
```

### MCP Tool Schemas

```typescript
const CopyFileSchema = z.object({
  source: z.string(),
  target: z.string(),
  preview: z.boolean().optional().default(true)
});

const RenameFileSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
  updateImports: z.boolean().optional().default(true),
  preview: z.boolean().optional().default(true)
});

const SplitFileSchema = z.object({
  filePath: z.string(),
  entityIds: z.array(z.string()).describe("Entities to extract into separate files"),
  preview: z.boolean().optional().default(true)
});

const SynthesizeFilesSchema = z.object({
  files: z.array(z.string()).describe("Files to combine"),
  targetPath: z.string(),
  preview: z.boolean().optional().default(true)
});
```

### Token Savings Examples

| Operation | Without Tool | With Tool | Savings |
|-----------|-------------|-----------|---------|
| Copy file | Send full file content | `copy(source, target)` | ~95% |
| Rename + update imports | Manual search/replace | `rename(old, new, updateImports=true)` | ~90% |
| Split file | Manual extraction | `split(file, [entityIds])` | ~85% |
| Synthesize | Send all files | `synthesize([files], target)` | ~90% |

---

## Функция 5: Technology Detection

### Описание
Автоматическое определение технологического стека и фреймворков с интеграцией в embeddings.

### Архитектура

```typescript
// src/analysis/technology-detector.ts

export interface TechnologyStack {
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  buildTools: BuildToolInfo[];
  dependencies: DependencyInfo[];
  confidence: number; // 0-1
}

export interface LanguageInfo {
  name: string;
  version?: string;
  percentage: number; // % of codebase
  fileCount: number;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  category: 'frontend' | 'backend' | 'testing' | 'build' | 'other';
  confidence: number;
  evidence: string[]; // Files/imports that indicate framework
}

export interface BuildToolInfo {
  name: string;
  configFiles: string[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'prod' | 'dev';
}

export class TechnologyDetector {
  private detectionPatterns: Map<string, DetectionPattern> = new Map();

  constructor(
    private graphStorage: GraphStorage,
    private workingDirectory: string
  ) {
    this.initializePatterns();
  }

  async detectStack(): Promise<TechnologyStack> {
    const languages = await this.detectLanguages();
    const frameworks = await this.detectFrameworks();
    const buildTools = await this.detectBuildTools();
    const dependencies = await this.detectDependencies();

    const confidence = this.calculateConfidence(frameworks);

    return {
      languages,
      frameworks,
      buildTools,
      dependencies,
      confidence
    };
  }

  // Detect languages from file extensions and graph
  private async detectLanguages(): Promise<LanguageInfo[]> {
    const entities = await this.graphStorage.findEntities({
      type: 'entity',
      filters: {}
    });

    const languageCounts = new Map<string, number>();
    const fileCounts = new Map<string, Set<string>>();

    for (const entity of entities) {
      const lang = entity.language || 'unknown';
      languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);

      if (!fileCounts.has(lang)) {
        fileCounts.set(lang, new Set());
      }
      fileCounts.get(lang)!.add(entity.filePath);
    }

    const totalEntities = entities.length;
    const languages: LanguageInfo[] = [];

    for (const [name, count] of languageCounts.entries()) {
      if (name === 'unknown') continue;

      languages.push({
        name,
        percentage: (count / totalEntities) * 100,
        fileCount: fileCounts.get(name)!.size
      });
    }

    return languages.sort((a, b) => b.percentage - a.percentage);
  }

  // Detect frameworks from imports and config files
  private async detectFrameworks(): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];

    // Check package.json dependencies
    const packageJsonPath = join(this.workingDirectory, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // React
      if (deps['react']) {
        frameworks.push({
          name: 'React',
          version: deps['react'],
          category: 'frontend',
          confidence: 1.0,
          evidence: ['package.json:dependencies.react']
        });
      }

      // Next.js
      if (deps['next']) {
        frameworks.push({
          name: 'Next.js',
          version: deps['next'],
          category: 'frontend',
          confidence: 1.0,
          evidence: ['package.json:dependencies.next']
        });
      }

      // Express
      if (deps['express']) {
        frameworks.push({
          name: 'Express',
          version: deps['express'],
          category: 'backend',
          confidence: 1.0,
          evidence: ['package.json:dependencies.express']
        });
      }

      // Jest
      if (deps['jest']) {
        frameworks.push({
          name: 'Jest',
          version: deps['jest'],
          category: 'testing',
          confidence: 1.0,
          evidence: ['package.json:devDependencies.jest']
        });
      }

      // TypeScript
      if (deps['typescript']) {
        frameworks.push({
          name: 'TypeScript',
          version: deps['typescript'],
          category: 'other',
          confidence: 1.0,
          evidence: ['package.json:devDependencies.typescript']
        });
      }
    }

    // Check for framework-specific imports in code
    const importFrameworks = await this.detectFromImports();
    frameworks.push(...importFrameworks);

    return frameworks;
  }

  private async detectFromImports(): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];

    // Query all import entities
    const imports = await this.graphStorage.findEntities({
      type: 'entity',
      filters: { entityType: 'import' }
    });

    const importCounts = new Map<string, number>();
    const importFiles = new Map<string, Set<string>>();

    for (const imp of imports) {
      const source = imp.metadata.importData?.source || '';

      // React imports
      if (source === 'react' || source.startsWith('react/')) {
        importCounts.set('React', (importCounts.get('React') || 0) + 1);
        if (!importFiles.has('React')) importFiles.set('React', new Set());
        importFiles.get('React')!.add(imp.filePath);
      }

      // Vue imports
      if (source === 'vue' || source.startsWith('vue/')) {
        importCounts.set('Vue', (importCounts.get('Vue') || 0) + 1);
        if (!importFiles.has('Vue')) importFiles.set('Vue', new Set());
        importFiles.get('Vue')!.add(imp.filePath);
      }

      // Angular imports
      if (source.startsWith('@angular/')) {
        importCounts.set('Angular', (importCounts.get('Angular') || 0) + 1);
        if (!importFiles.has('Angular')) importFiles.set('Angular', new Set());
        importFiles.get('Angular')!.add(imp.filePath);
      }
    }

    // Create framework info from import analysis
    for (const [name, count] of importCounts.entries()) {
      const files = importFiles.get(name)!;
      frameworks.push({
        name,
        category: 'frontend',
        confidence: Math.min(count / 10, 1.0), // More imports = higher confidence
        evidence: [`${count} imports in ${files.size} files`]
      });
    }

    return frameworks;
  }

  private async detectBuildTools(): Promise<BuildToolInfo[]> {
    const buildTools: BuildToolInfo[] = [];

    // Check for common build tool config files
    const configFiles = [
      { name: 'webpack', files: ['webpack.config.js', 'webpack.config.ts'] },
      { name: 'vite', files: ['vite.config.js', 'vite.config.ts'] },
      { name: 'rollup', files: ['rollup.config.js', 'rollup.config.ts'] },
      { name: 'tsup', files: ['tsup.config.ts'] },
      { name: 'esbuild', files: ['esbuild.config.js'] }
    ];

    for (const { name, files } of configFiles) {
      const found: string[] = [];
      for (const file of files) {
        const path = join(this.workingDirectory, file);
        if (existsSync(path)) {
          found.push(file);
        }
      }

      if (found.length > 0) {
        buildTools.push({ name, configFiles: found });
      }
    }

    return buildTools;
  }

  private async detectDependencies(): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    const packageJsonPath = join(this.workingDirectory, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      // Production dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({ name, version: version as string, type: 'prod' });
        }
      }

      // Dev dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          dependencies.push({ name, version: version as string, type: 'dev' });
        }
      }
    }

    return dependencies;
  }

  private calculateConfidence(frameworks: FrameworkInfo[]): number {
    if (frameworks.length === 0) return 0;
    const avgConfidence = frameworks.reduce((sum, f) => sum + f.confidence, 0) / frameworks.length;
    return avgConfidence;
  }

  private initializePatterns(): void {
    // Detection patterns for various frameworks/tools
    this.detectionPatterns.set('React', {
      imports: ['react', 'react-dom'],
      files: ['*.jsx', '*.tsx'],
      keywords: ['useState', 'useEffect', 'Component']
    });

    // Add more patterns...
  }

  // Integrate technology info into embeddings
  async enhanceEmbeddingsWithTechStack(stack: TechnologyStack): Promise<void> {
    // Add technology context to embeddings metadata
    const techContext = this.generateTechContext(stack);

    // Store in graph storage metadata
    // This allows semantic search to understand technology context
    // For example: "find React components" will use tech stack info
  }

  private generateTechContext(stack: TechnologyStack): string {
    const parts: string[] = [];

    parts.push(`Languages: ${stack.languages.map(l => l.name).join(', ')}`);
    parts.push(`Frameworks: ${stack.frameworks.map(f => f.name).join(', ')}`);
    parts.push(`Build Tools: ${stack.buildTools.map(b => b.name).join(', ')}`);

    return parts.join(' | ');
  }
}

interface DetectionPattern {
  imports?: string[];
  files?: string[];
  keywords?: string[];
}
```

### MCP Tool Schema

```typescript
const DetectTechnologySchema = z.object({
  updateEmbeddings: z.boolean().optional().default(false).describe("Update embeddings with tech context")
});
```

### Integration with Embeddings

Технологическая информация добавляется в metadata всех embeddings:

```typescript
// При создании embedding
const techStack = await technologyDetector.detectStack();
const techContext = generateTechContext(techStack);

const embedding = await embeddingGenerator.generate({
  content: entityCode,
  metadata: {
    ...entity.metadata,
    techStack: techContext, // Add technology context
    frameworks: techStack.frameworks.map(f => f.name)
  }
});
```

Это позволяет LLM делать более точные запросы:
- "Find all React components" → filter by `frameworks: ["React"]`
- "Show Express routes" → filter by `frameworks: ["Express"]` + type: "function"

---

## Функция 6: Code Validator

### Описание
Валидация кода с автоматической проверкой после изменений и отчётом "до/после".

### Архитектура

```typescript
// src/validation/code-validator.ts

export interface ValidationReport {
  filePath: string;
  timestamp: number;
  problems: ValidationProblem[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    total: number;
  };
  linterUsed: string;
}

export interface ValidationProblem {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
  ruleId?: string;
  source?: string; // linter name
}

export interface BeforeAfterReport {
  before: ValidationReport;
  after: ValidationReport;
  improvement: {
    errorsFixed: number;
    warningsFixed: number;
    newErrors: number;
    newWarnings: number;
    netChange: number; // negative = improvement
  };
}

export class CodeValidator {
  private linters: Map<string, Linter> = new Map();

  constructor() {
    this.initializeLinters();
  }

  async validateFile(filePath: string): Promise<ValidationReport> {
    const ext = extname(filePath).toLowerCase();
    const linter = this.selectLinter(ext);

    if (!linter) {
      return {
        filePath,
        timestamp: Date.now(),
        problems: [],
        summary: { errors: 0, warnings: 0, info: 0, total: 0 },
        linterUsed: 'none'
      };
    }

    // Read file
    const content = await fs.readFile(filePath, 'utf-8');

    // Run linter
    const problems = await linter.lint(filePath, content);

    // Categorize problems by severity
    const summary = this.categorizeProblems(problems);

    return {
      filePath,
      timestamp: Date.now(),
      problems,
      summary,
      linterUsed: linter.name
    };
  }

  async validateDirectory(dirPath: string, extensions: string[] = ['.ts', '.js']): Promise<ValidationReport[]> {
    const files = await this.findFiles(dirPath, extensions);
    const reports: ValidationReport[] = [];

    // Batch validation with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchReports = await Promise.all(
        batch.map(file => this.validateFile(file))
      );
      reports.push(...batchReports);
    }

    return reports;
  }

  // Automatic validation after code modification
  async validateModification(filePath: string, beforeReport?: ValidationReport): Promise<BeforeAfterReport> {
    const before = beforeReport || await this.validateFile(filePath);
    const after = await this.validateFile(filePath);

    const improvement = this.compareReports(before, after);

    return { before, after, improvement };
  }

  private compareReports(before: ValidationReport, after: ValidationReport): BeforeAfterReport['improvement'] {
    const errorsFixed = Math.max(0, before.summary.errors - after.summary.errors);
    const warningsFixed = Math.max(0, before.summary.warnings - after.summary.warnings);
    const newErrors = Math.max(0, after.summary.errors - before.summary.errors);
    const newWarnings = Math.max(0, after.summary.warnings - before.summary.warnings);

    const netChange = (newErrors + newWarnings) - (errorsFixed + warningsFixed);

    return {
      errorsFixed,
      warningsFixed,
      newErrors,
      newWarnings,
      netChange
    };
  }

  private categorizeProblems(problems: ValidationProblem[]): ValidationReport['summary'] {
    const summary = { errors: 0, warnings: 0, info: 0, total: problems.length };

    for (const problem of problems) {
      switch (problem.severity) {
        case 'error':
          summary.errors++;
          break;
        case 'warning':
          summary.warnings++;
          break;
        case 'info':
          summary.info++;
          break;
      }
    }

    return summary;
  }

  private selectLinter(ext: string): Linter | null {
    switch (ext) {
      case '.ts':
      case '.tsx':
        return this.linters.get('typescript');
      case '.js':
      case '.jsx':
        return this.linters.get('javascript');
      case '.py':
        return this.linters.get('python');
      default:
        return null;
    }
  }

  private initializeLinters(): void {
    // TypeScript/JavaScript - oxlint
    this.linters.set('typescript', new oxlintLinter());
    this.linters.set('javascript', new oxlintLinter());

    // Python - Pylint/Ruff
    this.linters.set('python', new PylintLinter());

    // More linters...
  }

  private async findFiles(dirPath: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules, .git, etc.
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }

    await walk(dirPath);
    return files;
  }
}

// Linter interface
interface Linter {
  name: string;
  lint(filePath: string, content: string): Promise<ValidationProblem[]>;
}

// oxlint implementation
class oxlintLinter implements Linter {
  name = 'oxlint';

  async lint(filePath: string, content: string): Promise<ValidationProblem[]> {
    try {
      const { oxlint } = await import('eslint');
      const eslint = new oxlint();

      const results = await eslint.lintText(content, { filePath });
      const problems: ValidationProblem[] = [];

      for (const result of results) {
        for (const message of result.messages) {
          problems.push({
            severity: message.severity === 2 ? 'error' : 'warning',
            message: message.message,
            line: message.line,
            column: message.column,
            ruleId: message.ruleId || undefined,
            source: 'oxlint'
          });
        }
      }

      return problems;
    } catch (error) {
      console.warn('[oxlintLinter] Linting failed:', error);
      return [];
    }
  }
}

// Pylint implementation (streaming for large files)
class PylintLinter implements Linter {
  name = 'Pylint';

  async lint(filePath: string, content: string): Promise<ValidationProblem[]> {
    try {
      // Use pylint via subprocess
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(`pylint --output-format=json ${filePath}`);
      const results = JSON.parse(stdout);
      const problems: ValidationProblem[] = [];

      for (const result of results) {
        problems.push({
          severity: result.type === 'error' ? 'error' : result.type === 'warning' ? 'warning' : 'info',
          message: result.message,
          line: result.line,
          column: result.column,
          ruleId: result['message-id'],
          source: 'Pylint'
        });
      }

      return problems;
    } catch (error) {
      console.warn('[PylintLinter] Linting failed:', error);
      return [];
    }
  }
}
```

### Integration with CodeModifier

Автоматическая валидация встроена в `CodeModifier`:

```typescript
// В CodeModifier.modifyEntity()
const beforeValidation = await this.validator.validateFile(entity.filePath);

// ... apply modifications ...

const afterValidation = await this.validator.validateFile(entity.filePath);

return {
  success: true,
  filesModified: [entity.filePath],
  validationReport: {
    before: beforeValidation,
    after: afterValidation,
    improvement: this.validator.compareReports(beforeValidation, afterValidation)
  }
};
```

### MCP Tool Schemas

```typescript
const ValidateFileSchema = z.object({
  filePath: z.string()
});

const ValidateDirectorySchema = z.object({
  dirPath: z.string(),
  extensions: z.array(z.string()).optional().default(['.ts', '.js'])
});
```

### Example Output

```json
{
  "success": true,
  "filesModified": ["src/utils/helper.ts"],
  "validationReport": {
    "before": {
      "filePath": "src/utils/helper.ts",
      "summary": { "errors": 5, "warnings": 12, "info": 3, "total": 20 }
    },
    "after": {
      "filePath": "src/utils/helper.ts",
      "summary": { "errors": 0, "warnings": 8, "info": 3, "total": 11 }
    },
    "improvement": {
      "errorsFixed": 5,
      "warningsFixed": 4,
      "newErrors": 0,
      "newWarnings": 0,
      "netChange": -9
    }
  }
}
```

---

## Функция 7: Pattern-based Search

### Описание
Расширенный поиск по сущностям с поддержкой содержимого и контекста.

### Use Cases
1. **Entity-based search**: "Найти все функции с названием `process*`"
2. **Content-aware search**: "Найти контрол `<button class="outline">` только в шаблонах скачивания файлов"
3. **Hybrid search**: Комбинация regex + semantic similarity

### Архитектура

```typescript
// src/search/pattern-search.ts

export interface PatternSearchQuery {
  pattern: string;              // Regex or semantic query
  scope?: {
    entityTypes?: EntityType[]; // Filter by entity types
    files?: string[];           // Filter by file paths
    frameworks?: string[];      // Filter by framework (from tech detection)
  };
  contentFilter?: {
    contains?: string;          // Content must contain this string
    regex?: string;             // Content must match this regex
    semantic?: string;          // Semantic similarity to this description
  };
  limit?: number;
  mode: 'entity' | 'content' | 'hybrid';
}

export interface PatternSearchResult {
  entity: Entity;
  matchType: 'name' | 'content' | 'semantic';
  score: number;
  snippet?: string;             // Code snippet showing match
  highlights?: {                // Highlighted match positions
    start: number;
    end: number;
  }[];
}

export class PatternSearch {
  constructor(
    private graphStorage: GraphStorage,
    private vectorStore: VectorStore,
    private technologyDetector: TechnologyDetector
  ) {}

  async search(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    switch (query.mode) {
      case 'entity':
        return this.searchEntities(query);
      case 'content':
        return this.searchContent(query);
      case 'hybrid':
        return this.searchHybrid(query);
      default:
        throw new Error(`Unknown search mode: ${query.mode}`);
    }
  }

  // Search by entity name/type
  private async searchEntities(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    const filters: any = {};

    // Apply entity type filter
    if (query.scope?.entityTypes) {
      filters.entityType = query.scope.entityTypes;
    }

    // Apply file path filter
    if (query.scope?.files) {
      filters.filePath = query.scope.files;
    }

    // Apply framework filter (using tech detection)
    if (query.scope?.frameworks) {
      // Get entities that belong to files using these frameworks
      const techStack = await this.technologyDetector.detectStack();
      const relevantFiles = await this.getFilesForFrameworks(query.scope.frameworks, techStack);
      filters.filePath = relevantFiles;
    }

    // Query entities with regex pattern
    filters.name = new RegExp(query.pattern);

    const entities = await this.graphStorage.findEntities({
      type: 'entity',
      filters,
      limit: query.limit || 100
    });

    return entities.map(entity => ({
      entity,
      matchType: 'name',
      score: 1.0
    }));
  }

  // Search by content (inside entity body)
  private async searchContent(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    // First, get candidate entities (from entity search)
    const candidates = await this.searchEntities({
      ...query,
      pattern: '.*', // Match all entities
      mode: 'entity'
    });

    const results: PatternSearchResult[] = [];

    // For each candidate, check content
    for (const { entity } of candidates) {
      const content = await this.getEntityContent(entity);

      // Apply content filters
      if (query.contentFilter?.contains) {
        if (!content.includes(query.contentFilter.contains)) continue;
      }

      if (query.contentFilter?.regex) {
        const regex = new RegExp(query.contentFilter.regex, 'i');
        if (!regex.test(content)) continue;
      }

      if (query.contentFilter?.semantic) {
        // Semantic similarity check
        const similarity = await this.computeSemanticSimilarity(
          content,
          query.contentFilter.semantic
        );
        if (similarity < 0.7) continue;
      }

      // Generate snippet
      const snippet = this.generateSnippet(content, query.pattern);

      results.push({
        entity,
        matchType: 'content',
        score: 1.0,
        snippet
      });
    }

    return results;
  }

  // Hybrid search: entity + content + semantic
  private async searchHybrid(query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    // Combine entity search and content search
    const entityResults = await this.searchEntities(query);
    const contentResults = await this.searchContent(query);

    // If semantic query provided, also do vector search
    if (query.contentFilter?.semantic) {
      const semanticResults = await this.searchSemantic(query.contentFilter.semantic, query);

      // Merge results with scoring
      return this.mergeResults([
        ...entityResults,
        ...contentResults,
        ...semanticResults
      ]);
    }

    return this.mergeResults([...entityResults, ...contentResults]);
  }

  // Semantic search using vector embeddings
  private async searchSemantic(semanticQuery: string, query: PatternSearchQuery): Promise<PatternSearchResult[]> {
    // Generate query embedding
    const { EmbeddingGenerator } = await import('../semantic/embedding-generator.js');
    const generator = new EmbeddingGenerator();
    const queryEmbedding = await generator.generate({ content: semanticQuery });

    // Search vector store
    const similarEntities = await this.vectorStore.searchSimilar(
      queryEmbedding.embedding,
      query.limit || 10
    );

    const results: PatternSearchResult[] = [];

    for (const { entityId, score } of similarEntities) {
      const entity = await this.graphStorage.getEntity(entityId);
      if (!entity) continue;

      // Apply scope filters
      if (query.scope?.entityTypes && !query.scope.entityTypes.includes(entity.type)) continue;
      if (query.scope?.files && !query.scope.files.includes(entity.filePath)) continue;

      results.push({
        entity,
        matchType: 'semantic',
        score
      });
    }

    return results;
  }

  private async getEntityContent(entity: Entity): Promise<string> {
    const fileContent = await fs.readFile(entity.filePath, 'utf-8');
    const lines = fileContent.split('\n');
    return lines.slice(entity.location.start.line - 1, entity.location.end.line).join('\n');
  }

  private generateSnippet(content: string, pattern: string): string {
    // Find match position
    const regex = new RegExp(pattern, 'i');
    const match = content.match(regex);
    if (!match) return content.slice(0, 100);

    const matchStart = match.index || 0;
    const contextBefore = 50;
    const contextAfter = 50;

    const start = Math.max(0, matchStart - contextBefore);
    const end = Math.min(content.length, matchStart + match[0].length + contextAfter);

    return content.slice(start, end);
  }

  private mergeResults(results: PatternSearchResult[]): PatternSearchResult[] {
    // Remove duplicates and sort by score
    const seen = new Set<string>();
    const unique: PatternSearchResult[] = [];

    for (const result of results) {
      if (seen.has(result.entity.id)) continue;
      seen.add(result.entity.id);
      unique.push(result);
    }

    return unique.sort((a, b) => b.score - a.score);
  }

  private async computeSemanticSimilarity(content: string, query: string): Promise<number> {
    // Use SIMD-accelerated cosine similarity
    const { EmbeddingGenerator } = await import('../semantic/embedding-generator.js');
    const generator = new EmbeddingGenerator();

    const contentEmbedding = await generator.generate({ content });
    const queryEmbedding = await generator.generate({ content: query });

    // SIMD-accelerated cosine similarity
    return this.cosineSimilarity(contentEmbedding.embedding, queryEmbedding.embedding);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    // Use WASM SIMD if available
    try {
      const { cosineSimilaritySIMD } = require('../wasm/vector-ops-simd.js');
      return cosineSimilaritySIMD(a, b);
    } catch {
      // Fallback to JS
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
  }

  private async getFilesForFrameworks(frameworks: string[], techStack: TechnologyStack): Promise<string[]> {
    // Get all files that use specified frameworks
    // This uses import analysis from TechnologyDetector
    const files: string[] = [];

    for (const framework of frameworks) {
      const frameworkInfo = techStack.frameworks.find(f => f.name === framework);
      if (!frameworkInfo) continue;

      // Get files from evidence
      for (const evidence of frameworkInfo.evidence) {
        // Parse evidence like "15 imports in 5 files"
        // Get actual file list from graph
        const imports = await this.graphStorage.findEntities({
          type: 'entity',
          filters: { entityType: 'import' }
        });

        for (const imp of imports) {
          const source = imp.metadata.importData?.source || '';
          if (source.includes(framework.toLowerCase())) {
            files.push(imp.filePath);
          }
        }
      }
    }

    return [...new Set(files)]; // Deduplicate
  }
}
```

### MCP Tool Schema

```typescript
const PatternSearchSchema = z.object({
  pattern: z.string().describe("Regex pattern or semantic query"),
  mode: z.enum(['entity', 'content', 'hybrid']).default('entity'),
  scope: z.object({
    entityTypes: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    frameworks: z.array(z.string()).optional()
  }).optional(),
  contentFilter: z.object({
    contains: z.string().optional(),
    regex: z.string().optional(),
    semantic: z.string().optional()
  }).optional(),
  limit: z.number().optional().default(100)
});
```

### SIMD Optimization (WASM)

```rust
// wasm/vector-ops-simd/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn cosine_similarity_simd(a: &[f32], b: &[f32]) -> f32 {
    // Use WASM SIMD intrinsics for 4x speedup
    use std::arch::wasm32::*;

    let mut dot_product = f32x4_splat(0.0);
    let mut norm_a = f32x4_splat(0.0);
    let mut norm_b = f32x4_splat(0.0);

    // Process 4 elements at a time
    for i in (0..a.len()).step_by(4) {
        let va = v128_load(&a[i] as *const f32 as *const v128);
        let vb = v128_load(&b[i] as *const f32 as *const v128);

        dot_product = f32x4_add(dot_product, f32x4_mul(va, vb));
        norm_a = f32x4_add(norm_a, f32x4_mul(va, va));
        norm_b = f32x4_add(norm_b, f32x4_mul(vb, vb));
    }

    // Horizontal sum (reduce)
    let dot = f32x4_extract_lane::<0>(dot_product) +
              f32x4_extract_lane::<1>(dot_product) +
              f32x4_extract_lane::<2>(dot_product) +
              f32x4_extract_lane::<3>(dot_product);

    let na = f32x4_extract_lane::<0>(norm_a) +
             f32x4_extract_lane::<1>(norm_a) +
             f32x4_extract_lane::<2>(norm_a) +
             f32x4_extract_lane::<3>(norm_a);

    let nb = f32x4_extract_lane::<0>(norm_b) +
             f32x4_extract_lane::<1>(norm_b) +
             f32x4_extract_lane::<2>(norm_b) +
             f32x4_extract_lane::<3>(norm_b);

    dot / (na.sqrt() * nb.sqrt())
}
```

### Example Queries

```typescript
// Query 1: Find all React components in download-related files
const results = await patternSearch.search({
  pattern: '.*Component$',
  mode: 'entity',
  scope: {
    entityTypes: ['function', 'class'],
    frameworks: ['React']
  },
  contentFilter: {
    contains: 'download'
  }
});

// Query 2: Find <button> elements only in download templates
const results = await patternSearch.search({
  pattern: '<button',
  mode: 'content',
  contentFilter: {
    contains: 'class="outline"',
    semantic: 'download file templates'
  }
});

// Query 3: Hybrid search for authentication functions
const results = await patternSearch.search({
  pattern: 'auth.*',
  mode: 'hybrid',
  scope: {
    entityTypes: ['function']
  },
  contentFilter: {
    semantic: 'user authentication and login'
  }
});
```

---

## Интеграция с существующими системами

### LayeredIndexManager Integration

Все операции модификации должны обновлять соответствующие слои:

| Operation | Layer 0 (Base) | Layer 1 (Branch) | Layer 2 (Working) |
|-----------|----------------|------------------|-------------------|
| Code Modification | ❌ Read-only | ❌ Read-only | ✅ Update entity delta |
| File Copy | ❌ Read-only | ❌ Read-only | ✅ Add new entities |
| File Rename | ❌ Read-only | ❌ Read-only | ✅ Update filePath in delta |
| File Split | ❌ Read-only | ❌ Read-only | ✅ Add multiple entities |

**Реализация:**

```typescript
// В CodeModifier
async modifyEntity(request: CodeModificationRequest): Promise<CodeModificationResult> {
  // ...

  // Update Layer 2 (working delta)
  if (this.layeredIndexManager) {
    await this.layeredIndexManager.updateWorkingDelta(
      request.clientId || 'default',
      {
        entityDelta: {
          modified: new Map([[entity.id, updatedEntity]]),
          added: new Map(),
          deleted: new Set()
        }
      }
    );
  }

  // ...
}
```

### VectorStore Integration

Обновление embeddings должно быть **инкрементальным**:

```typescript
// Incremental embedding update
async updateEntityEmbedding(entity: Entity, newCode: string): Promise<boolean> {
  // Delete old embedding
  await this.vectorStore.deleteEmbedding(entity.id);

  // Generate new embedding (with comments)
  const enhancedContent = await this.enhanceEntityContent(entity, newCode);
  const embedding = await this.embeddingGenerator.generate({ content: enhancedContent });

  // Insert new embedding
  await this.vectorStore.insertEmbedding({
    id: entity.id,
    entityId: entity.id,
    content: enhancedContent,
    embedding: embedding.embedding,
    modelName: embedding.modelName,
    createdAt: Date.now()
  });

  return true;
}
```

### BranchManager Integration

Version Manager должен использовать BranchManager для git operations:

```typescript
// В VersionManager
async createGitSnapshot(description: string, files?: string[]): Promise<string> {
  const currentBranch = this.branchManager.getCurrentBranch();

  // Use git stash or worktree
  if (currentBranch) {
    // Create stash
    execSync(`git stash push -m "${description}"`, {
      cwd: this.workingDirectory
    });
  }

  // ...
}
```

---

## План реализации (Phases)

### Phase 0: Подготовка инфраструктуры (1-2 дня)

**Цель:** Создать базовую инфраструктуру для SIMD, streaming, xxHash интеграции.

**Задачи:**
1. ✅ Настроить WASM build pipeline (wasm-pack)
2. ✅ Создать WASM модули для SIMD операций:
   - `wasm/diff-simd` - diff algorithm
   - `wasm/vector-ops-simd` - cosine similarity
3. ✅ Создать streaming utilities:
   - `src/utils/stream-helpers.ts` - pipeline wrappers
4. ✅ Расширить использование xxHash:
   - Snapshot hashing
   - Pattern query caching

**Файлы:**
- `wasm/diff-simd/src/lib.rs`
- `wasm/vector-ops-simd/src/lib.rs`
- `src/utils/stream-helpers.ts`
- `scripts/build-wasm.sh`

---

### Phase 1: Version Manager (2-3 дня)

**Цель:** Реализовать систему версионирования с git worktree и .backup/ fallback.

**Задачи:**
1. ✅ Создать `VersionManager` class
2. ✅ Реализовать git worktree backend
3. ✅ Реализовать .backup/ backend
4. ✅ Добавить streaming copy для больших файлов
5. ✅ Добавить xxHash integrity checks
6. ✅ Написать тесты (git и non-git projects)

**Файлы:**
- `src/versioning/version-manager.ts` (~400 lines)
- `tests/version-manager.test.ts`

**MCP Tools:**
- `create_snapshot`
- `undo`
- `list_snapshots`
- `cleanup_snapshots`

---

### Phase 2: PreviewChanges (2 дня)

**Цель:** Универсальный preview механизм для всех деструктивных операций.

**Задачи:**
1. ✅ Создать `PreviewManager` class
2. ✅ Реализовать SIMD-accelerated diff (WASM)
3. ✅ Реализовать impact estimation
4. ✅ Интегрировать с существующими MCP tools

**Файлы:**
- `src/modification/preview-manager.ts` (~500 lines)
- `wasm/diff-simd/src/lib.rs` (~200 lines)

**Изменения:**
- Добавить `preview: boolean` параметр во все деструктивные MCP tools
- Default: `preview: true`

---

### Phase 3: Code Validator (2-3 дня)

**Цель:** Валидация кода с автоматической проверкой after modifications.

**Задачи:**
1. ✅ Создать `CodeValidator` class
2. ✅ Реализовать oxlint integration
3. ✅ Реализовать Pylint integration
4. ✅ Добавить before/after comparison
5. ✅ Интегрировать с CodeModifier

**Файлы:**
- `src/validation/code-validator.ts` (~600 lines)
- `src/validation/linters/eslint-linter.ts`
- `src/validation/linters/pylint-linter.ts`

**MCP Tools:**
- `validate_file`
- `validate_directory`

---

### Phase 4: Code Modification API (3-4 дня)

**Цель:** Entity-based code replacement с embedding updates.

**Задачи:**
1. ✅ Создать `CodeModifier` class
2. ✅ Реализовать streaming replacement
3. ✅ Интегрировать с LayeredIndexManager (Layer 2 updates)
4. ✅ Реализовать incremental embedding updates
5. ✅ Интегрировать с VersionManager
6. ✅ Интегрировать с CodeValidator
7. ✅ Написать тесты

**Файлы:**
- `src/modification/code-modifier.ts` (~700 lines)

**MCP Tools:**
- `modify_code`

---

### Phase 5: File Operations (3 дня)

**Цель:** Copy/rename/split/synthesize с token efficiency.

**Задачи:**
1. ✅ Создать `FileOperations` class
2. ✅ Реализовать streaming copy
3. ✅ Реализовать rename с import updates
4. ✅ Реализовать split (extract entities)
5. ✅ Реализовать synthesize (combine files)
6. ✅ Интегрировать с GraphStorage и VectorStore
7. ✅ Написать тесты

**Файлы:**
- `src/modification/file-operations.ts` (~800 lines)

**MCP Tools:**
- `copy_file`
- `rename_file`
- `split_file`
- `synthesize_files`

---

### Phase 6: Technology Detection (2-3 дня)

**Цель:** Определение tech stack с интеграцией в embeddings.

**Задачи:**
1. ✅ Создать `TechnologyDetector` class
2. ✅ Реализовать language detection (from graph)
3. ✅ Реализовать framework detection (package.json + imports)
4. ✅ Реализовать build tool detection
5. ✅ Добавить tech context в embeddings metadata
6. ✅ Написать тесты

**Файлы:**
- `src/analysis/technology-detector.ts` (~600 lines)

**MCP Tools:**
- `detect_technology_stack`

---

### Phase 7: Pattern-based Search (3-4 дня)

**Цель:** Расширенный поиск с entity/content/semantic modes.

**Задачи:**
1. ✅ Создать `PatternSearch` class
2. ✅ Реализовать entity search (regex)
3. ✅ Реализовать content search (inside entities)
4. ✅ Реализовать semantic search (vector similarity)
5. ✅ Реализовать hybrid search (combination)
6. ✅ Добавить SIMD-accelerated cosine similarity (WASM)
7. ✅ Интегрировать с TechnologyDetector (framework filtering)
8. ✅ Написать тесты

**Файлы:**
- `src/search/pattern-search.ts` (~700 lines)
- `wasm/vector-ops-simd/src/lib.rs` (~150 lines)

**MCP Tools:**
- `pattern_search`

---

### Phase 8: Integration & Testing (2-3 дня)

**Цель:** Интеграция всех компонентов, тестирование, документация.

**Задачи:**
1. ✅ Интеграция всех компонентов в `src/index.ts`
2. ✅ Обновление MCP tool schemas
3. ✅ E2E тесты для всех workflows
4. ✅ Performance тесты (SIMD, streaming, xxHash)
5. ✅ Документация (README, examples)

**Файлы:**
- `src/index.ts` - add new tools
- `tests/e2e/code-modification.test.ts`
- `tests/performance/simd-benchmarks.test.ts`
- `examples/code-modification-example.ts`
- `README.md` - update with new features

---

## Метрики производительности

### Target Metrics

| Operation | Without Optimization | With SIMD/Streaming/xxHash | Target |
|-----------|---------------------|---------------------------|--------|
| Diff computation (1000 lines) | ~500ms | ~50ms | 10x faster |
| Cosine similarity (384-dim) | ~5ms | ~1ms | 5x faster |
| File copy (100MB) | ~2000ms (in-memory) | ~500ms (streaming) | 4x faster |
| Hash computation (10MB file) | ~100ms (SHA-256) | ~10ms (xxHash) | 10x faster |
| Embedding update (single entity) | ~500ms | ~100ms | 5x faster |

### Memory Usage

| Operation | Without Streaming | With Streaming | Target |
|-----------|------------------|----------------|--------|
| Copy 100MB file | ~100MB | ~5MB | 20x reduction |
| Split large file | ~50MB | ~10MB | 5x reduction |
| Synthesize 10 files (50MB total) | ~50MB | ~10MB | 5x reduction |

### SIMD Benchmarks

Создадим benchmark suite для проверки SIMD эффективности:

```typescript
// tests/performance/simd-benchmarks.test.ts

describe('SIMD Performance', () => {
  it('cosine similarity: SIMD vs JS', async () => {
    const a = new Float32Array(384).fill(0.1);
    const b = new Float32Array(384).fill(0.2);

    // SIMD version
    const simdStart = performance.now();
    const { cosineSimilaritySIMD } = await import('../../wasm/vector-ops-simd.js');
    const simdResult = cosineSimilaritySIMD(a, b);
    const simdTime = performance.now() - simdStart;

    // JS version
    const jsStart = performance.now();
    const jsResult = cosineSimilarityJS(a, b);
    const jsTime = performance.now() - jsStart;

    console.log(`SIMD: ${simdTime}ms, JS: ${jsTime}ms, Speedup: ${jsTime / simdTime}x`);
    expect(simdTime).toBeLessThan(jsTime / 3); // At least 3x faster
  });

  it('diff computation: SIMD vs JS', async () => {
    const oldCode = 'x'.repeat(10000);
    const newCode = 'y'.repeat(10000);

    // SIMD version
    const simdStart = performance.now();
    const { computeDiffSIMD } = await import('../../wasm/diff-simd.js');
    const simdResult = computeDiffSIMD(oldCode, newCode);
    const simdTime = performance.now() - simdStart;

    // JS version
    const jsStart = performance.now();
    const jsResult = computeDiffJS(oldCode, newCode);
    const jsTime = performance.now() - jsStart;

    console.log(`SIMD: ${simdTime}ms, JS: ${jsTime}ms, Speedup: ${jsTime / simdTime}x`);
    expect(simdTime).toBeLessThan(jsTime / 5); // At least 5x faster
  });
});
```

---

## Приложения

### A. Структура директорий (после реализации)

```
ultrascript-tools-mcp/
├── src/
│   ├── modification/
│   │   ├── code-modifier.ts          # Phase 4
│   │   ├── file-operations.ts        # Phase 5
│   │   └── preview-manager.ts        # Phase 2
│   ├── versioning/
│   │   └── version-manager.ts        # Phase 1
│   ├── validation/
│   │   ├── code-validator.ts         # Phase 3
│   │   └── linters/
│   │       ├── eslint-linter.ts
│   │       └── pylint-linter.ts
│   ├── analysis/
│   │   └── technology-detector.ts    # Phase 6
│   ├── search/
│   │   └── pattern-search.ts         # Phase 7
│   └── utils/
│       └── stream-helpers.ts         # Phase 0
├── wasm/
│   ├── diff-simd/                    # Phase 0, 2
│   │   ├── src/lib.rs
│   │   └── Cargo.toml
│   └── vector-ops-simd/              # Phase 0, 7
│       ├── src/lib.rs
│       └── Cargo.toml
├── tests/
│   ├── performance/
│   │   └── simd-benchmarks.test.ts   # Phase 8
│   └── e2e/
│       └── code-modification.test.ts # Phase 8
└── examples/
    └── code-modification-example.ts  # Phase 8
```

### B. Зависимости (package.json additions)

```json
{
  "dependencies": {
    "eslint": "^9.0.0",        // For Code Validator
    "@types/eslint": "^9.0.0"
  },
  "devDependencies": {
    "wasm-pack": "^0.12.0",    // For WASM builds
    "@rollup/plugin-wasm": "^6.2.0"
  },
  "scripts": {
    "build:wasm": "cd wasm/diff-simd && wasm-pack build --target nodejs && cd ../vector-ops-simd && wasm-pack build --target nodejs"
  }
}
```

### C. Оценка трудозатрат

| Phase | Описание | Дни | Приоритет |
|-------|----------|-----|-----------|
| Phase 0 | SIMD/Streaming Infrastructure | 1-2 | Высокий |
| Phase 1 | Version Manager | 2-3 | Высокий |
| Phase 2 | PreviewChanges | 2 | Высокий |
| Phase 3 | Code Validator | 2-3 | Средний |
| Phase 4 | Code Modification API | 3-4 | Высокий |
| Phase 5 | File Operations | 3 | Средний |
| Phase 6 | Technology Detection | 2-3 | Низкий |
| Phase 7 | Pattern-based Search | 3-4 | Средний |
| Phase 8 | Integration & Testing | 2-3 | Высокий |
| **ИТОГО** | | **20-27 дней** | |

**Рекомендуемый порядок:**
1. Phase 0 → Phase 1 → Phase 2 (инфраструктура + safety)
2. Phase 4 → Phase 3 (modification API + validation)
3. Phase 5 → Phase 7 (file ops + search)
4. Phase 6 (tech detection - низкий приоритет)
5. Phase 8 (integration)

---

## Заключение

Данный план охватывает все 7 функций с учётом:

✅ **SIMD-операции** - WASM модули для diff и vector similarity
✅ **Стримы/пайпы** - Все file operations используют `pipeline()`
✅ **xxHash** - Для snapshot integrity, pattern caching, change detection
✅ **Совместимость с embeddings** - Incremental updates, tech context integration

**Ожидаемые результаты:**
- 10x ускорение diff/hash операций
- 5x ускорение векторных операций
- 4-20x снижение memory usage через streaming
- Полная интеграция с LayeredIndexManager, VectorStore, BranchManager

**Следующие шаги:**
1. Утверждение плана
2. Начало Phase 0 (инфраструктура)
3. Итеративная реализация Phase 1-8
4. Continuous testing и performance benchmarking

---

**Вопросы для обсуждения:**
1. Приоритизация фаз - согласен ли с предложенным порядком?
2. WASM SIMD vs Native addons - какой подход предпочтительнее для deployment?
3. oxlint/Pylint integration - добавлять ли поддержку других linters (Rust Clippy, Go golint)?
4. Pattern search - нужны ли дополнительные query modes (AST-based, dependency-based)?

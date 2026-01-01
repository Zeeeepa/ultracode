/**
 * TASK-001: Indexer Agent Implementation
 *
 * Core indexer agent responsible for storing and querying the code graph.
 * Subscribes to parse events and maintains the graph database.
 *

        storageEntities.push(entity);
        validParsed.push(parsed); * Architecture References:
 * - Base Agent: src/agents/base.ts
 * - Agent Types: src/types/agent.ts
 * - Storage Types: src/types/storage.ts
 * - Knowledge Bus: src/core/knowledge-bus.ts
 */

import { nanoid } from "nanoid";
// p-map removed - was used for handleParseBatchComplete which is now disabled
import xxhash from "xxhash-wasm";
import { getConfig } from "../config/yaml-config.js";
import { BranchManager } from "../core/branch-manager.js";
import { GitWatcher } from "../core/git-watcher.js";
import { knowledgeBus } from "../core/knowledge-bus.js";
import { getDataDir } from "../shared/storage-paths.js";
import { BatchOperationsLibSQL } from "../storage/batch-operations-libsql.js";
import { getCacheManager, QueryCacheManager } from "../storage/cache-manager.js";
import { getGraphStorage, getLibSQLAdapter } from "../storage/graph-storage-factory.js";
// SQLiteManager removed - using libsql via GraphStorage
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";
import type {
  BatchResult,
  Entity,
  EntityChange,
  FileInfo,
  GraphQuery,
  GraphQueryResult,
  GraphStorage,
  Relationship,
} from "../types/storage.js";
import { EntityType, flattenParsedEntities, parsedEntityToEntity, RelationType } from "../types/storage.js";
import { logger } from "../utils/logger.js";
import { BaseAgent } from "./base.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
function getIndexerConfig() {
  const config = getConfig();
  return {
    maxConcurrency: config.indexer?.maxConcurrency ?? 8,
    memoryLimit: config.indexer?.memoryLimit ?? 512,
    priority: config.indexer?.priority ?? 7,
    batchSize: config.indexer?.batchSize ?? 1000,
    // OPTIMIZATION: Increased cache size from 50MB to 100MB for better performance
    cacheSize: config.indexer?.cacheSize ?? 100 * 1024 * 1024,
    cacheTTL: config.indexer?.cacheTTL ?? 5 * 60 * 1000,
  };
}

// =============================================================================
// 3. STABLE ID HELPERS
// =============================================================================
const ID_LENGTH = 12;
let xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null;

// Initialize xxHash once
async function initXXHash() {
  if (!xxhashInstance) {
    xxhashInstance = await xxhash();
  }
}

function stableEntityId(base: Omit<Entity, "id" | "createdAt" | "updatedAt">): string {
  // For packages and imports, use global ID (no filePath, no location) since they represent the same entity across files
  const isGlobal = base.type === "package" || base.type === "import";

  const key = isGlobal
    ? `${base.type}|${base.name}` // Only type and name for global entities
    : `${base.filePath}|${base.type}|${base.name}|${base.location?.start?.index ?? -1}-${base.location?.end?.index ?? -1}`; // Full path for file-specific entities

  if (!xxhashInstance) {
    throw new Error("xxHash not initialized - call initXXHash() first");
  }
  return xxhashInstance.h64ToString(key).slice(0, ID_LENGTH);
}
function stableRelationshipId(fromId: string, toId: string, type: RelationType | string): string {
  if (!xxhashInstance) {
    throw new Error("xxHash not initialized - call initXXHash() first");
  }
  return xxhashInstance.h64ToString(`${fromId}|${toId}|${type}`).slice(0, ID_LENGTH);
}

// =============================================================================
// 3. INDEXER TASK TYPES
// =============================================================================

interface ProvidedRelationship {
  from: string;
  to: string;
  type: RelationType | string;
  sourceFile?: string;
  targetFile?: string;
  metadata?: { line?: number | undefined; [k: string]: unknown };
}

export interface IndexerTask extends AgentTask {
  type: "index:entities" | "index:incremental" | "query:graph" | "query:subgraph";
  payload: {
    entities?: ParsedEntity[];
    filePath?: string | undefined;
    changes?: EntityChange[];
    query?: GraphQuery;
    entityId?: string | undefined;
    depth?: number;
    relationships?: EntityRelationship[] | undefined;
  };
}

// =============================================================================
// 4. INDEXER AGENT IMPLEMENTATION
// =============================================================================

export class IndexerAgent extends BaseAgent {
  private graphStorage!: GraphStorage;
  private batchOps!: BatchOperationsLibSQL;
  private cacheManager!: QueryCacheManager;
  private branchManager: BranchManager | null = null;
  private gitWatcher: GitWatcher | null = null;

  // Debounced embedding generation
  private pendingEmbeddingGeneration = false;
  private embeddingDebounceAbort: AbortController | null = null;
  private readonly EMBEDDING_DEBOUNCE_MS = 60_000; // 1 minute
  private currentRepositoryPath: string | null = null;
  private subscriptionIds: string[] = [];
  private ready = false;
  private indexingStats = {
    entitiesIndexed: 0,
    relationshipsCreated: 0,
    filesProcessed: 0,
    totalIndexTime: 0,
    lastIndexTime: 0,
  };

  constructor() {
    super(AgentType.INDEXER, getIndexerConfig());
    console.error(`[IndexerAgent] Created with ID: ${this.id}`);
  }

  /**
   * Initialize the indexer agent
   */
  protected async onInitialize(): Promise<void> {
    const startTime = Date.now();
    logger.trace("AGENT", `[IndexerAgent] ▶ onInitialize() START`);
    console.error(`[${this.id}] Initializing Indexer Agent...`);

    // Initialize xxHash for stable ID generation
    logger.trace("AGENT", `[IndexerAgent] ▶ initXXHash`);
    await initXXHash();
    logger.trace("AGENT", `[IndexerAgent] ◀ initXXHash (${Date.now() - startTime}ms)`);

    // Initialize branch-aware indexing if enabled
    const appConfig = getConfig();
    if (appConfig.indexing?.branchAware) {
      console.error(`[${this.id}] Branch-aware indexing is enabled`);

      // Use centralized storage if no explicit dataDir configured
      const dataDir = appConfig.indexing.dataDir || getDataDir();

      this.branchManager = new BranchManager({
        enabled: true,
        dataDir,
        maxBranchesPerRepo: appConfig.indexing.maxBranchesPerRepo || 10,
        maxTotalBranches: appConfig.indexing.maxTotalBranches || 50,
        evictionStrategy: appConfig.indexing.evictionStrategy || "LRU",
      });

      await this.branchManager.initialize();

      // Initialize GitWatcher if Git integration is enabled
      if (appConfig.git?.enabled && appConfig.git.watchBranchChanges) {
        console.error(`[${this.id}] Git watching is enabled`);

        this.gitWatcher = new GitWatcher({
          enabled: true,
          pollIntervalMs: appConfig.git.pollIntervalMs || 5000,
          autoReindex: appConfig.git.autoReindex ?? true,
          watchUncommitted: appConfig.git.watchUncommitted ?? true,
          uncommittedPollIntervalMs: appConfig.git.uncommittedPollIntervalMs || 10000,
          includeUntracked: appConfig.git.includeUntracked ?? true,
          // Debounce for embedding generation
          debounceMs: appConfig.git.debounceMs ?? 60_000,
          bulkModeThreshold: appConfig.git.bulkModeThreshold ?? 1000,
        });

        // Setup branch change handler
        this.gitWatcher.onBranchChange(async (newBranch, oldBranch) => {
          await this.handleBranchChange(newBranch, oldBranch);
        });

        // Setup uncommitted file change handler for incremental reindexing
        this.gitWatcher.onUncommittedChange(async (files) => {
          await this.handleUncommittedChanges(files);
        });

        // Setup debounced callback for embedding generation
        // This waits for user to stop editing (60s debounce) then generates embeddings
        this.gitWatcher.onDebouncedChange(async (files, bulkMode) => {
          await this.handleDebouncedEmbeddingGeneration(files, bulkMode);
        });
      }
    }

    // CRITICAL FIX: Use singleton GraphStorage instance (libsql unified)
    // This ensures IndexerAgent and MCP tools use the same storage instance
    logger.trace("AGENT", `[IndexerAgent] ▶ getGraphStorage`);
    const gsStart = Date.now();
    this.graphStorage = await getGraphStorage();
    logger.trace("AGENT", `[IndexerAgent] ◀ getGraphStorage (${Date.now() - gsStart}ms)`);
    // Ensure graph storage is fully initialized (re-prepare statements after SQLite reset)
    if (typeof (this.graphStorage as any).initialize === "function") {
      logger.trace("AGENT", `[IndexerAgent] ▶ graphStorage.initialize`);
      await (this.graphStorage as any).initialize();
      logger.trace("AGENT", `[IndexerAgent] ◀ graphStorage.initialize (${Date.now() - gsStart}ms)`);
    }

    const config = getIndexerConfig();

    // v4: Use LibSQL BatchOperations instead of better-sqlite3
    logger.trace("AGENT", `[IndexerAgent] ▶ BatchOperationsLibSQL.initialize`);
    const batchStart = Date.now();
    const adapter = getLibSQLAdapter();
    if (!adapter) {
      throw new Error(
        `[${this.id}] LibSQLAdapter is required but not available - ensure getGraphStorage() was called first`,
      );
    }
    this.batchOps = new BatchOperationsLibSQL(adapter, config.batchSize);
    await this.batchOps.initialize();
    logger.trace("AGENT", `[IndexerAgent] ◀ BatchOperationsLibSQL.initialize (${Date.now() - batchStart}ms)`);
    this.cacheManager = getCacheManager({
      maxSize: config.cacheSize,
      defaultTTL: config.cacheTTL,
    });

    // Subscribe to parse complete events
    this.subscribeToParseEvents();

    this.ready = true;
    console.error(`[${this.id}] Indexer Agent initialized successfully`);
  }

  /**
   * Set the project context for GraphStorage and BatchOperations.
   * v3: Must be called before indexing to ensure correct project_hash.
   */
  setProjectContext(projectPath: string, branchName?: string): void {
    console.error(`[${this.id}] setProjectContext called with: ${projectPath}`);

    // Set context on GraphStorage
    if (this.graphStorage && typeof this.graphStorage.setProject === "function") {
      this.graphStorage.setProject(projectPath, branchName);
      console.error(
        `[${this.id}] GraphStorage context set for project: ${projectPath}, branch: ${branchName || "main"}`,
      );
    } else {
      console.error(`[${this.id}] WARNING: Cannot set GraphStorage context - not ready`);
    }

    // v3: Set context on BatchOperations too!
    if (this.batchOps && typeof this.batchOps.setProject === "function") {
      this.batchOps.setProject(projectPath, branchName);
      console.error(
        `[${this.id}] BatchOperations context set for project: ${projectPath}, branch: ${branchName || "main"}`,
      );
    } else {
      console.error(`[${this.id}] WARNING: Cannot set BatchOperations context - not ready`);
    }
  }

  /**
   * Subscribe to parser events via knowledge bus
   *
   * NOTE: This is DISABLED because DevAgent directly calls indexerAgent.process()/enqueue()
   * after parsing. Subscribing to events would cause DOUBLE processing of each file.
   * Only enable this if IndexerAgent is used standalone without DevAgent.
   */
  private subscribeToParseEvents(): void {
    // DISABLED: DevAgent already calls indexerAgent directly after parsing.
    // Subscribing to events causes each file to be indexed 2-3 times!
    //
    // const parseCompleteId = knowledgeBus.subscribe(this.id, "parse:complete", async (entry: KnowledgeEntry) => {
    //   await this.handleParseComplete(entry);
    // });
    // this.subscriptionIds.push(parseCompleteId);
    //
    // const parseBatchId = knowledgeBus.subscribe(this.id, "parse:batch:complete", async (entry: KnowledgeEntry) => {
    //   await this.handleParseBatchComplete(entry);
    // });
    // this.subscriptionIds.push(parseBatchId);

    console.error(`[${this.id}] Parse event subscriptions DISABLED (DevAgent calls directly)`);
  }

  // NOTE: handleParseComplete and handleParseBatchComplete are removed because
  // DevAgent calls indexerAgent.process()/enqueue() directly after parsing.
  // Keeping these methods would cause unused code warnings.

  /**
   * Check if agent can process the task
   */
  protected canProcessTask(_task: AgentTask): boolean {
    // Allow tasks through to switch so we can throw a clearer error in default branch
    return true;
  }

  /**
   * Process indexer tasks
   */
  protected async processTask(task: AgentTask): Promise<unknown> {
    const indexerTask = task as IndexerTask;

    switch (indexerTask.type) {
      case "index:entities":
        return await this.indexEntities(
          indexerTask.payload.entities!,
          indexerTask.payload.filePath!,
          indexerTask.payload.relationships,
        );

      case "index:incremental":
        return await this.incrementalUpdate(indexerTask.payload.changes!);

      case "query:graph":
        return await this.queryGraph(indexerTask.payload.query!);

      case "query:subgraph":
        return await this.querySubgraph(indexerTask.payload.entityId!, indexerTask.payload.depth || 2);

      default:
        throw new Error(`Unknown task type: ${indexerTask.type}`);
    }
  }

  /**
   * Index entities and build relationships
   */
  async indexEntities(
    entities: ParsedEntity[],
    filePath: string,
    providedRelationships?: ProvidedRelationship[],
  ): Promise<BatchResult & { entitiesIndexed: number; relationshipsCreated: number }> {
    const startTime = Date.now();

    // Flatten entity tree to include all children (class members, properties, methods)
    // This is critical for NgRx effects and other class members to be stored as separate entities
    const flatEntities = flattenParsedEntities(entities);
    const childrenExtracted = flatEntities.length - entities.length;
    console.error(
      `[${this.id}] Indexing ${entities.length} entities (${flatEntities.length} after flatten, ${childrenExtracted} children) from ${filePath}`,
    );
    if (childrenExtracted > 0) {
      // Log some sample children for debugging
      const sampleChildren = flatEntities.slice(entities.length, entities.length + 3);
      console.error(
        `[${this.id}] Sample children: ${sampleChildren.map((c) => `${c.name} (${c.type}, filePath=${c.filePath ? "yes" : "NO"}, location=${c.location ? "yes" : "NO"})`).join(", ")}`,
      );
    }

    // Validate parsed entities and convert to storage entities
    const storageEntities: Entity[] = [];
    const validParsed: ParsedEntity[] = [];
    const preErrors: Array<{ item: unknown; error: string }> = [];
    const fileHash = nanoid(8); // In production, use actual file hash

    for (const parsed of flatEntities) {
      try {
        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof (parsed as any).name !== "string" ||
          !(parsed as any).type ||
          !(parsed as any).location
        ) {
          // Debug: log why entity was rejected
          const reasons: string[] = [];
          if (!parsed) reasons.push("null/undefined");
          else if (typeof parsed !== "object") reasons.push("not object");
          else {
            if (typeof (parsed as any).name !== "string") reasons.push("no name");
            if (!(parsed as any).type) reasons.push("no type");
            if (!(parsed as any).location) reasons.push("no location");
          }
          console.error(
            `[${this.id}] Rejected entity: ${(parsed as any)?.name || "unknown"} - reasons: ${reasons.join(", ")}`,
          );
          throw new Error("Invalid entity");
        }

        const isImport = parsed?.type === "import" && parsed?.importData?.source;
        const hasName = typeof (parsed as any).name === "string" && (parsed as any).name.trim().length > 0;

        const normalizedParsed =
          !hasName && isImport ? { ...(parsed as any), name: `import:${parsed.importData?.source}` } : parsed;

        // Use entity's filePath if available (for flattened children), otherwise use provided filePath
        const entityFilePath = normalizedParsed.filePath || filePath;
        const base = parsedEntityToEntity(normalizedParsed, entityFilePath, fileHash);
        const entity: Entity = {
          ...base,
          id: stableEntityId(base),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        storageEntities.push(entity);
        validParsed.push(normalizedParsed as ParsedEntity);
      } catch (e) {
        preErrors.push({ item: parsed, error: (e as Error).message });
      }
    }

    // Insert entities in batch
    const entityResult = await this.batchOps.insertEntities(storageEntities, (processed, total) => {
      console.error(`[${this.id}] Progress: ${processed}/${total} entities`);
    });

    console.error(
      `[${this.id}] DEBUG: Entity insert result: processed=${entityResult.processed}, failed=${entityResult.failed}, errors=${entityResult.errors.length}`,
    );
    if (entityResult.failed > 0) {
      console.error(
        `[${this.id}] DEBUG: First 3 entity errors:`,
        entityResult.errors.slice(0, 3).map((e) => e.error),
      );
    }

    // OPTIMIZATION: Publish entities for embedding IMMEDIATELY after entity insertion
    // Don't wait for relationship insertion - embedding can start in parallel
    if (validParsed.length) {
      const entitiesWithPath = validParsed.map((entity) => ({
        ...entity,
        filePath: filePath,
      }));
      knowledgeBus.publish("semantic:new_entities", entitiesWithPath, this.id);
      logger.debug("IndexerAgent", `Published semantic:new_entities EARLY`, {
        count: entitiesWithPath.length,
        file: filePath,
      });
    }

    // Build and insert relationships
    let relationships: Relationship[] = [];

    // Use provided relationships if available
    if (providedRelationships && providedRelationships.length > 0) {
      const byName = new Map<string, Entity[]>();
      for (const e of storageEntities) {
        const arr = byName.get(e.name) || [];
        arr.push(e);
        byName.set(e.name, arr);
      }

      console.error(
        `[${this.id}] DEBUG: storageEntities names: ${Array.from(byName.keys()).slice(0, 10).join(", ")}...`,
      );
      const first3 = providedRelationships.slice(0, 3);
      console.error(
        `[${this.id}] DEBUG: First 3 raw relationships:`,
        JSON.stringify(first3.map((r) => ({ from: r.from, to: r.to, type: r.type }))),
      );

      function resolveByNameAndLine(name: string, line?: number): string | undefined {
        const candidates = byName.get(name);
        if (!candidates || candidates.length === 0) return undefined;

        if (line == null) return candidates[0]?.id;

        let best: Entity | undefined;
        let bestDelta = Infinity;

        for (const c of candidates) {
          const d = Math.abs((c.location?.start?.line ?? 0) - line);
          if (d < bestDelta) {
            best = c;
            bestDelta = d;
          }
        }
        return best?.id;
      }
      const relLoopStart = Date.now();
      console.error(`[${this.id}] DEBUG: Processing ${providedRelationships.length} provided relationships`);
      for (const rel of providedRelationships) {
        let fromId = resolveByNameAndLine(rel.from, rel.metadata?.line);
        let toId = resolveByNameAndLine(rel.to, rel.metadata?.line);

        // DEBUG: Log resolution results for first relationship
        if (relationships.length === 0) {
          console.error(
            `[${this.id}] DEBUG: First rel resolution: from="${rel.from}" -> fromId="${fromId}", to="${rel.to}" -> toId="${toId}"`,
          );
        }

        // Create external placeholder for unresolved fromId (e.g., decorators)
        if (!fromId) {
          const src = rel.sourceFile || filePath || "unknown";
          fromId = `external:${src}:${rel.from}`;
        }

        if (!toId) {
          const src = rel.targetFile || "unknown";
          toId = `external:${src}:${rel.to}`;
        }

        if (fromId && toId) {
          relationships.push({
            id: stableRelationshipId(fromId, toId, rel.type as any),
            fromId,
            toId,
            type: rel.type as any,
            metadata: { line: rel.metadata?.line, context: rel.type },
            createdAt: Date.now(),
          } as Relationship);
        } else {
          console.error(`[${this.id}] SKIPPED relationship: ${rel.from} -> ${rel.to} (fromId=${fromId}, toId=${toId})`);
        }
      }
      const relLoopMs = Date.now() - relLoopStart;
      logger.info("PROFILE_INDEXER", "RelationshipLoop", {
        count: providedRelationships.length,
        builtCount: relationships.length,
        ms: relLoopMs,
      });
      console.error(`[${this.id}] Using ${relationships.length} provided relationships (${relLoopMs}ms)`);
    } else {
      relationships = await this.buildRelationships(validParsed, storageEntities);
      console.error(`[${this.id}] Built ${relationships.length} relationships automatically`);
    }

    // Ensure placeholder entities exist for any external relationship sources/targets
    const externalPlaceholders: Entity[] = [];
    const seenExternal = new Map<string, string>(); // extKey -> placeholderId

    const createExternalPlaceholder = (extId: string): string => {
      // Parse extId format: "external:SOURCE:SYMBOL"
      // Handle Windows paths like "external:D:\path\file.ts:Symbol"
      // where the path contains ":" after drive letter
      let source = "unknown";
      let symbol = "unknown";

      if (extId.startsWith("external:")) {
        const rest = extId.slice("external:".length); // Remove "external:" prefix

        // Check for Windows drive letter pattern (e.g., "D:\...")
        if (/^[A-Za-z]:[\\/]/.test(rest)) {
          // Windows path: find the last ":" which separates path from symbol
          const lastColonIdx = rest.lastIndexOf(":");
          if (lastColonIdx > 2) {
            // Must be after "D:\"
            source = rest.slice(0, lastColonIdx);
            symbol = rest.slice(lastColonIdx + 1) || "unknown";
          } else {
            source = rest;
          }
        } else {
          // Unix path or simple format: "SOURCE:SYMBOL"
          const colonIdx = rest.indexOf(":");
          if (colonIdx !== -1) {
            source = rest.slice(0, colonIdx);
            symbol = rest.slice(colonIdx + 1) || "unknown";
          } else {
            source = rest;
          }
        }
      }

      const placeholderBase: Omit<Entity, "id" | "createdAt" | "updatedAt"> = {
        name: symbol,
        type: EntityType.IMPORT,
        filePath: `external://${source}`,
        location: {
          start: { line: 0, column: 0, index: 0 },
          end: { line: 0, column: 0, index: 0 },
        },
        metadata: { isExternal: true, source, symbol } as any,
        hash: `external:${source}:${symbol}`,
      };

      const placeholderId = stableEntityId(placeholderBase);

      if (!seenExternal.has(extId)) {
        seenExternal.set(extId, placeholderId);
        externalPlaceholders.push({
          ...placeholderBase,
          id: placeholderId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      return placeholderId;
    };

    for (const rel of relationships) {
      // Handle external fromId (e.g., decorators from imported modules)
      if (typeof rel.fromId === "string" && rel.fromId.startsWith("external:")) {
        rel.fromId = createExternalPlaceholder(rel.fromId);
      }

      // Handle external toId
      if (typeof rel.toId === "string" && rel.toId.startsWith("external:")) {
        rel.toId = createExternalPlaceholder(rel.toId);
      }

      rel.id = stableRelationshipId(rel.fromId, rel.toId, rel.type);
    }

    if (externalPlaceholders.length > 0) {
      await this.batchOps.insertEntities(externalPlaceholders);
    }

    console.error(`[${this.id}] DEBUG: About to insert ${relationships.length} relationships into DB`);
    console.error(
      `[${this.id}] DEBUG: First 3 relationships:`,
      relationships.slice(0, 3).map((r) => `${r.fromId} -> ${r.toId} (${r.type})`),
    );

    const insertRelStart = Date.now();
    const relResult = await this.batchOps.insertRelationships(relationships, (processed, total) => {
      console.error(`[${this.id}] Progress: ${processed}/${total} relationships`);
    });
    const insertRelMs = Date.now() - insertRelStart;
    logger.info("PROFILE_INDEXER", "InsertRelationships", {
      count: relationships.length,
      processed: relResult.processed,
      ms: insertRelMs,
    });

    // Update file info
    const fileInfo: FileInfo = {
      path: filePath,
      hash: fileHash,
      lastIndexed: Date.now(),
      entityCount: storageEntities.length,
    };
    await this.graphStorage.updateFileInfo(fileInfo);

    // Clear relevant cache entries
    this.cacheManager.clear();

    // Update statistics
    const indexTime = Date.now() - startTime;
    this.indexingStats.entitiesIndexed += entityResult.processed;
    this.indexingStats.relationshipsCreated += relResult.processed;
    this.indexingStats.filesProcessed++;
    this.indexingStats.totalIndexTime += indexTime;
    this.indexingStats.lastIndexTime = indexTime;

    // Publish indexing complete event
    console.error(`[IndexerAgent] Publishing index:complete event`);
    knowledgeBus.publish(
      "index:complete",
      {
        filePath,
        entities: entityResult.processed,
        relationships: relResult.processed,
        timeMs: indexTime,
      },
      this.id,
    );
    console.error(`[IndexerAgent] Published index:complete event`);

    // NOTE: semantic:new_entities is now published EARLY (after entity insertion, before relationships)
    // This allows embedding generation to run in parallel with relationship insertion

    console.error(
      `[${this.id}] Indexed ${entityResult.processed} entities and ${relResult.processed} relationships in ${indexTime}ms`,
    );

    const failed = entityResult.failed + relResult.failed + preErrors.length;
    const errors = [...entityResult.errors, ...relResult.errors, ...preErrors];

    // Return complete indexing statistics
    const { timeMs: _throwAway, ...restBase } = entityResult;

    return {
      ...restBase,
      failed,
      errors,
      timeMs: indexTime,
      entitiesIndexed: entityResult.processed,
      relationshipsCreated: relResult.processed,
    };
  }

  /**
   * Build relationships from parsed entities
   */
  private async buildRelationships(parsedEntities: ParsedEntity[], storageEntities: Entity[]): Promise<Relationship[]> {
    const relationships: Relationship[] = [];
    const entityMap = new Map<string, string>(); // name -> id mapping

    // Build entity map
    for (const entity of storageEntities) {
      entityMap.set(`${entity.name}:${entity.location.start.line}`, entity.id);
    }

    // Create relationships
    const len = Math.min(parsedEntities.length, storageEntities.length);
    for (let i = 0; i < len; i++) {
      const parsed = parsedEntities[i]!;
      const entity = storageEntities[i]!;

      // Import relationships
      if (parsed.type === "import" && parsed.importData) {
        for (const specifier of parsed.importData.specifiers) {
          relationships.push({
            id: nanoid(12),
            fromId: entity.id,
            toId: `external:${parsed.importData.source}:${specifier.imported || specifier.local}`,
            type: RelationType.IMPORTS,
            metadata: {
              line: parsed.location.start.line,
              column: parsed.location.start.column,
              context: `Import from ${parsed.importData.source}`,
            },
          });
        }
      }

      // Reference relationships
      if (parsed.references) {
        for (const ref of parsed.references) {
          // Try to find referenced entity in current file
          const refKey = Array.from(entityMap.keys()).find((key) => key.startsWith(`${ref}:`));
          if (refKey) {
            relationships.push({
              id: nanoid(12),
              fromId: entity.id,
              toId: entityMap.get(refKey)!,
              type: RelationType.REFERENCES,
              metadata: {
                line: parsed.location.start.line,
                column: parsed.location.start.column,
              },
            });
          }
        }
      }

      // Parent-child relationships
      if (parsed.children) {
        for (const child of parsed.children) {
          const childKey = `${child.name}:${child.location.start.line}`;
          const childId = entityMap.get(childKey);
          if (childId) {
            relationships.push({
              id: nanoid(12),
              fromId: entity.id,
              toId: childId,
              type: RelationType.CONTAINS,
              metadata: {
                line: child.location.start.line,
                column: child.location.start.column,
              },
            });
          }
        }
      }

      // Inheritance relationships (extends/implements)
      if (parsed.inheritance) {
        // Base classes -> EXTENDS relationship
        if (parsed.inheritance.baseClasses) {
          for (const baseClass of parsed.inheritance.baseClasses) {
            // Try to find base class in current file first
            const baseKey = Array.from(entityMap.keys()).find((key) => key.startsWith(`${baseClass}:`));
            const targetId = baseKey ? entityMap.get(baseKey)! : `external:${baseClass}`;

            relationships.push({
              id: nanoid(12),
              fromId: entity.id,
              toId: targetId,
              type: RelationType.EXTENDS,
              metadata: {
                line: parsed.location.start.line,
                column: parsed.location.start.column,
                context: `${parsed.name} extends ${baseClass}`,
              },
            });
          }
        }

        // Interfaces -> IMPLEMENTS relationship
        if (parsed.inheritance.interfaces) {
          for (const iface of parsed.inheritance.interfaces) {
            // Try to find interface in current file first
            const ifaceKey = Array.from(entityMap.keys()).find((key) => key.startsWith(`${iface}:`));
            const targetId = ifaceKey ? entityMap.get(ifaceKey)! : `external:${iface}`;

            relationships.push({
              id: nanoid(12),
              fromId: entity.id,
              toId: targetId,
              type: RelationType.IMPLEMENTS,
              metadata: {
                line: parsed.location.start.line,
                column: parsed.location.start.column,
                context: `${parsed.name} implements ${iface}`,
              },
            });
          }
        }
      }

      // Parser-provided relationships (calls, decorates, overrides, etc.)
      if (parsed.relationships) {
        for (const rel of parsed.relationships) {
          // Try to find target entity in current file
          const targetKey = Array.from(entityMap.keys()).find((key) => key.startsWith(`${rel.target}:`));
          const targetId = targetKey ? entityMap.get(targetKey)! : `external:${rel.target}`;

          // Map parser relationship types to storage RelationType
          let relType: RelationType;
          switch (rel.type) {
            case "calls":
              relType = RelationType.CALLS;
              break;
            case "inherits":
              relType = RelationType.EXTENDS;
              break;
            case "implements":
              relType = RelationType.IMPLEMENTS;
              break;
            case "imports":
              relType = RelationType.IMPORTS;
              break;
            case "contains":
              relType = RelationType.CONTAINS;
              break;
            default:
              relType = RelationType.REFERENCES;
              break;
          }

          relationships.push({
            id: nanoid(12),
            fromId: entity.id,
            toId: targetId,
            type: relType,
            metadata: {
              line: parsed.location.start.line,
              column: parsed.location.start.column,
              context: `${parsed.name} ${rel.type} ${rel.target}`,
              originalType: rel.type,
              ...rel.metadata,
            },
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Perform incremental update for changed entities
   */
  async incrementalUpdate(changes: EntityChange[]): Promise<BatchResult> {
    console.error(`[${this.id}] Processing ${changes.length} incremental changes`);

    const toAdd: Entity[] = [];
    const toUpdate: Array<{ id: string; changes: Partial<Entity> }> = [];
    const toDelete: string[] = [];

    for (const change of changes) {
      switch (change.type) {
        case "added":
          if (change.entity) {
            toAdd.push(change.entity);
          }
          break;

        case "modified":
          if (change.entity && change.entityId) {
            toUpdate.push({
              id: change.entityId,
              changes: change.entity,
            });
          }
          break;

        case "deleted":
          if (change.entityId) {
            toDelete.push(change.entityId);
          }
          break;
      }
    }

    // Process changes
    let processed = 0;
    let failed = 0;
    const errors: Array<{ item: unknown; error: string }> = [];

    if (toAdd.length > 0) {
      const result = await this.batchOps.insertEntities(toAdd);
      processed += result.processed;
      failed += result.failed;
      errors.push(...result.errors);
    }

    if (toUpdate.length > 0) {
      const result = await this.batchOps.updateEntities(toUpdate);
      processed += result.processed;
      failed += result.failed;
      errors.push(...result.errors);
    }

    if (toDelete.length > 0) {
      const result = await this.batchOps.deleteEntities(toDelete);
      processed += result.processed;
      failed += result.failed;
      errors.push(...result.errors);
    }

    // Clear cache after updates
    this.cacheManager.clear();

    // Trigger debounced embedding generation
    this.scheduleEmbeddingGeneration();

    return {
      processed,
      failed,
      errors,
      timeMs: 0,
    };
  }

  /**
   * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
   */
  private async sleep(ms: number): Promise<void> {
    if (typeof (globalThis as any).Bun?.sleep === "function") {
      await (globalThis as any).Bun.sleep(ms);
    } else {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  /**
   * Schedule debounced embedding generation
   * Waits 1 minute after last change before triggering generation
   */
  private scheduleEmbeddingGeneration(): void {
    // Cancel existing timer
    if (this.embeddingDebounceAbort) {
      this.embeddingDebounceAbort.abort();
    }

    // Create new abort controller
    this.embeddingDebounceAbort = new AbortController();
    const signal = this.embeddingDebounceAbort.signal;

    logger.debug("IndexerAgent", `Embedding generation scheduled in ${this.EMBEDDING_DEBOUNCE_MS}ms`);

    // Start async timer
    (async () => {
      try {
        const startTime = Date.now();
        while (!signal.aborted && Date.now() - startTime < this.EMBEDDING_DEBOUNCE_MS) {
          await this.sleep(1000); // Check every second
        }
        if (!signal.aborted) {
          this.triggerEmbeddingGeneration();
        }
      } catch (error) {
        // Aborted or error - do nothing
      }
    })();
  }

  /**
   * Trigger embedding generation via knowledge bus
   * SemanticAgent subscribes to this event
   */
  private async triggerEmbeddingGeneration(): Promise<void> {
    if (this.pendingEmbeddingGeneration) {
      logger.debug("IndexerAgent", "Embedding generation already pending, skipping");
      return;
    }

    this.pendingEmbeddingGeneration = true;
    logger.info("IndexerAgent", "Triggering batch embedding generation after incremental update");

    // Publish event for SemanticAgent
    knowledgeBus.publish(
      "indexer:incremental:complete",
      {
        timestamp: Date.now(),
        reason: "debounced_after_incremental_update",
      },
      this.id,
    );

    // Reset flag after a delay using runtime-aware sleep
    await this.sleep(5000);
    this.pendingEmbeddingGeneration = false;
  }

  /**
   * Query the graph
   */
  async queryGraph(query: GraphQuery): Promise<GraphQueryResult> {
    // Check cache
    const cacheKey = QueryCacheManager.createKey(query);
    const cached = this.cacheManager.get<GraphQueryResult>(cacheKey);
    if (cached) {
      console.error(`[${this.id}] Cache hit for graph query`);
      return cached;
    }

    // Execute query
    console.error(`[${this.id}] Executing graph query`);
    const result = await this.graphStorage.executeQuery(query);

    // Cache result
    this.cacheManager.set(cacheKey, result);

    return result;
  }

  /**
   * Query subgraph for an entity
   */
  async querySubgraph(entityId: string, depth: number): Promise<GraphQueryResult> {
    // Check cache
    const cacheKey = QueryCacheManager.createKey({ entityId, depth });
    const cached = this.cacheManager.get<GraphQueryResult>(cacheKey);
    if (cached) {
      console.error(`[${this.id}] Cache hit for subgraph query`);
      return cached;
    }

    // Execute query
    console.error(`[${this.id}] Getting subgraph for ${entityId} with depth ${depth}`);
    const result = await this.graphStorage.getSubgraph(entityId, depth);

    // Cache result
    this.cacheManager.set(cacheKey, result);

    return result;
  }

  /**
   * Handle incoming messages
   */
  protected async handleMessage(message: AgentMessage): Promise<void> {
    console.error(`[${this.id}] Received message: ${message.type} from ${message.from}`);

    switch (message.type) {
      case "index:request": {
        // Handle indexing request
        const task: IndexerTask = {
          id: message.id,
          type: "index:entities",
          priority: 5,
          payload: message.payload as IndexerTask["payload"],
          createdAt: Date.now(),
        };
        await this.process(task);
        break;
      }

      case "query:request": {
        // Handle query request
        const queryTask: IndexerTask = {
          id: message.id,
          type: "query:graph",
          priority: 8,
          payload: message.payload as IndexerTask["payload"],
          createdAt: Date.now(),
        };
        const result = await this.process(queryTask);

        // Send response
        await this.send({
          id: nanoid(12),
          from: this.id,
          to: message.from,
          type: "query:response",
          payload: result,
          timestamp: Date.now(),
          correlationId: message.id,
        });
        break;
      }

      default:
        console.warn(`[${this.id}] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle uncommitted file changes detected by GitWatcher
   * Triggers incremental reindexing for changed files
   */
  private async handleUncommittedChanges(files: string[]): Promise<void> {
    if (!this.currentRepositoryPath || files.length === 0) {
      return;
    }

    console.error(`[${this.id}] Uncommitted changes detected: ${files.length} files`);

    // Resolve relative paths to absolute
    const { join, isAbsolute } = await import("node:path");
    const absolutePaths = files.map((f) => (isAbsolute(f) ? f : join(this.currentRepositoryPath!, f)));

    // Publish file:changed events for each file
    // These will be picked up by components subscribed to the knowledge bus
    for (const filePath of absolutePaths) {
      knowledgeBus.publish(
        "file:changed",
        {
          filePath,
          changeType: "modified",
          source: "git-watcher",
        },
        this.id,
      );
    }

    // Also publish a batch event for efficiency
    knowledgeBus.publish(
      "indexer:files:changed",
      {
        files: absolutePaths,
        count: absolutePaths.length,
        repositoryPath: this.currentRepositoryPath,
        source: "git-watcher-uncommitted",
      },
      this.id,
    );

    console.error(`[${this.id}] Published change events for ${absolutePaths.length} files`);
  }

  /**
   * Handle debounced file changes for embedding generation.
   * Called after user stops editing (debounce period elapsed).
   * @param files - List of changed files (accumulated during debounce)
   * @param bulkMode - If true, many files changed -> drop/rebuild index. If false, incremental insert.
   */
  private async handleDebouncedEmbeddingGeneration(files: string[], bulkMode: boolean): Promise<void> {
    if (!this.currentRepositoryPath || files.length === 0) {
      return;
    }

    console.error(`[${this.id}] Debounced embedding generation: ${files.length} files (bulkMode: ${bulkMode})`);

    // Publish event for SemanticAgent to pick up
    // SemanticAgent will handle the actual embedding generation with bulk mode flag
    knowledgeBus.publish(
      "indexer:embeddings:generate",
      {
        files,
        count: files.length,
        bulkMode,
        repositoryPath: this.currentRepositoryPath,
        source: "git-watcher-debounced",
      },
      this.id,
    );

    console.error(`[${this.id}] Published embedding generation event: ${files.length} files, bulkMode=${bulkMode}`);
  }

  /**
   * Handle branch change event
   */
  private async handleBranchChange(newBranch: string, oldBranch: string): Promise<void> {
    console.error(`[${this.id}] Branch changed from ${oldBranch} to ${newBranch}`);

    if (!this.branchManager || !this.currentRepositoryPath) {
      console.warn(`[${this.id}] BranchManager not initialized, skipping branch switch`);
      return;
    }

    try {
      // Switch to new branch database
      await this.branchManager.switchBranch(newBranch, this.currentRepositoryPath);

      // Emit event for other components
      knowledgeBus.publish(
        "indexer:branch:changed",
        {
          oldBranch,
          newBranch,
          repositoryPath: this.currentRepositoryPath,
        },
        this.id,
      );

      console.error(`[${this.id}] Successfully switched to branch: ${newBranch}`);
    } catch (error) {
      console.error(`[${this.id}] Failed to handle branch change:`, error);
    }
  }

  /**
   * Get BranchManager instance
   */
  getBranchManager(): BranchManager | null {
    return this.branchManager;
  }

  /**
   * Get GitWatcher instance
   */
  getGitWatcher(): GitWatcher | null {
    return this.gitWatcher;
  }

  /**
   * Set current repository path and start watching if Git is enabled
   */
  setRepositoryPath(path: string): void {
    this.currentRepositoryPath = path;

    if (this.gitWatcher && this.branchManager) {
      this.gitWatcher.startWatching(path);
      console.error(`[${this.id}] Started watching repository: ${path}`);
    }
  }

  /**
   * Shutdown the indexer agent
   */
  protected async onShutdown(): Promise<void> {
    console.error(`[${this.id}] Shutting down Indexer Agent...`);

    // Stop GitWatcher
    if (this.gitWatcher) {
      this.gitWatcher.stopWatching();
    }

    // Unsubscribe from knowledge bus
    try {
      for (const id of this.subscriptionIds) {
        knowledgeBus.unsubscribe(id);
      }
    } catch {}

    // Run final maintenance only if agent was initialized
    if (this.ready) {
      try {
        await this.graphStorage.analyze();
      } catch (e) {
        console.warn(`[${this.id}] Analyze on shutdown skipped: ${(e as Error).message}`);
      }
    }

    // Clear cache
    try {
      this.cacheManager?.clear();
    } catch {}

    console.error(`[${this.id}] Indexer Agent shutdown complete`);
    console.error(`[${this.id}] Final stats:`, this.indexingStats);
  }

  /**
   * Get indexing statistics
   */
  getIndexingStats(): typeof this.indexingStats {
    return { ...this.indexingStats };
  }

  /**
   * Get storage metrics
   */
  async getStorageMetrics() {
    return await this.graphStorage.getMetrics();
  }

  /**
   * Perform maintenance operations
   */
  async performMaintenance(): Promise<void> {
    console.error(`[${this.id}] Performing maintenance...`);

    // Vacuum database
    await this.graphStorage.vacuum();

    // Analyze for query optimization
    await this.graphStorage.analyze();

    // Prune cache
    this.cacheManager.prune();

    // Optimize batch size based on performance
    const avgTime = this.indexingStats.totalIndexTime / Math.max(1, this.indexingStats.filesProcessed);
    this.batchOps.optimizeBatchSize(avgTime);

    console.error(`[${this.id}] Maintenance complete`);
  }
}

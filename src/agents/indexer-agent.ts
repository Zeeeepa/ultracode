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
import xxhash from "xxhash-wasm";
import { getConfig } from "../config/yaml-config.js";
import { BranchManager } from "../core/branch-manager.js";
import { GitWatcher } from "../core/git-watcher.js";
import { type KnowledgeEntry, knowledgeBus } from "../core/knowledge-bus.js";
import { BatchOperations } from "../storage/batch-operations.js";
import { getCacheManager, QueryCacheManager } from "../storage/cache-manager.js";
import type { GraphStorageImpl } from "../storage/graph-storage.js";
import { getGraphStorage } from "../storage/graph-storage-factory.js";
import type { SQLiteManager } from "../storage/sqlite-manager.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { EntityRelationship, ParsedEntity, ParseResult } from "../types/parser.js";
import type {
  BatchResult,
  Entity,
  EntityChange,
  FileInfo,
  GraphQuery,
  GraphQueryResult,
  Relationship,
} from "../types/storage.js";
import { EntityType, parsedEntityToEntity, RelationType } from "../types/storage.js";
import { BaseAgent } from "./base.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
function getIndexerConfig() {
  const config = getConfig();
  return {
    maxConcurrency: config.indexer?.maxConcurrency ?? 2,
    memoryLimit: config.indexer?.memoryLimit ?? 512,
    priority: config.indexer?.priority ?? 7,
    batchSize: config.indexer?.batchSize ?? 1000,
    cacheSize: config.indexer?.cacheSize ?? 50 * 1024 * 1024,
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
  targetFile?: string;
  metadata?: { line?: number; [k: string]: unknown };
}

export interface IndexerTask extends AgentTask {
  type: "index:entities" | "index:incremental" | "query:graph" | "query:subgraph";
  payload: {
    entities?: ParsedEntity[];
    filePath?: string;
    changes?: EntityChange[];
    query?: GraphQuery;
    entityId?: string;
    depth?: number;
    relationships?: EntityRelationship[];
  };
}

// =============================================================================
// 4. INDEXER AGENT IMPLEMENTATION
// =============================================================================

export class IndexerAgent extends BaseAgent {
  private sqliteManager!: SQLiteManager;
  private graphStorage!: GraphStorageImpl;
  private batchOps!: BatchOperations;
  private cacheManager!: QueryCacheManager;
  private branchManager: BranchManager | null = null;
  private gitWatcher: GitWatcher | null = null;
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

  constructor(sqliteManager: SQLiteManager) {
    super(AgentType.INDEXER, getIndexerConfig());
    this.sqliteManager = sqliteManager;
    console.log(`[IndexerAgent] Created with ID: ${this.id} and provided SQLiteManager`);
  }

  /**
   * Initialize the indexer agent
   */
  protected async onInitialize(): Promise<void> {
    console.log(`[${this.id}] Initializing Indexer Agent...`);

    // Initialize xxHash for stable ID generation
    await initXXHash();

    // Ensure SQLite manager is initialized
    if (!this.sqliteManager) {
      throw new Error(`[${this.id}] SQLiteManager is required but not provided`);
    }

    if (!this.sqliteManager.isOpen()) {
      this.sqliteManager.initialize();
    }

    // Initialize branch-aware indexing if enabled
    const appConfig = getConfig();
    if (appConfig.indexing?.branchAware) {
      console.log(`[${this.id}] Branch-aware indexing is enabled`);

      this.branchManager = new BranchManager({
        enabled: true,
        dataDir: appConfig.indexing.dataDir || "./data",
        maxBranchesPerRepo: appConfig.indexing.maxBranchesPerRepo || 10,
        maxTotalBranches: appConfig.indexing.maxTotalBranches || 50,
        evictionStrategy: appConfig.indexing.evictionStrategy || "LRU",
      });

      await this.branchManager.initialize();

      // Initialize GitWatcher if Git integration is enabled
      if (appConfig.git?.enabled && appConfig.git.watchBranchChanges) {
        console.log(`[${this.id}] Git watching is enabled`);

        this.gitWatcher = new GitWatcher({
          enabled: true,
          pollIntervalMs: appConfig.git.pollIntervalMs || 5000,
          autoReindex: appConfig.git.autoReindex || true,
        });

        // Setup branch change handler
        this.gitWatcher.onBranchChange(async (newBranch, oldBranch) => {
          await this.handleBranchChange(newBranch, oldBranch);
        });
      }
    }

    // CRITICAL FIX: Use singleton GraphStorage instance
    // This ensures IndexerAgent and MCP tools use the same storage instance
    this.graphStorage = await getGraphStorage(this.sqliteManager);
    // Ensure graph storage is fully initialized (re-prepare statements after SQLite reset)
    if (typeof (this.graphStorage as any).initialize === "function") {
      await (this.graphStorage as any).initialize();
    }

    const config = getIndexerConfig();
    this.batchOps = new BatchOperations(this.sqliteManager.getConnection(), config.batchSize);
    await this.batchOps.initialize();
    this.cacheManager = getCacheManager({
      maxSize: config.cacheSize,
      defaultTTL: config.cacheTTL,
    });

    // Subscribe to parse complete events
    this.subscribeToParseEvents();

    this.ready = true;
    console.log(`[${this.id}] Indexer Agent initialized successfully`);
  }

  /**
   * Subscribe to parser events via knowledge bus
   */
  private subscribeToParseEvents(): void {
    // Subscribe to parse complete events
    const parseCompleteId = knowledgeBus.subscribe(this.id, "parse:complete", async (entry: KnowledgeEntry) => {
      await this.handleParseComplete(entry);
    });
    this.subscriptionIds.push(parseCompleteId);

    // Subscribe to parse batch complete events
    const parseBatchId = knowledgeBus.subscribe(this.id, "parse:batch:complete", async (entry: KnowledgeEntry) => {
      await this.handleParseBatchComplete(entry);
    });
    this.subscriptionIds.push(parseBatchId);

    console.log(`[${this.id}] Subscribed to parse events`);
  }

  /**
   * Handle parse complete event
   */
  private async handleParseComplete(entry: KnowledgeEntry): Promise<void> {
    const parseResult = entry.data as ParseResult;
    console.log(`[${this.id}] Received parse result for ${parseResult.filePath}`);

    // Create indexing task
    const config = getIndexerConfig();
    const task: IndexerTask = {
      id: nanoid(12),
      type: "index:entities",
      priority: config.priority,
      payload: {
        entities: parseResult.entities,
        filePath: parseResult.filePath,
        relationships: parseResult.relationships,
      },
      createdAt: Date.now(),
    };

    // Process the task
    await this.process(task);
  }

  /**
   * Handle parse batch complete event
   */
  private async handleParseBatchComplete(entry: KnowledgeEntry): Promise<void> {
    const results = entry.data as ParseResult[];
    console.log(`[${this.id}] Received batch parse results for ${results.length} files`);

    const config = getIndexerConfig();
    for (const result of results) {
      const task: IndexerTask = {
        id: nanoid(12),
        type: "index:entities",
        priority: config.priority,
        payload: {
          entities: result.entities,
          filePath: result.filePath,
          relationships: result.relationships,
        },
        createdAt: Date.now(),
      };

      await this.process(task);
    }
  }

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
    console.log(`[${this.id}] Indexing ${entities.length} entities from ${filePath}`);

    // Validate parsed entities and convert to storage entities
    const storageEntities: Entity[] = [];
    const validParsed: ParsedEntity[] = [];
    const preErrors: Array<{ item: unknown; error: string }> = [];
    const fileHash = nanoid(8); // In production, use actual file hash

    for (const parsed of entities) {
      try {
        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof (parsed as any).name !== "string" ||
          !(parsed as any).type ||
          !(parsed as any).location
        ) {
          throw new Error("Invalid entity");
        }

        const isImport = parsed?.type === "import" && parsed?.importData?.source;
        const hasName = typeof (parsed as any).name === "string" && (parsed as any).name.trim().length > 0;

        const normalizedParsed =
          !hasName && isImport ? { ...(parsed as any), name: `import:${parsed.importData?.source}` } : parsed;

        const base = parsedEntityToEntity(normalizedParsed, filePath, fileHash);
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
      console.log(`[${this.id}] Progress: ${processed}/${total} entities`);
    });

    console.log(
      `[${this.id}] DEBUG: Entity insert result: processed=${entityResult.processed}, failed=${entityResult.failed}, errors=${entityResult.errors.length}`,
    );
    if (entityResult.failed > 0) {
      console.log(
        `[${this.id}] DEBUG: First 3 entity errors:`,
        entityResult.errors.slice(0, 3).map((e) => e.error),
      );
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

      console.log(`[${this.id}] DEBUG: storageEntities names: ${Array.from(byName.keys()).slice(0, 10).join(", ")}...`);
      const first3 = providedRelationships.slice(0, 3);
      console.log(
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
      console.log(`[${this.id}] DEBUG: Processing ${providedRelationships.length} provided relationships`);
      for (const rel of providedRelationships) {
        const fromId = resolveByNameAndLine(rel.from, rel.metadata?.line);
        let toId = resolveByNameAndLine(rel.to, rel.metadata?.line);

        // DEBUG: Log resolution results for first relationship
        if (relationships.length === 0) {
          console.log(
            `[${this.id}] DEBUG: First rel resolution: from="${rel.from}" -> fromId="${fromId}", to="${rel.to}" -> toId="${toId}"`,
          );
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
          console.log(`[${this.id}] SKIPPED relationship: ${rel.from} -> ${rel.to} (fromId=${fromId}, toId=${toId})`);
        }
      }
      console.log(`[${this.id}] Using ${relationships.length} provided relationships`);
    } else {
      relationships = await this.buildRelationships(validParsed, storageEntities);
      console.log(`[${this.id}] Built ${relationships.length} relationships automatically`);
    }

    // Ensure placeholder entities exist for any external relationship targets
    const externalPlaceholders: Entity[] = [];
    const seenExternal = new Map<string, string>(); // extKey -> placeholderId

    for (const rel of relationships) {
      if (typeof rel.toId === "string" && rel.toId.startsWith("external:")) {
        const parts = rel.toId.split(":");
        const source = parts[1] ?? "unknown";
        const symbol = parts.slice(2).join(":") || "unknown";

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

        if (!seenExternal.has(rel.toId)) {
          seenExternal.set(rel.toId, placeholderId);
          externalPlaceholders.push({
            ...placeholderBase,
            id: placeholderId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }

        rel.toId = placeholderId;
      }

      rel.id = stableRelationshipId(rel.fromId, rel.toId, rel.type);
    }

    if (externalPlaceholders.length > 0) {
      await this.batchOps.insertEntities(externalPlaceholders);
    }

    console.log(`[${this.id}] DEBUG: About to insert ${relationships.length} relationships into DB`);
    console.log(
      `[${this.id}] DEBUG: First 3 relationships:`,
      relationships.slice(0, 3).map((r) => `${r.fromId} -> ${r.toId} (${r.type})`),
    );

    const relResult = await this.batchOps.insertRelationships(relationships, (processed, total) => {
      console.log(`[${this.id}] Progress: ${processed}/${total} relationships`);
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
    console.log(`[IndexerAgent] Publishing index:complete event`);
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
    console.log(`[IndexerAgent] Published index:complete event`);

    if (validParsed.length) {
      const entitiesWithPath = validParsed.map((entity) => ({
        ...entity,
        filePath: filePath,
      }));
      knowledgeBus.publish("semantic:new_entities", entitiesWithPath, this.id);
    }

    console.log(
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
    }

    return relationships;
  }

  /**
   * Perform incremental update for changed entities
   */
  async incrementalUpdate(changes: EntityChange[]): Promise<BatchResult> {
    console.log(`[${this.id}] Processing ${changes.length} incremental changes`);

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

    return {
      processed,
      failed,
      errors,
      timeMs: 0,
    };
  }

  /**
   * Query the graph
   */
  async queryGraph(query: GraphQuery): Promise<GraphQueryResult> {
    // Check cache
    const cacheKey = QueryCacheManager.createKey(query);
    const cached = this.cacheManager.get<GraphQueryResult>(cacheKey);
    if (cached) {
      console.log(`[${this.id}] Cache hit for graph query`);
      return cached;
    }

    // Execute query
    console.log(`[${this.id}] Executing graph query`);
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
      console.log(`[${this.id}] Cache hit for subgraph query`);
      return cached;
    }

    // Execute query
    console.log(`[${this.id}] Getting subgraph for ${entityId} with depth ${depth}`);
    const result = await this.graphStorage.getSubgraph(entityId, depth);

    // Cache result
    this.cacheManager.set(cacheKey, result);

    return result;
  }

  /**
   * Handle incoming messages
   */
  protected async handleMessage(message: AgentMessage): Promise<void> {
    console.log(`[${this.id}] Received message: ${message.type} from ${message.from}`);

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
   * Handle branch change event
   */
  private async handleBranchChange(newBranch: string, oldBranch: string): Promise<void> {
    console.log(`[${this.id}] Branch changed from ${oldBranch} to ${newBranch}`);

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

      console.log(`[${this.id}] Successfully switched to branch: ${newBranch}`);
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
      console.log(`[${this.id}] Started watching repository: ${path}`);
    }
  }

  /**
   * Shutdown the indexer agent
   */
  protected async onShutdown(): Promise<void> {
    console.log(`[${this.id}] Shutting down Indexer Agent...`);

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

    // Run final maintenance only if agent was initialized and DB is open
    if (this.ready) {
      try {
        this.sqliteManager.getConnection();
        await this.graphStorage.analyze();
      } catch (e) {
        console.warn(`[${this.id}] Analyze on shutdown skipped: ${(e as Error).message}`);
      }
    }

    // Close database connection
    try {
      if (this.ready) {
        this.sqliteManager.close();
      }
    } catch {}

    // Clear cache
    try {
      this.cacheManager?.clear();
    } catch {}

    console.log(`[${this.id}] Indexer Agent shutdown complete`);
    console.log(`[${this.id}] Final stats:`, this.indexingStats);
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
    console.log(`[${this.id}] Performing maintenance...`);

    // Vacuum database
    await this.graphStorage.vacuum();

    // Analyze for query optimization
    await this.graphStorage.analyze();

    // Prune cache
    this.cacheManager.prune();

    // Optimize batch size based on performance
    const avgTime = this.indexingStats.totalIndexTime / Math.max(1, this.indexingStats.filesProcessed);
    this.batchOps.optimizeBatchSize(avgTime);

    console.log(`[${this.id}] Maintenance complete`);
  }
}

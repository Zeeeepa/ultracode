/**
 * State Pattern Detector
 *
 * Detects state patterns and their operations across the codebase.
 * Works together with RaceDetector for race condition analysis.
 */

import { log } from "../../logging/index.js";
import type {
  ChaosAnalysisOptions,
  RaceAnalysis,
  StateOperation,
  StateOperationType,
  StatePattern,
} from "../../types/chaos-analysis.js";
import type { Entity, GraphStorage, Relationship } from "../../types/storage.js";
import { EntityType, RelationType } from "../../types/storage.js";

/** Relationship lookup type: entityId → all relationships where entity is source or target */
export type RelationshipLookup = Map<string, Relationship[]>;

/**
 * Build O(1) relationship lookup from flat array.
 * Indexes each relationship under both fromId and toId.
 */
export function buildRelationshipLookup(relationships: Relationship[]): RelationshipLookup {
  const lookup: RelationshipLookup = new Map();
  for (const rel of relationships) {
    let fromArr = lookup.get(rel.fromId);
    if (!fromArr) {
      fromArr = [];
      lookup.set(rel.fromId, fromArr);
    }
    fromArr.push(rel);

    if (rel.toId !== rel.fromId) {
      let toArr = lookup.get(rel.toId);
      if (!toArr) {
        toArr = [];
        lookup.set(rel.toId, toArr);
      }
      toArr.push(rel);
    }
  }
  return lookup;
}

import { isStateIdentifier } from "./angular-patterns.js";
import { isCSharpStateIdentifier } from "./csharp-patterns.js";
import { RaceDetector } from "./race-detector.js";

/**
 * Extended entity with optional code content
 * (code may come from metadata or file reading)
 */
interface EntityWithCode extends Entity {
  code?: string;
}

export interface StatePatternWithRaces extends StatePattern {
  raceAnalysis: RaceAnalysis;
}

export class StateDetector {
  private raceDetector: RaceDetector;
  private _cachedEntities: Entity[] | null = null;
  /** Pre-loaded functions/methods for body scanning — shared across all identifiers */
  private _cachedFunctions: EntityWithCode[] | null = null;
  /** Pre-loaded relationships indexed by entityId for O(1) lookup */
  private _relLookup: RelationshipLookup | null = null;

  constructor(private storage: GraphStorage) {
    this.raceDetector = new RaceDetector(storage);
  }

  async detectPatterns(
    options: ChaosAnalysisOptions,
    cachedEntities?: Entity[],
    relLookup?: RelationshipLookup,
  ): Promise<StatePatternWithRaces[]> {
    const t0 = performance.now();

    // Cache entities and relationships for the duration of this analysis run
    this._cachedEntities = cachedEntities || (await this.storage.getAllEntities());
    this._relLookup = relLookup || null;
    const patterns: StatePatternWithRaces[] = [];

    // Share entity + relationship caches with RaceDetector to avoid N+1 DB queries
    this.raceDetector.setEntityCache(this._cachedEntities);
    if (this._relLookup) {
      this.raceDetector.setRelationshipCache(this._relLookup);
    }

    // Pre-load all functions/methods ONCE for body scanning (was reloaded per identifier!)
    const tFns = performance.now();
    this._cachedFunctions = (await this.storage.searchEntities({
      types: [EntityType.FUNCTION, EntityType.METHOD, "constructor" as EntityType],
    })) as EntityWithCode[];
    log.i("CHAOS_DET", "preload_functions", {
      count: this._cachedFunctions.length,
      ms: +(performance.now() - tFns).toFixed(0),
    });

    if (options.stateIdentifiers && options.stateIdentifiers.length > 0) {
      for (const identifier of options.stateIdentifiers) {
        const pattern = await this.analyzeIdentifier(identifier);
        if (pattern) patterns.push(pattern);
      }
      log.i("CHAOS_DET", "manual_identifiers", {
        count: options.stateIdentifiers.length,
        matched: patterns.length,
        ms: +(performance.now() - t0).toFixed(0),
      });
    } else if (options.autoDetect) {
      const tAutoStart = performance.now();
      const identifiers = this.autoDetectStateIdentifiers(this._cachedEntities);
      log.i("CHAOS_DET", "autoDetect", {
        candidates: identifiers.length,
        fromEntities: this._cachedEntities.length,
        ms: +(performance.now() - tAutoStart).toFixed(0),
      });

      for (let i = 0; i < identifiers.length; i++) {
        const tIdent = performance.now();
        const pattern = await this.analyzeIdentifier(identifiers[i]!);
        if (pattern) patterns.push(pattern);
        const dtIdent = performance.now() - tIdent;
        if (dtIdent > 1000) {
          log.w("CHAOS_DET", "slow_identifier", {
            identifier: identifiers[i],
            index: i,
            ms: +dtIdent.toFixed(0),
            ops: pattern?.operations.length || 0,
            writers: pattern?.raceAnalysis.writers || 0,
          });
        }
      }
      log.i("CHAOS_DET", "all_identifiers", {
        total: identifiers.length,
        matched: patterns.length,
        ms: +(performance.now() - t0).toFixed(0),
      });
    }

    // Clear caches after analysis
    this._cachedEntities = null;
    this._cachedFunctions = null;
    this._relLookup = null;
    this.raceDetector.clearEntityCache();

    // Sort by race risk (critical first)
    return patterns.sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
      return riskOrder[a.raceAnalysis.raceRisk] - riskOrder[b.raceAnalysis.raceRisk];
    });
  }

  private autoDetectStateIdentifiers(entities: Entity[]): string[] {
    const identifiers = new Map<string, number>(); // name -> operation count

    for (const entity of entities) {
      const lang = entity.language || entity.metadata?.language;
      const isCSharp = lang === "csharp";

      // C# entities from Roslyn use "field"/"property" types (not VARIABLE/CONSTANT)
      const typeStr = entity.type as string;
      const isStateType =
        entity.type === EntityType.VARIABLE ||
        entity.type === EntityType.CONSTANT ||
        typeStr === "field" ||
        typeStr === "property";

      if (!isStateType) continue;

      // Use language-appropriate detector
      const isState = isCSharp ? isCSharpStateIdentifier(entity) : isStateIdentifier(entity.name);

      if (isState) {
        identifiers.set(entity.name, (identifiers.get(entity.name) || 0) + 1);
      }
    }

    // Sort by operation count (most used first) and take top 20
    return Array.from(identifiers.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);
  }

  private async analyzeIdentifier(identifier: string): Promise<StatePatternWithRaces | null> {
    const tOps = performance.now();
    const operations = await this.findStateOperations(identifier);
    const tOpsEnd = performance.now();
    if (operations.length === 0) return null;

    // Find related identifiers (similar names)
    const relatedIdentifiers = this.findRelatedIdentifiers(identifier);

    // Run race detection
    const tRace = performance.now();
    const raceAnalysis = await this.raceDetector.analyzeRaces(identifier, operations);
    const tRaceEnd = performance.now();

    log.d("CHAOS_DET", "analyzeIdentifier", {
      id: identifier,
      ops: operations.length,
      opsMs: +(tOpsEnd - tOps).toFixed(0),
      raceMs: +(tRaceEnd - tRace).toFixed(0),
      writers: raceAnalysis.writers,
      risk: raceAnalysis.raceRisk,
    });

    return {
      identifier,
      type: this.inferStateType(identifier, operations),
      scope: this.inferScope(operations),
      operations,
      relatedIdentifiers,
      raceAnalysis,
    };
  }

  private async findStateOperations(identifier: string): Promise<StateOperation[]> {
    const tStart = performance.now();
    const operations: StateOperation[] = [];

    // 1. Find direct variable declarations (C# uses "field"/"property" types)
    const variables = (await this.storage.searchEntities({
      namePattern: identifier,
      types: [EntityType.VARIABLE, EntityType.CONSTANT, "field" as EntityType, "property" as EntityType],
    })) as EntityWithCode[];

    for (const entity of variables) {
      operations.push({
        file: entity.filePath,
        line: entity.location?.start?.line || 0,
        column: entity.location?.start?.column || 0,
        entityId: entity.id,
        entityName: entity.name,
        operationType: "initialize",
        code: entity.code?.slice(0, 200) || "",
        context: "",
        isDefensive: false,
        depth: 0,
      });
    }

    // 2. Find usages through relationships
    // Build entity lookup map from cache for O(1) access instead of N getEntity() calls
    const entityLookup = new Map<string, EntityWithCode>();
    if (this._cachedEntities) {
      for (const e of this._cachedEntities) {
        entityLookup.set(e.id, e as EntityWithCode);
      }
    }

    for (const variable of variables) {
      const relationships =
        this._relLookup?.get(variable.id) || (await this.storage.getRelationshipsForEntity(variable.id));

      // Collect ref entity IDs that need fetching (not in cache)
      const refIds: string[] = [];
      for (const rel of relationships) {
        if (rel.type === RelationType.REFERENCES) {
          const refId = rel.fromId === variable.id ? rel.toId : rel.fromId;
          if (refId !== variable.id && !entityLookup.has(refId)) {
            refIds.push(refId);
          }
        }
      }

      // Batch fetch any missing entities
      if (refIds.length > 0) {
        const fetched = await this.storage.getEntitiesBatch(refIds);
        for (const [id, e] of fetched) {
          entityLookup.set(id, e as EntityWithCode);
        }
      }

      for (const rel of relationships) {
        if (rel.type === RelationType.REFERENCES) {
          const refId = rel.fromId === variable.id ? rel.toId : rel.fromId;
          const refEntity = entityLookup.get(refId) || null;
          if (refEntity && refEntity.id !== variable.id) {
            const opType = await this.classifyOperation(refEntity, identifier);
            operations.push({
              file: refEntity.filePath,
              line: refEntity.location?.start?.line || 0,
              column: refEntity.location?.start?.column || 0,
              entityId: refEntity.id,
              entityName: refEntity.name,
              operationType: opType,
              code: refEntity.code?.slice(0, 200) || "",
              context: await this.getContext(refEntity),
              isDefensive: this.isDefensiveCode(refEntity.code || ""),
              depth: 1,
            });
          }
        }
      }
    }

    // 3. Search for identifier in all function/method bodies (uses pre-loaded cache)
    const functions =
      this._cachedFunctions ||
      ((await this.storage.searchEntities({
        types: [EntityType.FUNCTION, EntityType.METHOD, "constructor" as EntityType],
      })) as EntityWithCode[]);

    // Use Set for O(1) duplicate check instead of O(N) array scan
    const seenEntityIds = new Set(operations.map((op) => op.entityId));
    const identifierRegex = new RegExp(`\\b${identifier}\\b`);

    for (const fn of functions) {
      if (!fn.code || seenEntityIds.has(fn.id)) continue;

      if (!identifierRegex.test(fn.code)) continue;

      const opType = this.classifyOperationFromCode(fn.code, identifier);

      seenEntityIds.add(fn.id);
      operations.push({
        file: fn.filePath,
        line: fn.location?.start?.line || 0,
        column: fn.location?.start?.column || 0,
        entityId: fn.id,
        entityName: fn.name,
        operationType: opType,
        code: this.extractRelevantCode(fn.code, identifier),
        context: "",
        isDefensive: this.isDefensiveCode(fn.code),
        depth: 1,
      });
    }

    const dtOps = performance.now() - tStart;
    if (dtOps > 500) {
      log.w("CHAOS_DET", "slow_findOps", {
        identifier,
        vars: variables.length,
        fns: functions.length,
        ops: operations.length,
        ms: +dtOps.toFixed(0),
      });
    }

    return operations;
  }

  /**
   * Classify operation type from entity
   */
  private async classifyOperation(entity: EntityWithCode, identifier: string): Promise<StateOperationType> {
    const code = entity.code || "";
    return this.classifyOperationFromCode(code, identifier);
  }

  /**
   * Classify operation type from code string
   */
  private classifyOperationFromCode(code: string, identifier: string): StateOperationType {
    // Check for writes: identifier = something
    const writePattern = new RegExp(`${identifier}\\s*=(?!=)`, "g");
    if (writePattern.test(code)) {
      // Check if it's a reset
      const resetPattern = new RegExp(`${identifier}\\s*=\\s*(null|undefined|false|0|''|""|\\[\\]|\\{\\})`, "g");
      if (resetPattern.test(code)) {
        return "write"; // Will be classified as "reset" in RaceDetector
      }
      return "write";
    }

    // Check for emit/subscribe
    if (/\.next\(|\.emit\(/.test(code)) return "emit";
    if (/\.subscribe\(|\.pipe\(/.test(code)) return "subscribe";

    // C# specific patterns
    if (/\block\s*\(/.test(code)) return "write"; // lock() implies state mutation
    if (/Interlocked\./.test(code)) return "write"; // atomic operations
    if (/\bawait\b/.test(code)) return "read"; // async context (conservative)

    // Check for conditional check
    const checkPattern = new RegExp(`if\\s*\\([^)]*${identifier}`, "g");
    if (checkPattern.test(code)) return "check";

    // Check for function pass
    const passPattern = new RegExp(`\\(\\s*[^)]*${identifier}[^)]*\\)`, "g");
    if (passPattern.test(code)) return "pass";

    return "read";
  }

  /**
   * Extract the most relevant code snippet containing the identifier
   */
  private extractRelevantCode(code: string, identifier: string): string {
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line?.includes(identifier)) {
        // Return up to 3 lines around the match
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 2);
        return lines.slice(start, end).join("\n").slice(0, 200);
      }
    }
    return code.slice(0, 200);
  }

  /**
   * Get surrounding context for an entity
   */
  private async getContext(_entity: EntityWithCode): Promise<string> {
    // For now, just return empty - would need file reading for real context
    return "";
  }

  /**
   * Check if code contains defensive patterns
   */
  private isDefensiveCode(code: string): boolean {
    return /!==?\s*(null|undefined)|typeof\s+\w+|&&\s*\w+\.|try\s*{|\?\?|\?\./i.test(code);
  }

  /**
   * Find identifiers with similar names
   */
  private findRelatedIdentifiers(identifier: string): string[] {
    const related: string[] = [];
    const entities = this._cachedEntities || [];

    // Common variations
    const variations = [
      `_${identifier}`,
      `${identifier}_`,
      `${identifier}Value`,
      `${identifier}State`,
      `current${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}`,
      `saved${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}`,
      `old${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}`,
      `new${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}`,
    ];

    for (const entity of entities) {
      if (variations.includes(entity.name) || entity.name.toLowerCase().includes(identifier.toLowerCase())) {
        if (entity.name !== identifier && !related.includes(entity.name)) {
          related.push(entity.name);
        }
      }
    }

    return related.slice(0, 5);
  }

  /**
   * Infer TypeScript type from operations
   */
  private inferStateType(identifier: string, operations: StateOperation[]): string {
    for (const op of operations) {
      if (op.operationType === "initialize" && op.code) {
        // Try to extract type annotation
        const typeMatch = op.code.match(new RegExp(`${identifier}\\s*:\\s*([\\w<>\\[\\]|&]+)`));
        if (typeMatch?.[1]) return typeMatch[1];

        // Infer from value
        if (/=\s*(true|false)/.test(op.code)) return "boolean";
        if (/=\s*\d+/.test(op.code)) return "number";
        if (/=\s*['"`]/.test(op.code)) return "string";
        if (/=\s*\[/.test(op.code)) return "array";
        if (/=\s*\{/.test(op.code)) return "object";
        if (/=\s*new\s+(\w+)/.test(op.code)) {
          const match = op.code.match(/=\s*new\s+(\w+)/);
          return match?.[1] ? match[1] : "unknown";
        }
      }
    }
    return "unknown";
  }

  /**
   * Infer scope from operations
   */
  private inferScope(operations: StateOperation[]): StatePattern["scope"] {
    const files = new Set(operations.map((op) => op.file));

    if (files.size === 1) return "local";
    if (files.size <= 3) return "module";
    return "global";
  }
}

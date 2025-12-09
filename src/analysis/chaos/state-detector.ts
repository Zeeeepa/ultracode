/**
 * State Pattern Detector
 *
 * Detects state patterns and their operations across the codebase.
 * Works together with RaceDetector for race condition analysis.
 */

import type {
  ChaosAnalysisOptions,
  RaceAnalysis,
  StateOperation,
  StateOperationType,
  StatePattern,
} from "../../types/chaos-analysis.js";
import type { Entity, GraphStorage } from "../../types/storage.js";
import { EntityType, RelationType } from "../../types/storage.js";
import { isStateIdentifier } from "./angular-patterns.js";
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

  constructor(private storage: GraphStorage) {
    this.raceDetector = new RaceDetector(storage);
  }

  async detectPatterns(options: ChaosAnalysisOptions): Promise<StatePatternWithRaces[]> {
    const patterns: StatePatternWithRaces[] = [];

    if (options.stateIdentifiers && options.stateIdentifiers.length > 0) {
      for (const identifier of options.stateIdentifiers) {
        const pattern = await this.analyzeIdentifier(identifier);
        if (pattern) patterns.push(pattern);
      }
    } else if (options.autoDetect) {
      const identifiers = await this.autoDetectStateIdentifiers();
      for (const identifier of identifiers) {
        const pattern = await this.analyzeIdentifier(identifier);
        if (pattern) patterns.push(pattern);
      }
    }

    // Sort by race risk (critical first)
    return patterns.sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
      return riskOrder[a.raceAnalysis.raceRisk] - riskOrder[b.raceAnalysis.raceRisk];
    });
  }

  private async autoDetectStateIdentifiers(): Promise<string[]> {
    const entities = await this.storage.getAllEntities();
    const identifiers = new Map<string, number>(); // name -> operation count

    for (const entity of entities) {
      if (entity.type === EntityType.VARIABLE || entity.type === EntityType.CONSTANT) {
        if (isStateIdentifier(entity.name)) {
          identifiers.set(entity.name, (identifiers.get(entity.name) || 0) + 1);
        }
      }
    }

    // Sort by operation count (most used first) and take top 20
    return Array.from(identifiers.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);
  }

  private async analyzeIdentifier(identifier: string): Promise<StatePatternWithRaces | null> {
    const operations = await this.findStateOperations(identifier);
    if (operations.length === 0) return null;

    // Find related identifiers (similar names)
    const relatedIdentifiers = await this.findRelatedIdentifiers(identifier);

    // Run race detection
    const raceAnalysis = await this.raceDetector.analyzeRaces(identifier, operations);

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
    const operations: StateOperation[] = [];

    // 1. Find direct variable declarations
    const variables = (await this.storage.searchEntities({
      namePattern: identifier,
      types: [EntityType.VARIABLE, EntityType.CONSTANT],
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
    for (const variable of variables) {
      const relationships = await this.storage.getRelationshipsForEntity(variable.id);

      for (const rel of relationships) {
        // Entities that reference this variable
        if (rel.type === RelationType.REFERENCES) {
          const refEntity = (await this.storage.getEntity(
            rel.fromId === variable.id ? rel.toId : rel.fromId,
          )) as EntityWithCode | null;
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

    // 3. Search for identifier in all function/method bodies
    const functions = (await this.storage.searchEntities({
      types: [EntityType.FUNCTION, EntityType.METHOD],
    })) as EntityWithCode[];

    for (const fn of functions) {
      if (!fn.code) continue;

      // Check if function body contains the identifier
      const regex = new RegExp(`\\b${identifier}\\b`, "g");
      const matches = fn.code.match(regex);
      if (!matches) continue;

      // Determine operation type from code context
      const opType = this.classifyOperationFromCode(fn.code, identifier);

      // Avoid duplicates
      if (!operations.some((op) => op.entityId === fn.id)) {
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
  private async findRelatedIdentifiers(identifier: string): Promise<string[]> {
    const related: string[] = [];
    const entities = await this.storage.getAllEntities();

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

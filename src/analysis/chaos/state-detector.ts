/**
 * State Pattern Detector (Simplified)
 */

import type { ChaosAnalysisOptions, StateOperation, StatePattern } from "../../types/chaos-analysis.js";
import type { GraphStorage } from "../../types/storage.js";
import { EntityType } from "../../types/storage.js";
import { isStateIdentifier } from "./angular-patterns.js";

export class StateDetector {
  constructor(private storage: GraphStorage) {}

  async detectPatterns(options: ChaosAnalysisOptions): Promise<StatePattern[]> {
    const patterns: StatePattern[] = [];

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

    return patterns;
  }

  private async autoDetectStateIdentifiers(): Promise<string[]> {
    const entities = await this.storage.getAllEntities();
    const identifiers = new Set<string>();

    for (const entity of entities) {
      if (entity.type === EntityType.VARIABLE || entity.type === EntityType.CONSTANT) {
        if (isStateIdentifier(entity.name)) {
          identifiers.add(entity.name);
        }
      }
    }

    return Array.from(identifiers).slice(0, 10); // Limit to top 10
  }

  private async analyzeIdentifier(identifier: string): Promise<StatePattern | null> {
    const operations = await this.findStateOperations(identifier);
    if (operations.length === 0) return null;

    return {
      identifier,
      type: "unknown",
      scope: "module",
      operations,
      relatedIdentifiers: [],
    };
  }

  private async findStateOperations(identifier: string): Promise<StateOperation[]> {
    const entities = await this.storage.searchEntities({
      namePattern: identifier,
      types: [EntityType.VARIABLE, EntityType.CONSTANT],
    });

    return entities.map((entity) => ({
      file: entity.filePath,
      line: entity.location?.start?.line || 0,
      column: entity.location?.start?.column || 0,
      entityId: entity.id,
      entityName: entity.name,
      operationType: "read" as const,
      code: "",
      context: "",
      isDefensive: false,
      depth: 0,
    }));
  }
}

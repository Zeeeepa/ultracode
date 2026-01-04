/**
 * Relationship Builder Module
 *
 * Builds relationships from parsed entities.
 * Extracted from indexer-agent.ts for better modularity.
 */

import { nanoid } from "nanoid";
import type { ParsedEntity } from "../../types/parser.js";
import type { Entity, Relationship } from "../../types/storage.js";
import { RelationType } from "../../types/storage.js";

/**
 * Build relationships from parsed entities
 */
export async function buildRelationships(
  parsedEntities: ParsedEntity[],
  storageEntities: Entity[],
): Promise<Relationship[]> {
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

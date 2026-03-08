/**
 * Field Mapper — Regex-based field mapping analysis for dataFlowLevel=3
 *
 * Reads source code of functions and detects field-level data transformations:
 * destructuring, spread, direct assignment, dot notation, and map transforms.
 */

import { readFile } from "node:fs/promises";

import type { Entity } from "../types/storage.js";
import type { FieldMapping } from "./diagram-ir.js";

// -- Regex patterns (multi-language) ----------------------------------------

/** TS/JS: const { name, email } = user */
const DESTRUCTURE_JS = /(?:const|let|var)\s*\{\s*([^}]+)\}\s*=\s*(\w+)/g;

/** TS/JS: { ...obj } or { ...obj, ...other } */
const SPREAD_JS = /\.\.\.\s*(\w+)/g;

/** TS/JS: result.targetField = source.sourceField */
const DIRECT_ASSIGN = /(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/g;

/** TS/JS: .map(x => x.field) or .map(x => ({ field: x.field })) */
const MAP_TRANSFORM = /\.map\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*(?:\(?\s*\{?\s*\w+:\s*)?\1\.(\w+)/g;

/** Python: obj["field"] */
const PYTHON_DICT = /(\w+)\[['"](\w+)['"]\]/g;

// -- Constants ---------------------------------------------------------------

const MAX_FUNCTIONS_PER_CALL = 50;
const MAX_FUNCTION_SIZE = 10_000; // chars

// -- Main API ---------------------------------------------------------------

export interface FieldMapperResult {
  entityId: string;
  mappings: FieldMapping[];
}

/**
 * Analyze field mappings for a batch of entities.
 * Only reads source code for entities with hasTransformation=true.
 * Limits to MAX_FUNCTIONS_PER_CALL for performance.
 */
export async function analyzeFieldMappings(entities: Entity[]): Promise<Map<string, FieldMapping[]>> {
  const result = new Map<string, FieldMapping[]>();
  const toAnalyze = entities.slice(0, MAX_FUNCTIONS_PER_CALL);

  for (const entity of toAnalyze) {
    try {
      const mappings = await analyzeEntityFields(entity);
      if (mappings.length > 0) {
        result.set(entity.id, mappings);
      }
    } catch {
      // Skip entities we can't read
    }
  }

  return result;
}

async function analyzeEntityFields(entity: Entity): Promise<FieldMapping[]> {
  if (!entity.filePath || !entity.location) return [];

  let content: string;
  try {
    const fullContent = await readFile(entity.filePath, "utf-8");
    const lines = fullContent.split("\n");
    const startLine = Math.max(0, entity.location.start.line - 1);
    const endLine = Math.min(lines.length, entity.location.end.line);
    content = lines.slice(startLine, endLine).join("\n");
  } catch {
    return [];
  }

  if (content.length > MAX_FUNCTION_SIZE) {
    content = content.substring(0, MAX_FUNCTION_SIZE);
  }

  const paramNames = new Set((entity.metadata.parameters || []).map((p) => p.name));
  const mappings: FieldMapping[] = [];

  // 1. Destructuring
  for (const match of content.matchAll(DESTRUCTURE_JS)) {
    const rawFields = match[1];
    const source = match[2];
    if (!rawFields || !source) continue;
    if (paramNames.has(source)) {
      const fields = rawFields.split(",").map((f) => {
        const part = f.trim().split(":")[0];
        return part ? part.split("=")[0]?.trim() : undefined;
      });
      for (const field of fields) {
        if (field) {
          mappings.push({ sourceParam: source, sourceField: field, targetField: field, operation: "destructure" });
        }
      }
    }
  }

  // 2. Direct assignment: result.x = param.y
  for (const match of content.matchAll(DIRECT_ASSIGN)) {
    const targetField = match[2];
    const sourceObj = match[3];
    const sourceField = match[4];
    if (!targetField || !sourceObj || !sourceField) continue;
    if (paramNames.has(sourceObj)) {
      mappings.push({ sourceParam: sourceObj, sourceField, targetField, operation: "assign" });
    }
  }

  // 3. Spread
  for (const match of content.matchAll(SPREAD_JS)) {
    const source = match[1];
    if (!source) continue;
    if (paramNames.has(source)) {
      mappings.push({ sourceParam: source, targetField: "*", operation: "spread" });
    }
  }

  // 4. Map transform
  for (const match of content.matchAll(MAP_TRANSFORM)) {
    const field = match[2];
    if (field) {
      mappings.push({ sourceParam: "iterable", sourceField: field, targetField: field, operation: "transform" });
    }
  }

  // 5. Python dict access
  for (const match of content.matchAll(PYTHON_DICT)) {
    const source = match[1];
    const field = match[2];
    if (!source || !field) continue;
    if (paramNames.has(source)) {
      mappings.push({ sourceParam: source, sourceField: field, targetField: field, operation: "assign" });
    }
  }

  return mappings;
}

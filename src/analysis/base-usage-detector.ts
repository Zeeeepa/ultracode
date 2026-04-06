/**
 * Base Usage Detector
 *
 * Generic multi-signal usage detection for API contract files (GraphQL, Protobuf, Swagger).
 * All three detectors share identical logic — only the filtering config differs.
 */

import { log } from "../logging/index.js";
import type { Entity, GraphStorage, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";

// =============================================================================
// TYPES
// =============================================================================

export interface UsageSignal {
  type: "imports" | "codegen_script" | "codegen_config" | "generated_markers";
  weight: number;
  score: number;
  details: string;
}

export interface FileUsage {
  filePath: string;
  usageConfidence: number;
  isActiveContract: boolean;
  signals: UsageSignal[];
}

export interface UsageResult {
  files: Map<string, FileUsage>;
  totalFiles: number;
  activeFiles: number;
}

// =============================================================================
// DETECTOR CONFIG
// =============================================================================

export interface UsageDetectorConfig {
  /** Log tag (e.g. "GRAPHQL_USAGE") */
  logTag: string;
  /** Filter entities that represent API files */
  entityFilter: (e: Entity) => boolean;
  /** Check if an import toId matches generated paths for this API type */
  importPathMatcher: (toId: string) => boolean;
  /** Keywords in codegen scripts */
  codegenKeywords: string[];
  /** Config filenames that indicate codegen is set up */
  configFileNames: string[];
  /** Filter entities that appear to be generated from this API type */
  generatedFilter: (e: Entity) => boolean;
  /** Signal weights (defaults: imports=0.4, script=0.3, config=0.2, markers=0.1) */
  signalWeights?: Partial<Record<UsageSignal["type"], number>>;
  /** Threshold for "active" classification (default: 0.3) */
  activeThreshold?: number;
}

const DEFAULT_WEIGHTS = {
  imports: 0.4,
  codegen_script: 0.3,
  codegen_config: 0.2,
  generated_markers: 0.1,
} as const;

// =============================================================================
// GENERIC DETECTOR
// =============================================================================

export async function detectUsage(storage: GraphStorage, config: UsageDetectorConfig): Promise<UsageResult> {
  const allEntities = await storage.getAllEntities();
  const allRelationships = await storage.getAllRelationships();
  const weights = { ...DEFAULT_WEIGHTS, ...config.signalWeights };
  const threshold = config.activeThreshold ?? 0.3;

  // Find and deduplicate API entities by file path
  const apiEntities = allEntities.filter(config.entityFilter);
  const apiFiles = new Map<string, Entity>();
  for (const e of apiEntities) {
    if (!apiFiles.has(e.filePath)) {
      apiFiles.set(e.filePath, e);
    }
  }

  if (apiFiles.size === 0) {
    return { files: new Map(), totalFiles: 0, activeFiles: 0 };
  }

  const files = new Map<string, FileUsage>();

  for (const [filePath] of apiFiles) {
    const signals: UsageSignal[] = [
      analyzeImportsSignal(allRelationships, config.importPathMatcher, weights.imports),
      analyzeCodegenScriptSignal(allEntities, config.codegenKeywords, weights.codegen_script),
      analyzeCodegenConfigSignal(allEntities, config.configFileNames, weights.codegen_config),
      analyzeGeneratedMarkersSignal(allEntities, config.generatedFilter, weights.generated_markers),
    ];

    const usageConfidence = Math.min(
      1,
      signals.reduce((sum, s) => sum + s.weight * s.score, 0),
    );

    files.set(filePath, {
      filePath,
      usageConfidence,
      isActiveContract: usageConfidence >= threshold,
      signals,
    });
  }

  const activeFiles = Array.from(files.values()).filter((f) => f.isActiveContract).length;

  log.i(config.logTag, "detection_done", { total: apiFiles.size, active: activeFiles });

  return { files, totalFiles: apiFiles.size, activeFiles };
}

export async function applyUsageMetadata(storage: GraphStorage, usage: UsageResult): Promise<number> {
  let updated = 0;

  for (const [filePath, fileUsage] of usage.files) {
    const entities = await storage.findEntities({ filters: { filePath } });

    for (const entity of entities) {
      if (entity.metadata?.["isApiContract"]) {
        await storage.updateEntity(entity.id, {
          metadata: {
            ...entity.metadata,
            usageConfidence: fileUsage.usageConfidence,
            isActiveContract: fileUsage.isActiveContract,
          },
        });
        updated++;
      }
    }
  }

  return updated;
}

// =============================================================================
// SIGNAL ANALYZERS (parameterized)
// =============================================================================

function analyzeImportsSignal(
  allRelationships: Relationship[],
  importPathMatcher: (toId: string) => boolean,
  weight: number,
): UsageSignal {
  const matchingImports = allRelationships.filter((r) => r.type === RelationType.IMPORTS && importPathMatcher(r.toId));

  const apiRels = allRelationships.filter(
    (r) => r.type === RelationType.GENERATED_FROM || r.type === RelationType.CONSUMES_API,
  );

  const hasImports = matchingImports.length > 0 || apiRels.length > 0;
  return {
    type: "imports",
    weight,
    score: hasImports ? 1.0 : 0,
    details: hasImports
      ? `Found ${matchingImports.length} imports from generated paths, ${apiRels.length} API relationships`
      : "No imports from generated paths detected",
  };
}

function analyzeCodegenScriptSignal(allEntities: Entity[], keywords: string[], weight: number): UsageSignal {
  const scriptEntities = allEntities.filter((e) => e.type === "function" && e.metadata?.["scriptCommand"]);
  const matching = scriptEntities.filter((e) => {
    const cmd = String(e.metadata?.["scriptCommand"] || "").toLowerCase();
    return keywords.some((kw) => cmd.includes(kw));
  });

  return {
    type: "codegen_script",
    weight,
    score: matching.length > 0 ? 1.0 : 0,
    details:
      matching.length > 0
        ? `Found codegen scripts: ${matching.map((s) => s.name).join(", ")}`
        : "No codegen scripts found",
  };
}

function analyzeCodegenConfigSignal(allEntities: Entity[], configFileNames: string[], weight: number): UsageSignal {
  const found = allEntities.filter((e) => {
    const name = e.name.toLowerCase();
    const fp = e.filePath.toLowerCase();
    return configFileNames.some((cfg) => name === cfg || fp.endsWith(`/${cfg}`));
  });

  return {
    type: "codegen_config",
    weight,
    score: found.length > 0 ? 1.0 : 0,
    details:
      found.length > 0
        ? `Found codegen configs: ${found.map((c) => c.name).join(", ")}`
        : "No codegen config files found",
  };
}

function analyzeGeneratedMarkersSignal(
  allEntities: Entity[],
  generatedFilter: (e: Entity) => boolean,
  weight: number,
): UsageSignal {
  const generated = allEntities.filter(generatedFilter);

  return {
    type: "generated_markers",
    weight,
    score: generated.length > 0 ? 1.0 : 0,
    details: generated.length > 0 ? `Found ${generated.length} generated entities` : "No generated file markers found",
  };
}

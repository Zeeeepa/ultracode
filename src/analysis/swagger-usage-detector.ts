/**
 * Swagger Usage Detector
 *
 * Determines which swagger files are "actively used" in a project
 * by analyzing multiple signals: imports, codegen scripts, config files, generated markers.
 *
 * Multi-signal detection with weighted scoring:
 * - Code imports types from generated path: weight 0.4
 * - package.json has codegen script: weight 0.3
 * - Codegen config file exists: weight 0.2
 * - Generated files with markers exist: weight 0.1
 *
 * Swagger file is considered "used" when score >= 0.3.
 */

import { log } from "../logging/index.js";
import type { Entity, GraphStorage, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";

// =============================================================================
// TYPES
// =============================================================================

export interface SwaggerUsageResult {
  /** Swagger file path → usage data */
  files: Map<string, SwaggerFileUsage>;
  /** Total number of swagger files detected */
  totalSwaggerFiles: number;
  /** Number of actively used swagger files */
  activeSwaggerFiles: number;
}

export interface SwaggerFileUsage {
  filePath: string;
  /** Aggregated confidence score (0-1) */
  usageConfidence: number;
  /** Whether this swagger file is actively used (confidence >= 0.3) */
  isActiveContract: boolean;
  /** Individual signal scores */
  signals: UsageSignal[];
}

export interface UsageSignal {
  type: "imports" | "codegen_script" | "codegen_config" | "generated_markers";
  weight: number;
  score: number;
  details: string;
}

// =============================================================================
// SIGNAL WEIGHTS
// =============================================================================

const SIGNAL_WEIGHTS = {
  imports: 0.4,
  codegen_script: 0.3,
  codegen_config: 0.2,
  generated_markers: 0.1,
} as const;

const ACTIVE_THRESHOLD = 0.3;

// =============================================================================
// MAIN DETECTOR
// =============================================================================

/**
 * Detect which swagger files are actively used in the project.
 * Should only be called when swagger entities exist in the graph.
 *
 * @param storage Graph storage instance
 * @returns Usage analysis for all swagger files
 */
export async function detectSwaggerUsage(storage: GraphStorage): Promise<SwaggerUsageResult> {
  const allEntities = await storage.getAllEntities();
  const allRelationships = await storage.getAllRelationships();

  // Find swagger API spec entities (the root swagger file entities)
  const swaggerSpecs = allEntities.filter((e) => e.metadata?.["swaggerType"] === "api_spec");

  if (swaggerSpecs.length === 0) {
    return { files: new Map(), totalSwaggerFiles: 0, activeSwaggerFiles: 0 };
  }

  const files = new Map<string, SwaggerFileUsage>();

  for (const spec of swaggerSpecs) {
    const signals: UsageSignal[] = [];

    // Signal 1: Code imports types from generated path
    const importsScore = analyzeImportsSignal(spec, allEntities, allRelationships);
    signals.push(importsScore);

    // Signal 2: Codegen script in package.json
    const codegenScriptScore = analyzeCodegenScriptSignal(allEntities);
    signals.push(codegenScriptScore);

    // Signal 3: Codegen config file exists
    const configScore = analyzeCodegenConfigSignal(allEntities);
    signals.push(configScore);

    // Signal 4: Generated files with markers
    const markersScore = analyzeGeneratedMarkersSignal(spec, allEntities, allRelationships);
    signals.push(markersScore);

    // Calculate aggregate confidence
    const usageConfidence = Math.min(
      1,
      signals.reduce((sum, s) => sum + s.weight * s.score, 0),
    );

    const usage: SwaggerFileUsage = {
      filePath: spec.filePath,
      usageConfidence,
      isActiveContract: usageConfidence >= ACTIVE_THRESHOLD,
      signals,
    };

    files.set(spec.filePath, usage);
  }

  const activeCount = Array.from(files.values()).filter((f) => f.isActiveContract).length;

  log.i("SWAGGER_USAGE", "detection_done", {
    total: swaggerSpecs.length,
    active: activeCount,
  });

  return {
    files,
    totalSwaggerFiles: swaggerSpecs.length,
    activeSwaggerFiles: activeCount,
  };
}

/**
 * Apply usage detection results to swagger entities in the graph.
 * Sets metadata.usageConfidence and metadata.isActiveContract.
 */
export async function applySwaggerUsageMetadata(storage: GraphStorage, usage: SwaggerUsageResult): Promise<number> {
  let updated = 0;

  for (const [filePath, fileUsage] of usage.files) {
    // Find all swagger entities for this file
    const entities = await storage.findEntities({
      filters: { filePath },
    });

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
// SIGNAL ANALYZERS
// =============================================================================

/**
 * Signal 1: Check if code imports types from paths related to swagger-generated code
 */
function analyzeImportsSignal(_spec: Entity, _allEntities: Entity[], allRelationships: Relationship[]): UsageSignal {
  // Find IMPORTS relationships where the imported source is in a generated directory
  const importsFromGenerated = allRelationships.filter(
    (r) =>
      r.type === RelationType.IMPORTS &&
      (r.toId.includes("/generated/") ||
        r.toId.includes("/gen/") ||
        r.toId.includes("/__generated__/") ||
        r.toId.includes("/api-client/") ||
        r.toId.includes("/api/")),
  );

  // Also check GENERATED_FROM and CONSUMES_API relationships
  const apiRelationships = allRelationships.filter(
    (r) => r.type === RelationType.GENERATED_FROM || r.type === RelationType.CONSUMES_API,
  );

  const hasImports = importsFromGenerated.length > 0 || apiRelationships.length > 0;
  const score = hasImports ? 1.0 : 0;

  return {
    type: "imports",
    weight: SIGNAL_WEIGHTS.imports,
    score,
    details: hasImports
      ? `Found ${importsFromGenerated.length} imports from generated paths, ${apiRelationships.length} API relationships`
      : "No imports from generated paths detected",
  };
}

/**
 * Signal 2: Check if package.json or .csproj has codegen scripts
 */
function analyzeCodegenScriptSignal(allEntities: Entity[]): UsageSignal {
  const codegenKeywords = [
    "openapi-generator",
    "nswag",
    "autorest",
    "refitter",
    "ng-openapi-gen",
    "swagger-codegen",
    "generate-api",
    "generate-client",
  ];

  // Find script entities from package.json
  const scriptEntities = allEntities.filter((e) => e.type === "function" && e.metadata?.["scriptCommand"]);

  const matchingScripts = scriptEntities.filter((e) => {
    const cmd = String(e.metadata?.["scriptCommand"] || "").toLowerCase();
    return codegenKeywords.some((kw) => cmd.includes(kw));
  });

  const score = matchingScripts.length > 0 ? 1.0 : 0;

  return {
    type: "codegen_script",
    weight: SIGNAL_WEIGHTS.codegen_script,
    score,
    details:
      matchingScripts.length > 0
        ? `Found codegen scripts: ${matchingScripts.map((s) => s.name).join(", ")}`
        : "No codegen scripts found",
  };
}

/**
 * Signal 3: Check if codegen config files exist
 */
function analyzeCodegenConfigSignal(allEntities: Entity[]): UsageSignal {
  const configFileNames = [
    "openapitools.json",
    "nswag.json",
    ".refitter",
    "ng-openapi-gen.json",
    "autorest.md",
    "swagger-codegen-config.json",
  ];

  const foundConfigs = allEntities.filter((e) => {
    const name = e.name.toLowerCase();
    const filePath = e.filePath.toLowerCase();
    return configFileNames.some((cfg) => name === cfg || filePath.endsWith(`/${cfg}`));
  });

  const score = foundConfigs.length > 0 ? 1.0 : 0;

  return {
    type: "codegen_config",
    weight: SIGNAL_WEIGHTS.codegen_config,
    score,
    details:
      foundConfigs.length > 0
        ? `Found codegen configs: ${foundConfigs.map((c) => c.name).join(", ")}`
        : "No codegen config files found",
  };
}

/**
 * Signal 4: Check if generated files with auto-generation markers exist
 */
function analyzeGeneratedMarkersSignal(
  _spec: Entity,
  allEntities: Entity[],
  _allRelationships: Relationship[],
): UsageSignal {
  // Check for entities that are explicitly marked as generated
  const generatedEntities = allEntities.filter(
    (e) =>
      e.metadata?.["isGenerated"] ||
      e.metadata?.["autoGenerated"] ||
      (e.filePath &&
        (e.filePath.includes("/generated/") || e.filePath.includes("/gen/") || e.filePath.includes("/__generated__/"))),
  );

  const score = generatedEntities.length > 0 ? 1.0 : 0;

  return {
    type: "generated_markers",
    weight: SIGNAL_WEIGHTS.generated_markers,
    score,
    details:
      generatedEntities.length > 0
        ? `Found ${generatedEntities.length} generated entities`
        : "No generated file markers found",
  };
}

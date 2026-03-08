/**
 * GraphQL Usage Detector
 *
 * Determines which GraphQL schema files are "actively used" in a project
 * by analyzing multiple signals: imports, codegen scripts, config files, generated markers.
 *
 * Multi-signal detection with weighted scoring:
 * - Code imports from generated path: weight 0.4
 * - package.json has graphql-codegen: weight 0.3
 * - Codegen config file (codegen.yml, etc.): weight 0.2
 * - Generated files with markers: weight 0.1
 *
 * Schema file is considered "used" when score >= 0.3.
 */

import { log } from "../logging/index.js";
import type { Entity, GraphStorage, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";

// =============================================================================
// TYPES
// =============================================================================

export interface GraphQLUsageResult {
  files: Map<string, GraphQLFileUsage>;
  totalGraphQLFiles: number;
  activeGraphQLFiles: number;
}

export interface GraphQLFileUsage {
  filePath: string;
  usageConfidence: number;
  isActiveContract: boolean;
  signals: GraphQLUsageSignal[];
}

export interface GraphQLUsageSignal {
  type: "imports" | "codegen_script" | "codegen_config" | "generated_markers";
  weight: number;
  score: number;
  details: string;
}

// =============================================================================
// CONSTANTS
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

export async function detectGraphQLUsage(storage: GraphStorage): Promise<GraphQLUsageResult> {
  const allEntities = await storage.getAllEntities();
  const allRelationships = await storage.getAllRelationships();

  // Find GraphQL schema entities
  const graphqlSchemas = allEntities.filter(
    (e) =>
      e.metadata?.["graphqlType"] === "schema" ||
      e.metadata?.["graphqlType"] === "query" ||
      e.metadata?.["graphqlType"] === "mutation",
  );

  // Deduplicate by file path
  const graphqlFiles = new Map<string, Entity>();
  for (const spec of graphqlSchemas) {
    if (!graphqlFiles.has(spec.filePath)) {
      graphqlFiles.set(spec.filePath, spec);
    }
  }

  if (graphqlFiles.size === 0) {
    return { files: new Map(), totalGraphQLFiles: 0, activeGraphQLFiles: 0 };
  }

  const files = new Map<string, GraphQLFileUsage>();

  for (const [filePath, _spec] of graphqlFiles) {
    const signals: GraphQLUsageSignal[] = [];

    signals.push(analyzeImportsSignal(allEntities, allRelationships));
    signals.push(analyzeCodegenScriptSignal(allEntities));
    signals.push(analyzeCodegenConfigSignal(allEntities));
    signals.push(analyzeGeneratedMarkersSignal(allEntities));

    const usageConfidence = Math.min(
      1,
      signals.reduce((sum, s) => sum + s.weight * s.score, 0),
    );

    files.set(filePath, {
      filePath,
      usageConfidence,
      isActiveContract: usageConfidence >= ACTIVE_THRESHOLD,
      signals,
    });
  }

  const activeCount = Array.from(files.values()).filter((f) => f.isActiveContract).length;

  log.i("GRAPHQL_USAGE", "detection_done", {
    total: graphqlFiles.size,
    active: activeCount,
  });

  return {
    files,
    totalGraphQLFiles: graphqlFiles.size,
    activeGraphQLFiles: activeCount,
  };
}

export async function applyGraphQLUsageMetadata(storage: GraphStorage, usage: GraphQLUsageResult): Promise<number> {
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
// SIGNAL ANALYZERS
// =============================================================================

function analyzeImportsSignal(_allEntities: Entity[], allRelationships: Relationship[]): GraphQLUsageSignal {
  const gqlImports = allRelationships.filter(
    (r) =>
      r.type === RelationType.IMPORTS &&
      (r.toId.includes("/generated/") ||
        r.toId.includes("/__generated__/") ||
        r.toId.includes(".generated.") ||
        r.toId.includes("/graphql/")),
  );

  const apiRelationships = allRelationships.filter(
    (r) => r.type === RelationType.GENERATED_FROM || r.type === RelationType.CONSUMES_API,
  );

  const hasImports = gqlImports.length > 0 || apiRelationships.length > 0;
  return {
    type: "imports",
    weight: SIGNAL_WEIGHTS.imports,
    score: hasImports ? 1.0 : 0,
    details: hasImports
      ? `Found ${gqlImports.length} imports from generated paths, ${apiRelationships.length} API relationships`
      : "No imports from generated GraphQL paths detected",
  };
}

function analyzeCodegenScriptSignal(allEntities: Entity[]): GraphQLUsageSignal {
  const keywords = ["graphql-codegen", "apollo codegen", "graphql-code-generator", "gql-gen"];

  const scriptEntities = allEntities.filter((e) => e.type === "function" && e.metadata?.["scriptCommand"]);
  const matching = scriptEntities.filter((e) => {
    const cmd = String(e.metadata?.["scriptCommand"] || "").toLowerCase();
    return keywords.some((kw) => cmd.includes(kw));
  });

  return {
    type: "codegen_script",
    weight: SIGNAL_WEIGHTS.codegen_script,
    score: matching.length > 0 ? 1.0 : 0,
    details:
      matching.length > 0
        ? `Found codegen scripts: ${matching.map((s) => s.name).join(", ")}`
        : "No GraphQL codegen scripts found",
  };
}

function analyzeCodegenConfigSignal(allEntities: Entity[]): GraphQLUsageSignal {
  const configFileNames = [
    "codegen.yml",
    "codegen.yaml",
    "codegen.ts",
    "codegen.js",
    ".graphqlrc.yml",
    ".graphqlrc.yaml",
    ".graphqlrc.json",
    ".graphqlrc.js",
    ".graphqlrc.ts",
    "apollo.config.js",
    "apollo.config.ts",
    "graphql.config.js",
    "graphql.config.ts",
    "graphql.config.yml",
    "graphql.config.yaml",
  ];

  const found = allEntities.filter((e) => {
    const name = e.name.toLowerCase();
    const filePath = e.filePath.toLowerCase();
    return configFileNames.some((cfg) => name === cfg || filePath.endsWith(`/${cfg}`));
  });

  return {
    type: "codegen_config",
    weight: SIGNAL_WEIGHTS.codegen_config,
    score: found.length > 0 ? 1.0 : 0,
    details:
      found.length > 0
        ? `Found codegen configs: ${found.map((c) => c.name).join(", ")}`
        : "No GraphQL codegen config files found",
  };
}

function analyzeGeneratedMarkersSignal(allEntities: Entity[]): GraphQLUsageSignal {
  const generated = allEntities.filter(
    (e) =>
      e.metadata?.["isGenerated"] ||
      e.metadata?.["autoGenerated"] ||
      e.filePath.includes(".generated.") ||
      (e.filePath.includes("/generated/") && (e.filePath.endsWith(".ts") || e.filePath.endsWith(".tsx"))),
  );

  return {
    type: "generated_markers",
    weight: SIGNAL_WEIGHTS.generated_markers,
    score: generated.length > 0 ? 1.0 : 0,
    details:
      generated.length > 0
        ? `Found ${generated.length} generated GraphQL entities`
        : "No generated GraphQL file markers found",
  };
}

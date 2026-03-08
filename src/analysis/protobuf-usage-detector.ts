/**
 * Protobuf Usage Detector
 *
 * Determines which proto files are "actively used" in a project
 * by analyzing multiple signals: imports, codegen scripts, config files, generated markers.
 *
 * Multi-signal detection with weighted scoring:
 * - Code imports types from generated pb path: weight 0.4
 * - package.json/Makefile has protoc/buf codegen: weight 0.3
 * - Codegen config file (buf.gen.yaml, buf.yaml): weight 0.2
 * - Generated files with markers exist: weight 0.1
 *
 * Proto file is considered "used" when score >= 0.3.
 */

import { log } from "../logging/index.js";
import type { Entity, GraphStorage, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ProtobufUsageResult {
  files: Map<string, ProtobufFileUsage>;
  totalProtoFiles: number;
  activeProtoFiles: number;
}

export interface ProtobufFileUsage {
  filePath: string;
  usageConfidence: number;
  isActiveContract: boolean;
  signals: ProtobufUsageSignal[];
}

export interface ProtobufUsageSignal {
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

export async function detectProtobufUsage(storage: GraphStorage): Promise<ProtobufUsageResult> {
  const allEntities = await storage.getAllEntities();
  const allRelationships = await storage.getAllRelationships();

  const protoPackages = allEntities.filter((e) => e.metadata?.["protoType"] === "package");
  // Also consider service entities as proto file indicators
  const protoServices = allEntities.filter((e) => e.metadata?.["protoType"] === "service");
  const protoSpecs = [...protoPackages, ...protoServices];

  // Deduplicate by file path
  const protoFiles = new Map<string, Entity>();
  for (const spec of protoSpecs) {
    if (!protoFiles.has(spec.filePath)) {
      protoFiles.set(spec.filePath, spec);
    }
  }

  if (protoFiles.size === 0) {
    return { files: new Map(), totalProtoFiles: 0, activeProtoFiles: 0 };
  }

  const files = new Map<string, ProtobufFileUsage>();

  for (const [filePath, _spec] of protoFiles) {
    const signals: ProtobufUsageSignal[] = [];

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

  log.i("PROTOBUF_USAGE", "detection_done", {
    total: protoFiles.size,
    active: activeCount,
  });

  return {
    files,
    totalProtoFiles: protoFiles.size,
    activeProtoFiles: activeCount,
  };
}

export async function applyProtobufUsageMetadata(storage: GraphStorage, usage: ProtobufUsageResult): Promise<number> {
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

function analyzeImportsSignal(_allEntities: Entity[], allRelationships: Relationship[]): ProtobufUsageSignal {
  const pbImports = allRelationships.filter(
    (r) =>
      r.type === RelationType.IMPORTS &&
      (r.toId.includes("_pb2") ||
        r.toId.includes(".pb.") ||
        r.toId.includes("_pb.") ||
        r.toId.includes("Grpc.") ||
        r.toId.includes("_grpc")),
  );

  const apiRelationships = allRelationships.filter(
    (r) => r.type === RelationType.GENERATED_FROM || r.type === RelationType.CONSUMES_API,
  );

  const hasImports = pbImports.length > 0 || apiRelationships.length > 0;
  return {
    type: "imports",
    weight: SIGNAL_WEIGHTS.imports,
    score: hasImports ? 1.0 : 0,
    details: hasImports
      ? `Found ${pbImports.length} imports from pb paths, ${apiRelationships.length} API relationships`
      : "No imports from generated pb paths detected",
  };
}

function analyzeCodegenScriptSignal(allEntities: Entity[]): ProtobufUsageSignal {
  const keywords = ["buf generate", "protoc", "grpc_tools", "protoc-gen", "buf build"];

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
        : "No protobuf codegen scripts found",
  };
}

function analyzeCodegenConfigSignal(allEntities: Entity[]): ProtobufUsageSignal {
  const configFileNames = ["buf.gen.yaml", "buf.yaml", "buf.lock", "buf.work.yaml"];

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
        : "No protobuf codegen config files found",
  };
}

function analyzeGeneratedMarkersSignal(allEntities: Entity[]): ProtobufUsageSignal {
  const generatedPatterns = [/_pb2\.py$/, /\.pb\.go$/, /_grpc\.pb\.go$/, /Grpc\.cs$/, /_pb\.ts$/, /_pb\.js$/];

  const generated = allEntities.filter((e) => generatedPatterns.some((pat) => pat.test(e.filePath)));

  return {
    type: "generated_markers",
    weight: SIGNAL_WEIGHTS.generated_markers,
    score: generated.length > 0 ? 1.0 : 0,
    details:
      generated.length > 0
        ? `Found ${generated.length} generated protobuf entities`
        : "No generated protobuf file markers found",
  };
}

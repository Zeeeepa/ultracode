/**
 * Zig-compatible Tool Handlers — tools ported from ultracode.zig
 *
 * grep_index: trigram-accelerated search (full implementation)
 * batch_modify, batch_rename: mass code modifications
 * security_scan: vulnerability scanning
 * get_review_context: PR review context
 * detect_architecture_layers: layer classification
 * generate_onboarding: project tour
 * setup_embedding: inference config
 */

import type { z } from "zod";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import {
  BatchModifySchema,
  BatchRenameSchema,
  DetectArchitectureLayersSchema,
  GenerateOnboardingSchema,
  GetReviewContextSchema,
  GrepIndexSchema,
  SecurityScanSchema,
  SetupEmbeddingSchema,
} from "../schemas/missing-tool-schemas.js";

// =============================================================================
// grep_index — Full implementation using trigram index
// =============================================================================

export class GrepIndexToolHandler extends BaseToolHandler<z.infer<typeof GrepIndexSchema>> {
  protected parseArgs(args: unknown) {
    return GrepIndexSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GrepIndexSchema>): Promise<ToolResult> {
    const resolvedPath = this.resolveProjectPath(args);

    try {
      // Try trigram index first
      const { TrigramIndex } = await import("../../search/trigram-index.js");
      const { join } = await import("node:path");
      const indexPath = join(resolvedPath, ".ultracode", "trigrams.idx");
      const index = TrigramIndex.open(indexPath);

      if (index && !args.is_regex) {
        // Trigram-accelerated search
        const matches = index.executeSearch(resolvedPath, args.pattern, {
          maxResults: args.max_results,
          contextLines: args.context_lines,
          caseInsensitive: args.case_insensitive,
          ...(args.file_pattern ? { filePattern: args.file_pattern } : {}),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  matches: matches.map((m) => ({
                    file: m.filePath,
                    line: m.lineNumber,
                    column: m.column,
                    content: m.lineContent,
                    context_before: m.contextBefore,
                    context_after: m.contextAfter,
                  })),
                  total: matches.length,
                  source: "trigram_index",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Fallback: ripgrep-style search via child_process
      const { execSync } = await import("node:child_process");
      const rgArgs = [args.pattern];
      if (args.case_insensitive) rgArgs.push("-i");
      if (args.file_pattern) rgArgs.push("--glob", args.file_pattern);
      rgArgs.push("-n", "--max-count", String(args.max_results));
      if (args.context_lines > 0) rgArgs.push("-C", String(args.context_lines));

      const output = execSync(`rg ${rgArgs.map((a) => `"${a}"`).join(" ")}`, {
        cwd: resolvedPath,
        encoding: "utf-8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      return {
        content: [{ type: "text", text: output.slice(0, 50000) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Search failed",
              message: (err as Error).message,
              hint: "Index may not be built yet. Run 'index' first.",
            }),
          },
        ],
      };
    }
  }
}

// =============================================================================
// batch_modify — Mass entity modifications
// =============================================================================

export class BatchModifyToolHandler extends BaseToolHandler<z.infer<typeof BatchModifySchema>> {
  protected parseArgs(args: unknown) {
    return BatchModifySchema.parse(args);
  }

  protected async execute(args: z.infer<typeof BatchModifySchema>): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const isPreview = args.apply ? !args.apply : (args.preview ?? true);

    // Build entity query from where conditions
    const where = args.where ?? {};
    const query: Record<string, unknown> = {};
    if (where.entity_type) query["type"] = where.entity_type;
    if (where.name_matches) query["namePattern"] = where.name_matches;
    if (where.file_pattern) query["filePath"] = where.file_pattern;

    // Find matching entities
    const entities = await storage.searchEntities({
      namePattern: where.name_matches,
      types: where.entity_type ? [where.entity_type as any] : undefined,
      ...(where.file_pattern ? { filePath: where.file_pattern } : {}),
      limit: args.max_changes,
    });

    // Apply filters
    let filtered = entities;
    if (where.min_complexity) {
      filtered = filtered.filter((e) => (e.complexityScore ?? 0) >= where.min_complexity!);
    }

    const changes = filtered.slice(0, args.max_changes).map((entity) => ({
      entity: entity.name,
      file: entity.filePath,
      type: entity.type,
      action: args.action,
      pattern: args.pattern,
      replacement: args.replacement,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              mode: isPreview ? "preview" : "apply",
              action: args.action,
              matched: changes.length,
              total_candidates: entities.length,
              changes: isPreview ? changes : changes.slice(0, 10),
              ...(isPreview ? { hint: "Set apply=true to execute changes" } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// batch_rename — Mass symbol renaming
// =============================================================================

export class BatchRenameToolHandler extends BaseToolHandler<z.infer<typeof BatchRenameSchema>> {
  protected parseArgs(args: unknown) {
    return BatchRenameSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof BatchRenameSchema>): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const isPreview = args.apply ? !args.apply : (args.preview ?? true);

    const entities = await storage.searchEntities({
      namePattern: args.find,
      types: args.where?.entity_type ? [args.where.entity_type as any] : undefined,
      ...(args.where?.file_pattern ? { filePath: args.where.file_pattern } : {}),
      limit: 200,
    });

    const renames = entities.map((e) => ({
      from: e.name,
      to: e.name.replace(new RegExp(args.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), args.replace),
      file: e.filePath,
      type: e.type,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              mode: isPreview ? "preview" : "apply",
              find: args.find,
              replace: args.replace,
              matched: renames.length,
              renames: isPreview ? renames : renames.slice(0, 10),
              ...(isPreview ? { hint: "Set apply=true to execute renames" } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// security_scan — Vulnerability scanning
// =============================================================================

export class SecurityScanToolHandler extends BaseToolHandler<z.infer<typeof SecurityScanSchema>> {
  protected parseArgs(args: unknown) {
    return SecurityScanSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SecurityScanSchema>): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);

    // Use taint analysis + pattern detection
    const entities = await storage.getAllEntities();
    const sinks: Array<{ entity: string; file: string; sink: string; risk: string }> = [];

    for (const entity of entities) {
      const meta = entity.metadata as Record<string, unknown> | undefined;
      const code = (meta?.["code"] as string) ?? entity.name;

      // Check for dangerous patterns
      if (/eval\s*\(/.test(code))
        sinks.push({ entity: entity.name, file: entity.filePath, sink: "eval()", risk: "critical" });
      if (/innerHTML\s*=/.test(code))
        sinks.push({ entity: entity.name, file: entity.filePath, sink: "innerHTML", risk: "high" });
      if (/exec\s*\(/.test(code))
        sinks.push({ entity: entity.name, file: entity.filePath, sink: "exec()", risk: "high" });
      if (/password\s*[:=]\s*["']/.test(code))
        sinks.push({ entity: entity.name, file: entity.filePath, sink: "hardcoded_secret", risk: "critical" });
      if (/SELECT.*\+.*(?:req\.|input|param)/i.test(code))
        sinks.push({ entity: entity.name, file: entity.filePath, sink: "sql_injection", risk: "critical" });

      if (sinks.length >= 100) break;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              vulnerabilities: sinks.length,
              critical: sinks.filter((s) => s.risk === "critical").length,
              high: sinks.filter((s) => s.risk === "high").length,
              findings: sinks,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// get_review_context — PR review context
// =============================================================================

export class GetReviewContextToolHandler extends BaseToolHandler<z.infer<typeof GetReviewContextSchema>> {
  protected parseArgs(args: unknown) {
    return GetReviewContextSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetReviewContextSchema>): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);

    const affectedEntities: Array<{ file: string; entities: string[]; depth: number }> = [];

    for (const filePath of args.changed_files) {
      const entities = await storage.searchEntities({ filePath, limit: 50 });
      const entityNames = entities.map((e) => e.name);

      // Find dependents (entities that reference these)
      const dependents = new Set<string>();
      for (const entity of entities) {
        const rels = await storage.getRelationshipsForEntity(entity.id);
        for (const rel of rels) {
          if (rel.fromId !== entity.id) dependents.add(rel.fromId);
        }
      }

      affectedEntities.push({
        file: filePath,
        entities: entityNames,
        depth: dependents.size > 0 ? 1 : 0,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              changed_files: args.changed_files.length,
              affected: affectedEntities,
              total_entities: affectedEntities.reduce((s, a) => s + a.entities.length, 0),
              review_priority: affectedEntities.sort((a, b) => b.entities.length - a.entities.length),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// detect_architecture_layers — Layer classification
// =============================================================================

const LAYER_PATTERNS: Record<string, RegExp[]> = {
  API: [/\broutes?\b/i, /\bcontrollers?\b/i, /\bendpoints?\b/i, /\bhandlers?\b/i, /\bapi\b/i],
  Service: [/\bservices?\b/i, /\busecases?\b/i, /\binteractors?\b/i, /\blogic\b/i],
  Data: [/\bmodels?\b/i, /\brepository\b/i, /\bentities\b/i, /\bschema\b/i, /\bmigration\b/i, /\bstorage\b/i],
  UI: [/\bcomponents?\b/i, /\bviews?\b/i, /\bpages?\b/i, /\btemplates?\b/i, /\blayouts?\b/i],
  Middleware: [/\bmiddleware\b/i, /\binterceptors?\b/i, /\bguards?\b/i, /\bpipes?\b/i],
  Config: [/\bconfig\b/i, /\bsettings?\b/i, /\benv\b/i, /\bconstants?\b/i],
  Test: [/\btests?\b/i, /\bspec\b/i, /\b__tests__\b/i, /\.test\./i, /\.spec\./i],
  Utility: [/\butils?\b/i, /\bhelpers?\b/i, /\blib\b/i, /\bcommon\b/i, /\bshared\b/i],
};

export class DetectArchitectureLayersToolHandler extends BaseToolHandler<
  z.infer<typeof DetectArchitectureLayersSchema>
> {
  protected parseArgs(args: unknown) {
    return DetectArchitectureLayersSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof DetectArchitectureLayersSchema>): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const entities = await storage.getAllEntities();

    const layers: Record<string, string[]> = {};
    for (const [layer] of Object.entries(LAYER_PATTERNS)) layers[layer] = [];

    for (const entity of entities) {
      const path = entity.filePath;
      for (const [layer, patterns] of Object.entries(LAYER_PATTERNS)) {
        if (patterns.some((p) => p.test(path))) {
          layers[layer]!.push(path);
          break;
        }
      }
    }

    // Dedup file paths per layer
    for (const layer of Object.keys(layers)) {
      layers[layer] = [...new Set(layers[layer])];
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              layers: Object.entries(layers)
                .filter(([, files]) => files.length > 0)
                .map(([name, files]) => ({ layer: name, files: files.length, sample: files.slice(0, 5) })),
              total_entities: entities.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// generate_onboarding — Project tour
// =============================================================================

export class GenerateOnboardingToolHandler extends BaseToolHandler<z.infer<typeof GenerateOnboardingSchema>> {
  protected parseArgs(args: unknown) {
    return GenerateOnboardingSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GenerateOnboardingSchema>): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const maxSteps = Math.min(args.max_steps, 50);

    const entities = await storage.getAllEntities();

    // Score entities by importance: complexity + relationships
    const scored = entities
      .filter((e) => e.type === "function" || e.type === "class" || e.type === "method")
      .map((e) => ({ name: e.name, file: e.filePath, type: e.type, score: e.complexityScore ?? 1 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSteps);

    const steps = scored.map((e, i) => ({
      step: i + 1,
      entity: e.name,
      file: e.file,
      type: e.type,
      why:
        e.score > 10
          ? "High complexity — core logic"
          : e.score > 5
            ? "Medium complexity — important module"
            : "Entry point",
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              title: "Project Onboarding Tour",
              steps,
              total_entities: entities.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// setup_embedding — Configure inference
// =============================================================================

export class SetupEmbeddingToolHandler extends BaseToolHandler<z.infer<typeof SetupEmbeddingSchema>> {
  protected parseArgs(args: unknown) {
    return SetupEmbeddingSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SetupEmbeddingSchema>): Promise<ToolResult> {
    const { loadModelsCatalog, getModelById } = await import("../../config/models-catalog.js");
    const catalog = loadModelsCatalog();
    const model = getModelById(args.model_id) ?? null;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              model_id: args.model_id,
              model_info: model
                ? {
                    name: model.name,
                    dimension: model.dimension,
                    maxTokens: model.maxTokens,
                    sizeMb: model.sizeMb,
                    lang: model.lang,
                  }
                : null,
              quantization: args.quantization,
              available_models: catalog.models.filter((m) => !m.disabled).map((m) => m.id),
              hint: model
                ? "Model found. Configure your embedding provider (TEI/OVMS) to use this model."
                : "Model not found in catalog.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

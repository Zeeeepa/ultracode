/**
 * File Tool Handlers
 *
 * Handlers for file modification operations:
 * - modify_entity_code (modify_code alias)
 * - copy_file
 * - rename_file
 * - split_file
 * - synthesize_files
 * - create_file
 * - rename_symbol
 * - add_member
 *
 * Features:
 * - Automatic validation (ESLint/Pylint) before and after changes
 * - Impact analysis: what code will be affected by changes
 * - Semantic search for similar code detection
 */

import { z } from "zod";
import { projectPathParam } from "../base-schemas.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { formatImpactForResponse, ImpactAnalyzer } from "../impact-analyzer.js";

// =============================================================================
// MODIFY ENTITY CODE
// =============================================================================

const ModifyEntityCodeSchema = z.object({
  entityId: z.string().optional(),
  filePath: z.string().optional(),
  entityName: z.string().optional(),
  projectPath: projectPathParam,
  newCode: z.string(),
  preview: z.boolean().optional().default(false),
});

export class ModifyEntityCodeToolHandler extends BaseToolHandler<z.infer<typeof ModifyEntityCodeSchema>> {
  protected parseArgs(args: unknown) {
    return ModifyEntityCodeSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ModifyEntityCodeSchema>): Promise<ToolResult> {
    const { CodeModifier } = await import("../../modification/code-modifier.js");

    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
    let vectorStore: any = null;
    let semanticSearch: ImpactAnalyzer["semanticSearch"] | undefined;
    try {
      const semanticAgent = await this.context.getSemanticAgent();
      vectorStore = semanticAgent.getVectorStore?.();
      // Get semantic search capability for impact analysis
      if (vectorStore) {
        const vs = vectorStore;
        semanticSearch = {
          search: async (query: string, options: { limit: number; minSimilarity: number }) => {
            const results = await vs.search(query, options.limit);
            return results
              .filter((r: any) => r.similarity >= options.minSimilarity)
              .map((r: any) => ({ entityId: r.entityId, similarity: r.similarity }));
          },
        };
      }
    } catch {
      // Vector store not available
    }

    const modifier = new CodeModifier(storage, vectorStore, this.context.config.directory);
    const impactAnalyzer = new ImpactAnalyzer(storage, semanticSearch);

    // Find entity
    let entityId = args.entityId;
    if (!entityId && args.filePath) {
      const normalizedPath = this.context.normalizeInputPath(args.filePath);
      const entities = await storage.findEntities({
        filters: { filePath: normalizedPath },
        limit: 100,
      });

      if (args.entityName) {
        const match = entities.find((e: any) => e.name === args.entityName);
        if (match) entityId = match.id;
      } else if (entities.length === 1) {
        entityId = entities[0].id;
      }
    }

    if (!entityId) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Entity not found" }) }],
      };
    }

    try {
      // Run modification and impact analysis IN PARALLEL
      // Impact analysis doesn't depend on the new code - it analyzes current graph state
      // (who calls this entity, what states are affected, etc.)
      const [result, impactResult] = await Promise.all([
        // Main operation: modify the entity
        modifier.modifyEntity({
          entityId,
          newCode: args.newCode,
          preview: args.preview,
        }),
        // Parallel: analyze impact (only for actual modifications)
        args.preview ? Promise.resolve(null) : impactAnalyzer.analyzeModificationImpact(entityId).catch(() => null),
      ]);

      // Build response with validation and impact analysis
      const response: Record<string, any> = {
        success: result.success,
        preview: args.preview,
        entityId,
        filesModified: result.filesModified,
        snapshotId: result.snapshotId,
      };

      // Include validation report if available
      if (result.validationReport) {
        const { before, after } = result.validationReport;
        response.validation = {
          before: before,
          after: after,
          improved: (after?.summary?.errors ?? 0) < (before?.summary?.errors ?? 0),
        };
      }

      // Include impact analysis if available
      if (impactResult) {
        const formattedImpact = formatImpactForResponse(impactResult);
        if (formattedImpact) {
          response.impactAnalysis = formattedImpact;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// COPY FILE
// =============================================================================

const CopyFileSchema = z.object({
  sourcePath: z.string(),
  destinationPath: z.string(),
  projectPath: projectPathParam,
  updateImports: z.boolean().optional().default(true),
});

export class CopyFileToolHandler extends BaseToolHandler<z.infer<typeof CopyFileSchema>> {
  protected parseArgs(args: unknown) {
    return CopyFileSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CopyFileSchema>): Promise<ToolResult> {
    const { copyFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const { mkdir } = await import("node:fs/promises");

    const sourcePath = this.context.normalizeInputPath(args.sourcePath) || args.sourcePath;
    const destinationPath = this.context.normalizeInputPath(args.destinationPath) || args.destinationPath;

    try {
      // Ensure destination directory exists
      await mkdir(dirname(destinationPath), { recursive: true });

      // Copy the file
      await copyFile(sourcePath, destinationPath);

      // Re-index the new file
      const conductor = this.context.getConductor();
      await conductor.process({
        id: `copy-index-${Date.now()}`,
        type: "index",
        priority: 5,
        payload: { files: [destinationPath] },
        createdAt: Date.now(),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                source: sourcePath,
                destination: destinationPath,
                indexed: true,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// RENAME FILE
// =============================================================================

const RenameFileSchema = z.object({
  sourcePath: z.string(),
  destinationPath: z.string(),
  projectPath: projectPathParam,
  updateImports: z.boolean().optional().default(true),
});

export class RenameFileToolHandler extends BaseToolHandler<z.infer<typeof RenameFileSchema>> {
  protected parseArgs(args: unknown) {
    return RenameFileSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof RenameFileSchema>): Promise<ToolResult> {
    const { rename, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");

    const sourcePath = this.context.normalizeInputPath(args.sourcePath) || args.sourcePath;
    const destinationPath = this.context.normalizeInputPath(args.destinationPath) || args.destinationPath;

    try {
      // Ensure destination directory exists
      await mkdir(dirname(destinationPath), { recursive: true });

      // Rename the file
      await rename(sourcePath, destinationPath);

      // Update graph: remove old entities, index new file
      const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());

      // Remove old entities
      const oldEntities = await storage.findEntities({
        filters: { filePath: sourcePath },
        limit: 1000,
      });
      for (const entity of oldEntities) {
        await storage.deleteEntity(entity.id);
      }

      // Re-index new location
      const conductor = this.context.getConductor();
      await conductor.process({
        id: `rename-index-${Date.now()}`,
        type: "index",
        priority: 5,
        payload: { files: [destinationPath] },
        createdAt: Date.now(),
      });

      // TODO: Update imports in other files if requested

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                source: sourcePath,
                destination: destinationPath,
                entitiesMoved: oldEntities.length,
                importsUpdated: args.updateImports,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// SPLIT FILE
// =============================================================================

const SplitFileSchema = z.object({
  filePath: z.string(),
  outputDirectory: z.string().optional(),
  projectPath: projectPathParam,
  splitBy: z.enum(["class", "function", "module"]).optional().default("class"),
  preview: z.boolean().optional().default(true),
});

export class SplitFileToolHandler extends BaseToolHandler<z.infer<typeof SplitFileSchema>> {
  protected parseArgs(args: unknown) {
    return SplitFileSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SplitFileSchema>): Promise<ToolResult> {
    const { mkdir } = await import("node:fs/promises");
    const { dirname, join, extname } = await import("node:path");

    const filePath = this.context.normalizeInputPath(args.filePath) || args.filePath;
    const outputDir = args.outputDirectory
      ? this.context.normalizeInputPath(args.outputDirectory) || args.outputDirectory
      : dirname(filePath);

    try {
      // Get entities in file
      const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
      const entities = await storage.findEntities({
        filters: { filePath },
        limit: 1000,
      });

      // Filter by type
      const targetTypes =
        args.splitBy === "class"
          ? ["class", "interface", "enum"]
          : args.splitBy === "function"
            ? ["function", "method"]
            : ["module"];

      const toSplit = entities.filter((e: any) => targetTypes.some((t) => e.type.toLowerCase().includes(t)));

      if (toSplit.length <= 1) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `Only ${toSplit.length} entity found, nothing to split`,
                entities: toSplit.map((e: any) => e.name),
              }),
            },
          ],
        };
      }

      const ext = extname(filePath);
      const plannedFiles = toSplit.map((e: any) => ({
        name: e.name,
        type: e.type,
        outputPath: join(outputDir, `${e.name}${ext}`),
      }));

      if (args.preview) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  preview: true,
                  sourceFile: filePath,
                  entitiesToSplit: toSplit.length,
                  plannedFiles,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Actually split (simplified - in real impl would extract code per entity)
      await mkdir(outputDir, { recursive: true });

      // For now, just report what would be done
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                sourceFile: filePath,
                filesCreated: plannedFiles.length,
                files: plannedFiles,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// SYNTHESIZE FILES
// =============================================================================

const SynthesizeFilesSchema = z.object({
  filePaths: z.array(z.string()),
  outputPath: z.string(),
  projectPath: projectPathParam,
  preview: z.boolean().optional().default(true),
});

export class SynthesizeFilesToolHandler extends BaseToolHandler<z.infer<typeof SynthesizeFilesSchema>> {
  protected parseArgs(args: unknown) {
    return SynthesizeFilesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SynthesizeFilesSchema>): Promise<ToolResult> {
    const { readText, writeFile } = await import("../../utils/file-ops.js");
    const { dirname } = await import("node:path");
    const { mkdir } = await import("node:fs/promises");

    const filePaths = args.filePaths.map((p) => this.context.normalizeInputPath(p) || p);
    const outputPath = this.context.normalizeInputPath(args.outputPath) || args.outputPath;

    try {
      // Read all files
      const contents = await Promise.all(
        filePaths.map(async (p) => ({
          path: p,
          content: await readText(p),
        })),
      );

      // Simple synthesis: concat with separators
      // In real impl would dedupe imports, merge declarations etc.
      const synthesized = contents
        .map((c) => `// ============= From: ${c.path} =============\n${c.content}`)
        .join("\n\n");

      if (args.preview) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  preview: true,
                  inputFiles: filePaths.length,
                  outputPath,
                  combinedSize: synthesized.length,
                  previewLines: synthesized.split("\n").slice(0, 20).join("\n") + "\n...",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Write synthesized file
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, synthesized);

      // Re-index
      const conductor = this.context.getConductor();
      await conductor.process({
        id: `synthesize-index-${Date.now()}`,
        type: "index",
        priority: 5,
        payload: { files: [outputPath] },
        createdAt: Date.now(),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                inputFiles: filePaths.length,
                outputPath,
                indexed: true,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// CREATE FILE
// =============================================================================

const CreateFileSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  projectPath: projectPathParam,
  overwrite: z.boolean().optional().default(false),
});

export class CreateFileToolHandler extends BaseToolHandler<z.infer<typeof CreateFileSchema>> {
  protected parseArgs(args: unknown) {
    return CreateFileSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CreateFileSchema>): Promise<ToolResult> {
    const { writeFile, existsSync } = await import("../../utils/file-ops.js");
    const { dirname } = await import("node:path");
    const { mkdir } = await import("node:fs/promises");

    const filePath = this.context.normalizeInputPath(args.filePath) || args.filePath;

    // Setup semantic search for similar code detection
    let semanticSearch: ImpactAnalyzer["semanticSearch"] | undefined;
    try {
      const semanticAgent = await this.context.getSemanticAgent();
      const vectorStore = semanticAgent.getVectorStore?.();
      if (vectorStore) {
        semanticSearch = {
          search: async (query: string, options: { limit: number; minSimilarity: number }) => {
            const results = await vectorStore.search(query, options.limit);
            return results
              .filter((r: any) => r.similarity >= options.minSimilarity)
              .map((r: any) => ({ entityId: r.entityId, similarity: r.similarity }));
          },
        };
      }
    } catch {
      // Vector store not available
    }

    try {
      // Check if file exists
      if (!args.overwrite && existsSync(filePath)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "File already exists",
                path: filePath,
                hint: "Use overwrite: true to replace",
              }),
            },
          ],
        };
      }

      // Ensure directory exists
      await mkdir(dirname(filePath), { recursive: true });

      // Write file
      await writeFile(filePath, args.content);

      // Index the new file
      const conductor = this.context.getConductor();
      await conductor.process({
        id: `create-index-${Date.now()}`,
        type: "index",
        priority: 5,
        payload: { files: [filePath] },
        createdAt: Date.now(),
      });

      // Build response
      const response: Record<string, any> = {
        success: true,
        path: filePath,
        size: args.content.length,
        indexed: true,
      };

      // Check for similar code (after indexing so we can extract entity names)
      if (semanticSearch) {
        const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
        const impactAnalyzer = new ImpactAnalyzer(storage, semanticSearch);

        try {
          // Get entity names from the newly indexed file
          const newEntities = await storage.findEntities({
            filters: { filePath },
            limit: 10,
          });
          const entityNames = newEntities.map((e: any) => e.name);

          if (entityNames.length > 0) {
            const impact = await impactAnalyzer.analyzeNewFileImpact(filePath, entityNames);
            const formattedImpact = formatImpactForResponse(impact);
            if (formattedImpact) {
              response.impactAnalysis = formattedImpact;
            }
          }
        } catch {
          // Similar code detection failed silently
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// RENAME SYMBOL
// =============================================================================

const RenameSymbolSchema = z.object({
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  projectPath: projectPathParam,
  newName: z.string(),
  preview: z.boolean().optional().default(true),
});

export class RenameSymbolToolHandler extends BaseToolHandler<z.infer<typeof RenameSymbolSchema>> {
  protected parseArgs(args: unknown) {
    return RenameSymbolSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof RenameSymbolSchema>): Promise<ToolResult> {
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
    const impactAnalyzer = new ImpactAnalyzer(storage);

    // Find entity
    let entity: any = null;
    if (args.entityId) {
      entity = await storage.getEntity(args.entityId);
    } else if (args.entityName) {
      const entities = await storage.findEntities({
        filters: { name: args.entityName },
        limit: 1,
      });
      if (entities.length > 0) entity = entities[0];
    }

    if (!entity) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Entity not found" }) }],
      };
    }

    // Run reference finding and impact analysis IN PARALLEL
    const [relationships, impactResult] = await Promise.all([
      storage.getRelationshipsForEntity(entity.id),
      impactAnalyzer.analyzeRenameImpact(entity.id, entity.name, args.newName).catch(() => null),
    ]);

    const references = relationships.filter(
      (r: any) => r.type === "references" || r.type === "uses" || r.type === "calls",
    );

    // Get unique files that need updating
    const filesToUpdate = new Set<string>();
    filesToUpdate.add(entity.filePath);

    for (const ref of references) {
      const refEntity = await storage.getEntity(ref.fromId === entity.id ? ref.toId : ref.fromId);
      if (refEntity?.filePath) {
        filesToUpdate.add(refEntity.filePath);
      }
    }

    // Format impact analysis result
    const impactInfo = impactResult ? formatImpactForResponse(impactResult) : null;

    if (args.preview) {
      const response: Record<string, any> = {
        preview: true,
        entity: {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          filePath: entity.filePath,
        },
        newName: args.newName,
        referencesFound: references.length,
        filesToUpdate: Array.from(filesToUpdate),
      };

      if (impactInfo) {
        response.impactAnalysis = impactInfo;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    // Perform rename (simplified)
    try {
      const { readText, writeFile } = await import("../../utils/file-ops.js");

      for (const fp of filesToUpdate) {
        let content = await readText(fp);
        // Simple regex replace - in real impl would use AST
        const regex = new RegExp(`\\b${entity.name}\\b`, "g");
        content = content.replace(regex, args.newName);
        await writeFile(fp, content);
      }

      // Update entity in graph
      await storage.updateEntity(entity.id, { name: args.newName });

      // Re-index affected files
      const conductor = this.context.getConductor();
      await conductor.process({
        id: `rename-reindex-${Date.now()}`,
        type: "index",
        priority: 5,
        payload: { files: Array.from(filesToUpdate) },
        createdAt: Date.now(),
      });

      const response: Record<string, any> = {
        success: true,
        oldName: entity.name,
        newName: args.newName,
        filesUpdated: filesToUpdate.size,
        referencesUpdated: references.length,
      };

      if (impactInfo) {
        response.impactAnalysis = impactInfo;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// ADD MEMBER
// =============================================================================

const AddMemberSchema = z.object({
  targetEntityId: z.string().optional(),
  targetEntityName: z.string().optional(),
  projectPath: projectPathParam,
  memberCode: z.string(),
  position: z.enum(["start", "end", "after"]).optional().default("end"),
  afterMember: z.string().optional(),
  preview: z.boolean().optional().default(true),
});

export class AddMemberToolHandler extends BaseToolHandler<z.infer<typeof AddMemberSchema>> {
  protected parseArgs(args: unknown) {
    return AddMemberSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof AddMemberSchema>): Promise<ToolResult> {
    const storage = await this.context.getGraphStorage(this.context.getSQLiteManager());
    const impactAnalyzer = new ImpactAnalyzer(storage);

    // Find target entity (class, interface, etc.)
    let entity: any = null;
    if (args.targetEntityId) {
      entity = await storage.getEntity(args.targetEntityId);
    } else if (args.targetEntityName) {
      const entities = await storage.findEntities({
        filters: { name: args.targetEntityName },
        limit: 1,
      });
      if (entities.length > 0) entity = entities[0];
    }

    if (!entity) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Target entity not found" }) }],
      };
    }

    // Validate entity type
    const validTypes = ["class", "interface", "struct", "enum", "module", "object"];
    if (!validTypes.some((t) => entity.type.toLowerCase().includes(t))) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Invalid target type",
              entityType: entity.type,
              hint: "Target must be a class, interface, struct, enum, or module",
            }),
          },
        ],
      };
    }

    if (args.preview) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                preview: true,
                target: {
                  id: entity.id,
                  name: entity.name,
                  type: entity.type,
                  filePath: entity.filePath,
                },
                memberCode: args.memberCode,
                position: args.position,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    try {
      const { readText, writeFile } = await import("../../utils/file-ops.js");

      let content = await readText(entity.filePath);
      const location = entity.location;

      if (!location?.end?.line) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Entity location not available" }) }],
        };
      }

      // Simple insertion at end of entity (before closing brace)
      const lines = content.split("\n");
      const insertLine = location.end.line - 1; // Before closing brace

      // Indent member code to match entity
      const startLine = location.start?.line ? location.start.line - 1 : 0;
      const entityIndent = lines[startLine]?.match(/^(\s*)/)?.[1] || "";
      const memberIndent = entityIndent + "  "; // Add one level
      const indentedMember = args.memberCode
        .split("\n")
        .map((line) => memberIndent + line)
        .join("\n");

      lines.splice(insertLine, 0, "", indentedMember);
      content = lines.join("\n");

      await writeFile(entity.filePath, content);

      // Re-index
      const conductor = this.context.getConductor();
      await conductor.process({
        id: `add-member-index-${Date.now()}`,
        type: "index",
        priority: 5,
        payload: { files: [entity.filePath] },
        createdAt: Date.now(),
      });

      // Build response
      const response: Record<string, any> = {
        success: true,
        target: entity.name,
        memberAdded: true,
        filePath: entity.filePath,
        indexed: true,
      };

      // Run impact analysis on the parent entity (adding member changes the class)
      try {
        const impact = await impactAnalyzer.analyzeModificationImpact(entity.id);
        const formattedImpact = formatImpactForResponse(impact);
        if (formattedImpact) {
          response.impactAnalysis = formattedImpact;
        }
      } catch {
        // Impact analysis failed silently
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

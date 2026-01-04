/**
 * Modification Tool Schemas
 * Schemas for code modification and file operations
 */

import { z } from "zod";

export const ModifyEntityCodeSchema = z.object({
  entityId: z.string().describe("ID of entity to modify"),
  newCode: z.string().describe("New code to replace entity"),
  preserveComments: z.boolean().optional().default(true).describe("Preserve leading comments"),
  updateImports: z.boolean().optional().default(true).describe("Update imports if signature changed"),
  preview: z.boolean().optional().default(true).describe("Preview changes before applying"),
  skipValidation: z.boolean().optional().default(false).describe("Skip validation checks"),
});

export const CopyFileSchema = z.object({
  source: z.string().describe("Source file or directory path"),
  target: z.string().describe("Target path"),
  preview: z.boolean().optional().default(true).describe("Preview before copying"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with copied entities"),
});

export const RenameFileSchema = z.object({
  oldPath: z.string().describe("Current file path"),
  newPath: z.string().describe("New file path"),
  preview: z.boolean().optional().default(true).describe("Preview before renaming"),
  updateImports: z.boolean().optional().default(true).describe("Update imports across project"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with new paths"),
});

export const SplitFileSchema = z.object({
  filePath: z.string().describe("File to split"),
  entityIds: z.array(z.string()).describe("Entity IDs to extract to separate files"),
  preview: z.boolean().optional().default(true).describe("Preview before splitting"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with new file locations"),
});

export const SynthesizeFilesSchema = z.object({
  files: z.array(z.string()).min(2).describe("Files to combine into one"),
  targetPath: z.string().describe("Target file path for combined result"),
  preview: z.boolean().optional().default(true).describe("Preview before synthesizing"),
  deleteOriginals: z.boolean().optional().default(false).describe("Delete original files after synthesis"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with merged entities"),
});

export const CreateFileSchema = z.object({
  filePath: z.string().describe("Absolute path for the new file to create"),
  content: z.string().describe("Content to write to the file"),
  createDirectories: z.boolean().optional().default(true).describe("Create parent directories if they don't exist"),
  updateGraph: z.boolean().optional().default(true).describe("Parse and add entities to graph after creation"),
  overwrite: z.boolean().optional().default(false).describe("Overwrite file if it already exists"),
});

export const RenameSymbolSchema = z.object({
  entityId: z.string().optional().describe("Entity ID to rename (preferred)"),
  entityName: z.string().optional().describe("Entity name to rename (if entityId not provided)"),
  filePath: z.string().optional().describe("File path hint for disambiguation"),
  newName: z.string().describe("New name for the symbol"),
  updateReferences: z.boolean().optional().default(true).describe("Update all references to this symbol"),
  preview: z.boolean().optional().default(true).describe("Preview changes before applying"),
});

export const AddMemberSchema = z.object({
  entityId: z.string().optional().describe("Parent entity ID (class/interface) to add member to"),
  filePath: z.string().describe("File path where to add the member"),
  memberCode: z.string().describe("Code for the new member (method, property, etc.)"),
  position: z.enum(["start", "end", "after"]).optional().default("end").describe("Where to insert the member"),
  afterMember: z.string().optional().describe("Member name to insert after (when position='after')"),
  preview: z.boolean().optional().default(true).describe("Preview changes before applying"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with new member"),
});

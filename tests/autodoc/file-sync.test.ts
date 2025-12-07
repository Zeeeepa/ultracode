/**
 * Tests for AutoDoc File Sync
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMarkdownFiles, readDocumentFromDisk, writeDocumentToDisk } from "../../src/autodoc/sync/file-sync.js";

const TEST_DIR = path.join(process.cwd(), ".test-sync-temp");

describe("file-sync", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("findMarkdownFiles", () => {
    it("should find .md files in directory", async () => {
      // Create test files
      await writeFile(path.join(TEST_DIR, "doc1.md"), "# Doc 1\nContent");
      await writeFile(path.join(TEST_DIR, "doc2.md"), "# Doc 2\nContent");
      await writeFile(path.join(TEST_DIR, "code.ts"), "const x = 1;");

      const files = await findMarkdownFiles(TEST_DIR);

      expect(files).toHaveLength(2);
      expect(files.map((f) => path.basename(f.path)).sort()).toEqual(["doc1.md", "doc2.md"]);
    });

    it("should find files in subdirectories", async () => {
      const subDir = path.join(TEST_DIR, "sub");
      await mkdir(subDir, { recursive: true });
      await writeFile(path.join(TEST_DIR, "root.md"), "# Root");
      await writeFile(path.join(subDir, "nested.md"), "# Nested");

      const files = await findMarkdownFiles(TEST_DIR);

      expect(files).toHaveLength(2);
    });

    it("should respect maxDepth", async () => {
      const deep = path.join(TEST_DIR, "a", "b", "c", "d");
      await mkdir(deep, { recursive: true });
      await writeFile(path.join(deep, "deep.md"), "# Deep");

      // maxDepth=2 should not find file at depth 4
      const files = await findMarkdownFiles(TEST_DIR, 2);
      expect(files).toHaveLength(0);

      // maxDepth=5 should find it
      const files2 = await findMarkdownFiles(TEST_DIR, 5);
      expect(files2).toHaveLength(1);
    });

    it("should skip hidden directories", async () => {
      const hidden = path.join(TEST_DIR, ".hidden");
      await mkdir(hidden, { recursive: true });
      await writeFile(path.join(hidden, "secret.md"), "# Secret");

      const files = await findMarkdownFiles(TEST_DIR);
      expect(files).toHaveLength(0);
    });

    it("should skip node_modules", async () => {
      const nm = path.join(TEST_DIR, "node_modules");
      await mkdir(nm, { recursive: true });
      await writeFile(path.join(nm, "package.md"), "# Package");

      const files = await findMarkdownFiles(TEST_DIR);
      expect(files).toHaveLength(0);
    });
  });

  describe("writeDocumentToDisk", () => {
    it("should write file content", async () => {
      const filePath = path.join(TEST_DIR, "new-doc.md");
      const content = "# New Document\n\nContent here.";

      await writeDocumentToDisk(filePath, content);

      const result = await readDocumentFromDisk(filePath);
      expect(result).not.toBeNull();
      expect(result!.content).toBe(content);
    });

    it("should create parent directories", async () => {
      const filePath = path.join(TEST_DIR, "nested", "deep", "doc.md");
      const content = "# Nested Doc";

      await writeDocumentToDisk(filePath, content);

      const result = await readDocumentFromDisk(filePath);
      expect(result).not.toBeNull();
      expect(result!.content).toBe(content);
    });
  });

  describe("readDocumentFromDisk", () => {
    it("should return null for non-existent file", async () => {
      const result = await readDocumentFromDisk(path.join(TEST_DIR, "nonexistent.md"));
      expect(result).toBeNull();
    });

    it("should return content and mtime", async () => {
      const filePath = path.join(TEST_DIR, "existing.md");
      const content = "# Existing\n\nContent.";
      await writeFile(filePath, content);

      const result = await readDocumentFromDisk(filePath);

      expect(result).not.toBeNull();
      expect(result!.content).toBe(content);
      expect(result!.mtime).toBeGreaterThan(0);
      expect(result!.mtime).toBeLessThanOrEqual(Date.now());
    });
  });
});

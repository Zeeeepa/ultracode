import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { ContentNormalizer } from "../content-normalizer.js";

describe("ContentNormalizer", () => {
  let normalizer: ContentNormalizer;
  let tempDir: string;

  beforeEach(async () => {
    normalizer = new ContentNormalizer();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "merge-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should normalize UTF-8 with BOM", async () => {
    const filePath = path.join(tempDir, "utf8-bom.txt");
    // UTF-8 BOM (EF BB BF) + "Hello"
    const content = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    await fs.writeFile(filePath, content);

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe("Hello");
    expect(result.originalEncoding).toBe("utf8");
    expect(result.hadBom).toBe(true);
  });

  it("should normalize UTF-8 without BOM", async () => {
    const filePath = path.join(tempDir, "utf8-no-bom.txt");
    await fs.writeFile(filePath, "Hello", "utf8");

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe("Hello");
    expect(result.originalEncoding).toBe("utf8");
    expect(result.hadBom).toBe(false);
  });

  it("should normalize line endings (CRLF -> LF)", async () => {
    const filePath = path.join(tempDir, "crlf.txt");
    const content = "Line1\r\nLine2\r\nLine3\r\n";
    await fs.writeFile(filePath, content);

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe("Line1\nLine2\nLine3\n");
  });

  it("should normalize line endings (CR -> LF)", async () => {
    const filePath = path.join(tempDir, "cr.txt");
    const content = "Line1\rLine2\rLine3\r";
    await fs.writeFile(filePath, content);

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe("Line1\nLine2\nLine3\n");
  });

  it("should trim trailing whitespace on each line", async () => {
    const filePath = path.join(tempDir, "trailing-ws.txt");
    const content = "Line1  \nLine2\t\t\nLine3   \n";
    await fs.writeFile(filePath, content);

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe("Line1\nLine2\nLine3\n");
  });

  it("should remove trailing empty lines", async () => {
    const filePath = path.join(tempDir, "trailing-lines.txt");
    const content = "Line1\nLine2\n\n\n\n";
    await fs.writeFile(filePath, content);

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe("Line1\nLine2\n");
  });

  it("should compute consistent content hash", () => {
    const content1 = "function foo() { return 1; }";
    const content2 = "function foo() { return 1; }";

    const hash1 = normalizer.computeContentHash(content1);
    const hash2 = normalizer.computeContentHash(content2);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex = 64 chars
  });

  it("should compute different hashes for different content", () => {
    const content1 = "function foo() { return 1; }";
    const content2 = "function bar() { return 2; }";

    const hash1 = normalizer.computeContentHash(content1);
    const hash2 = normalizer.computeContentHash(content2);

    expect(hash1).not.toBe(hash2);
  });

  it("should normalize complex file (BOM + CRLF + trailing whitespace)", async () => {
    const filePath = path.join(tempDir, "complex.txt");
    // UTF-8 BOM + content with CRLF + trailing spaces
    const buffer = Buffer.from([0xef, 0xbb, 0xbf]); // BOM
    const content = Buffer.from("Line1  \r\nLine2\t\r\n\r\n", "utf8");
    const combined = Buffer.concat([buffer, content]);
    await fs.writeFile(filePath, combined);

    const result = await normalizer.normalize(filePath);

    expect(result.content).toBe("Line1\nLine2\n");
    expect(result.hadBom).toBe(true);
  });
});

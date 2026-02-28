import { hashText } from "../../utils/fast-hash.js";
import { readBytes } from "../../utils/file-ops.js";

/**
 * Normalizes files before comparison: encoding, BOM, line endings.
 *
 * CRITICAL for correct Fast Path matching:
 * - Identical files must produce the same contentHash
 * - Differences in encoding/BOM/line endings must not create false negatives
 *
 * Based on ContentNormalizer from SharpToolsMCP.
 */
export class ContentNormalizer {
  /**
   * Normalize a file.
   *
   * @param filePath - Absolute path to file
   * @returns Normalized content with metadata
   */
  async normalize(filePath: string): Promise<NormalizedContent> {
    // 1. Read raw bytes using optimized file-ops
    const rawBytes = Buffer.from(await readBytes(filePath));

    // 2. Detect encoding and BOM
    const { encoding, hasBom } = this.detectEncoding(rawBytes);

    // 3. Decode to string
    let content = rawBytes.toString(encoding);

    // 4. Remove BOM if present (U+FEFF at start)
    if (hasBom && content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }

    // 5. Normalize line endings: CRLF/CR → LF
    content = this.normalizeLineEndings(content);

    // 6. Trim trailing whitespace on each line
    content = this.trimTrailingWhitespace(content);

    // 7. Remove trailing empty lines at end of file
    content = content.replace(/\n+$/, "\n");

    return {
      content,
      originalEncoding: encoding,
      hadBom: hasBom,
    };
  }

  /**
   * Compute SHA256 hash of content.
   *
   * Used for Fast Path Level 1 matching (exact content match).
   *
   * @param content - Normalized content string
   * @returns Hex-encoded SHA256 hash
   */
  computeContentHash(content: string): string {
    return hashText(content);
  }

  /**
   * Detect encoding via BOM detection.
   *
   * @param bytes - Raw file bytes
   * @returns Detected encoding and BOM presence
   */
  private detectEncoding(bytes: Buffer): { encoding: BufferEncoding; hasBom: boolean } {
    // UTF-8 BOM: EF BB BF
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { encoding: "utf8", hasBom: true };
    }

    // UTF-16 LE BOM: FF FE
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { encoding: "utf16le", hasBom: true };
    }

    // UTF-16 BE BOM: FE FF
    // Note: Node.js doesn't have utf16be, but we can detect it
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { encoding: "utf16le", hasBom: true };
    }

    // Default: UTF-8 no BOM (most common case)
    return { encoding: "utf8", hasBom: false };
  }

  /**
   * Normalize line endings (CRLF/CR → LF).
   *
   * @param content - Content with potentially mixed line endings
   * @returns Content with Unix-style LF line endings
   */
  private normalizeLineEndings(content: string): string {
    // CRLF → LF
    content = content.replace(/\r\n/g, "\n");
    // CR → LF (old Mac style)
    content = content.replace(/\r/g, "\n");
    return content;
  }

  /**
   * Remove trailing whitespace on each line.
   *
   * @param content - Content to trim
   * @returns Content with trimmed lines
   */
  private trimTrailingWhitespace(content: string): string {
    return content
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join("\n");
  }
}

/**
 * File normalization result.
 */
export interface NormalizedContent {
  content: string; // Normalized content (UTF-8, LF, no BOM)
  originalEncoding: string; // Original encoding (for reference)
  hadBom: boolean; // Whether original file had BOM
}

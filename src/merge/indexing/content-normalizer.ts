import { hashText } from "../../utils/fast-hash.js";
import { readBytes } from "../../utils/file-ops.js";

/**
 * Нормализует файлы перед сравнением: encoding, BOM, line endings.
 *
 * КРИТИЧНО для корректного Fast Path matching:
 * - Одинаковые файлы должны давать одинаковый contentHash
 * - Различия в encoding/BOM/line endings не должны создавать false negatives
 *
 * Основано на ContentNormalizer из SharpToolsMCP.
 */
export class ContentNormalizer {
  /**
   * Нормализовать файл.
   *
   * @param filePath - Absolute path to file
   * @returns Normalized content with metadata
   */
  async normalize(filePath: string): Promise<NormalizedContent> {
    // 1. Прочитать raw bytes using optimized file-ops
    const rawBytes = Buffer.from(await readBytes(filePath));

    // 2. Определить encoding и BOM
    const { encoding, hasBom } = this.detectEncoding(rawBytes);

    // 3. Декодировать в string
    let content = rawBytes.toString(encoding);

    // 4. Удалить BOM если есть (U+FEFF at start)
    if (hasBom && content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }

    // 5. Нормализовать line endings: CRLF/CR → LF
    content = this.normalizeLineEndings(content);

    // 6. Trim trailing whitespace на каждой строке
    content = this.trimTrailingWhitespace(content);

    // 7. Удалить trailing empty lines в конце файла
    content = content.replace(/\n+$/, "\n");

    return {
      content,
      originalEncoding: encoding,
      hadBom: hasBom,
    };
  }

  /**
   * Вычислить SHA256 hash контента.
   *
   * Используется для Fast Path Level 1 matching (exact content match).
   *
   * @param content - Normalized content string
   * @returns Hex-encoded SHA256 hash
   */
  computeContentHash(content: string): string {
    return hashText(content);
  }

  /**
   * Определить encoding через BOM detection.
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
   * Нормализовать line endings (CRLF/CR → LF).
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
   * Удалить trailing whitespace на каждой строке.
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
 * Результат нормализации файла.
 */
export interface NormalizedContent {
  content: string; // Normalized content (UTF-8, LF, no BOM)
  originalEncoding: string; // Original encoding (for reference)
  hadBom: boolean; // Whether original file had BOM
}

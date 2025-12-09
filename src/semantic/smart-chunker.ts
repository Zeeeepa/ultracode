/**
 * Smart Chunker for large code entities
 *
 * Splits code into semantic chunks based on:
 * - Empty lines (paragraph boundaries)
 * - Comment blocks (logical sections)
 * - Bracket boundaries (code blocks)
 *
 * Adapts to provider's maxTokens (512, 8192, etc.)
 */

export interface ChunkOptions {
  /** Max tokens per chunk (from provider) */
  maxTokens: number;
  /** Overlap tokens between chunks for context continuity */
  overlapTokens?: number;
  /** Include entity header in each chunk */
  includeHeader?: boolean;
}

export interface CodeChunk {
  /** Chunk ID: entityId#chunk_N */
  id: string;
  /** Chunk content */
  content: string;
  /** Chunk index (0-based) */
  index: number;
  /** Total chunks for this entity */
  totalChunks: number;
  /** Parent entity ID */
  entityId: string;
  /** Approximate token count */
  tokenCount: number;
  /** Start line in original code */
  startLine: number;
  /** End line in original code */
  endLine: number;
}

/** Default overlap as percentage of maxTokens */
const DEFAULT_OVERLAP_PERCENT = 0.1; // 10%

// Pre-compiled character sets for O(1) lookup
const SYMBOL_CHARS = new Set([
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  ";",
  ",",
  ".",
  ":",
  "=",
  "<",
  ">",
  "!",
  "&",
  "|",
  "+",
  "-",
  "*",
  "/",
]);
const WHITESPACE_CHARS = new Set([" ", "\t", "\n", "\r"]);
const STRING_CHARS = new Set(['"', "'", "`"]);

/**
 * Estimate token count for text - optimized single pass
 * More accurate than char count for code
 */
export function estimateTokens(text: string): number {
  let words = 0;
  let symbols = 0;
  let strings = 0;
  let inWord = false;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      // Inside string - look for closing quote
      if (ch === stringChar && text[i - 1] !== "\\") {
        inString = false;
        stringChar = "";
      }
    } else if (STRING_CHARS.has(ch)) {
      // Start of string
      inString = true;
      stringChar = ch;
      strings++;
      if (inWord) {
        words++;
        inWord = false;
      }
    } else if (WHITESPACE_CHARS.has(ch)) {
      if (inWord) {
        words++;
        inWord = false;
      }
    } else if (SYMBOL_CHARS.has(ch)) {
      symbols++;
      if (inWord) {
        words++;
        inWord = false;
      }
    } else {
      inWord = true;
    }
  }

  // Count last word if any
  if (inWord) words++;

  // Each word ~1.3 tokens, each symbol ~1 token, strings variable
  return Math.ceil(words * 1.3 + symbols * 0.8 + strings * 2);
}

/**
 * Find logical split points in code
 * Returns line numbers where splits are preferred
 */
function findSplitPoints(lines: string[]): number[] {
  const splitPoints: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    const prevLine = i > 0 ? (lines[i - 1] ?? "").trim() : "";

    // Empty line after non-empty = paragraph boundary
    if (line === "" && prevLine !== "") {
      splitPoints.push(i);
      continue;
    }

    // Comment start = section boundary
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*") || line.startsWith("#")) {
      if (!prevLine.startsWith("//") && !prevLine.startsWith("*") && !prevLine.startsWith("#")) {
        splitPoints.push(i);
        continue;
      }
    }

    // Closing brace at start of line = block end
    // BUT not if the same line opens a new block (e.g., "} catch (error) {", "} else {")
    if (line.startsWith("}") || line.startsWith("]") || line.startsWith(")")) {
      if (!line.endsWith("{")) {
        splitPoints.push(i + 1); // Split after closing brace only if not opening new block
      }
    }
  }

  return [...new Set(splitPoints)].sort((a, b) => a - b);
}

/**
 * Smart chunk code based on logical boundaries
 */
export function chunkCode(entityId: string, code: string, header: string, options: ChunkOptions): CodeChunk[] {
  const { maxTokens, overlapTokens, includeHeader = true } = options;
  const overlap = overlapTokens ?? Math.floor(maxTokens * DEFAULT_OVERLAP_PERCENT);

  // Estimate total tokens
  const totalTokens = estimateTokens(code);
  const headerTokens = includeHeader ? estimateTokens(header) : 0;
  const availableTokens = maxTokens - headerTokens - 20; // Safety margin

  // If fits in one chunk, return as-is
  if (totalTokens <= availableTokens) {
    const content = includeHeader ? `${header}\n${code}` : code;
    return [
      {
        id: entityId,
        content,
        index: 0,
        totalChunks: 1,
        entityId,
        tokenCount: totalTokens + headerTokens,
        startLine: 0,
        endLine: code.split("\n").length - 1,
      },
    ];
  }

  // Need to split
  const lines = code.split("\n");
  const splitPoints = findSplitPoints(lines);
  const chunks: CodeChunk[] = [];

  let currentStart = 0;
  let chunkIndex = 0;

  while (currentStart < lines.length) {
    // Find best end point for this chunk
    let bestEnd = currentStart;
    let currentTokens = 0;

    // Accumulate lines until we hit token limit
    for (let i = currentStart; i < lines.length; i++) {
      const lineTokens = estimateTokens(lines[i] ?? "");
      if (currentTokens + lineTokens > availableTokens && i > currentStart) {
        break;
      }
      currentTokens += lineTokens;
      bestEnd = i;
    }

    // Try to align to a split point (find the one closest to bestEnd, not the first one)
    const candidateSplits = splitPoints.filter((sp) => sp > currentStart && sp <= bestEnd + 5);
    const nearestSplit = candidateSplits.length > 0 ? candidateSplits[candidateSplits.length - 1] : undefined;
    if (nearestSplit && nearestSplit > currentStart + 5) {
      // Only use split point if it doesn't make chunk too small
      bestEnd = nearestSplit - 1;
    }

    // Ensure minimum chunk size
    if (bestEnd - currentStart < 3 && bestEnd < lines.length - 1) {
      bestEnd = Math.min(currentStart + 10, lines.length - 1);
    }

    // Build chunk content
    const chunkLines = lines.slice(currentStart, bestEnd + 1);
    const chunkCode = chunkLines.join("\n");
    const content = includeHeader ? `${header}\n// ... chunk ${chunkIndex + 1}\n${chunkCode}` : chunkCode;

    chunks.push({
      id: `${entityId}#chunk_${chunkIndex}`,
      content,
      index: chunkIndex,
      totalChunks: -1, // Will be updated
      entityId,
      tokenCount: estimateTokens(content),
      startLine: currentStart,
      endLine: bestEnd,
    });

    // Move to next chunk with overlap
    // If we've reached the end or remaining content is small, stop
    if (bestEnd >= lines.length - 1) {
      break;
    }

    const remainingLines = lines.length - bestEnd - 1;
    const overlapLines = Math.max(1, Math.floor((overlap / availableTokens) * (bestEnd - currentStart)));

    // If remaining content is less than overlap, include it in current chunk and stop
    if (remainingLines <= overlapLines) {
      break;
    }

    currentStart = bestEnd + 1 - overlapLines;
    chunkIndex++;

    // Safety: prevent infinite loop
    if (chunkIndex > 500) break;
  }

  // Update totalChunks
  const totalChunks = chunks.length;
  chunks.forEach((chunk) => {
    chunk.totalChunks = totalChunks;
  });

  return chunks;
}

/**
 * Check if entity needs chunking based on provider's maxTokens
 */
export function needsChunking(code: string, maxTokens: number): boolean {
  return estimateTokens(code) > maxTokens * 0.9; // 90% threshold
}

/**
 * Get recommended chunk settings for different use cases
 */
export function getChunkSettings(maxTokens: number): ChunkOptions {
  if (maxTokens >= 8192) {
    // Large context - minimal chunking
    return {
      maxTokens,
      overlapTokens: 200,
      includeHeader: true,
    };
  } else if (maxTokens >= 2048) {
    // Medium context
    return {
      maxTokens,
      overlapTokens: 100,
      includeHeader: true,
    };
  } else {
    // Small context (512)
    return {
      maxTokens,
      overlapTokens: 50,
      includeHeader: true,
    };
  }
}

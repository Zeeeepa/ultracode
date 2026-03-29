/**
 * Code Classifier — ported from ultracode.zig/src/parsers/simd_scan.zig
 *
 * Classifies each byte in source code as "live code" vs "string/comment".
 * Produces a packed bitmap where bit=1 means the byte is executable code
 * (not inside a string literal or comment).
 *
 * The Zig version uses AVX2 SIMD to find structural character positions,
 * then processes them sequentially (state machine is inherently serial).
 * This TS port uses the same sequential state machine — the SIMD part
 * only accelerated position-finding which we do scalar here.
 *
 * Uses: trigram quality filtering, keyword triage, brace depth analysis.
 */

// 32-byte chunk size — matches Zig's VEC_LEN for API/bitmap compatibility.
// Keeping this even without SIMD: each u32 in the bitmap covers 32 source bytes.
const CHUNK_LEN = 32;

// Char codes for hot-path comparisons
const CH_DQUOTE = 0x22; // "
const CH_SQUOTE = 0x27; // '
const CH_BACKTICK = 0x60; // `
const CH_SLASH = 0x2f; // /
const CH_STAR = 0x2a; // *
const CH_HASH = 0x23; // #
const CH_NEWLINE = 0x0a; // \n
const CH_BACKSLASH = 0x5c; // \

/**
 * Stateful classifier that tracks string/comment context across chunks.
 * Call classifyChunk() sequentially for each 32-byte chunk of a file.
 */
export class CodeClassifier {
  inString = false;
  stringChar = 0;
  inLineComment = false;
  inBlockComment = false;

  /**
   * Classify a 32-byte chunk, returning a u32 bitmask where bit=1 means "live code".
   * State carries between calls — process chunks in order.
   *
   * @param source - Full source buffer
   * @param offset - Byte offset of this chunk within source
   * @param hashComments - true for Python/Bash (# starts line comment)
   * @returns u32 bitmask (bit i set → source[offset+i] is live code)
   */
  classifyChunk(source: Uint8Array, offset: number, hashComments: boolean): number {
    const end = Math.min(offset + CHUNK_LEN, source.length);
    const chunkLen = end - offset;
    if (chunkLen === 0) return 0;

    // Fast path: scan for any structural char in this chunk.
    // If none found and we're in a consistent state, skip per-byte logic.
    let hasStructural = false;
    for (let k = offset; k < end; k++) {
      const c = source[k]!;
      if (
        c === CH_DQUOTE ||
        c === CH_SQUOTE ||
        c === CH_BACKTICK ||
        c === CH_SLASH ||
        c === CH_STAR ||
        c === CH_HASH ||
        c === CH_NEWLINE ||
        c === CH_BACKSLASH
      ) {
        hasStructural = true;
        break;
      }
    }

    if (!hasStructural) {
      if (this.inString || this.inLineComment || this.inBlockComment) {
        return 0; // entire chunk is non-code
      }
      // All code — set bits 0..chunkLen-1
      return chunkLen >= 32 ? 0xffffffff : (1 << chunkLen) - 1;
    }

    // Sequential state machine (identical logic to Zig's classifyScalar)
    let codeMask = 0;

    for (let i = 0; i < chunkLen; i++) {
      const absI = offset + i;
      const ch = source[absI]!;
      const bit = 1 << i;

      if (this.inString) {
        if (ch === this.stringChar && (absI === 0 || source[absI - 1] !== CH_BACKSLASH)) {
          this.inString = false;
        }
        continue;
      }
      if (this.inLineComment) {
        if (ch === CH_NEWLINE) {
          this.inLineComment = false;
          codeMask |= bit; // newline itself is code
        }
        continue;
      }
      if (this.inBlockComment) {
        if (ch === CH_SLASH && absI > 0 && source[absI - 1] === CH_STAR) {
          this.inBlockComment = false;
        }
        continue;
      }

      // Live code byte
      codeMask |= bit;

      // State transitions
      if (ch === CH_DQUOTE || ch === CH_SQUOTE || ch === CH_BACKTICK) {
        this.inString = true;
        this.stringChar = ch;
        codeMask &= ~bit; // quote char is not "code"
      } else if (ch === CH_SLASH && absI + 1 < source.length) {
        const next = source[absI + 1]!;
        if (next === CH_SLASH) {
          this.inLineComment = true;
          codeMask &= ~bit;
        } else if (next === CH_STAR) {
          this.inBlockComment = true;
          codeMask &= ~bit;
        }
      } else if (ch === CH_HASH && hashComments) {
        this.inLineComment = true;
        codeMask &= ~bit;
      }
    }

    return codeMask;
  }

  /** Reset state for a new file */
  reset(): void {
    this.inString = false;
    this.stringChar = 0;
    this.inLineComment = false;
    this.inBlockComment = false;
  }
}

/**
 * Build a packed bitmap where bit=1 means "live code" (not in string or comment).
 * Stored as Uint32Array — each u32 covers 32 source bytes.
 * Total size: ceil(source.length / 32) entries.
 *
 * @param source - File content as bytes
 * @param hashComments - true for Python/Bash
 * @returns Packed code bitmap
 */
export function buildCodeBitmap(source: Uint8Array, hashComments: boolean): Uint32Array {
  const numChunks = Math.ceil(source.length / CHUNK_LEN);
  if (numChunks === 0) return new Uint32Array(0);

  const bitmap = new Uint32Array(numChunks);
  const cc = new CodeClassifier();

  for (let i = 0; i < numChunks; i++) {
    bitmap[i] = cc.classifyChunk(source, i * CHUNK_LEN, hashComments);
  }

  return bitmap;
}

/**
 * Check if a byte at `pos` is live code using a pre-built bitmap.
 */
export function isCodeByte(bitmap: Uint32Array, pos: number): boolean {
  const chunkIdx = (pos / CHUNK_LEN) | 0;
  const bitIdx = pos % CHUNK_LEN;
  if (chunkIdx >= bitmap.length) return false;
  return (bitmap[chunkIdx]! & (1 << bitIdx)) !== 0;
}

/**
 * Count newlines in a byte buffer.
 * Uses loop unrolling for V8 JIT optimization (~2x vs naive).
 */
export function countNewlines(source: Uint8Array): number {
  const len = source.length;
  let total = 0;

  // Unrolled loop: 8 bytes at a time
  const len8 = len - (len % 8);
  for (let i = 0; i < len8; i += 8) {
    total +=
      (source[i]! === CH_NEWLINE ? 1 : 0) +
      (source[i + 1]! === CH_NEWLINE ? 1 : 0) +
      (source[i + 2]! === CH_NEWLINE ? 1 : 0) +
      (source[i + 3]! === CH_NEWLINE ? 1 : 0) +
      (source[i + 4]! === CH_NEWLINE ? 1 : 0) +
      (source[i + 5]! === CH_NEWLINE ? 1 : 0) +
      (source[i + 6]! === CH_NEWLINE ? 1 : 0) +
      (source[i + 7]! === CH_NEWLINE ? 1 : 0);
  }

  // Scalar tail
  for (let i = len8; i < len; i++) {
    if (source[i] === CH_NEWLINE) total++;
  }

  return total;
}

/**
 * Check if a character is a word boundary (for keyword detection).
 * Matches Zig's isWordBoundary exactly.
 */
export function isWordBoundary(ch: number): boolean {
  return (
    ch === 0 ||
    ch === 0x20 || // space
    ch === 0x0a || // \n
    ch === 0x0d || // \r
    ch === 0x09 || // \t
    ch === 0x7b || // {
    ch === 0x7d || // }
    ch === 0x28 || // (
    ch === 0x29 || // )
    ch === 0x3b || // ;
    ch === 0x2c || // ,
    ch === 0x3a || // :
    ch === 0x40 || // @
    ch === 0x3c || // <
    ch === 0x3e // >
  );
}

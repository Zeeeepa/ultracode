/**
 * Trigram Index Types — ported from ultracode.zig/src/search/trigram_types.zig
 *
 * Binary format for trigrams.idx:
 *   [Header 32B] [FileTable] [StringTable] [TrigramTable] [PostingsSection]
 *
 * All multi-byte values are little-endian (matching SQLite and Zig native).
 * Sizes are fixed: Header=32B, FileEntry=16B, TrigramTableEntry=24B.
 */

// =============================================================================
// Constants
// =============================================================================

export const MAGIC = new Uint8Array([0x54, 0x47, 0x49, 0x01]); // "TGI\x01"
export const VERSION = 1;

export const HEADER_SIZE = 32;
export const FILE_ENTRY_SIZE = 16;
export const TRIGRAM_ENTRY_SIZE = 24;

// =============================================================================
// Binary Structures
// =============================================================================

export interface Header {
  magic: Uint8Array; // 4 bytes
  version: number;   // u32
  fileCount: number;
  trigramCount: number;
  fileTableOffset: number;
  stringTableOffset: number;
  trigramTableOffset: number;
  postingsOffset: number;
}

export interface FileEntry {
  pathOffset: number;  // u32: offset into StringTable
  pathLen: number;     // u16
  contentHash: bigint; // u64: FNV-1a of file content
}

export interface TrigramTableEntry {
  nextMask: bigint;     // u64: bloom for next-char
  trigram: number;      // u32: lower 24 bits
  postingOffset: number; // u32: byte offset into PostingsSection
  postingCount: number;  // u32
  locMask: number;       // u8: bloom for position
}

// =============================================================================
// Per-file extraction output
// =============================================================================

export interface PackedTrigram {
  trigram: number;  // u32, lower 24 bits
  nextMask: bigint; // u64
  locMask: number;  // u8
}

export interface FileTrigramData {
  entries: PackedTrigram[];
}

// =============================================================================
// Query types
// =============================================================================

export interface SearchOptions {
  maxResults?: number;
  contextLines?: number;
  filePattern?: string;
  caseInsensitive?: boolean;
}

export interface SearchMatch {
  filePath: string;
  lineNumber: number;
  column: number;
  lineContent: string;
  contextBefore: string[];
  contextAfter: string[];
}

// =============================================================================
// Helpers
// =============================================================================

/** Pack 3 bytes into a u32 trigram value (lower 24 bits) */
export function packTrigram(b0: number, b1: number, b2: number): number {
  return ((b0 & 0xFF) << 16) | ((b1 & 0xFF) << 8) | (b2 & 0xFF);
}

/** Unpack a u32 trigram value to 3 bytes */
export function unpackTrigram(tri: number): [number, number, number] {
  return [(tri >>> 16) & 0xFF, (tri >>> 8) & 0xFF, tri & 0xFF];
}

/** Convert trigram to readable string */
export function trigramToString(tri: number): string {
  const [a, b, c] = unpackTrigram(tri);
  return String.fromCharCode(a, b, c);
}

// =============================================================================
// Header serialization
// =============================================================================

export function writeHeader(buf: DataView, h: Header): void {
  buf.setUint8(0, MAGIC[0]!); buf.setUint8(1, MAGIC[1]!);
  buf.setUint8(2, MAGIC[2]!); buf.setUint8(3, MAGIC[3]!);
  buf.setUint32(4, h.version, true);
  buf.setUint32(8, h.fileCount, true);
  buf.setUint32(12, h.trigramCount, true);
  buf.setUint32(16, h.fileTableOffset, true);
  buf.setUint32(20, h.stringTableOffset, true);
  buf.setUint32(24, h.trigramTableOffset, true);
  buf.setUint32(28, h.postingsOffset, true);
}

export function readHeader(buf: DataView): Header | null {
  if (buf.byteLength < HEADER_SIZE) return null;
  const magic = new Uint8Array(buf.buffer, buf.byteOffset, 4);
  if (magic[0] !== MAGIC[0] || magic[1] !== MAGIC[1] || magic[2] !== MAGIC[2] || magic[3] !== MAGIC[3]) return null;
  const version = buf.getUint32(4, true);
  if (version !== VERSION) return null;
  return {
    magic,
    version,
    fileCount: buf.getUint32(8, true),
    trigramCount: buf.getUint32(12, true),
    fileTableOffset: buf.getUint32(16, true),
    stringTableOffset: buf.getUint32(20, true),
    trigramTableOffset: buf.getUint32(24, true),
    postingsOffset: buf.getUint32(28, true),
  };
}

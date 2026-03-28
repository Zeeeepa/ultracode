/**
 * Trigram Index — Builder, Reader, and Query Engine
 * Ported from ultracode.zig: trigram_builder.zig + trigram_index.zig + trigram_query.zig
 *
 * Builder: accumulates files with their trigrams, serializes to binary format.
 * Reader: memory-maps (or loads) the binary index, provides O(log n) trigram lookup.
 * Query: decomposes search pattern into trigrams, intersects posting lists, verifies matches.
 *
 * Binary format: [Header 32B] [FileTable] [StringTable] [TrigramTable] [PostingsSection]
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  FILE_ENTRY_SIZE,
  HEADER_SIZE,
  type Header,
  type SearchMatch,
  type SearchOptions,
  TRIGRAM_ENTRY_SIZE,
  type TrigramTableEntry,
  readHeader,
  writeHeader,
} from "./trigram-types.js";
import { decomposePattern } from "./trigram-extract.js";
import type { FileTrigramData } from "./trigram-types.js";
import { decodeDelta, encodeDelta, maxEncodedSize } from "./varint.js";

// =============================================================================
// Builder
// =============================================================================

interface BuilderFile {
  path: string;
  contentHash: bigint;
  trigrams: FileTrigramData;
}

export class TrigramBuilder {
  private files: BuilderFile[] = [];
  private fileIdMap = new Map<string, number>();

  /** Add a file with its pre-extracted trigrams */
  addFile(path: string, contentHash: bigint, trigrams: FileTrigramData): void {
    if (this.fileIdMap.has(path)) return; // dedup
    const fileId = this.files.length;
    this.fileIdMap.set(path, fileId);
    this.files.push({ path, contentHash, trigrams });
  }

  /** Serialize the index to a binary buffer and write to disk */
  build(outputPath: string): void {
    // Collect all unique trigrams across files → posting lists
    const trigramPostings = new Map<number, number[]>(); // trigram → sorted file IDs
    const trigramMasks = new Map<number, { nextMask: bigint; locMask: number }>();

    for (let fileId = 0; fileId < this.files.length; fileId++) {
      for (const entry of this.files[fileId]!.trigrams.entries) {
        let posting = trigramPostings.get(entry.trigram);
        if (!posting) {
          posting = [];
          trigramPostings.set(entry.trigram, posting);
          trigramMasks.set(entry.trigram, { nextMask: 0n, locMask: 0 });
        }
        posting.push(fileId);
        const masks = trigramMasks.get(entry.trigram)!;
        masks.nextMask |= entry.nextMask;
        masks.locMask |= entry.locMask;
      }
    }

    // Sort trigrams for binary search
    const sortedTrigrams = [...trigramPostings.keys()].sort((a, b) => a - b);

    // Build string table (concatenated file paths)
    const encoder = new TextEncoder();
    const pathBuffers: Uint8Array[] = [];
    const pathOffsets: number[] = [];
    let stringTableSize = 0;
    for (const file of this.files) {
      pathOffsets.push(stringTableSize);
      const encoded = encoder.encode(file.path);
      pathBuffers.push(encoded);
      stringTableSize += encoded.length;
    }

    // Encode posting lists
    const postingBuffers: Uint8Array[] = [];
    const postingOffsets: number[] = [];
    let postingsTotalSize = 0;
    for (const tri of sortedTrigrams) {
      const ids = trigramPostings.get(tri)!;
      postingOffsets.push(postingsTotalSize);
      const buf = new Uint8Array(maxEncodedSize(ids.length));
      const written = encodeDelta(ids, buf);
      postingBuffers.push(buf.subarray(0, written));
      postingsTotalSize += written;
    }

    // Calculate section offsets
    const fileTableOffset = HEADER_SIZE;
    const fileTableSize = this.files.length * FILE_ENTRY_SIZE;
    const stringTableOffset = fileTableOffset + fileTableSize;
    const trigramTableOffset = stringTableOffset + stringTableSize;
    const trigramTableSize = sortedTrigrams.length * TRIGRAM_ENTRY_SIZE;
    const postingsOffset = trigramTableOffset + trigramTableSize;
    const totalSize = postingsOffset + postingsTotalSize;

    // Allocate output buffer
    const output = new ArrayBuffer(totalSize);
    const view = new DataView(output);
    const bytes = new Uint8Array(output);

    // Write header
    const header: Header = {
      magic: new Uint8Array([0x54, 0x47, 0x49, 0x01]),
      version: 1,
      fileCount: this.files.length,
      trigramCount: sortedTrigrams.length,
      fileTableOffset,
      stringTableOffset,
      trigramTableOffset,
      postingsOffset,
    };
    writeHeader(view, header);

    // Write file table
    for (let i = 0; i < this.files.length; i++) {
      const off = fileTableOffset + i * FILE_ENTRY_SIZE;
      view.setUint32(off, pathOffsets[i]!, true);
      view.setUint16(off + 4, pathBuffers[i]!.length, true);
      view.setUint16(off + 6, 0, true); // pad
      view.setBigUint64(off + 8, this.files[i]!.contentHash, true);
    }

    // Write string table
    let strPos = stringTableOffset;
    for (const buf of pathBuffers) {
      bytes.set(buf, strPos);
      strPos += buf.length;
    }

    // Write trigram table
    for (let i = 0; i < sortedTrigrams.length; i++) {
      const off = trigramTableOffset + i * TRIGRAM_ENTRY_SIZE;
      const tri = sortedTrigrams[i]!;
      const masks = trigramMasks.get(tri)!;
      const ids = trigramPostings.get(tri)!;

      view.setBigUint64(off, masks.nextMask, true);
      view.setUint32(off + 8, tri, true);
      view.setUint32(off + 12, postingOffsets[i]!, true);
      view.setUint32(off + 16, ids.length, true);
      view.setUint8(off + 20, masks.locMask);
      // 3 bytes padding (already 0)
    }

    // Write postings section
    let postPos = postingsOffset;
    for (const buf of postingBuffers) {
      bytes.set(buf, postPos);
      postPos += buf.length;
    }

    writeFileSync(outputPath, Buffer.from(output));
  }

  /** Reset builder for next index build */
  clear(): void {
    this.files = [];
    this.fileIdMap.clear();
  }
}

// =============================================================================
// Index Reader
// =============================================================================

export class TrigramIndex {
  private buf: Buffer;
  private view: DataView;
  private header: Header;

  private constructor(buf: Buffer, header: Header) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.header = header;
  }

  /** Open a trigram index file */
  static open(path: string): TrigramIndex | null {
    try {
      const buf = readFileSync(path);
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const header = readHeader(view);
      if (!header) return null;
      return new TrigramIndex(buf, header);
    } catch {
      return null;
    }
  }

  /** Get file count */
  get fileCount(): number { return this.header.fileCount; }
  /** Get trigram count */
  get trigramCount(): number { return this.header.trigramCount; }

  /** Get file path by file ID */
  getFilePath(fileId: number): string {
    const off = this.header.fileTableOffset + fileId * FILE_ENTRY_SIZE;
    const pathOffset = this.view.getUint32(off, true);
    const pathLen = this.view.getUint16(off + 4, true);
    const start = this.header.stringTableOffset + pathOffset;
    return Buffer.from(this.buf.subarray(start, start + pathLen)).toString("utf-8");
  }

  /** Binary search for a trigram in the sorted trigram table. Returns entry or null. */
  lookupTrigram(tri: number): TrigramTableEntry | null {
    let lo = 0;
    let hi = this.header.trigramCount - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const off = this.header.trigramTableOffset + mid * TRIGRAM_ENTRY_SIZE;
      const midTri = this.view.getUint32(off + 8, true);

      if (midTri === tri) {
        return {
          nextMask: this.view.getBigUint64(off, true),
          trigram: midTri,
          postingOffset: this.view.getUint32(off + 12, true),
          postingCount: this.view.getUint32(off + 16, true),
          locMask: this.view.getUint8(off + 20),
        };
      }
      if (midTri < tri) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }

  /** Read posting list (file IDs) for a trigram entry */
  readPostingList(entry: TrigramTableEntry): number[] {
    const start = this.header.postingsOffset + entry.postingOffset;
    const buf = new Uint8Array(this.buf.buffer, this.buf.byteOffset + start);
    return decodeDelta(buf, 0, entry.postingCount);
  }

  /**
   * Execute a search query: decompose pattern → intersect postings → verify matches.
   */
  executeSearch(
    projectPath: string,
    pattern: string,
    options: SearchOptions = {},
  ): SearchMatch[] {
    const maxResults = options.maxResults ?? 100;
    const contextLines = options.contextLines ?? 2;

    // Step 1: Decompose pattern into trigrams
    const queryTrigrams = decomposePattern(
      options.caseInsensitive ? pattern.toLowerCase() : pattern,
    );
    if (queryTrigrams.length === 0) return [];

    // Step 2: Look up each trigram, get posting lists
    const postingLists: number[][] = [];
    for (const tri of queryTrigrams) {
      const entry = this.lookupTrigram(tri);
      if (!entry) return []; // Trigram not in index → no results
      postingLists.push(this.readPostingList(entry));
    }

    // Step 3: Intersect posting lists (all trigrams must be present in file)
    let candidates = postingLists[0]!;
    for (let i = 1; i < postingLists.length; i++) {
      candidates = intersectSorted(candidates, postingLists[i]!);
      if (candidates.length === 0) return [];
    }

    // Step 4: Verify matches by reading actual files
    const matches: SearchMatch[] = [];
    const { join } = require("node:path") as typeof import("node:path");
    const { readFileSync: readFs } = require("node:fs") as typeof import("node:fs");

    for (const fileId of candidates) {
      if (matches.length >= maxResults) break;

      const filePath = this.getFilePath(fileId);
      const fullPath = join(projectPath, filePath);

      try {
        const content = readFs(fullPath, "utf-8");
        const searchContent = options.caseInsensitive ? content.toLowerCase() : content;
        const searchPattern = options.caseInsensitive ? pattern.toLowerCase() : pattern;

        let pos = 0;
        while (pos < searchContent.length && matches.length < maxResults) {
          const idx = searchContent.indexOf(searchPattern, pos);
          if (idx === -1) break;

          // Find line number and column
          const lines = content.slice(0, idx).split("\n");
          const lineNumber = lines.length;
          const column = (lines[lines.length - 1]?.length ?? 0) + 1;

          // Get the full line
          const allLines = content.split("\n");
          const lineIdx = lineNumber - 1;
          const lineContent = allLines[lineIdx] ?? "";

          // Context lines
          const ctxBefore: string[] = [];
          const ctxAfter: string[] = [];
          for (let c = Math.max(0, lineIdx - contextLines); c < lineIdx; c++) {
            ctxBefore.push(allLines[c] ?? "");
          }
          for (let c = lineIdx + 1; c <= Math.min(allLines.length - 1, lineIdx + contextLines); c++) {
            ctxAfter.push(allLines[c] ?? "");
          }

          matches.push({
            filePath,
            lineNumber,
            column,
            lineContent,
            contextBefore: ctxBefore,
            contextAfter: ctxAfter,
          });

          pos = idx + 1;
        }
      } catch {
        // File not readable — skip
      }
    }

    return matches;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Intersect two sorted arrays of numbers */
function intersectSorted(a: number[], b: number[]): number[] {
  const result: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i]! === b[j]!) {
      result.push(a[i]!);
      i++; j++;
    } else if (a[i]! < b[j]!) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}

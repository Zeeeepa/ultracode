/**
 * Code Classifier + Keyword Triage Test Suite
 *
 * Tests ported from ultracode.zig/src/parsers/simd_scan.zig tests
 * plus additional coverage for keyword-triage.ts.
 */

import { describe, expect, test } from "bun:test";
import {
  buildCodeBitmap,
  CodeClassifier,
  countNewlines,
  isCodeByte,
  isWordBoundary,
} from "../../src/search/code-classifier.js";
import { scanForKeywords } from "../../src/search/keyword-triage.js";
import { extractTrigrams, extractTrigramsFiltered } from "../../src/search/trigram-extract.js";

const enc = new TextEncoder();

// =============================================================================
// CODE CLASSIFIER TESTS (ported from simd_scan.zig)
// =============================================================================

describe("CodeClassifier", () => {
  test("skips strings", () => {
    // Zig test: "CodeClassifier skips strings"
    const cc = new CodeClassifier();
    const src = enc.encode('abc"def"ghi_____rest_of_data____');
    const mask = cc.classifyChunk(src, 0, false);

    // positions 0,1,2 = code (abc)
    expect(mask & 0b111).toBe(0b111);
    // position 3 = " (not code)
    expect(mask & (1 << 3)).toBe(0);
    // positions 4,5,6 = string content (not code)
    expect(mask & (1 << 4)).toBe(0);
    expect(mask & (1 << 5)).toBe(0);
    expect(mask & (1 << 6)).toBe(0);
    // position 7 = closing " (not code)
    expect(mask & (1 << 7)).toBe(0);
    // position 8 = g (code again)
    expect(mask & (1 << 8)).not.toBe(0);
  });

  test("skips line comments", () => {
    // Zig test: "CodeClassifier skips line comments"
    const cc = new CodeClassifier();
    const src = enc.encode("ab//comment here and more pad\nxy");
    const mask = cc.classifyChunk(src, 0, false);

    // 0,1 = code (ab)
    expect(mask & 0b11).toBe(0b11);
    // position 2 = first / (not code — start of comment)
    expect(mask & (1 << 2)).toBe(0);
    // position 10 = middle of comment
    expect(mask & (1 << 10)).toBe(0);
    // position 29 = \n (code — newline ends comment)
    expect(mask & (1 << 29)).not.toBe(0);
    // position 30 = x (code)
    expect(mask & (1 << 30)).not.toBe(0);
  });

  test("skips block comments", () => {
    const cc = new CodeClassifier();
    const src = enc.encode("ab/*comment*/cd_________________");
    const mask = cc.classifyChunk(src, 0, false);

    // ab = code
    expect(mask & 0b11).toBe(0b11);
    // / at pos 2 = not code (start of block comment)
    expect(mask & (1 << 2)).toBe(0);
    // middle of block comment
    expect(mask & (1 << 5)).toBe(0);
    // */ closing: * at pos 11, / at pos 12 — / ends the comment, not code
    expect(mask & (1 << 12)).toBe(0);
    // cd at pos 13,14 = code
    expect(mask & (1 << 13)).not.toBe(0);
    expect(mask & (1 << 14)).not.toBe(0);
  });

  test("hash comments in Python", () => {
    // Zig test: "CodeClassifier hash comments in Python"
    const cc = new CodeClassifier();
    const src = enc.encode("ab# comment here and more pad__\n");
    const mask = cc.classifyChunk(src, 0, true);

    // ab = code
    expect(mask & 0b11).toBe(0b11);
    // # at pos 2 = not code
    expect(mask & (1 << 2)).toBe(0);
    // middle of comment
    expect(mask & (1 << 10)).toBe(0);
  });

  test("hash NOT treated as comment for non-Python", () => {
    const cc = new CodeClassifier();
    const src = enc.encode("a#b_____________________________");
    const mask = cc.classifyChunk(src, 0, false);

    // All positions should be code (# is not a comment in JS/Go/etc.)
    expect(mask & (1 << 0)).not.toBe(0); // a
    expect(mask & (1 << 1)).not.toBe(0); // #
    expect(mask & (1 << 2)).not.toBe(0); // b
  });

  test("state carries across chunks", () => {
    const cc = new CodeClassifier();
    // First chunk: start of string that doesn't close in 32 bytes
    const chunk1 = enc.encode('"this is a long string that span');
    const chunk2 = enc.encode('s multiple chunks"___rest_code__');

    const mask1 = cc.classifyChunk(chunk1, 0, false);
    // First byte " opens string → not code, rest is string
    expect(mask1 & (1 << 0)).toBe(0); // " = not code
    expect(mask1 & (1 << 5)).toBe(0); // middle of string

    const mask2 = cc.classifyChunk(chunk2, 0, false);
    // After closing " at pos 17, rest should be code
    expect(mask2 & (1 << 0)).toBe(0); // still in string
    expect(mask2 & (1 << 17)).toBe(0); // closing " = not code
    expect(mask2 & (1 << 18)).not.toBe(0); // _ after string = code
  });

  test("escaped quotes don't end string", () => {
    const cc = new CodeClassifier();
    const src = enc.encode('"hello \\"world\\" end"___________');
    const mask = cc.classifyChunk(src, 0, false);

    // Position 0 = opening " (not code)
    expect(mask & (1 << 0)).toBe(0);
    // After the escaped quotes, we should still be in string until final "
    // The final " is at position 20
    expect(mask & (1 << 20)).toBe(0); // closing "
    expect(mask & (1 << 21)).not.toBe(0); // code after string
  });

  test("fast path: no structural chars → all code", () => {
    const cc = new CodeClassifier();
    const src = enc.encode("abcdefghijklmnopqrstuvwxyz123456");
    const mask = cc.classifyChunk(src, 0, false);

    // All 32 bits should be set (all code)
    expect(mask).toBe(0xffffffff);
  });

  test("fast path: no structural chars in non-code state → all non-code", () => {
    const cc = new CodeClassifier();
    // Open a string in first chunk
    cc.inString = true;
    cc.stringChar = 0x22; // "

    const src = enc.encode("abcdefghijklmnopqrstuvwxyz123456");
    const mask = cc.classifyChunk(src, 0, false);

    // All bits should be 0 (all non-code — inside string, no closing quote)
    expect(mask).toBe(0);
  });
});

// =============================================================================
// buildCodeBitmap + isCodeByte
// =============================================================================

describe("buildCodeBitmap", () => {
  test("marks code and non-code regions", () => {
    const src = enc.encode('let x = "hello"; // done');
    const bitmap = buildCodeBitmap(src, false);

    // 'l' at pos 0 = code
    expect(isCodeByte(bitmap, 0)).toBe(true);
    // '"' at pos 8 = not code (string start)
    expect(isCodeByte(bitmap, 8)).toBe(false);
    // 'h' at pos 9 = not code (inside string)
    expect(isCodeByte(bitmap, 9)).toBe(false);
    // '"' at pos 14 = not code (string end)
    expect(isCodeByte(bitmap, 14)).toBe(false);
    // ';' at pos 15 = code
    expect(isCodeByte(bitmap, 15)).toBe(true);
    // '/' at pos 17 = not code (comment start)
    expect(isCodeByte(bitmap, 17)).toBe(false);
  });

  test("empty source", () => {
    const bitmap = buildCodeBitmap(new Uint8Array(0), false);
    expect(bitmap.length).toBe(0);
  });

  test("out-of-bounds returns false", () => {
    const bitmap = buildCodeBitmap(enc.encode("abc"), false);
    expect(isCodeByte(bitmap, 100)).toBe(false);
  });
});

// =============================================================================
// countNewlines
// =============================================================================

describe("countNewlines", () => {
  test("basic counting", () => {
    expect(countNewlines(enc.encode("line1\nline2\nline3\n"))).toBe(3);
  });

  test("empty", () => {
    expect(countNewlines(enc.encode(""))).toBe(0);
  });

  test("no newlines", () => {
    expect(countNewlines(enc.encode("hello world"))).toBe(0);
  });

  test("all newlines", () => {
    expect(countNewlines(enc.encode("\n".repeat(64)))).toBe(64);
  });

  test("large input (multi-chunk)", () => {
    // 256 chars with newlines every 10
    let s = "";
    for (let i = 0; i < 25; i++) s += "123456789\n";
    expect(countNewlines(enc.encode(s))).toBe(25);
  });
});

// =============================================================================
// isWordBoundary
// =============================================================================

describe("isWordBoundary", () => {
  test("space is boundary", () => expect(isWordBoundary(0x20)).toBe(true));
  test("zero is boundary", () => expect(isWordBoundary(0)).toBe(true));
  test("semicolon is boundary", () => expect(isWordBoundary(0x3b)).toBe(true));
  test("letter is not boundary", () => expect(isWordBoundary(0x61)).toBe(false));
  test("digit is not boundary", () => expect(isWordBoundary(0x30)).toBe(false));
});

// =============================================================================
// KEYWORD TRIAGE TESTS (ported from simd_triage.zig)
// =============================================================================

describe("scanForKeywords", () => {
  test("detects JS functions", () => {
    const src = enc.encode("function hello() { return 42; }");
    const result = scanForKeywords(src, "javascript");
    expect(result.hasEntityKeywords).toBe(true);
    expect(result.keywordCount).toBeGreaterThanOrEqual(1);
  });

  test("skips data-only file", () => {
    const src = enc.encode('{ "name": "test", "version": "1.0.0", "dependencies": {} }');
    const result = scanForKeywords(src, "javascript");
    expect(result.hasEntityKeywords).toBe(false);
  });

  test("ignores keywords in strings", () => {
    const src = enc.encode('const msg = "this function is not a real function";');
    const result = scanForKeywords(src, "javascript");
    // "const" is outside string → has keywords
    expect(result.hasEntityKeywords).toBe(true);
    // But "function" inside string should NOT count
    // Only "const" should be found
    expect(result.keywordCount).toBe(1);
  });

  test("ignores keywords in comments", () => {
    const src = enc.encode("// function hello() {}\n/* class Foo {} */");
    const result = scanForKeywords(src, "javascript");
    expect(result.hasEntityKeywords).toBe(false);
  });

  test("Python keywords", () => {
    const src = enc.encode("def hello():\n    pass\n\nclass Foo:\n    pass");
    const result = scanForKeywords(src, "python");
    expect(result.hasEntityKeywords).toBe(true);
    expect(result.keywordCount).toBeGreaterThanOrEqual(2);
  });

  test("Go keywords", () => {
    const src = enc.encode("package main\n\nfunc main() {}");
    const result = scanForKeywords(src, "go");
    expect(result.hasEntityKeywords).toBe(true);
  });

  test("empty file", () => {
    const result = scanForKeywords(new Uint8Array(0), "javascript");
    expect(result.hasEntityKeywords).toBe(false);
  });

  test("Python hash comments hide keywords", () => {
    const src = enc.encode("# def hello():\n#     pass\n");
    const result = scanForKeywords(src, "python");
    expect(result.hasEntityKeywords).toBe(false);
  });

  test("Rust keywords", () => {
    const src = enc.encode("pub fn main() {}\nstruct Foo {}");
    const result = scanForKeywords(src, "rust");
    expect(result.hasEntityKeywords).toBe(true);
    expect(result.keywordCount).toBeGreaterThanOrEqual(3); // pub, fn, struct
  });

  test("unknown language returns true (no filtering)", () => {
    const src = enc.encode("whatever content");
    const result = scanForKeywords(src, "unknown_lang");
    expect(result.hasEntityKeywords).toBe(true);
  });
});

// =============================================================================
// FILTERED TRIGRAM EXTRACTION
// =============================================================================

describe("extractTrigramsFiltered", () => {
  test("excludes trigrams from strings", () => {
    const src = enc.encode('abc"def"ghi');
    const filtered = extractTrigramsFiltered(src, false);
    const unfiltered = extractTrigrams(src);

    // Filtered should have fewer trigrams (no "def" related ones)
    expect(filtered.entries.length).toBeLessThan(unfiltered.entries.length);

    // "abc" trigram should NOT be in filtered (it spans code→quote boundary)
    // but "ghi" region trigrams should be
    const trigramStrings = filtered.entries.map((e) => {
      const b0 = (e.trigram >>> 16) & 0xff;
      const b1 = (e.trigram >>> 8) & 0xff;
      const b2 = e.trigram & 0xff;
      return String.fromCharCode(b0, b1, b2);
    });

    // "def" should NOT be in filtered results
    expect(trigramStrings).not.toContain("def");
    // "ghi" should be in filtered results
    expect(trigramStrings).toContain("ghi");
  });

  test("excludes trigrams from comments", () => {
    const src = enc.encode("abc//xyz\ndef");
    const filtered = extractTrigramsFiltered(src, false);

    const trigramStrings = filtered.entries.map((e) => {
      const b0 = (e.trigram >>> 16) & 0xff;
      const b1 = (e.trigram >>> 8) & 0xff;
      const b2 = e.trigram & 0xff;
      return String.fromCharCode(b0, b1, b2);
    });

    // "xyz" is in comment → should not appear
    expect(trigramStrings).not.toContain("xyz");
    // "def" is after comment → should appear
    expect(trigramStrings).toContain("def");
  });

  test("short content returns empty", () => {
    const result = extractTrigramsFiltered(enc.encode("ab"), false);
    expect(result.entries.length).toBe(0);
  });

  test("all-code content matches unfiltered", () => {
    const src = enc.encode("function hello world");
    const filtered = extractTrigramsFiltered(src, false);
    const unfiltered = extractTrigrams(src);

    // Same number of trigrams when there are no strings/comments
    expect(filtered.entries.length).toBe(unfiltered.entries.length);
  });
});

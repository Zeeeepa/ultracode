import { beforeEach, describe, expect, it } from "bun:test";
import { StructuralNormalizer } from "../structural-normalizer.js";

describe("StructuralNormalizer", () => {
  let normalizer: StructuralNormalizer;

  beforeEach(() => {
    normalizer = new StructuralNormalizer();
  });

  describe("TypeScript normalization", () => {
    it("should normalize TypeScript code with comments", () => {
      const code1 = `
        // Comment
        function   foo(  x  :  number  )  {
          return   x   +   1  ;
        }
      `;

      const code2 = `
        function foo(x: number) {
          return x + 1
        }
      `;

      const norm1 = normalizer.normalizeCode(code1, "typescript");
      const norm2 = normalizer.normalizeCode(code2, "typescript");

      // Both should contain same keywords after normalization
      expect(norm1).toContain("function foo");
      expect(norm1).toContain("return x +");
      expect(norm2).toContain("function foo");
      expect(norm2).toContain("return x +");

      // Comments should be removed
      expect(norm1).not.toContain("Comment");
    });

    it("should remove trailing semicolons in TypeScript", () => {
      const code1 = "function foo() { return 1; }";
      const code2 = "function foo() { return 1 }";

      const norm1 = normalizer.normalizeCode(code1, "typescript");
      const norm2 = normalizer.normalizeCode(code2, "typescript");

      expect(norm1).toBe(norm2);
    });

    it("should remove multi-line comments", () => {
      const code = `
        /* Multi-line
           comment */
        function foo() {
          /* Another comment */
          return 1;
        }
      `;

      const normalized = normalizer.normalizeCode(code, "typescript");

      expect(normalized).not.toContain("Multi-line");
      expect(normalized).not.toContain("comment");
      expect(normalized).toContain("function foo()");
    });
  });

  describe("Python normalization", () => {
    it("should remove Python comments", () => {
      const code = `
        # This is a comment
        def foo(x):
            # Another comment
            return x + 1
      `;

      const normalized = normalizer.normalizeCode(code, "python");

      expect(normalized).not.toContain("#");
      expect(normalized).toContain("def foo(x):");
      expect(normalized).toContain("return x + 1");
    });

    it("should normalize whitespace in Python", () => {
      const code1 = "def    foo(  x  ):    return    x";
      const code2 = "def foo(x): return x";

      const norm1 = normalizer.normalizeCode(code1, "python");
      const norm2 = normalizer.normalizeCode(code2, "python");

      expect(norm1).toBe(norm2);
    });
  });

  describe("C/C++ normalization", () => {
    it("should remove C-style comments", () => {
      const code = `
        // Single line
        int foo(int x) {
          /* Multi-line comment */
          return x + 1;
        }
      `;

      const normalized = normalizer.normalizeCode(code, "c");

      expect(normalized).not.toContain("Single line");
      expect(normalized).not.toContain("Multi-line");
      expect(normalized).toContain("int foo(int x)");
    });
  });

  describe("Hash computation", () => {
    it("should compute same hash for equivalent code", () => {
      const code1 = "function foo() { return 1; }";
      const code2 = "function   foo  (  )   {   return   1   ;   }";

      const norm1 = normalizer.normalizeCode(code1, "typescript");
      const norm2 = normalizer.normalizeCode(code2, "typescript");

      // Normalized code should be similar (whitespace removed)
      expect(norm1).toContain("function");
      expect(norm1).toContain("return");
      expect(norm2).toContain("function");
      expect(norm2).toContain("return");

      // They should be exactly equal after normalization
      expect(norm1).toBe(norm2);

      const hash1 = normalizer.computeStructuralHash(norm1);
      const hash2 = normalizer.computeStructuralHash(norm2);

      // Hash should be identical for structurally identical code
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBeGreaterThanOrEqual(6); // base36 encoded
    });

    it("should compute different hash for different structure", () => {
      const code1 = "function foo() { return 1; }";
      const code2 = "function bar() { return 2; }";

      const norm1 = normalizer.normalizeCode(code1, "typescript");
      const norm2 = normalizer.normalizeCode(code2, "typescript");

      const hash1 = normalizer.computeStructuralHash(norm1);
      const hash2 = normalizer.computeStructuralHash(norm2);

      expect(hash1).not.toBe(hash2);
    });

    it("should compute same hash for code with only formatting differences", () => {
      const code1 = `
        class User {
          getName() {
            return this.name;
          }
        }
      `;

      const code2 = `class User{getName(){return this.name;}}`;

      const norm1 = normalizer.normalizeCode(code1, "typescript");
      const norm2 = normalizer.normalizeCode(code2, "typescript");

      // Normalized code should be similar
      expect(norm1).toContain("class User");
      expect(norm1).toContain("getName");
      expect(norm2).toContain("class User");
      expect(norm2).toContain("getName");

      const hash1 = normalizer.computeStructuralHash(norm1);
      const hash2 = normalizer.computeStructuralHash(norm2);

      // Hash should be identical
      expect(hash1).toBe(hash2);
    });
  });

  describe("Whitespace normalization", () => {
    it("should remove empty lines", () => {
      const code = `
        function foo() {


          return 1;


        }
      `;

      const normalized = normalizer.normalizeCode(code, "typescript");

      expect(normalized.split("\n").filter((line) => line === "")).toHaveLength(0);
    });

    it("should trim each line", () => {
      const code = "   function foo()   \n   {   \n   return 1;   \n   }   ";

      const normalized = normalizer.normalizeCode(code, "typescript");
      const lines = normalized.split("\n");

      for (const line of lines) {
        expect(line).toBe(line.trim());
      }
    });
  });
});

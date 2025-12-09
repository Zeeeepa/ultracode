import { describe, expect, it } from "bun:test";
import {
  extractCommentRefs,
  extractReferences,
  generateCodeRef,
  generateDocRef,
  generateEntityRef,
  generateFlowComment,
  generateSeeDocComment,
  generateSeeEntityComment,
  validateReference,
} from "../../src/autodoc/parser/link-extractor.js";

describe("link-extractor", () => {
  describe("extractReferences", () => {
    it("extracts doc references from relative paths", () => {
      const markdown = `
# Test Doc

See [→ Architecture](./ARCHITECTURE.md) guide.
Also check [→ flow](../FLOW.md#login).
      `;
      const refs = extractReferences(markdown, "test.md");

      expect(refs.length).toBe(2);
      expect(refs[0].targetType).toBe("doc");
    });

    it("extracts line range references", () => {
      const markdown = `
Check [→ implementation](src/service.ts#L10-L50) for code.
      `;
      const refs = extractReferences(markdown, "test.md");

      expect(refs.length).toBe(1);
      expect(refs[0].targetType).toBe("line_range");
    });

    it("ignores external URLs", () => {
      const markdown = `
See [Google](https://google.com) for search.
      `;
      const refs = extractReferences(markdown, "test.md");
      expect(refs).toHaveLength(0);
    });

    it("handles markdown without references", () => {
      const markdown = "# Simple doc\n\nNo references here.";
      const refs = extractReferences(markdown, "test.md");
      expect(refs).toHaveLength(0);
    });
  });

  describe("generateCodeRef", () => {
    it("generates line range reference", () => {
      const ref = generateCodeRef("src/file.ts", 10, 20);
      expect(ref).toContain("src/file.ts");
      expect(ref).toContain("L10");
      expect(ref).toContain("L20");
    });

    it("generates single line reference", () => {
      const ref = generateCodeRef("src/file.ts", 10);
      expect(ref).toContain("L10");
    });
  });

  describe("generateEntityRef", () => {
    it("generates entity reference link", () => {
      const ref = generateEntityRef("MyClass.myMethod", "method");
      // Uses ultrascript:// protocol for entities
      expect(ref).toContain("ultrascript://entity/MyClass.myMethod");
      expect(ref).toContain("→");
    });
  });

  describe("generateDocRef", () => {
    it("generates doc reference link", () => {
      const ref = generateDocRef("ARCHITECTURE.md", "Architecture");
      // Returns markdown link format
      expect(ref).toContain("ARCHITECTURE.md");
      expect(ref).toContain("→");
    });

    it("generates doc reference with section", () => {
      const ref = generateDocRef("FLOW.md", "Login Flow", "login");
      expect(ref).toContain("FLOW.md");
      expect(ref).toContain("Login Flow");
    });
  });

  describe("validateReference", () => {
    // Mock resolver that always returns true
    const mockResolver = () => true;
    const { RefTargetType } = require("../../src/autodoc/types.js");

    it("validates entity reference", () => {
      const ref = {
        syntax: "[→ method](entity:MyClass.method)",
        text: "method",
        target: "entity:MyClass.method",
        targetType: RefTargetType.ENTITY,
        targetId: "MyClass.method",
        line: 1,
        column: 0,
      };
      const result = validateReference(ref, mockResolver);
      expect(result.valid).toBe(true);
    });

    it("validates doc reference", () => {
      const ref = {
        syntax: "[→ doc](docs://ARCHITECTURE.md)",
        text: "doc",
        target: "docs://ARCHITECTURE.md",
        targetType: RefTargetType.DOC,
        targetId: "ARCHITECTURE.md",
        line: 1,
        column: 0,
      };
      const result = validateReference(ref, mockResolver);
      expect(result.valid).toBe(true);
    });

    it("returns invalid when resolver returns false", () => {
      const falseResolver = () => false;
      const ref = {
        syntax: "[→ method](entity:Missing.method)",
        text: "method",
        target: "entity:Missing.method",
        targetType: RefTargetType.ENTITY,
        targetId: "Missing.method",
        line: 1,
        column: 0,
      };
      const result = validateReference(ref, falseResolver);
      expect(result.valid).toBe(false);
    });
  });

  describe("extractCommentRefs", () => {
    it("extracts @see doc references", () => {
      const comment = `
        /**
         * Main function.
         * @see docs://.autodoc/FLOW.md#login
         */
      `;
      const refs = extractCommentRefs(comment);
      expect(refs.docRefs.length).toBe(1);
    });

    it("extracts @see entity references", () => {
      const comment = `
        /**
         * @see entity:AuthService.login
         */
      `;
      const refs = extractCommentRefs(comment);
      expect(refs.entityRefs.length).toBe(1);
    });

    it("extracts @flow tags", () => {
      const comment = `
        /**
         * @flow user-registration, api-auth
         */
      `;
      const refs = extractCommentRefs(comment);
      expect(refs.flowTags.length).toBe(2);
    });
  });

  describe("generateSeeDocComment", () => {
    it("generates @see doc comment", () => {
      const comment = generateSeeDocComment("FLOW.md#login");
      expect(comment).toContain("@see");
      expect(comment).toContain("docs://");
    });
  });

  describe("generateSeeEntityComment", () => {
    it("generates @see entity comment", () => {
      const comment = generateSeeEntityComment("MyService.process");
      expect(comment).toContain("@see");
      expect(comment).toContain("entity:");
    });
  });

  describe("generateFlowComment", () => {
    it("generates @flow comment with multiple tags", () => {
      const comment = generateFlowComment(["login", "authentication"]);
      expect(comment).toContain("@flow");
      expect(comment).toContain("login");
      expect(comment).toContain("authentication");
    });
  });
});

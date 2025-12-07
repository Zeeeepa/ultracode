import { describe, expect, it } from "@jest/globals";
import {
  extractTitle,
  findSectionById,
  findSectionByTitle,
  flattenSections,
  generateMarkdown,
  getSectionPath,
  parseMarkdown,
} from "../../src/autodoc/parser/md-parser.js";

describe("md-parser", () => {
  const sampleMarkdown = `# Main Title

Introduction text.

## Overview

Overview content here.

### Details

Detailed information.

## Configuration

Config content.

### Advanced Settings

Advanced settings info.
`;

  describe("parseMarkdown", () => {
    it("parses markdown into hierarchical sections", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");

      expect(result.title).toBe("Main Title");
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it("extracts section titles correctly", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const flat = flattenSections(result.sections);
      const titles = flat.map((s) => s.title);

      expect(titles).toContain("Main Title");
      expect(titles).toContain("Overview");
      expect(titles).toContain("Configuration");
    });

    it("handles empty content", () => {
      const result = parseMarkdown("", "test.md");
      // Empty content gives filename as title
      expect(result.sections).toHaveLength(0);
    });
  });

  describe("flattenSections", () => {
    it("flattens nested sections", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const flat = flattenSections(result.sections);

      // Should have all sections including nested ones
      expect(flat.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("findSectionById", () => {
    it("finds section by slugified ID", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const section = findSectionById(result.sections, "overview");

      expect(section).toBeDefined();
      expect(section?.title).toBe("Overview");
    });

    it("returns null for non-existent section", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const section = findSectionById(result.sections, "nonexistent");

      expect(section).toBeNull();
    });
  });

  describe("findSectionByTitle", () => {
    it("finds section by exact title", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const section = findSectionByTitle(result.sections, "Configuration");

      expect(section).toBeDefined();
      expect(section?.title).toBe("Configuration");
    });

    it("is case-insensitive", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const section = findSectionByTitle(result.sections, "configuration");

      expect(section).toBeDefined();
    });
  });

  describe("extractTitle", () => {
    it("extracts H1 title from markdown", () => {
      const title = extractTitle("# My Document\n\nSome content");
      expect(title).toBe("My Document");
    });

    it("returns null for no title", () => {
      const title = extractTitle("Some content without heading");
      expect(title).toBeNull();
    });
  });

  describe("getSectionPath", () => {
    it("generates path for nested sections", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const flat = flattenSections(result.sections);
      const detailsSection = flat.find((s) => s.title === "Details");

      if (detailsSection) {
        const path = getSectionPath(result.sections, detailsSection.id);
        expect(path.length).toBeGreaterThan(0);
      }
    });
  });

  describe("generateMarkdown", () => {
    it("regenerates markdown from parsed document", () => {
      const result = parseMarkdown(sampleMarkdown, "test.md");
      const regenerated = generateMarkdown(result);

      // Should contain the main sections
      expect(regenerated).toContain("# Main Title");
      expect(regenerated).toContain("## Overview");
    });
  });
});

/**
 * Prisma Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const PRISMA_CONFIG: LanguageConfig = {
  language: "prisma",
  extensions: ["prisma"],
  keywords: LANGUAGE_KEYWORDS.prisma,
  nodeTypes: {
    functions: [],
    classes: ["model"],
    methods: [],
    imports: [],
    exports: [],
    variables: [],
    types: ["model", "enum"],
    interfaces: [],
  },
  extractors: {
    extractName: () => ["identifier"],
    extractModifiers: () => [],
    extractParameters: false,
    extractReturnType: false,
    extractReferences: true,
  },
};

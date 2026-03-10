/**
 * LINQ Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const LINQ_CONFIG: LanguageConfig = {
  language: "linq",
  extensions: ["linq"],
  keywords: LANGUAGE_KEYWORDS.linq,
  nodeTypes: {
    functions: ["query", "method"],
    classes: [],
    methods: ["query"],
    imports: [],
    exports: [],
    variables: [],
    types: [],
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

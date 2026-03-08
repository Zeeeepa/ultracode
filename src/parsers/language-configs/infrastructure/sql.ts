/**
 * SQL Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const SQL_CONFIG: LanguageConfig = {
  language: "sql",
  extensions: ["sql"],
  keywords: LANGUAGE_KEYWORDS.sql,
  nodeTypes: {
    functions: ["procedure", "function", "trigger"],
    classes: ["table"],
    methods: [],
    imports: [],
    exports: [],
    variables: [],
    types: ["table", "view", "enum"],
    interfaces: [],
  },
  extractors: {
    extractName: () => ["identifier"],
    extractModifiers: () => [],
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

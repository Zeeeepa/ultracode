/**
 * CSS Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const CSS_CONFIG: LanguageConfig = {
  language: "css",
  extensions: ["css", "scss", "sass", "less"],
  keywords: LANGUAGE_KEYWORDS.css,
  nodeTypes: {
    functions: [],
    classes: [],
    methods: [],
    imports: [],
    exports: [],
    variables: ["rule_set"],
    types: [],
    interfaces: [],
  },
  extractors: {
    extractName: () => ["selectors"],
    extractModifiers: () => [],
    extractParameters: false,
    extractReturnType: false,
    extractReferences: false,
  },
};

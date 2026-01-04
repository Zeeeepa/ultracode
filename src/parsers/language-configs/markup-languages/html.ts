/**
 * HTML Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const HTML_CONFIG: LanguageConfig = {
  language: "html",
  extensions: ["html", "htm"],
  keywords: LANGUAGE_KEYWORDS.html,
  nodeTypes: {
    functions: [],
    classes: [],
    methods: [],
    imports: [],
    exports: [],
    variables: ["element"],
    types: [],
    interfaces: [],
  },
  extractors: {
    extractName: () => ["tag_name"],
    extractModifiers: () => [],
    extractParameters: false,
    extractReturnType: false,
    extractReferences: false,
  },
};

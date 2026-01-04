/**
 * XML Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const XML_CONFIG: LanguageConfig = {
  language: "xml",
  extensions: ["xml"],
  keywords: LANGUAGE_KEYWORDS.xml,
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

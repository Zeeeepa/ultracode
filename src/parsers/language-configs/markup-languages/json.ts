/**
 * JSON Language Configuration (OpenAPI, package.json, tsconfig.json)
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const JSON_CONFIG: LanguageConfig = {
  language: "json",
  extensions: ["json"],
  keywords: LANGUAGE_KEYWORDS.json,
  nodeTypes: {
    functions: [],
    classes: [],
    methods: ["paths"],
    imports: ["dependencies", "devDependencies"],
    exports: ["exports"],
    variables: [],
    types: ["definitions", "components", "schemas"],
    interfaces: [],
  },
  extractors: {
    extractName: () => ["key", "string"],
    extractModifiers: () => [],
    extractParameters: false,
    extractReturnType: false,
    extractReferences: true,
  },
};

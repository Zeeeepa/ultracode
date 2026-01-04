/**
 * Batch/CMD Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const BATCH_CONFIG: LanguageConfig = {
  language: "batch",
  extensions: ["bat", "cmd"],
  keywords: LANGUAGE_KEYWORDS.batch,
  nodeTypes: {
    functions: ["call_statement", "label"],
    classes: [],
    methods: [],
    imports: ["call_statement"],
    exports: ["set_statement", "setx_statement"],
    variables: ["set_statement", "variable_expansion", "environment_variable"],
    types: [],
    interfaces: [],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "label":
          return ["identifier", "label_name"];
        case "set_statement":
        case "setx_statement":
          return ["variable_name", "identifier"];
        case "call_statement":
          return ["command", "identifier"];
        default:
          return ["identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "call_statement":
          return ["call"];
        case "set_statement":
          return ["set"];
        case "setx_statement":
          return ["setx"];
        default:
          return [];
      }
    },
    extractParameters: false,
    extractReturnType: false,
    extractReferences: true,
  },
};

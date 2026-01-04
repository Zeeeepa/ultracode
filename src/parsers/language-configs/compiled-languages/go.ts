/**
 * Go Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const GO_CONFIG: LanguageConfig = {
  language: "go",
  extensions: ["go", "mod"],
  keywords: LANGUAGE_KEYWORDS.go,
  nodeTypes: {
    functions: ["function_declaration", "method_declaration", "func_literal"],
    classes: ["type_declaration", "type_spec", "struct_type", "interface_type"],
    methods: ["method_declaration"],
    imports: ["import_spec", "import_declaration"],
    exports: [], // Go uses capitalization for exports
    variables: ["short_var_declaration", "var_spec", "assignment_statement", "expression_statement"],
    types: ["type_declaration", "type_spec", "array_type", "slice_type", "map_type", "channel_type"],
    interfaces: ["interface_type"],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_declaration":
        case "method_declaration":
          return ["identifier"];
        case "type_declaration":
        case "type_spec":
          return ["identifier"];
        case "struct_type":
          return ["type_identifier", "identifier"];
        case "interface_type":
          return ["type_identifier", "identifier"];
        case "import_spec":
          return ["import_path", "identifier"];
        case "short_var_declaration":
        case "var_spec":
          return ["identifier", "expression_list"];
        default:
          return ["identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "function_declaration":
        case "method_declaration":
          return ["func"];
        case "type_declaration":
        case "type_spec":
          return ["type"];
        default:
          return [];
      }
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

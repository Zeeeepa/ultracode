/**
 * JavaScript Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const JAVASCRIPT_CONFIG: LanguageConfig = {
  language: "javascript",
  extensions: ["js", "mjs", "cjs"],
  keywords: LANGUAGE_KEYWORDS.javascript,
  nodeTypes: {
    functions: [
      "function_declaration",
      "function_expression",
      "arrow_function",
      "generator_function",
      "generator_function_declaration",
    ],
    classes: ["class_declaration", "class_expression"],
    methods: ["method_definition", "public_field_definition"],
    imports: [
      "import_statement",
      "import_declaration",
      "call_expression", // for require()
    ],
    exports: ["export_statement", "export_declaration", "export_default_declaration", "export_specifier"],
    variables: ["variable_declaration", "lexical_declaration", "variable_declarator"],
    types: [],
    interfaces: [],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_declaration":
        case "class_declaration":
          return ["identifier"];
        case "method_definition":
          return ["property_identifier", "identifier"];
        case "variable_declarator":
          return ["identifier", "object_pattern", "array_pattern"];
        default:
          return ["identifier"];
      }
    },
    extractModifiers: (_nodeType: string) => {
      return ["async", "static", "get", "set", "private", "protected", "public"];
    },
    extractParameters: true,
    extractReturnType: false,
    extractReferences: true,
  },
};

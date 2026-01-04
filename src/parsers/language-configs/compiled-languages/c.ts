/**
 * C Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const C_CONFIG: LanguageConfig = {
  language: "c",
  extensions: ["c", "h"],
  keywords: LANGUAGE_KEYWORDS.c,
  nodeTypes: {
    functions: ["function_definition", "function_declarator", "pointer_declarator"],
    classes: ["struct_specifier", "union_specifier", "enum_specifier"],
    methods: [],
    imports: ["preproc_include", "preproc_def", "preproc_call"],
    exports: ["function_definition", "declaration"],
    variables: ["declaration", "parameter_declaration", "init_declarator"],
    types: [
      "type_definition",
      "primitive_type",
      "sized_type_specifier",
      "struct_specifier",
      "union_specifier",
      "enum_specifier",
    ],
    interfaces: [],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_definition":
        case "function_declarator":
          return ["identifier"];
        case "struct_specifier":
        case "union_specifier":
        case "enum_specifier":
          return ["type_identifier", "identifier"];
        case "declaration":
        case "parameter_declaration":
          return ["identifier"];
        case "preproc_include":
          return ["string_literal", "system_lib_string"];
        case "preproc_def":
          return ["identifier"];
        default:
          return ["identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "function_definition":
          return ["static", "inline", "extern"];
        case "declaration":
          return ["static", "extern", "const", "volatile", "register"];
        case "struct_specifier":
        case "union_specifier":
          return ["static", "extern"];
        default:
          return ["static", "extern", "const", "volatile"];
      }
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

/**
 * C# Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const CSHARP_CONFIG: LanguageConfig = {
  language: "csharp",
  extensions: ["cs", "csx"],
  keywords: LANGUAGE_KEYWORDS.csharp,
  nodeTypes: {
    functions: ["method_declaration", "constructor_declaration"],
    classes: [
      "class_declaration",
      "struct_declaration",
      "record_declaration",
      "interface_declaration",
      "enum_declaration",
      "delegate_declaration",
    ],
    methods: ["method_declaration", "constructor_declaration"],
    imports: ["using_directive"],
    exports: ["public", "internal", "protected"],
    variables: ["field_declaration", "property_declaration"],
    types: ["type_identifier", "generic_name", "predefined_type", "nullable_type"],
    interfaces: ["interface_declaration"],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "method_declaration":
        case "constructor_declaration":
          return ["identifier"];
        case "class_declaration":
        case "struct_declaration":
        case "record_declaration":
        case "interface_declaration":
        case "enum_declaration":
        case "delegate_declaration":
          return ["identifier"];
        case "field_declaration":
        case "property_declaration":
          return ["identifier", "variable_declarator"];
        case "using_directive":
          return ["qualified_name", "identifier"];
        default:
          return ["identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "method_declaration":
        case "constructor_declaration":
          return [
            "public",
            "private",
            "protected",
            "internal",
            "static",
            "virtual",
            "override",
            "abstract",
            "sealed",
            "async",
            "partial",
          ];
        case "class_declaration":
        case "struct_declaration":
        case "record_declaration":
        case "interface_declaration":
        case "enum_declaration":
          return ["public", "private", "protected", "internal", "static", "abstract", "sealed", "partial"];
        case "field_declaration":
        case "property_declaration":
          return ["public", "private", "protected", "internal", "static", "readonly", "const", "volatile"];
        default:
          return ["public", "private", "protected", "internal", "static"];
      }
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

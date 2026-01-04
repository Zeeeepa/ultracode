/**
 * TypeScript Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const TYPESCRIPT_CONFIG: LanguageConfig = {
  language: "typescript",
  extensions: ["ts", "mts", "cts"],
  keywords: LANGUAGE_KEYWORDS.typescript,
  nodeTypes: {
    functions: [
      "function_declaration",
      "function_expression",
      "arrow_function",
      "generator_function",
      "generator_function_declaration",
      "function_signature",
    ],
    classes: ["class_declaration", "class_expression", "abstract_class_declaration"],
    methods: ["method_definition", "method_signature", "public_field_definition", "abstract_method_signature"],
    imports: [
      "import_statement",
      "import_declaration",
      "import_alias",
      "call_expression", // for require()
    ],
    exports: [
      "export_statement",
      "export_declaration",
      "export_default_declaration",
      "export_specifier",
      "export_assignment",
    ],
    variables: ["variable_declaration", "lexical_declaration", "variable_declarator", "const_declaration"],
    types: ["type_alias_declaration", "enum_declaration", "namespace_declaration"],
    interfaces: ["interface_declaration", "interface_body"],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_declaration":
        case "class_declaration":
        case "interface_declaration":
        case "type_alias_declaration":
        case "enum_declaration":
          return ["identifier", "type_identifier"];
        case "method_definition":
        case "method_signature":
          return ["property_identifier", "identifier"];
        case "variable_declarator":
          return ["identifier", "object_pattern", "array_pattern"];
        default:
          return ["identifier", "type_identifier"];
      }
    },
    extractModifiers: (_nodeType: string) => {
      return ["async", "static", "get", "set", "private", "protected", "public", "readonly", "abstract", "override"];
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

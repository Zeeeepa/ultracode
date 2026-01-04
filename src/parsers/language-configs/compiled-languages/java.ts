/**
 * Java Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const JAVA_CONFIG: LanguageConfig = {
  language: "java",
  extensions: ["java"],
  keywords: LANGUAGE_KEYWORDS.java,
  nodeTypes: {
    functions: ["method_declaration", "constructor_declaration"],
    classes: [
      "class_declaration",
      "interface_declaration",
      "enum_declaration",
      "record_declaration",
      "annotation_type_declaration",
    ],
    methods: ["method_declaration", "constructor_declaration"],
    imports: ["import_declaration"],
    exports: ["public", "protected"],
    variables: ["field_declaration", "local_variable_declaration", "variable_declarator"],
    types: ["type_identifier", "generic_type", "array_type"],
    interfaces: ["interface_declaration"],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "method_declaration":
        case "constructor_declaration":
          return ["identifier"];
        case "class_declaration":
        case "interface_declaration":
        case "enum_declaration":
        case "record_declaration":
        case "annotation_type_declaration":
          return ["identifier"];
        case "field_declaration":
        case "local_variable_declaration":
          return ["identifier", "variable_declarator"];
        case "import_declaration":
          return ["scoped_identifier", "identifier"];
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
            "static",
            "final",
            "abstract",
            "synchronized",
            "native",
            "strictfp",
          ];
        case "class_declaration":
        case "interface_declaration":
        case "enum_declaration":
        case "record_declaration":
          return ["public", "private", "protected", "static", "final", "abstract", "strictfp"];
        case "field_declaration":
          return ["public", "private", "protected", "static", "final", "transient", "volatile"];
        default:
          return ["public", "private", "protected", "static", "final"];
      }
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

/**
 * C++ Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const CPP_CONFIG: LanguageConfig = {
  language: "cpp",
  extensions: ["cpp", "cxx", "cc", "C", "hpp", "hxx", "hh"],
  keywords: LANGUAGE_KEYWORDS.cpp,
  nodeTypes: {
    functions: ["function_definition", "function_declarator", "template_function", "template_declaration"],
    classes: ["class_specifier", "struct_specifier", "union_specifier", "enum_specifier", "template_declaration"],
    methods: [
      "function_definition", // methods inside classes
      "field_declaration",
    ],
    imports: ["preproc_include", "using_declaration", "namespace_alias_definition"],
    exports: ["function_definition", "declaration", "template_declaration"],
    variables: ["declaration", "parameter_declaration", "init_declarator", "field_declaration"],
    types: [
      "type_definition",
      "primitive_type",
      "sized_type_specifier",
      "class_specifier",
      "struct_specifier",
      "union_specifier",
      "enum_specifier",
      "template_declaration",
      "auto",
    ],
    interfaces: [
      "class_specifier", // C++ classes can act as interfaces
    ],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_definition":
        case "function_declarator":
        case "template_function":
          return ["identifier", "qualified_identifier"];
        case "class_specifier":
        case "struct_specifier":
        case "union_specifier":
        case "enum_specifier":
          return ["type_identifier", "identifier"];
        case "template_declaration":
          return ["type_identifier", "identifier", "template_type"];
        case "namespace_definition":
          return ["identifier"];
        case "using_declaration":
          return ["qualified_identifier", "identifier"];
        case "declaration":
        case "parameter_declaration":
        case "field_declaration":
          return ["identifier", "field_identifier"];
        default:
          return ["identifier", "type_identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "function_definition":
          return ["static", "inline", "extern", "virtual", "override", "final", "constexpr", "consteval"];
        case "class_specifier":
        case "struct_specifier":
          return ["final", "abstract"];
        case "field_declaration":
          return ["static", "const", "mutable", "constexpr"];
        case "declaration":
          return ["static", "extern", "const", "volatile", "mutable", "constexpr", "consteval"];
        default:
          return ["static", "extern", "const", "volatile", "virtual", "override", "final"];
      }
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

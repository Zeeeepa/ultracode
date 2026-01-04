/**
 * Rust Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const RUST_CONFIG: LanguageConfig = {
  language: "rust",
  extensions: ["rs"],
  keywords: LANGUAGE_KEYWORDS.rust,
  nodeTypes: {
    functions: [
      "function_item",
      "function_signature_item",
      "async_function_item",
      "const_function_item",
      "closure_expression",
    ],
    classes: ["struct_item", "enum_item", "trait_item", "impl_item", "mod_item", "union_item"],
    methods: [
      "function_item", // methods inside impl blocks
      "associated_type",
      "method_signature_item",
    ],
    imports: ["use_declaration", "extern_crate_declaration", "use_list", "use_as_clause", "use_wildcard"],
    exports: [
      "visibility_modifier", // pub keyword
      "pub_visibility_modifier",
      "crate_visibility_modifier",
    ],
    variables: ["let_declaration", "const_item", "static_item", "let_expression", "ref_pattern", "mut_pattern"],
    types: [
      "type_alias",
      "generic_type",
      "reference_type",
      "pointer_type",
      "array_type",
      "tuple_type",
      "function_type",
      "type_parameters",
      "where_clause",
      "trait_bounds",
    ],
    interfaces: [
      "trait_item", // Rust traits are similar to interfaces
    ],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_item":
        case "async_function_item":
        case "const_function_item":
          return ["identifier"];
        case "struct_item":
        case "enum_item":
        case "trait_item":
        case "mod_item":
        case "union_item":
          return ["type_identifier", "identifier"];
        case "impl_item":
          return ["type_identifier"];
        case "use_declaration":
          return ["identifier", "scoped_identifier"];
        case "use_as_clause":
          return ["identifier", "alias"];
        case "let_declaration":
        case "const_item":
        case "static_item":
          return ["identifier", "pattern"];
        case "type_alias":
          return ["type_identifier"];
        case "closure_expression":
          return []; // Closures are anonymous
        default:
          return ["identifier", "type_identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "function_item":
        case "async_function_item":
        case "const_function_item":
          return ["pub", "async", "const", "unsafe", "extern"];
        case "struct_item":
        case "enum_item":
        case "trait_item":
          return ["pub", "pub(crate)", "pub(super)", "pub(self)"];
        case "impl_item":
          return ["unsafe"];
        case "let_declaration":
          return ["mut", "ref"];
        case "const_item":
        case "static_item":
          return ["pub", "mut", "unsafe"];
        default:
          return ["pub", "mut", "const", "unsafe"];
      }
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

/**
 * Swift Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const SWIFT_CONFIG: LanguageConfig = {
  language: "swift",
  extensions: ["swift"],
  keywords: LANGUAGE_KEYWORDS.swift,
  nodeTypes: {
    functions: ["function_declaration"],
    classes: ["class_declaration", "struct_declaration", "actor_declaration"],
    methods: ["function_declaration"],
    imports: ["import_declaration"],
    exports: ["public", "internal", "open"],
    variables: ["property_declaration"],
    types: ["type_identifier"],
    interfaces: ["protocol_declaration"],
  },
  extractors: {
    extractName: () => ["simple_identifier", "type_identifier"],
    extractModifiers: () => ["public", "private", "fileprivate", "internal", "open"],
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

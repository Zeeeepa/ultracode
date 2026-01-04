/**
 * Kotlin Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const KOTLIN_CONFIG: LanguageConfig = {
  language: "kotlin",
  extensions: ["kt", "kts"],
  keywords: LANGUAGE_KEYWORDS.kotlin,
  nodeTypes: {
    functions: ["function_declaration"],
    classes: ["class_declaration", "object_declaration"],
    methods: ["function_declaration"],
    imports: ["import_header"],
    exports: ["public", "internal"],
    variables: ["property_declaration"],
    types: ["type_identifier"],
    interfaces: ["class_declaration"],
  },
  extractors: {
    extractName: () => ["simple_identifier", "type_identifier"],
    extractModifiers: () => ["public", "private", "protected", "internal"],
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

/**
 * Zig Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const ZIG_CONFIG: LanguageConfig = {
  language: "zig",
  extensions: ["zig", "zon"],
  keywords: LANGUAGE_KEYWORDS.zig,
  nodeTypes: {
    functions: ["function_declaration", "test_declaration"],
    classes: ["struct_declaration", "union_declaration"],
    methods: ["function_declaration"],
    imports: ["import_expression"],
    exports: ["pub"],
    variables: ["const_declaration", "var_declaration"],
    types: ["type_identifier"],
    interfaces: ["enum_declaration", "error_set_declaration"],
  },
  extractors: {
    extractName: () => ["identifier"],
    extractModifiers: () => ["pub", "export", "extern", "inline", "comptime"],
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

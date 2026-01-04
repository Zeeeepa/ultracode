/**
 * Enhanced Python Language Configuration - TASK-003B 4-Layer Architecture Support
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const PYTHON_CONFIG: LanguageConfig = {
  language: "python",
  extensions: ["py", "pyi", "pyw"],
  keywords: LANGUAGE_KEYWORDS.python,
  nodeTypes: {
    // Layer 1: Enhanced Basic Parsing - Comprehensive function types
    functions: [
      "function_definition",
      "async_function_definition",
      "lambda",
      "generator_expression",
      "list_comprehension",
      "set_comprehension",
      "dictionary_comprehension",
    ],
    // Layer 1: Enhanced class types including special classes
    classes: [
      "class_definition",
      "decorated_definition", // for @dataclass and other decorated classes
    ],
    // Layer 1: Comprehensive method types with decorators
    methods: [
      "function_definition", // methods are function_definition inside class_definition
      "decorated_definition", // decorated methods (@property, @staticmethod, etc.)
      "property_definition", // property definitions
    ],
    // Layer 1: Enhanced import patterns
    imports: [
      "import_statement",
      "import_from_statement",
      "aliased_import",
      "dotted_name",
      "relative_import",
      "import_list",
      "wildcard_import",
    ],
    // Layer 1: Export patterns
    exports: [
      "expression_statement", // for __all__ assignments
      "assignment", // module-level assignments that act as exports
      "augmented_assignment",
    ],
    // Layer 1: Variable and assignment patterns
    variables: [
      "assignment",
      "augmented_assignment",
      "annotated_assignment",
      "named_expression", // walrus operator :=
      "pattern_list",
      "tuple_pattern",
      "list_pattern",
    ],
    // Layer 1: Type definitions and annotations
    types: [
      "type_alias_statement",
      "generic_type",
      "union_type",
      "subscript", // for List[int], Dict[str, Any], etc.
      "attribute", // for module.TypeName
      "type_parameter",
    ],
    // Layer 2: Protocol support for structural subtyping
    interfaces: [
      "class_definition", // protocols are classes with typing.Protocol base
    ],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        // Layer 1: Enhanced function name extraction
        case "function_definition":
        case "async_function_definition":
          return ["identifier"];
        case "lambda":
          return ["lambda"]; // special case - lambdas don't have names

        // Layer 1: Enhanced class name extraction
        case "class_definition":
          return ["identifier"];
        case "decorated_definition":
          return ["identifier"]; // extract from the underlying definition

        // Layer 1: Enhanced import name extraction
        case "import_statement":
          return ["dotted_name", "identifier"];
        case "import_from_statement":
          return ["import_list", "identifier", "aliased_import"];
        case "aliased_import":
          return ["identifier"]; // both original and alias
        case "wildcard_import":
          return ["*"];

        // Layer 1: Enhanced variable/assignment name extraction
        case "assignment":
        case "augmented_assignment":
        case "annotated_assignment":
          return ["identifier", "pattern_list", "tuple_pattern", "subscript", "attribute"];
        case "named_expression": // walrus operator
          return ["identifier"];

        // Layer 1: Type hint name extraction
        case "type_alias_statement":
          return ["identifier"];
        case "generic_type":
        case "subscript":
          return ["identifier", "attribute"];
        case "union_type":
          return ["identifier"]; // extract all union members

        // Layer 2: Comprehension name extraction
        case "list_comprehension":
        case "set_comprehension":
        case "dictionary_comprehension":
        case "generator_expression":
          return ["identifier"]; // iterator variables

        default:
          return ["identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      // Layer 1 & 2: Enhanced modifier extraction for Python
      const baseModifiers = ["async", "staticmethod", "classmethod", "property"];

      switch (nodeType) {
        case "function_definition":
        case "async_function_definition":
          return [
            ...baseModifiers,
            "abstractmethod",
            "cached_property",
            "lru_cache",
            "singledispatch",
            "contextmanager",
            "asynccontextmanager",
            "wraps",
            "dataclass",
            "final",
            "overload",
          ];

        case "class_definition":
          return ["dataclass", "final", "runtime_checkable", "total", "frozen", "eq", "order", "unsafe_hash", "init"];

        case "decorated_definition":
          // Extract from actual decorators
          return [...baseModifiers, "dataclass", "final", "overload", "abstractmethod", "cached_property"];

        default:
          return baseModifiers;
      }
    },
    extractParameters: true,
    extractReturnType: true, // Python has comprehensive type hints
    extractReferences: true,
  },
};

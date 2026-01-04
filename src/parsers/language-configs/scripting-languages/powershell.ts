/**
 * PowerShell Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const POWERSHELL_CONFIG: LanguageConfig = {
  language: "powershell",
  extensions: ["ps1", "psm1", "psd1"],
  keywords: LANGUAGE_KEYWORDS.powershell,
  nodeTypes: {
    functions: ["function_statement", "filter_statement", "workflow_statement"],
    classes: ["class_statement", "enum_statement"],
    methods: ["function_member"],
    imports: ["using_statement", "import_module_command"],
    exports: ["export_module_member_command"],
    variables: ["assignment_statement", "variable"],
    types: ["type_literal", "type_constraint", "attribute"],
    interfaces: [],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_statement":
        case "filter_statement":
        case "workflow_statement":
          return ["command_name", "simple_name"];
        case "class_statement":
        case "enum_statement":
          return ["type_name"];
        case "variable":
        case "assignment_statement":
          return ["variable"];
        default:
          return ["simple_name", "identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "function_statement":
          return ["function", "param", "begin", "process", "end"];
        case "class_statement":
          return ["class", "public", "private", "static", "hidden"];
        default:
          return [];
      }
    },
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

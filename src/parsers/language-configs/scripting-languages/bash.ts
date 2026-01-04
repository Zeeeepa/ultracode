/**
 * Bash/Shell Script Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const BASH_CONFIG: LanguageConfig = {
  language: "bash",
  extensions: ["sh", "bash", "zsh", "fish"],
  keywords: LANGUAGE_KEYWORDS.bash,
  nodeTypes: {
    functions: ["function_definition", "command"],
    classes: [],
    methods: [],
    imports: ["source_command", "file_redirect"],
    exports: ["variable_assignment", "export_command", "declaration_command"],
    variables: ["variable_assignment", "simple_expansion", "expansion"],
    types: ["command", "declaration_command"],
    interfaces: [],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "function_definition":
          return ["word", "identifier"];
        case "variable_assignment":
          return ["variable_name"];
        case "command":
          return ["command_name", "word"];
        case "source_command":
          return ["file_redirect", "word"];
        default:
          return ["word", "identifier"];
      }
    },
    extractModifiers: (nodeType: string) => {
      switch (nodeType) {
        case "function_definition":
          return ["function"];
        case "declaration_command":
          return ["local", "export", "readonly", "declare"];
        default:
          return ["export", "local", "readonly"];
      }
    },
    extractParameters: true,
    extractReturnType: false,
    extractReferences: true,
  },
};

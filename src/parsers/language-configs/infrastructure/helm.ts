import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const HELM_CONFIG: LanguageConfig = {
  language: "helm" as any, // cast since it's being added
  extensions: ["tpl"],
  keywords: LANGUAGE_KEYWORDS["helm" as keyof typeof LANGUAGE_KEYWORDS],
  nodeTypes: {
    functions: ["define"],
    classes: [],
    methods: [],
    imports: ["include", "template"],
    exports: [],
    variables: ["variable_assignment", "value_reference"],
    types: [],
    interfaces: [],
  },
  extractors: {
    extractName: (nodeType: string) => {
      switch (nodeType) {
        case "define":
          return ["template_name"];
        case "include":
          return ["template_name"];
        case "template":
          return ["template_name"];
        case "variable_assignment":
          return ["variable_name"];
        default:
          return ["name"];
      }
    },
    extractModifiers: (_nodeType: string) => [],
    extractParameters: false,
    extractReturnType: false,
    extractReferences: true,
  },
};

/**
 * GraphQL Schema Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const GRAPHQL_CONFIG: LanguageConfig = {
  language: "graphql",
  extensions: ["graphql", "gql"],
  keywords: LANGUAGE_KEYWORDS.graphql,
  nodeTypes: {
    functions: ["query", "mutation", "subscription"],
    classes: ["type", "interface", "input"],
    methods: ["field"],
    imports: [],
    exports: ["extend"],
    variables: [],
    types: ["enum", "union", "scalar"],
    interfaces: ["interface"],
  },
  extractors: {
    extractName: () => ["identifier"],
    extractModifiers: () => [],
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

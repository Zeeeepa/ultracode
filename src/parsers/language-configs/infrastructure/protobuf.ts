/**
 * Protocol Buffers Language Configuration
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";

export const PROTOBUF_CONFIG: LanguageConfig = {
  language: "protobuf",
  extensions: ["proto"],
  keywords: LANGUAGE_KEYWORDS.protobuf,
  nodeTypes: {
    functions: ["rpc"],
    classes: ["service"],
    methods: ["rpc"],
    imports: ["import"],
    exports: [],
    variables: [],
    types: ["message", "enum"],
    interfaces: [],
  },
  extractors: {
    extractName: () => ["identifier"],
    extractModifiers: () => [],
    extractParameters: true,
    extractReturnType: true,
    extractReferences: true,
  },
};

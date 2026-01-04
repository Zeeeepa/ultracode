/**
 * TSX Language Configuration (extends TypeScript)
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";
import { TYPESCRIPT_CONFIG } from "./typescript.js";

export const TSX_CONFIG: LanguageConfig = {
  ...TYPESCRIPT_CONFIG,
  language: "tsx",
  extensions: ["tsx"],
  keywords: LANGUAGE_KEYWORDS.tsx,
  nodeTypes: {
    ...TYPESCRIPT_CONFIG.nodeTypes,
    functions: [...TYPESCRIPT_CONFIG.nodeTypes.functions, "jsx_element", "jsx_self_closing_element"],
  },
};

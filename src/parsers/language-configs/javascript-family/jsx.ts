/**
 * JSX Language Configuration (extends JavaScript)
 */

import { LANGUAGE_KEYWORDS } from "../shared/keywords.js";
import type { LanguageConfig } from "../shared/types.js";
import { JAVASCRIPT_CONFIG } from "./javascript.js";

export const JSX_CONFIG: LanguageConfig = {
  ...JAVASCRIPT_CONFIG,
  language: "jsx",
  extensions: ["jsx"],
  keywords: LANGUAGE_KEYWORDS.jsx,
  nodeTypes: {
    ...JAVASCRIPT_CONFIG.nodeTypes,
    functions: [...JAVASCRIPT_CONFIG.nodeTypes.functions, "jsx_element", "jsx_self_closing_element"],
  },
};

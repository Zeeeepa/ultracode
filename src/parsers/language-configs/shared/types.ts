/**
 * Language Configuration Type Definitions
 *
 * Core interfaces for language-specific parsing configurations.
 */

import type { SupportedLanguage } from "../../../types/parser.js";
import type { LANGUAGE_KEYWORDS } from "./keywords.js";

/**
 * Language configuration for parsing
 */
export interface LanguageConfig {
  language: SupportedLanguage;
  extensions: string[];
  keywords: (typeof LANGUAGE_KEYWORDS)[SupportedLanguage];
  nodeTypes: NodeTypeConfig;
  extractors: ExtractorConfig;
}

/**
 * Tree-sitter node types for each language construct
 */
export interface NodeTypeConfig {
  functions: string[];
  classes: string[];
  methods: string[];
  imports: string[];
  exports: string[];
  variables: string[];
  types: string[];
  interfaces: string[];
}

/**
 * Extraction patterns and rules
 */
export interface ExtractorConfig {
  extractName: (nodeType: string) => string[];
  extractModifiers: (nodeType: string) => string[];
  extractParameters: boolean;
  extractReturnType: boolean;
  extractReferences: boolean;
}

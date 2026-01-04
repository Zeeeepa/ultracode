/**
 * Java ANTLR Parser Types
 *
 * Type definitions for Java parsing context and location information.
 * Extracted from java-antlr-parser.ts for better modularity.
 */

import type { EntityRelationship, ParsedEntity } from "../../types/parser.js";

// =============================================================================
// PARSER CONTEXT
// =============================================================================

/**
 * Context passed through all parsing functions
 */
export interface ParserContext {
  filePath: string;
  packageName: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  currentClass: string | null;
  imports: Map<string, string>;
}

// =============================================================================
// LOCATION INFO
// =============================================================================

/**
 * Location information for AST nodes
 */
export type LocationInfo = {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
};

// =============================================================================
// HELPER FUNCTION TYPES
// =============================================================================

/**
 * Annotation information extracted from modifiers
 */
export interface AnnotationInfo {
  name: string;
  arguments?: string[];
}

/**
 * Inheritance information for classes/interfaces
 */
export interface InheritanceInfo {
  baseClasses: string[];
  interfaces: string[];
}

/**
 * Parameter information for methods/constructors
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  optional?: boolean;
}

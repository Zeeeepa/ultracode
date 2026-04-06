/**
 * JVM Shared Parser Types
 *
 * Unified type definitions shared between Java and Kotlin ANTLR parsers.
 * Language-specific extensions remain in java/types.ts and kotlin/types.ts.
 *
 * Identical interfaces: ParserContext, LocationInfo, AnnotationInfo,
 * InheritanceInfo, ParameterInfo, ExceptionInfo, ComplexityMetrics,
 * AntlrToken, AntlrContext, AntlrContextWithChildren.
 *
 * Unified interfaces (superset with optional language-specific fields):
 * CallInfo, BranchInfo, LoopInfo, ReturnInfo, ControlFlowInfo, DocParam, DocInfo.
 */

import type { EntityRelationship, ParsedEntity } from "../../types/parser.js";

// =============================================================================
// PARSER CONTEXT (100% identical)
// =============================================================================

export interface ParserContext {
  filePath: string;
  packageName: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  currentClass: string | null;
  imports: Map<string, string>;
}

// =============================================================================
// LOCATION INFO (100% identical)
// =============================================================================

export type LocationInfo = {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
};

// =============================================================================
// CALL EXTRACTION TYPES (unified — optional fields for Java/Kotlin specifics)
// =============================================================================

export interface CallInfo {
  /** Name of the called function/method */
  name: string;
  /** Target object for method calls (this, obj, ClassName) */
  target?: string;
  /** Location of the call */
  location: LocationInfo;
  /** Whether this is a constructor call (new) */
  isNew?: boolean;
  /** Number of arguments */
  argumentCount: number;
  /** Type arguments for generic calls */
  typeArguments?: string[];
  // Java-specific
  /** Whether this is a static call (Java) */
  isStatic?: boolean;
  /** Whether this is a super call (Java) */
  isSuper?: boolean;
  // Kotlin-specific
  /** Whether this is an await/suspend call (Kotlin) */
  isAwait?: boolean;
  /** Whether this is safe call ?. (Kotlin) */
  isSafeCall?: boolean;
  /** Whether this is an extension function call (Kotlin) */
  isExtensionCall?: boolean;
  /** Receiver type for extension functions (Kotlin) */
  receiverType?: string;
}

// =============================================================================
// ANNOTATION INFO (100% identical)
// =============================================================================

export interface AnnotationInfo {
  name: string;
  arguments?: string[] | undefined;
  isBuiltin?: boolean | undefined;
}

// =============================================================================
// INHERITANCE INFO (100% identical)
// =============================================================================

export interface InheritanceInfo {
  baseClasses: string[];
  interfaces: string[];
}

// =============================================================================
// PARAMETER INFO (100% identical)
// =============================================================================

export interface ParameterInfo {
  name: string;
  type?: string | undefined;
  optional?: boolean | undefined;
  defaultValue?: string | undefined;
  isVararg?: boolean | undefined;
}

// =============================================================================
// CONTROL FLOW TYPES (unified — superset of branch/loop types)
// =============================================================================

export interface BranchInfo {
  type:
    | "if"
    | "else"
    | "else-if"
    | "ternary"
    // Java-specific
    | "switch"
    | "case"
    | "default"
    // Kotlin-specific
    | "when"
    | "when-entry"
    | "elvis";
  condition?: string | undefined;
  location: LocationInfo;
}

export interface LoopInfo {
  type: "for" | "while" | "do-while" | "for-each"; // for-each: Java only
  location: LocationInfo;
}

export interface ExceptionInfo {
  type: "try" | "catch" | "finally" | "throw";
  catchType?: string | undefined;
  location: LocationInfo;
}

export interface ReturnInfo {
  location: LocationInfo;
  hasValue: boolean;
  /** Labeled return (Kotlin only, e.g. return@forEach) */
  label?: string | undefined;
}

export interface ControlFlowInfo {
  branches: BranchInfo[];
  loops: LoopInfo[];
  exceptions: ExceptionInfo[];
  returns: ReturnInfo[];
  /** Suspend/await points (Kotlin only) */
  awaits?: Array<{
    location: LocationInfo;
    expression: string;
  }>;
}

// =============================================================================
// DOCUMENTATION TYPES (unified DocParam + DocInfo)
// =============================================================================

export interface DocParam {
  name: string;
  type?: string | undefined;
  description?: string | undefined;
}

export interface DocInfo {
  description?: string | undefined;
  params?: DocParam[] | undefined;
  returns?:
    | {
        type?: string | undefined;
        description?: string | undefined;
      }
    | undefined;
  throws?:
    | Array<{
        type?: string | undefined;
        description?: string | undefined;
      }>
    | undefined;
  see?: string[] | undefined;
  since?: string | undefined;
  author?: string | undefined;
  deprecated?: string | boolean | undefined;
  // Java-specific
  version?: string | undefined;
  // Kotlin-specific
  property?:
    | Array<{
        name: string;
        description?: string | undefined;
      }>
    | undefined;
  receiver?: string | undefined;
  sample?: string[] | undefined;
  suppress?: string[] | undefined;
}

// =============================================================================
// COMPLEXITY METRICS (100% identical)
// =============================================================================

export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  linesOfCode: number;
  linesOfLogic: number;
  nestingDepth: number;
  parameterCount: number;
  returnCount: number;
}

// =============================================================================
// ANTLR CONTEXT TYPES (100% identical)
// =============================================================================

export interface AntlrToken {
  line?: number;
  column?: number;
  start?: number;
  stop?: number;
  text?: string;
}

export interface AntlrContext {
  start?: AntlrToken;
  stop?: AntlrToken;
  _start?: AntlrToken;
  _stop?: AntlrToken;
  getText?: () => string;
}

export interface AntlrContextWithChildren extends AntlrContext {
  children?: AntlrContext[];
  getChildCount?: () => number;
  getChild?: (i: number) => AntlrContext | null;
}

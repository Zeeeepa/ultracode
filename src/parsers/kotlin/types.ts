/**
 * Kotlin ANTLR Parser Types
 *
 * Type definitions for Kotlin parsing context and extracted information.
 * Provides shared types for all Kotlin parser modules.
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
// CALL EXTRACTION TYPES
// =============================================================================

/**
 * Information about a method/function call
 */
export interface CallInfo {
  /** Name of the called function/method */
  name: string;
  /** Target object for method calls (this, obj, ClassName) */
  target?: string;
  /** Location of the call */
  location: LocationInfo;
  /** Whether this is an await/suspend call */
  isAwait?: boolean;
  /** Whether this is safe call (?.) */
  isSafeCall?: boolean;
  /** Whether this is a constructor call */
  isNew?: boolean;
  /** Number of arguments */
  argumentCount: number;
  /** Type arguments for generic calls */
  typeArguments?: string[];
  /** Whether this is an extension function call */
  isExtensionCall?: boolean;
  /** Receiver type for extension functions */
  receiverType?: string;
}

// =============================================================================
// ANNOTATION INFO
// =============================================================================

/**
 * Annotation information extracted from modifiers
 */
export interface AnnotationInfo {
  name: string;
  arguments?: string[];
}

// =============================================================================
// INHERITANCE INFO
// =============================================================================

/**
 * Inheritance information for classes/interfaces
 */
export interface InheritanceInfo {
  baseClasses: string[];
  interfaces: string[];
}

// =============================================================================
// PARAMETER INFO
// =============================================================================

/**
 * Parameter information for functions/constructors
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
  isVararg?: boolean;
}

// =============================================================================
// CONTROL FLOW TYPES
// =============================================================================

/**
 * Branch information in control flow
 */
export interface BranchInfo {
  type: "if" | "else" | "else-if" | "when" | "when-entry" | "elvis" | "ternary";
  condition?: string;
  location: LocationInfo;
}

/**
 * Loop information in control flow
 */
export interface LoopInfo {
  type: "for" | "while" | "do-while";
  location: LocationInfo;
}

/**
 * Exception handling information
 */
export interface ExceptionInfo {
  type: "try" | "catch" | "finally" | "throw";
  catchType?: string;
  location: LocationInfo;
}

/**
 * Return statement information
 */
export interface ReturnInfo {
  location: LocationInfo;
  hasValue: boolean;
  label?: string; // For labeled returns
}

/**
 * Complete control flow structure
 */
export interface ControlFlowInfo {
  branches: BranchInfo[];
  loops: LoopInfo[];
  exceptions: ExceptionInfo[];
  returns: ReturnInfo[];
  awaits: Array<{
    location: LocationInfo;
    expression: string;
  }>;
}

// =============================================================================
// DOCUMENTATION TYPES (KDoc)
// =============================================================================

/**
 * KDoc parameter documentation
 */
export interface KDocParam {
  name: string;
  type?: string;
  description?: string;
}

/**
 * Parsed KDoc documentation
 */
export interface KDocInfo {
  description?: string;
  params?: KDocParam[];
  returns?: {
    type?: string;
    description?: string;
  };
  throws?: Array<{
    type?: string;
    description?: string;
  }>;
  property?: Array<{
    name: string;
    description?: string;
  }>;
  receiver?: string;
  sample?: string[];
  see?: string[];
  since?: string;
  author?: string;
  deprecated?: string | boolean;
  suppress?: string[];
}

// =============================================================================
// COROUTINE TYPES
// =============================================================================

/**
 * Coroutine-specific information
 */
export interface CoroutineInfo {
  isSuspend: boolean;
  hasLaunch?: boolean;
  hasAsync?: boolean;
  hasFlow?: boolean;
  hasWithContext?: boolean;
  dispatcherUsed?: string;
  scopeType?: "CoroutineScope" | "GlobalScope" | "viewModelScope" | "lifecycleScope" | "other";
}

// =============================================================================
// COMPLEXITY METRICS
// =============================================================================

/**
 * Code complexity metrics for a function/method
 */
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
// FRAMEWORK PATTERN TYPES
// =============================================================================

/**
 * Android ViewModel pattern info
 */
export interface ViewModelInfo {
  stateFlows: string[];
  liveData: string[];
  savedStateHandle?: boolean;
}

/**
 * Ktor routing pattern info
 */
export interface KtorRouteInfo {
  method: "get" | "post" | "put" | "delete" | "patch" | "head" | "options";
  path: string;
  location: LocationInfo;
}

// =============================================================================
// ANTLR CONTEXT TYPES
// =============================================================================

/**
 * ANTLR Token interface
 */
export interface AntlrToken {
  line?: number;
  column?: number;
  start?: number;
  stop?: number;
  text?: string;
}

/**
 * Generic ANTLR context with location info
 */
export interface AntlrContext {
  start?: AntlrToken;
  stop?: AntlrToken;
  _start?: AntlrToken;
  _stop?: AntlrToken;
  getText?: () => string;
}

/**
 * ANTLR context with children
 */
export interface AntlrContextWithChildren extends AntlrContext {
  children?: AntlrContext[];
  getChildCount?: () => number;
  getChild?: (i: number) => AntlrContext | null;
}

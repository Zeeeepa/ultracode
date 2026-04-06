/**
 * Kotlin ANTLR Parser Types
 *
 * Re-exports shared JVM types + Kotlin-specific type definitions.
 */

import type { LocationInfo } from "../jvm/shared-types.js";

// Re-export all shared JVM types
// Kotlin-specific type aliases for backward compatibility
export type {
  AnnotationInfo,
  AntlrContext,
  AntlrContextWithChildren,
  AntlrToken,
  BranchInfo,
  CallInfo,
  ComplexityMetrics,
  ControlFlowInfo,
  DocInfo,
  DocInfo as KDocInfo,
  DocParam,
  DocParam as KDocParam,
  ExceptionInfo,
  InheritanceInfo,
  LocationInfo,
  LoopInfo,
  ParameterInfo,
  ParserContext,
  ReturnInfo,
} from "../jvm/shared-types.js";

// =============================================================================
// KOTLIN-SPECIFIC TYPES (not shared with Java)
// =============================================================================

/**
 * Coroutine-specific information
 */
export interface CoroutineInfo {
  isSuspend: boolean;
  hasLaunch?: boolean | undefined;
  hasAsync?: boolean | undefined;
  hasFlow?: boolean | undefined;
  hasWithContext?: boolean | undefined;
  dispatcherUsed?: string | undefined;
  scopeType?: "CoroutineScope" | "GlobalScope" | "viewModelScope" | "lifecycleScope" | "other" | undefined;
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
  savedStateHandle?: boolean | undefined;
}

/**
 * Ktor routing pattern info
 */
export interface KtorRouteInfo {
  method: "get" | "post" | "put" | "delete" | "patch" | "head" | "options";
  path: string;
  location: LocationInfo;
}

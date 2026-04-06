/**
 * Java ANTLR Parser Types
 *
 * Re-exports shared JVM types + Java-specific type definitions.
 */

// Re-export all shared JVM types
// Java-specific type aliases for backward compatibility
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
  DocInfo as JavaDocInfo,
  DocParam,
  DocParam as JavaDocParam,
  ExceptionInfo,
  InheritanceInfo,
  LocationInfo,
  LoopInfo,
  ParameterInfo,
  ParserContext,
  ReturnInfo,
} from "../jvm/shared-types.js";

// =============================================================================
// FRAMEWORK PATTERN TYPES
// =============================================================================

/**
 * Spring annotation information
 */
export interface SpringAnnotationInfo {
  type: "controller" | "service" | "repository" | "component" | "configuration" | "bean";
  path?: string | undefined;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | undefined;
  qualifiers?: string[] | undefined;
}

/**
 * JPA entity information
 */
export interface JpaEntityInfo {
  tableName?: string | undefined;
  relationships: Array<{
    type: "OneToMany" | "ManyToOne" | "OneToOne" | "ManyToMany";
    targetEntity?: string | undefined;
    mappedBy?: string | undefined;
  }>;
  isEntity: boolean;
}

/**
 * Lombok annotation information
 */
export interface LombokInfo {
  hasData?: boolean | undefined;
  hasBuilder?: boolean | undefined;
  hasGetter?: boolean | undefined;
  hasSetter?: boolean | undefined;
  hasSlf4j?: boolean | undefined;
  hasAllArgsConstructor?: boolean | undefined;
  hasNoArgsConstructor?: boolean | undefined;
}

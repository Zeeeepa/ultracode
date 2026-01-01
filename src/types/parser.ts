/**
 * TASK-003B: Enhanced Parser Agent Type Definitions
 *
 * Type definitions for native language parsers.
 * Provides interfaces for parsing, entity extraction, and incremental processing.
 * Enhanced for TASK-003B with advanced Python language support across 4 layers.
 *
 * Architecture References:
 * - Agent Types: src/types/agent.ts
 * - Base Agent: src/agents/base.ts
 * - Python Analyzer: src/parsers/python-analyzer.ts
 * - TypeScript Parser: src/parsers/typescript-parser.ts
 * - Unified Parser: src/parsers/unified-parser.ts
 */

// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import type { AgentTask } from "./agent.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
export const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "c",
  "cpp",
  "rust",
  "go",
  "java",
  "kotlin",
  "swift",
  "css",
  "html",
  "xml",
  "bash",
  "powershell",
  "batch",
  "json",
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================

/**
 * Magic method types for Python special methods
 */
export type MagicType =
  | "init"
  | "new"
  | "del"
  | "str"
  | "repr"
  | "format"
  | "bytes"
  | "hash"
  | "bool"
  | "call"
  | "len"
  | "getitem"
  | "setitem"
  | "delitem"
  | "contains"
  | "iter"
  | "next"
  | "reversed"
  | "enter"
  | "exit"
  | "aenter"
  | "aexit"
  | "eq"
  | "ne"
  | "lt"
  | "le"
  | "gt"
  | "ge"
  | "add"
  | "sub"
  | "mul"
  | "truediv"
  | "floordiv"
  | "mod"
  | "pow"
  | "and"
  | "or"
  | "xor"
  | "lshift"
  | "rshift"
  | "invert";

/**
 * Represents a parsed entity from the source code
 */
export interface ParsedEntity {
  /** Unique identifier for the entity */
  id?: string | undefined; // Optional for backward compatibility

  /** Optional alias (some parsers might use path) */
  path?: string | undefined;
  /** Optional signature for functions/methods */
  signature?: string | undefined;
  /** Entity name (function name, class name, etc.) */
  name: string;

  type:
    | "event"
    | "function"
    | "class"
    | "method"
    | "interface"
    | "type"
    | "import"
    | "export"
    | "variable"
    | "constant"
    | "property"
    | "magic_method"
    | "async_function"
    | "generator"
    | "lambda"
    | "decorator"
    | "context_manager"
    | "dataclass"
    | "namedtuple"
    | "enum"
    | "protocol"
    | "abstract_method"
    | "class_method"
    | "static_method"
    | "module"
    | "typedef"
    | "struct"
    | "trait"
    | "macro"
    | "enum_variant"
    | "field"
    | "impl_block"
    | "union"
    | "crate"
    | "ngrx_effect"
    | "ngrx_action"
    | "ngrx_reducer"
    | "ngrx_selector";

  /** File path containing this entity */
  filePath?: string | undefined; // Optional for backward compatibility

  /** Source location */
  location: {
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };

  /** Detected language (optional) */
  language?: string | undefined;

  /** Child entities (e.g., methods in a class) */
  children?: ParsedEntity[] | undefined;

  /** References to other entities */
  references?: string[];

  /** Modifiers (e.g., async, static, private) - enhanced for Python */
  modifiers?: string[];

  /** Python-specific method classification */
  methodType?: "instance" | "class" | "static" | "property" | "abstract" | "magic";

  /** Decorator information for Python entities */
  decorators?: Array<{
    name: string;
    arguments?: string[];
    isBuiltin?: boolean;
  }>;

  /** Inheritance information for classes */
  inheritance?: {
    baseClasses: string[];
    mro?: string[]; // Method Resolution Order
    isAbstract?: boolean;
    interfaces?: string[];
  };

  /** Async/generator patterns */
  asyncInfo?: {
    isAsync?: boolean;
    isGenerator?: boolean;
    isAsyncGenerator?: boolean;
    yieldsFrom?: string[];

    awaitCount?: number;
    yieldCount?: number;
    generatorType?: "delegating" | "simple";
    asyncPatterns?: string[];
  };

  pythonInfo?: {
    magicMethodType?: MagicType | "other";
    decorators?: Array<{
      name: string;
      module?: string;
      arguments?: string[];
      line?: number | undefined;
    }>;
    isProperty?: boolean;
    hasGetter?: boolean;
    hasSetter?: boolean;
    isDataclass?: boolean;
    specialClassType?: "dataclass" | "enum" | "namedtuple" | "protocol" | "abstract";
  };

  /** Return type for functions/methods */
  returnType?: string | undefined;

  /** Parameters for functions/methods */
  parameters?: Array<{
    name: string;
    type?: string | undefined;
    optional?: boolean;
    defaultValue?: string | undefined;
  }>;

  /** Import/export specific data - enhanced for Python */
  importData?: {
    source: string;
    specifiers: Array<{ local: string; imported?: string | undefined; alias?: string }>;
    isDefault?: boolean;
    isNamespace?: boolean;
    isRelative?: boolean;
    fromModule?: string | undefined;
  };

  /** Pattern recognition data for Layer 4 */
  patterns?: {
    isContextManager?: boolean;
    exceptionHandling?: {
      hasTryExcept?: boolean;
      exceptTypes?: string[];
      hasFinally?: boolean;
    };
    designPatterns?: string[]; // e.g., ['singleton', 'observer', 'factory']
    pythonIdioms?: string[]; // e.g., ['comprehension', 'with_statement', 'duck_typing']
  };

  /** Relationship data for Layer 3 */
  relationships?: Array<{
    type: "inherits" | "implements" | "overrides" | "calls" | "imports" | "decorates" | "contains";
    target: string;
    targetFile?: string;
    metadata?: Record<string, any>;
  }>;

  // ==========================================================================
  // ENHANCED PARSING DATA (Phase 1-7)
  // ==========================================================================

  /**
   * Call Graph - all function/method calls within this entity
   * Phase 1: Call Graph extraction
   */
  calls?: Array<{
    /** Name of the called function/method */
    name: string;
    /** Target object for method calls (this, obj, ClassName) */
    target?: string | undefined;
    /** Location of the call */
    location: {
      start: { line: number; column: number; index: number };
      end: { line: number; column: number; index: number };
    };
    /** Whether this is an await call */
    isAwait?: boolean;
    /** Whether this is optional chaining (obj?.method()) */
    isOptional?: boolean;
    /** Whether this is a constructor call (new Foo()) */
    isNew?: boolean;
    /** Number of arguments */
    argumentCount: number;
    /** Type arguments for generic calls */
    typeArguments?: string[];
  }>;

  /**
   * Control Flow structure within this entity
   * Phase 2: Control Flow extraction
   */
  controlFlow?: {
    /** Conditional branches */
    branches: Array<{
      type: "if" | "else" | "else-if" | "switch" | "case" | "default" | "ternary";
      condition?: string | undefined;
      location: {
        start: { line: number; column: number; index: number };
        end: { line: number; column: number; index: number };
      };
    }>;
    /** Loop constructs */
    loops: Array<{
      type: "for" | "for-of" | "for-in" | "while" | "do-while";
      location: {
        start: { line: number; column: number; index: number };
        end: { line: number; column: number; index: number };
      };
    }>;
    /** Exception handling */
    exceptions: Array<{
      type: "try" | "catch" | "finally" | "throw";
      catchType?: string | undefined;
      location: {
        start: { line: number; column: number; index: number };
        end: { line: number; column: number; index: number };
      };
    }>;
    /** Return statements */
    returns: Array<{
      location: {
        start: { line: number; column: number; index: number };
        end: { line: number; column: number; index: number };
      };
      hasValue: boolean;
    }>;
    /** Await expressions */
    awaits: Array<{
      location: {
        start: { line: number; column: number; index: number };
        end: { line: number; column: number; index: number };
      };
      expression: string;
    }>;
  };

  /**
   * Structured documentation (JSDoc/docstring)
   * Phase 3: Documentation extraction
   */
  documentation?: {
    /** Main description */
    description?: string | undefined;
    /** Parameter documentation */
    params?: Array<{
      name: string;
      type?: string | undefined;
      description?: string | undefined;
      optional?: boolean;
    }>;
    /** Return value documentation */
    returns?: {
      type?: string | undefined;
      description?: string | undefined;
    };
    /** Thrown exceptions */
    throws?: Array<{
      type?: string | undefined;
      description?: string | undefined;
    }>;
    /** Usage examples */
    examples?: string[];
    /** Deprecation notice */
    deprecated?: string | boolean;
    /** Related items */
    see?: string[];
    /** Version info */
    since?: string | undefined;
    /** Author info */
    author?: string;
  };

  /**
   * Type references used by this entity
   * Phase 4: Type References
   */
  typeReferences?: Array<{
    /** Referenced type name */
    name: string;
    /** How it's used */
    kind: "parameter" | "return" | "variable" | "property" | "generic" | "extends" | "implements";
    /** Location of the reference */
    location: {
      start: { line: number; column: number; index: number };
      end: { line: number; column: number; index: number };
    };
  }>;

  /**
   * Code complexity metrics
   * Phase 5: Complexity Metrics
   */
  complexity?: {
    /** Cyclomatic complexity (number of paths) */
    cyclomatic: number;
    /** Cognitive complexity (understanding difficulty) */
    cognitive: number;
    /** Lines of code */
    linesOfCode: number;
    /** Lines of logic (excluding blanks/comments) */
    linesOfLogic: number;
    /** Maximum nesting depth */
    nestingDepth: number;
    /** Number of parameters */
    parameterCount: number;
    /** Number of return statements */
    returnCount: number;
  };

  /**
   * Generic type parameters
   * Phase 6: Generics
   */
  typeParameters?: Array<{
    /** Type parameter name (T, K, V) */
    name: string;
    /** Constraint (extends SomeType) */
    constraint?: string;
    /** Default type */
    default?: string;
  }>;

  /**
   * Side effects detection
   * Phase 7: Side Effects
   */
  sideEffects?: {
    /** Whether this entity has side effects */
    hasSideEffects: boolean;
    /** Types of side effects detected */
    types: Array<"io" | "network" | "storage" | "dom" | "global" | "state">;
    /** Detailed side effect locations */
    details: Array<{
      type: "io" | "network" | "storage" | "dom" | "global" | "state";
      expression: string;
      location: {
        start: { line: number; column: number; index: number };
        end: { line: number; column: number; index: number };
      };
    }>;
  };

  /** Generic metadata for language-specific properties */
  metadata?: Record<string, any>;

  // ==========================================================================
  // EMBEDDING DATA (generated by parsing subprocess workers)
  // ==========================================================================

  /**
   * Pre-computed embedding vector for semantic search.
   * Generated by subprocess workers to offload work from main process.
   * Uses base64-encoded Float32Array for efficient IPC transfer.
   */
  embeddingBase64?: string;

  /**
   * Text used for embedding generation.
   * Stored for debugging and potential re-generation.
   * Contains: name, type, signature, code snippet, comments.
   */
  embeddingText?: string;
}

/**
 * Result of parsing a file
 */
export interface ParseResult {
  /** File path */
  filePath: string;

  /** Language detected */
  language: SupportedLanguage;

  /** Extracted entities */
  entities: ParsedEntity[];

  /** Relationship graph for Layer 3 analysis */
  relationships?: EntityRelationship[] | undefined;

  /** Pattern analysis results for Layer 4 */
  patterns?: PatternAnalysis;

  /** File content hash for caching */
  contentHash: string;

  /** Parsing timestamp */
  timestamp: number;

  /** Parse time in milliseconds */
  parseTimeMs: number;

  /** Whether this was from cache */
  fromCache?: boolean;

  /** Any parsing errors */
  errors?: Array<{
    message: string;
    location?: { line: number; column: number };
  }>;
}

/**
 * Represents a file change for incremental parsing
 */
export interface FileChange {
  /** File path */
  filePath: string;

  /** Type of change */
  changeType: "created" | "modified" | "deleted";

  /** New content (for created/modified) */
  content?: string | undefined;

  /** Previous content hash (for modified) */
  previousHash?: string;

  /** Edit information for incremental parsing */
  edits?: Array<{
    startIndex: number;
    oldEndIndex: number;
    newEndIndex: number;
    startPosition: { row: number; column: number };
    oldEndPosition: { row: number; column: number };
    newEndPosition: { row: number; column: number };
  }>;
}

/**
 * Parser task specific to the Parser Agent
 */
export interface ParserTask extends AgentTask {
  type: "parse:file" | "parse:batch" | "parse:incremental";
  payload: {
    files?: string[];
    changes?: FileChange[];
    options?: ParserOptions | undefined;
  };
}

/**
 * Options for parsing operations
 */
export interface ParserOptions {
  /** Use cache for unchanged files */
  useCache?: boolean;

  /** Extract references between entities */
  extractReferences?: boolean;

  /** Extract inheritance hierarchies (Layer 3) */
  extractInheritance?: boolean;

  /** Extract method overrides (Layer 3) */
  extractOverrides?: boolean;

  /** Detect design patterns (Layer 4) */
  detectPatterns?: boolean;

  /** Analyze async/await patterns (Layer 2) */
  analyzeAsync?: boolean;

  /** Extract magic methods (Layer 2) */
  extractMagicMethods?: boolean;

  /** Include source code snippets */
  includeSourceSnippets?: boolean;

  /** Maximum depth for nested entities */
  maxDepth?: number | undefined;

  /** Batch size for parallel processing */
  batchSize?: number | undefined;

  /** Timeout per file in milliseconds */
  timeoutMs?: number | undefined;
}

/**
 * Cache entry for parsed results
 */
export interface CacheEntry {
  /** File content hash */
  hash: string;

  /** Parsed result */
  result: ParseResult;

  /** Cache timestamp */
  cachedAt: number;

  /** Size in bytes */
  size: number;
}

/**
 * Statistics for parser performance
 */
export interface ParserStats {
  /** Total files parsed */
  filesParsed: number;

  /** Cache hits */
  cacheHits: number;

  /** Cache misses */
  cacheMisses: number;

  /** Average parse time */
  avgParseTimeMs: number;

  /** Total parse time */
  totalParseTimeMs: number;

  /** Files per second throughput */
  throughput: number;

  /** Memory used by cache */
  cacheMemoryMB: number;

  /** Errors encountered */
  errorCount: number;
}

/**
 * AST Node interface (generic, works with any parser)
 * Used for interoperability between different parser implementations.
 */
export interface ASTNode {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  text: string;
  children: ASTNode[];
  namedChildren: ASTNode[];
  childCount: number;
  namedChildCount: number;
  parent: ASTNode | null;
  nextSibling: ASTNode | null;
  previousSibling: ASTNode | null;

  // Methods for tree-sitter compatibility (required for analyzers)
  child(index: number): ASTNode | null;
  namedChild(index: number): ASTNode | null;
  childForFieldName(fieldName: string): ASTNode | null;
  firstChild: ASTNode | null;
  lastChild: ASTNode | null;
  firstNamedChild: ASTNode | null;
  lastNamedChild: ASTNode | null;
  descendantForPosition(position: { row: number; column: number }): ASTNode;
  descendantsOfType(type: string): ASTNode[];
}

/**
 * @deprecated Use ASTNode instead. Kept for backward compatibility with analyzers.
 */
export type TreeSitterNode = ASTNode;

/**
 * @deprecated Use standard tree traversal. Kept for backward compatibility.
 */
export interface TreeSitterTree {
  rootNode: ASTNode;
  edit?(edit: TreeSitterEdit): void;
  walk?(): TreeSitterCursor;
}

/**
 * @deprecated Kept for backward compatibility with incremental parsing.
 */
export interface TreeSitterEdit {
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
  startPosition: { row: number; column: number };
  oldEndPosition: { row: number; column: number };
  newEndPosition: { row: number; column: number };
}

/**
 * @deprecated Kept for backward compatibility.
 */
export interface TreeSitterCursor {
  nodeType: string;
  nodeText: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  currentNode(): ASTNode;
  gotoFirstChild(): boolean;
  gotoNextSibling(): boolean;
  gotoParent(): boolean;
}

// =============================================================================
// TASK-003B: ENHANCED PYTHON TYPE DEFINITIONS
// =============================================================================

/**
 * Entity relationship for Layer 3 relationship mapping
 */
export interface EntityRelationship {
  /** Source entity name */
  from: string;

  /** Target entity name */
  to: string;

  /** Relationship type */
  type:
    | "inherits"
    | "implements"
    | "overrides"
    | "calls"
    | "imports"
    | "decorates"
    | "contains"
    | "references"
    | "embeds"
    | "member_of"
    // NgRx-specific relationships (legacy names)
    | "listens_to" // Effect listens to action via ofType()
    | "dispatches" // Effect/Component dispatches action
    | "reduces" // Reducer handles action
    | "selects" // Component/Effect uses selector
    // NgRx-specific relationships (new RelationType names)
    | "dispatches_action" // Component/Effect → Action
    | "listens_to_action" // Effect → Action (ofType)
    | "handles_action" // Reducer → Action (on)
    | "selects_state" // Component → Selector
    | "modifies_state" // Reducer → State slice
    | "depends_on"; // General dependency

  /** Source file path */
  sourceFile?: string;

  /** Target file path (for cross-file relationships) */
  targetFile?: string;

  /** Additional metadata */
  metadata?: {
    line?: number | undefined;
    confidence?: number;
    isDirectRelation?: boolean;
    mroPosition?: number; // For inheritance MRO
    [key: string]: any;
  };
}

/**
 * Pattern analysis results for Layer 4
 */
export interface PatternAnalysis {
  /** Context manager patterns detected */
  contextManagers: Array<{
    entity: string;
    type: "class_based" | "function_based" | "async";
    methods: string[]; // __enter__, __exit__, __aenter__, __aexit__
  }>;

  /** Exception handling patterns */
  exceptionHandling: Array<{
    location: { line: number; column: number };
    type: "try_except" | "try_finally" | "try_except_finally";
    exceptTypes: string[];
    hasElse?: boolean;
    hasFinally?: boolean;
  }>;

  /** Design patterns detected */
  designPatterns: Array<{
    pattern: "singleton" | "observer" | "factory" | "builder" | "strategy" | "decorator" | "iterator";
    entities: string[];
    confidence: number;
    description: string;
  }>;

  /** Python idioms detected */
  pythonIdioms: Array<{
    idiom: "list_comprehension" | "dict_comprehension" | "generator_expression" | "context_manager" | "duck_typing";
    locations: Array<{ line: number; column: number }>;
    usage: string;
  }>;

  /** Circular dependencies detected */
  circularDependencies: Array<{
    cycle: string[]; // List of files/modules in the cycle
    type: "import" | "inheritance" | "reference";
    severity: "warning" | "error";
  }>;

  otherPatterns?: Array<{
    kind: string;
    entities?: string[];
    confidence?: number;
    description?: string | undefined;
    locations?: Array<{ line: number; column: number }>;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Python-specific analysis configuration
 */
export interface PythonAnalysisConfig {
  /** Enable Layer 1: Enhanced basic parsing */
  enhancedBasicParsing: boolean;

  /** Enable Layer 2: Advanced feature analysis */
  advancedFeatureAnalysis: boolean;

  /** Enable Layer 3: Relationship mapping */
  relationshipMapping: boolean;

  /** Enable Layer 4: Pattern recognition */
  patternRecognition: boolean;

  /** Extract all magic methods */
  extractAllMagicMethods: boolean;

  /** Analyze property decorators */
  analyzePropertyDecorators: boolean;

  /** Build inheritance hierarchies */
  buildInheritanceHierarchies: boolean;

  /** Detect circular dependencies */
  detectCircularDependencies: boolean;

  /** Pattern detection thresholds */
  patternConfidenceThreshold: number;
}

/**
 * Enhanced Python method information
 */
export interface PythonMethodInfo {
  /** Method classification */
  classification: "instance" | "class" | "static" | "property" | "abstract" | "magic";

  /** Is this method async */
  isAsync: boolean;

  /** Is this a generator method */
  isGenerator: boolean;

  /** Decorator stack */
  decorators: Array<{
    name: string;
    module?: string;
    arguments?: string[];
    line: number;
  }>;

  /** Magic method type (if applicable) */
  magicType?: MagicType | undefined;

  /** Property information (if property) */
  propertyInfo?: {
    hasGetter: boolean;
    hasSetter: boolean;
    hasDeleter: boolean;
    getterName?: string;
    setterName?: string;
    deleterName?: string;
  };

  /** Override information */
  overrideInfo?: {
    overrides: string; // Parent method being overridden
    parentClass: string;
    callsSuper: boolean;
    changeSignature: boolean;
  };

  location?: {
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };
}

/**
 * Enhanced Python class information
 */
export interface PythonClassInfo {
  /** Class type */
  classType: "regular" | "abstract" | "dataclass" | "namedtuple" | "enum" | "protocol";

  /** Base classes */
  baseClasses: string[];

  /** Method Resolution Order */
  mro: string[];

  /** Abstract methods that need implementation */
  abstractMethods: string[];

  /** Magic methods implemented */
  magicMethods: string[];

  /** Properties defined */
  properties: Array<{
    name: string;
    hasGetter: boolean;
    hasSetter: boolean;
    hasDeleter: boolean;
  }>;

  /** Metaclass information */
  metaclass?: string;

  /** Decorator information */
  classDecorators: Array<{
    name: string;
    arguments?: string[];
  }>;

  methods: string[];

  decorators?: string[];

  location?: {
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };

  methodResolutionOrder?: string[];
}

/**
 * Import dependency information for Layer 3
 */
export interface ImportDependency {
  /** Source file */
  sourceFile: string;

  /** Target module/file */
  targetModule: string;

  /** Import type */
  importType: "absolute" | "relative" | "conditional" | "dynamic";

  /** Imported symbols */
  symbols: Array<{
    name: string;
    alias?: string | undefined;
    isDefault?: boolean;
  }>;

  /** Line number of import */
  line: number;

  /** Is this import used */
  isUsed: boolean;

  /** Usage locations */
  usageLocations: Array<{ line: number; column: number; context: string }>;

  module?: string;

  imported?: string | undefined;

  alias?: string | undefined;

  isLocal?: boolean;

  metadata?: Record<string, any>;

  type?: "import" | "from_import" | "use" | "extern_crate";
}

/**
 * Performance metrics for enhanced Python parsing
 */
export interface PythonParserMetrics {
  /** Layer 1 metrics */
  basicParsing: {
    methodsClassified: number;
    typeHintsProcessed: number;
    decoratorsExtracted: number;
    parseTimeMs: number;
  };

  /** Layer 2 metrics */
  advancedFeatures: {
    magicMethodsFound: number;
    propertiesAnalyzed: number;
    asyncPatternsDetected: number;
    generatorsFound: number;
    dataclassesProcessed: number;
    analysisTimeMs: number;
  };

  /** Layer 3 metrics */
  relationshipMapping: {
    inheritanceHierarchiesBuilt: number;
    methodOverridesDetected: number;
    crossFileReferencesResolved: number;
    circularDependenciesFound: number;
    mappingTimeMs: number;

    timeMs?: number;
    inheritanceRelationships?: number;
    methodOverrides?: number;
    importDependencies?: number;
    crossReferences?: number;
    mroCalculations?: number;
  };

  /** Layer 4 metrics */
  patternRecognition: {
    contextManagersDetected: number;
    exceptionPatternsFound: number;
    designPatternsIdentified: number;
    pythonIdiomsDetected: number;
    recognitionTimeMs: number;

    timeMs?: number;
    totalPatternsFound?: number;
  };

  /** Overall metrics */
  overall: {
    totalEntities: number;
    totalRelationships: number;
    totalPatterns: number;
    totalTimeMs: number;
    memoryUsedMB: number;
  };
}

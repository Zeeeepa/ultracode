/**
 * Parser system types: entity extraction, relationships, caching,
 * pattern detection, and incremental file parsing.
 */

export type {
  ASTNode,
  TreeSitterCursor,
  TreeSitterEdit,
  TreeSitterNode,
  TreeSitterTree,
} from "./parser-ast-types.js";

export type {
  ImportDependency,
  MagicType,
  PythonAnalysisConfig,
  PythonClassInfo,
  PythonMethodInfo,
  PythonParserMetrics,
} from "./parser-python-types.js";

import type { AgentTask } from "./agent.js";
import type { MagicType } from "./parser-python-types.js";

// -- Language constants -----------------------------------------------------

export const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "c",
  "cpp",
  "csharp",
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
  "zig",
  "helm",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// -- Source location --------------------------------------------------------

interface SourcePosition {
  line: number;
  column: number;
  index: number;
}

interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

// -- Relationship types -----------------------------------------------------

export type RelationshipKind =
  | "inherits"
  | "implements"
  | "overrides"
  | "calls"
  | "imports"
  | "decorates"
  | "contains"
  | "member_of"
  | "depends_on"
  | "produces_api"
  | "consumes_api"
  | "generated_from";

export type ExtendedRelationshipKind =
  | RelationshipKind
  | "references"
  | "embeds"
  | "listens_to"
  | "dispatches"
  | "reduces"
  | "selects"
  | "dispatches_action"
  | "listens_to_action"
  | "handles_action"
  | "selects_state"
  | "modifies_state"
  | "defines_class"
  | "defines_function"
  | "has_method";

// -- Entity types -----------------------------------------------------------

export type EntityKind =
  | "function"
  | "async_function"
  | "method"
  | "abstract_method"
  | "class_method"
  | "static_method"
  | "constructor"
  | "lambda"
  | "generator"
  | "class"
  | "interface"
  | "type"
  | "struct"
  | "enum"
  | "enum_variant"
  | "record"
  | "protocol"
  | "trait"
  | "impl_block"
  | "union"
  | "dataclass"
  | "namedtuple"
  | "property"
  | "field"
  | "variable"
  | "constant"
  | "typedef"
  | "module"
  | "import"
  | "export"
  | "crate"
  | "namespace"
  | "file"
  | "magic_method"
  | "decorator"
  | "context_manager"
  | "actor"
  | "extension"
  | "delegate"
  | "event"
  | "macro"
  | "ngrx_effect"
  | "ngrx_action"
  | "ngrx_reducer"
  | "ngrx_selector";

export type SideEffectCategory = "io" | "network" | "storage" | "dom" | "global" | "state";

// -- ParsedEntity -----------------------------------------------------------

export interface ParsedEntity {
  name: string;
  type: EntityKind;
  location: SourceSpan;

  id?: string;
  path?: string;
  signature?: string;
  filePath?: string;
  language?: string;
  children?: ParsedEntity[];

  references?: string[];
  relationships?: Array<{
    type: RelationshipKind;
    target: string;
    targetFile?: string;
    metadata?: Record<string, any>;
  }>;

  modifiers?: string[];
  decorators?: Array<{
    name: string;
    arguments?: string[];
    isBuiltin?: boolean;
  }>;

  returnType?: string;
  parameters?: Array<{
    name: string;
    type?: string;
    optional?: boolean;
    defaultValue?: string;
  }>;
  methodType?: "instance" | "class" | "static" | "property" | "abstract" | "magic";

  inheritance?: {
    baseClasses: string[];
    interfaces?: string[];
    mro?: string[];
    isAbstract?: boolean;
  };

  asyncInfo?: {
    isAsync?: boolean;
    isGenerator?: boolean;
    isAsyncGenerator?: boolean;
    yieldsFrom?: string[];
    awaitCount?: number;
    yieldCount?: number;
    generatorType?: "simple" | "delegating";
    asyncPatterns?: string[];
  };

  importData?: {
    source: string;
    specifiers: Array<{
      local: string;
      imported?: string;
      alias?: string;
    }>;
    isDefault?: boolean;
    isNamespace?: boolean;
    isRelative?: boolean;
    fromModule?: string;
  };

  pythonInfo?: {
    magicMethodType?: MagicType | "other";
    decorators?: Array<{
      name: string;
      module?: string;
      arguments?: string[];
      line?: number;
    }>;
    isProperty?: boolean;
    hasGetter?: boolean;
    hasSetter?: boolean;
    isDataclass?: boolean;
    specialClassType?: "dataclass" | "enum" | "namedtuple" | "protocol" | "abstract";
  };

  patterns?: {
    isContextManager?: boolean;
    exceptionHandling?: {
      hasTryExcept?: boolean;
      exceptTypes?: string[];
      hasFinally?: boolean;
    };
    designPatterns?: string[];
    pythonIdioms?: string[];
  };

  calls?: Array<{
    name: string;
    argumentCount: number;
    location: SourceSpan;
    target?: string;
    isAwait?: boolean;
    isOptional?: boolean;
    isNew?: boolean;
    typeArguments?: string[];
  }>;

  controlFlow?: {
    branches: Array<{
      type: "if" | "else" | "else-if" | "switch" | "case" | "default" | "ternary";
      condition?: string;
      location: SourceSpan;
    }>;
    loops: Array<{
      type: "for" | "for-of" | "for-in" | "while" | "do-while";
      location: SourceSpan;
    }>;
    exceptions: Array<{
      type: "try" | "catch" | "finally" | "throw";
      catchType?: string;
      location: SourceSpan;
    }>;
    returns: Array<{
      hasValue: boolean;
      location: SourceSpan;
    }>;
    awaits: Array<{
      expression: string;
      location: SourceSpan;
    }>;
  };

  documentation?: {
    description?: string;
    params?: Array<{
      name: string;
      type?: string;
      description?: string;
      optional?: boolean;
    }>;
    returns?: {
      type?: string;
      description?: string;
    };
    throws?: Array<{
      type?: string;
      description?: string;
    }>;
    examples?: string[];
    deprecated?: string | boolean;
    see?: string[];
    since?: string;
    author?: string;
  };

  typeReferences?: Array<{
    name: string;
    kind: "parameter" | "return" | "variable" | "property" | "generic" | "extends" | "implements";
    location: SourceSpan;
  }>;

  complexity?: {
    cyclomatic: number;
    cognitive: number;
    linesOfCode: number;
    linesOfLogic: number;
    nestingDepth: number;
    parameterCount: number;
    returnCount: number;
  };

  typeParameters?: Array<{
    name: string;
    constraint?: string;
    default?: string;
  }>;

  sideEffects?: {
    hasSideEffects: boolean;
    types: SideEffectCategory[];
    details: Array<{
      type: SideEffectCategory;
      expression: string;
      location: SourceSpan;
    }>;
  };

  embeddingBase64?: string;
  embeddingText?: string;
  metadata?: Record<string, any>;
}

// -- Parse results ----------------------------------------------------------

export interface ParseResult {
  filePath: string;
  language: SupportedLanguage;
  entities: ParsedEntity[];
  contentHash: string;
  timestamp: number;
  parseTimeMs: number;
  fromCache?: boolean;
  relationships?: EntityRelationship[];
  patterns?: PatternAnalysis;
  errors?: Array<{
    message: string;
    location?: { line: number; column: number };
  }>;
}

export interface CacheEntry {
  hash: string;
  result: ParseResult;
  cachedAt: number;
  size: number;
}

// -- Incremental parsing ----------------------------------------------------

export interface FileChange {
  filePath: string;
  changeType: "created" | "modified" | "deleted";
  content?: string;
  previousHash?: string;
  edits?: Array<{
    startIndex: number;
    oldEndIndex: number;
    newEndIndex: number;
    startPosition: { row: number; column: number };
    oldEndPosition: { row: number; column: number };
    newEndPosition: { row: number; column: number };
  }>;
}

// -- Parser task & options --------------------------------------------------

export interface ParserTask extends AgentTask {
  type: "parse:file" | "parse:batch" | "parse:incremental";
  payload: {
    files?: string[];
    changes?: FileChange[];
    options?: ParserOptions;
  };
}

export interface ParserOptions {
  useCache?: boolean;
  extractReferences?: boolean;
  extractInheritance?: boolean;
  extractOverrides?: boolean;
  detectPatterns?: boolean;
  analyzeAsync?: boolean;
  extractMagicMethods?: boolean;
  includeSourceSnippets?: boolean;
  maxDepth?: number;
  batchSize?: number;
  timeoutMs?: number;
}

// -- Performance stats ------------------------------------------------------

export interface ParserStats {
  filesParsed: number;
  cacheHits: number;
  cacheMisses: number;
  avgParseTimeMs: number;
  totalParseTimeMs: number;
  throughput: number;
  cacheMemoryMB: number;
  errorCount: number;
}

// -- Entity relationships ---------------------------------------------------

export interface EntityRelationship {
  from: string;
  to: string;
  type: ExtendedRelationshipKind;
  sourceFile?: string;
  targetFile?: string;
  metadata?: {
    line?: number;
    confidence?: number;
    isDirectRelation?: boolean;
    mroPosition?: number;
    [key: string]: any;
  };
}

// -- Pattern analysis -------------------------------------------------------

export interface PatternAnalysis {
  contextManagers: Array<{
    entity: string;
    type: "class_based" | "function_based" | "async";
    methods: string[];
  }>;

  exceptionHandling: Array<{
    type: "try_except" | "try_finally" | "try_except_finally";
    exceptTypes: string[];
    location: { line: number; column: number };
    hasElse?: boolean;
    hasFinally?: boolean;
  }>;

  designPatterns: Array<{
    pattern: "singleton" | "observer" | "factory" | "builder" | "strategy" | "decorator" | "iterator";
    entities: string[];
    confidence: number;
    description: string;
  }>;

  pythonIdioms: Array<{
    idiom: "list_comprehension" | "dict_comprehension" | "generator_expression" | "context_manager" | "duck_typing";
    locations: Array<{ line: number; column: number }>;
    usage: string;
  }>;

  circularDependencies: Array<{
    cycle: string[];
    type: "import" | "inheritance" | "reference";
    severity: "warning" | "error";
  }>;

  otherPatterns?: Array<{
    kind: string;
    entities?: string[];
    confidence?: number;
    description?: string;
    locations?: Array<{ line: number; column: number }>;
    metadata?: Record<string, any>;
  }>;
}

# Jvm

Shared JVM parser utilities for Java/Kotlin AST handling, complexity analysis, and documentation extraction.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `AnnotationInfo` | interface | Decorator/annotation name and argument values | [→ shared-types.ts:76-80] |
| `AntlrContext` | interface | ANTLR parser context node interface | [→ shared-types.ts:224-230] |
| `AntlrContextWithChildren` | interface | Parser context providing child node access | [→ shared-types.ts:232-236] |
| `AntlrToken` | interface | ANTLR token representation with position data | [→ shared-types.ts:216-222] |
| `BranchInfo` | interface | Control flow branch type and location metadata | [→ shared-types.ts:107-123] |
| `calculateClassComplexity` | function | Calculates overall class complexity rating | [→ shared-complexity.ts:144-148] |
| `calculateCommentDensity` | function | Computes ratio of comment to code lines | [→ shared-complexity.ts:53-90] |
| `calculateLinesOfCode` | function | Counts executable code lines excluding comments | [→ shared-complexity.ts:16-47] |
| `calculateNestingDepth` | function | Measures maximum nesting depth in structure | [→ shared-complexity.ts:96-113] |
| `calculatePhysicalLines` | function | Returns total number of source lines | [→ shared-complexity.ts:49-51] |
| `CallInfo` | interface | Method/function call details and invocation metadata | [→ shared-types.ts:43-70] |
| `cleanDescriptionBase` | function | Removes markers and normalizes description text | [→ shared-doc-parser.ts:159-174] |
| `ComplexityMetrics` | interface | Code complexity scores and measurements | [→ shared-types.ts:202-210] |
| `ComplexityThresholds` | interface | Configuration object for complexity rating limits | [→ shared-complexity.ts:207-212] |
| `ControlFlowInfo` | interface | Aggregated control flow statement information | [→ shared-types.ts:143-153] |
| `DocInfo` | interface | Complete documentation structure with parsed tags | [→ shared-types.ts:165-196] |
| `DocParam` | interface | Documentation parameter with name and description | [→ shared-types.ts:159-163] |
| `exceedsThresholds` | function | Checks if metrics exceed configured thresholds | [→ shared-complexity.ts:232-239] |
| `ExceptionInfo` | interface | Exception type and handling location information | [→ shared-types.ts:130-134] |
| `extractDocFromSourceBase` | function | Retrieves and parses documentation from code | [→ shared-doc-parser.ts:180-232] |
| `extractGenericArguments` | function | Parses type arguments from generic call | [→ shared-ast-helpers.ts:136-160] |
| `findAllDescendants` | function | Recursively finds all nodes matching predicate | [→ shared-ast-helpers.ts:74-94] |
| `findAncestor` | function | Walks parent chain to find matching ancestor node | [→ shared-ast-helpers.ts:96-108] |
| `findDocComment` | function | Locates JavaDoc/KDoc comment before code element | [→ shared-doc-parser.ts:15-36] |
| `formatComplexityMetrics` | function | Formats metrics into human-readable string | [→ shared-complexity.ts:193-201] |
| `getBaseRefactoringSuggestions` | function | Generates refactoring recommendations based metrics | [→ shared-complexity.ts:241-261] |
| `getComplexityRating` | function | Maps complexity score to text rating | [→ shared-complexity.ts:214-230] |
| `getIdentifierText` | function | Extracts identifier text from context | [→ shared-ast-helpers.ts:122-126] |
| `getLocation` | function | Extracts source code location from ANTLR parser context | [→ shared-ast-helpers.ts:16-33] |
| `getTerminalLocation` | function | Gets source position and span from terminal token | [→ shared-ast-helpers.ts:35-52] |
| `getText` | function | Retrieves text from parser context with null safety | [→ shared-ast-helpers.ts:114-116] |
| `getTextTrimmed` | function | Returns context text with leading/trailing whitespace | [→ shared-ast-helpers.ts:118-120] |
| `InheritanceInfo` | interface | Base classes and implemented interface names | [→ shared-types.ts:86-89] |
| `isSuperCall` | function | Checks whether call targets superclass | [→ shared-ast-helpers.ts:166-168] |
| `isThisCall` | function | Checks whether call targets current instance | [→ shared-ast-helpers.ts:170-172] |
| `LocationInfo` | type | Source code position with line/column/index | [→ shared-types.ts:34-37] |
| `LoopInfo` | interface | Loop structure type and iteration metadata | [→ shared-types.ts:125-128] |
| `ParameterInfo` | interface | Function parameter name and type information | [→ shared-types.ts:95-101] |
| `parseDocComment` | function | Parses raw comment into structured documentation | [→ shared-doc-parser.ts:47-95] |
| `parseParamTag` | function | Extracts parameter name and description from tag | [→ shared-doc-parser.ts:101-116] |
| `ParserContext` | interface | Unified parser state and entity tracking context | [→ shared-types.ts:21-28] |
| `parseReturnTag` | function | Extracts return type description from tag | [→ shared-doc-parser.ts:118-124] |
| `parseSeeTag` | function | Extracts cross-reference documentation from tag | [→ shared-doc-parser.ts:144-153] |
| `parseThrowsTag` | function | Extracts thrown exception documentation from tag | [→ shared-doc-parser.ts:126-142] |
| `ReturnInfo` | interface | Return statement location and type information | [→ shared-types.ts:136-141] |
| `visitChildren` | function | Maps visitor function over parser context children | [→ shared-ast-helpers.ts:58-72] |

## Files

- **shared-ast-helpers.ts** — Location extraction, AST traversal, text retrieval utilities
- **shared-complexity.ts** — Code metrics calculation and complexity analysis functions
- **shared-doc-parser.ts** — JavaDoc/KDoc comment parsing and tag extraction
- **shared-types.ts** — Type definitions for parser state and AST nodes

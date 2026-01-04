/**
 * Rust Pattern Identifier
 *
 * Pattern identification for Rust code analysis (Layer 4).
 * Extracted from rust-analyzer.ts for better modularity.
 */

import type { ASTNode, ParsedEntity, PatternAnalysis } from "../../types/parser.js";
import { hasChild } from "../base-parser-utils.js";
import { findNodes, getNodeText } from "./ast-helpers.js";

// =============================================================================
// MAIN PATTERN IDENTIFICATION
// =============================================================================

/**
 * Identify Rust patterns (Layer 4)
 */
export function identifyPatterns(node: ASTNode, entities: ParsedEntity[]): PatternAnalysis {
  const result: PatternAnalysis = {
    contextManagers: [],
    exceptionHandling: [],
    designPatterns: [],
    pythonIdioms: [],
    circularDependencies: [],
    otherPatterns: [],
  };

  // Identify Builder pattern
  const builderPattern = identifyBuilderPattern(entities);
  if (builderPattern) result.designPatterns.push(builderPattern);

  // Identify Iterator pattern
  const iteratorPattern = identifyIteratorPattern(node, entities);
  if (iteratorPattern) result.designPatterns.push(iteratorPattern);

  // Identify Error handling patterns
  const errorPatterns = identifyErrorHandlingPatterns(node);
  result.otherPatterns?.push(...errorPatterns);

  // Identify Ownership patterns
  const ownershipPatterns = identifyOwnershipPatterns(node);
  result.otherPatterns?.push(...ownershipPatterns);

  // Identify unsafe code blocks
  const unsafePatterns = identifyUnsafePatterns(node);
  result.otherPatterns?.push(...unsafePatterns);

  return result;
}

// =============================================================================
// DESIGN PATTERN IDENTIFICATION
// =============================================================================

/**
 * Identify Builder pattern
 */
export function identifyBuilderPattern(entities: ParsedEntity[]): PatternAnalysis["designPatterns"][number] | null {
  for (const entity of entities) {
    if (entity.type !== "struct") continue;

    if (entity.name.endsWith("Builder")) {
      // Look for build() method
      const buildMethod = entities.find(
        (e) => e.type === "method" && e.metadata?.["implType"] === entity.name && e.name === "build",
      );

      if (buildMethod) {
        return {
          pattern: "builder",
          confidence: 0.95,
          entities: [entity.id!, buildMethod.id!],
          description: `Builder pattern detected in struct ${entity.name}`,
        };
      }
    }
  }

  return null;
}

/**
 * Identify Iterator pattern
 */
export function identifyIteratorPattern(
  node: ASTNode,
  entities: ParsedEntity[],
): PatternAnalysis["designPatterns"][number] | null {
  // Try via methods
  const iteratorImpls = entities.filter(
    (e) => e.type === "method" && e.metadata?.["traitName"] === "Iterator" && e.name === "next",
  );
  if (iteratorImpls.length > 0) {
    return {
      pattern: "iterator",
      confidence: 1.0,
      entities: iteratorImpls.map((e) => e.id!).filter(Boolean),
      description: `Found ${iteratorImpls.length} Iterator implementations`,
    };
  }
  // Fallback: find impl_item with trait "Iterator" in AST
  const impls = findNodes(node, "impl_item").filter((n) => {
    const traitNode = n.childForFieldName("trait");
    return traitNode && getNodeText(traitNode) === "Iterator";
  });
  if (impls.length > 0) {
    return {
      pattern: "iterator",
      confidence: 0.8,
      entities: [],
      description: `Found ${impls.length} Iterator impl blocks`,
    };
  }
  return null;
}

// =============================================================================
// RUST-SPECIFIC PATTERN IDENTIFICATION
// =============================================================================

/**
 * Identify error handling patterns
 */
export function identifyErrorHandlingPatterns(node: ASTNode): NonNullable<PatternAnalysis["otherPatterns"]> {
  const patterns: NonNullable<PatternAnalysis["otherPatterns"]> = [];

  // Count Result<T, E> usage
  const resultTypes = findNodes(node, "generic_type").filter((n) => {
    const typeNode = n.childForFieldName("type");
    const name = typeNode ? getNodeText(typeNode) : "";
    return name.includes("Result");
  });

  if (resultTypes.length > 0) {
    patterns.push({
      kind: "result_error_handling",
      confidence: 1.0,
      description: `Found ${resultTypes.length} Result type usages`,
      metadata: { count: resultTypes.length },
    });
  }

  // Count ? operator usage
  const tryOperators = findNodes(node, "try_expression");
  if (tryOperators.length > 0) {
    patterns.push({
      kind: "try_operator",
      confidence: 1.0,
      description: `Found ${tryOperators.length} ? operator usages`,
      metadata: { count: tryOperators.length },
    });
  }

  return patterns;
}

/**
 * Identify ownership patterns
 */
export function identifyOwnershipPatterns(node: ASTNode): NonNullable<PatternAnalysis["otherPatterns"]> {
  const patterns: NonNullable<PatternAnalysis["otherPatterns"]> = [];

  // Count borrowing patterns
  const references = findNodes(node, "reference_type");
  const mutReferences = references.filter((r) => hasChild(r, "mutable_specifier"));

  if (references.length > 0) {
    patterns.push({
      kind: "borrowing",
      confidence: 1.0,
      description: `Found ${references.length} references (${mutReferences.length} mutable)`,
      metadata: {
        totalReferences: references.length,
        mutableReferences: mutReferences.length,
      },
    });
  }

  // Count lifetime annotations
  const lifetimes = findNodes(node, "lifetime");
  if (lifetimes.length > 0) {
    patterns.push({
      kind: "lifetime_annotations",
      confidence: 1.0,
      description: `Found ${lifetimes.length} lifetime annotations`,
      metadata: { count: lifetimes.length },
    });
  }

  return patterns;
}

/**
 * Check if node has specific modifier
 */
function hasModifier(node: ASTNode, modifier: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === modifier) {
      return true;
    }
  }
  return false;
}

/**
 * Identify unsafe code blocks
 */
export function identifyUnsafePatterns(node: ASTNode): NonNullable<PatternAnalysis["otherPatterns"]> {
  const patterns: NonNullable<PatternAnalysis["otherPatterns"]> = [];

  // Count unsafe blocks
  const unsafeBlocks = findNodes(node, "unsafe_block");
  const unsafeFunctions = findNodes(node, "function_item").filter((f) => hasModifier(f, "unsafe"));
  const unsafeTraits = findNodes(node, "trait_item").filter((t) => hasModifier(t, "unsafe"));
  const unsafeImpls = findNodes(node, "impl_item").filter((i) => hasModifier(i, "unsafe"));

  const totalUnsafe = unsafeBlocks.length + unsafeFunctions.length + unsafeTraits.length + unsafeImpls.length;

  if (totalUnsafe > 0) {
    patterns.push({
      kind: "unsafe_code",
      confidence: 1.0,
      description: `Found ${totalUnsafe} unsafe code usages`,
      metadata: {
        unsafeBlocks: unsafeBlocks.length,
        unsafeFunctions: unsafeFunctions.length,
        unsafeTraits: unsafeTraits.length,
        unsafeImpls: unsafeImpls.length,
      },
    });
  }

  return patterns;
}

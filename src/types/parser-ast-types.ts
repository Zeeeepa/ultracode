/**
 * AST Parser Type Definitions
 *
 * Generic AST node interfaces for interoperability between parsers.
 * Includes tree-sitter compatibility types.
 */

// =============================================================================
// AST NODE INTERFACE
// =============================================================================

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

// =============================================================================
// TREE-SITTER COMPATIBILITY TYPES (DEPRECATED)
// =============================================================================

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

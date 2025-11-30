/**
 * Type declarations for tree-sitter
 * Based on tree-sitter API, used when tree-sitter npm types are not available
 */

declare module "tree-sitter" {
  export interface Point {
    row: number;
    column: number;
  }

  export interface Range {
    startPosition: Point;
    endPosition: Point;
    startIndex: number;
    endIndex: number;
  }

  export interface Edit {
    startIndex: number;
    oldEndIndex: number;
    newEndIndex: number;
    startPosition: Point;
    oldEndPosition: Point;
    newEndPosition: Point;
  }

  export interface SyntaxNode {
    id: number;
    tree: Tree;
    type: string;
    text: string;
    startPosition: Point;
    endPosition: Point;
    startIndex: number;
    endIndex: number;
    parent: SyntaxNode | null;
    children: SyntaxNode[];
    namedChildren: SyntaxNode[];
    childCount: number;
    namedChildCount: number;
    firstChild: SyntaxNode | null;
    firstNamedChild: SyntaxNode | null;
    lastChild: SyntaxNode | null;
    lastNamedChild: SyntaxNode | null;
    nextSibling: SyntaxNode | null;
    nextNamedSibling: SyntaxNode | null;
    previousSibling: SyntaxNode | null;
    previousNamedSibling: SyntaxNode | null;
    hasChanges(): boolean;
    hasError(): boolean;
    isMissing(): boolean;
    isNamed(): boolean;
    toString(): string;
    child(index: number): SyntaxNode | null;
    namedChild(index: number): SyntaxNode | null;
    childForFieldName(fieldName: string): SyntaxNode | null;
    childrenForFieldName(fieldName: string): SyntaxNode[];
    fieldNameForChild(childIndex: number): string | null;
    descendantForIndex(index: number): SyntaxNode;
    descendantForIndex(startIndex: number, endIndex: number): SyntaxNode;
    namedDescendantForIndex(index: number): SyntaxNode;
    namedDescendantForIndex(startIndex: number, endIndex: number): SyntaxNode;
    descendantForPosition(position: Point): SyntaxNode;
    descendantForPosition(startPosition: Point, endPosition: Point): SyntaxNode;
    namedDescendantForPosition(position: Point): SyntaxNode;
    namedDescendantForPosition(startPosition: Point, endPosition: Point): SyntaxNode;
    descendantsOfType(types: string | string[], startPosition?: Point, endPosition?: Point): SyntaxNode[];
    walk(): TreeCursor;
  }

  export interface TreeCursor {
    nodeType: string;
    nodeText: string;
    nodeIsNamed: boolean;
    startPosition: Point;
    endPosition: Point;
    startIndex: number;
    endIndex: number;
    currentNode(): SyntaxNode;
    currentFieldName(): string | null;
    gotoParent(): boolean;
    gotoFirstChild(): boolean;
    gotoFirstChildForIndex(index: number): boolean;
    gotoNextSibling(): boolean;
    reset(node: SyntaxNode): void;
  }

  export interface Tree {
    rootNode: SyntaxNode;
    language: Language;
    edit(edit: Edit): void;
    walk(): TreeCursor;
    getChangedRanges(other: Tree): Range[];
    getEditedRange(other: Tree): Range;
    printDotGraph(fd?: number): void;
  }

  export interface Language {
    version: number;
    fieldCount: number;
    nodeTypeCount: number;
    fieldNameForId(fieldId: number): string | null;
    fieldIdForName(fieldName: string): number | null;
    idForNodeType(type: string, named: boolean): number;
    nodeTypeForId(typeId: number): string | null;
    nodeTypeIsNamed(typeId: number): boolean;
    nodeTypeIsVisible(typeId: number): boolean;
  }

  export interface QueryCapture {
    name: string;
    node: SyntaxNode;
  }

  export interface QueryMatch {
    pattern: number;
    captures: QueryCapture[];
  }

  export interface Query {
    captureNames: string[];
    matches(node: SyntaxNode, startPosition?: Point, endPosition?: Point): QueryMatch[];
    captures(node: SyntaxNode, startPosition?: Point, endPosition?: Point): QueryCapture[];
  }

  interface ParseOptions {
    bufferSize?: number;
    includedRanges?: Range[];
  }

  class Parser {
    parse(
      input: string | ((index: number, position?: Point) => string | null),
      oldTree?: Tree,
      options?: ParseOptions,
    ): Tree;
    getLanguage(): Language | null;
    setLanguage(language: Language | null): void;
    getLogger(): ((message: string, params: object, type: "parse" | "lex") => void) | null;
    setLogger(logger: ((message: string, params: object, type: "parse" | "lex") => void) | null): void;
    printDotGraphs(enabled: boolean): void;
    reset(): void;
  }

  namespace Parser {
    export { Point, Range, Edit, SyntaxNode, TreeCursor, Tree, Language, Query, QueryCapture, QueryMatch };
  }

  export = Parser;
}

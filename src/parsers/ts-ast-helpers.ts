/**
 * TypeScript AST Helper Functions
 *
 * Low-level utilities for working with TypeScript AST nodes.
 * Used by typescript-parser.ts and extraction functions.
 */

import ts from "typescript";
import type { ParsedEntity, SupportedLanguage } from "../types/parser.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

export const SCRIPT_TARGETS: Record<string, ts.ScriptTarget> = {
  ".js": ts.ScriptTarget.ESNext,
  ".mjs": ts.ScriptTarget.ESNext,
  ".cjs": ts.ScriptTarget.ESNext,
  ".jsx": ts.ScriptTarget.ESNext,
  ".ts": ts.ScriptTarget.ESNext,
  ".mts": ts.ScriptTarget.ESNext,
  ".cts": ts.ScriptTarget.ESNext,
  ".tsx": ts.ScriptTarget.ESNext,
};

export const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getExtension(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : ".ts";
}

export function getLanguage(filePath: string): SupportedLanguage {
  const ext = getExtension(filePath);
  switch (ext) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".tsx":
      return "tsx";
    default:
      return "typescript";
  }
}

export function getPosition(sourceFile: ts.SourceFile, pos: number): { line: number; column: number; index: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, column: character, index: pos };
}

export function getLocation(sourceFile: ts.SourceFile, node: ts.Node): ParsedEntity["location"] {
  return {
    start: getPosition(sourceFile, node.getStart(sourceFile)),
    end: getPosition(sourceFile, node.getEnd()),
  };
}

export function getModifiers(node: ts.Node): string[] {
  const modifiers: string[] = [];

  if (ts.canHaveModifiers(node)) {
    const mods = ts.getModifiers(node);
    if (mods) {
      for (const mod of mods) {
        switch (mod.kind) {
          case ts.SyntaxKind.AsyncKeyword:
            modifiers.push("async");
            break;
          case ts.SyntaxKind.StaticKeyword:
            modifiers.push("static");
            break;
          case ts.SyntaxKind.PublicKeyword:
            modifiers.push("public");
            break;
          case ts.SyntaxKind.PrivateKeyword:
            modifiers.push("private");
            break;
          case ts.SyntaxKind.ProtectedKeyword:
            modifiers.push("protected");
            break;
          case ts.SyntaxKind.ReadonlyKeyword:
            modifiers.push("readonly");
            break;
          case ts.SyntaxKind.AbstractKeyword:
            modifiers.push("abstract");
            break;
          case ts.SyntaxKind.ExportKeyword:
            modifiers.push("export");
            break;
          case ts.SyntaxKind.DefaultKeyword:
            modifiers.push("default");
            break;
          case ts.SyntaxKind.ConstKeyword:
            modifiers.push("const");
            break;
          case ts.SyntaxKind.DeclareKeyword:
            modifiers.push("declare");
            break;
          case ts.SyntaxKind.OverrideKeyword:
            modifiers.push("override");
            break;
        }
      }
    }
  }

  return modifiers;
}

export function getParameters(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): ParsedEntity["parameters"] {
  return node.parameters.map((param) => {
    const name = param.name.getText(sourceFile);
    const type = param.type ? param.type.getText(sourceFile) : undefined;
    const optional = !!param.questionToken;
    const defaultValue = param.initializer ? param.initializer.getText(sourceFile) : undefined;

    return {
      name,
      optional,
      ...(type && { type }),
      ...(defaultValue && { defaultValue }),
    };
  });
}

export function getReturnType(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string | undefined {
  if (node.type) {
    return node.type.getText(sourceFile);
  }
  return undefined;
}

export function getDecorators(node: ts.Node, sourceFile: ts.SourceFile): ParsedEntity["decorators"] {
  const decorators: ParsedEntity["decorators"] = [];

  if (ts.canHaveDecorators(node)) {
    const decs = ts.getDecorators(node);
    if (decs) {
      for (const dec of decs) {
        let name: string;
        let args: string[] | undefined;

        if (ts.isCallExpression(dec.expression)) {
          name = dec.expression.expression.getText(sourceFile);
          args = dec.expression.arguments.map((arg) => arg.getText(sourceFile));
        } else {
          name = dec.expression.getText(sourceFile);
        }

        decorators.push({ name, ...(args && { arguments: args }) });
      }
    }
  }

  return decorators.length > 0 ? decorators : undefined;
}

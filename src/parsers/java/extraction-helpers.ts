/**
 * Java ANTLR Parser Extraction Helpers
 *
 * Helper functions for extracting modifiers, annotations, inheritance,
 * and parameters from Java AST nodes.
 * Extracted from java-antlr-parser.ts for better modularity.
 */

import type {
  NormalClassDeclarationContext,
  NormalInterfaceDeclarationContext,
} from "../../generated/java/Java20Parser.js";
import type { AnnotationInfo, InheritanceInfo, LocationInfo, ParameterInfo } from "./types.js";

// =============================================================================
// LOCATION EXTRACTION
// =============================================================================

/**
 * Extract location information from an AST context
 */
export function getLocation(ctx: any): LocationInfo {
  const start = ctx.start || ctx._start || { line: 1, column: 0, start: 0 };
  const stop = ctx.stop || ctx._stop || start;

  return {
    start: {
      line: start.line || 1,
      column: start.column || 0,
      index: start.start || 0,
    },
    end: {
      line: stop.line || start.line || 1,
      column: (stop.column || 0) + (stop.text?.length || 0),
      index: (stop.stop || start.start || 0) + 1,
    },
  };
}

// =============================================================================
// MODIFIER EXTRACTION
// =============================================================================

/**
 * Generic modifier extraction - filters out annotations
 */
function extractModifiersGeneric(modifiersCtx: any[]): string[] {
  const modifiers: string[] = [];
  if (!modifiersCtx) return modifiers;

  for (const mod of modifiersCtx) {
    const text = mod.getText();
    if (text && !text.startsWith("@")) {
      modifiers.push(text);
    }
  }

  return modifiers;
}

/**
 * Extract modifiers from class declaration
 */
export function extractClassModifiers(modifiersCtx: any[]): string[] {
  return extractModifiersGeneric(modifiersCtx);
}

/**
 * Extract modifiers from interface declaration
 */
export function extractInterfaceModifiers(modifiersCtx: any[]): string[] {
  return extractModifiersGeneric(modifiersCtx);
}

/**
 * Extract modifiers from method declaration
 */
export function extractMethodModifiers(modifiersCtx: any[]): string[] {
  return extractModifiersGeneric(modifiersCtx);
}

/**
 * Extract modifiers from interface method declaration
 */
export function extractInterfaceMethodModifiers(modifiersCtx: any[]): string[] {
  return extractModifiersGeneric(modifiersCtx);
}

/**
 * Extract modifiers from field declaration
 */
export function extractFieldModifiers(modifiersCtx: any[]): string[] {
  return extractModifiersGeneric(modifiersCtx);
}

/**
 * Extract modifiers from constructor declaration
 */
export function extractConstructorModifiers(modifiersCtx: any[]): string[] {
  return extractModifiersGeneric(modifiersCtx);
}

/**
 * Extract modifiers from constant declaration
 */
export function extractConstantModifiers(modifiersCtx: any[]): string[] {
  return extractModifiersGeneric(modifiersCtx);
}

// =============================================================================
// ANNOTATION EXTRACTION
// =============================================================================

/**
 * Extract annotations from class/enum/record modifiers
 */
export function extractAnnotations(modifiersCtx: any[]): AnnotationInfo[] {
  const annotations: AnnotationInfo[] = [];
  if (!modifiersCtx) return annotations;

  for (const mod of modifiersCtx) {
    const annotation = mod.annotation?.();
    if (annotation) {
      const normalAnnotation = annotation.normalAnnotation?.();
      const markerAnnotation = annotation.markerAnnotation?.();
      const singleElementAnnotation = annotation.singleElementAnnotation?.();

      let name = "";
      let args: string[] | undefined;

      if (normalAnnotation) {
        name = normalAnnotation.typeName?.()?.getText() || "";
        const elementValuePairs = normalAnnotation.elementValuePairList?.()?.getText();
        if (elementValuePairs) {
          args = [elementValuePairs];
        }
      } else if (markerAnnotation) {
        name = markerAnnotation.typeName?.()?.getText() || "";
      } else if (singleElementAnnotation) {
        name = singleElementAnnotation.typeName?.()?.getText() || "";
        const elementValue = singleElementAnnotation.elementValue?.()?.getText();
        if (elementValue) {
          args = [elementValue];
        }
      }

      if (name) {
        annotations.push({ name, arguments: args });
      }
    }
  }

  return annotations;
}

/**
 * Extract annotations from interface modifiers
 */
export function extractAnnotationsFromInterfaceModifiers(modifiersCtx: any[]): AnnotationInfo[] {
  return extractAnnotations(modifiersCtx);
}

/**
 * Extract annotations from method modifiers
 */
export function extractAnnotationsFromMethodModifiers(modifiersCtx: any[]): AnnotationInfo[] {
  return extractAnnotations(modifiersCtx);
}

/**
 * Extract annotations from field modifiers
 */
export function extractAnnotationsFromFieldModifiers(modifiersCtx: any[]): AnnotationInfo[] {
  return extractAnnotations(modifiersCtx);
}

// =============================================================================
// INHERITANCE EXTRACTION
// =============================================================================

/**
 * Extract inheritance (extends/implements) from class declaration
 */
export function extractClassInheritance(classDecl: NormalClassDeclarationContext): InheritanceInfo {
  const result: InheritanceInfo = { baseClasses: [], interfaces: [] };

  // Extract extends
  const classExtends = classDecl.classExtends();
  if (classExtends) {
    const classType = classExtends.classType();
    if (classType) {
      result.baseClasses.push(classType.getText());
    }
  }

  // Extract implements
  const classImplements = classDecl.classImplements();
  if (classImplements) {
    const interfaceList = classImplements.interfaceTypeList();
    if (interfaceList) {
      for (const interfaceType of interfaceList.interfaceType()) {
        result.interfaces.push(interfaceType.getText());
      }
    }
  }

  return result;
}

/**
 * Extract inheritance (extends) from interface declaration
 */
export function extractInterfaceInheritance(interfaceDecl: NormalInterfaceDeclarationContext): {
  interfaces: string[];
} {
  const result = { interfaces: [] as string[] };

  const interfaceExtends = interfaceDecl.interfaceExtends();
  if (interfaceExtends) {
    const interfaceList = interfaceExtends.interfaceTypeList();
    if (interfaceList) {
      for (const interfaceType of interfaceList.interfaceType()) {
        result.interfaces.push(interfaceType.getText());
      }
    }
  }

  return result;
}

// =============================================================================
// PARAMETER EXTRACTION
// =============================================================================

/**
 * Extract parameters from method declarator
 */
export function extractMethodParameters(methodDeclarator: any): ParameterInfo[] {
  const params: ParameterInfo[] = [];

  const formalParameterList = methodDeclarator.formalParameterList?.();
  if (!formalParameterList) return params;

  // Regular parameters
  const formalParams = formalParameterList.formalParameter?.() || [];
  for (const param of formalParams) {
    const varDeclId = param.variableDeclaratorId?.();
    const unannType = param.unannType?.();

    if (varDeclId) {
      const identifier = varDeclId.identifier?.();
      if (identifier) {
        params.push({
          name: identifier.getText(),
          type: unannType?.getText() || undefined,
        });
      }
    }
  }

  // Varargs parameter
  const varArgsParam = formalParameterList.variableArityParameter?.();
  if (varArgsParam) {
    const identifier = varArgsParam.identifier?.();
    const unannType = varArgsParam.unannType?.();

    if (identifier) {
      params.push({
        name: identifier.getText(),
        type: unannType ? unannType.getText() + "..." : undefined,
      });
    }
  }

  return params;
}

/**
 * Extract parameters from constructor declarator
 */
export function extractConstructorParameters(declarator: any): ParameterInfo[] {
  const params: ParameterInfo[] = [];

  const formalParameterList = declarator.formalParameterList?.();
  if (!formalParameterList) return params;

  // Regular parameters
  const formalParams = formalParameterList.formalParameter?.() || [];
  for (const param of formalParams) {
    const varDeclId = param.variableDeclaratorId?.();
    const unannType = param.unannType?.();

    if (varDeclId) {
      const identifier = varDeclId.identifier?.();
      if (identifier) {
        params.push({
          name: identifier.getText(),
          type: unannType?.getText() || undefined,
        });
      }
    }
  }

  return params;
}

// =============================================================================
// CALL EXTRACTION
// =============================================================================

/**
 * Java keywords to exclude from call extraction
 */
const JAVA_KEYWORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "return",
  "throw",
  "try",
  "catch",
  "finally",
  "new",
  "instanceof",
  "synchronized",
  "assert",
]);

/**
 * Extract method calls from method body
 */
export function extractCalls(bodyCtx: any): string[] {
  if (!bodyCtx) return [];

  const calls: string[] = [];
  const text = bodyCtx.getText() || "";

  // Simple regex extraction
  const callRe = /(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = callRe.exec(text))) {
    const callName = match[1];
    if (callName && !JAVA_KEYWORDS.has(callName)) {
      calls.push(callName);
    }
  }

  return Array.from(new Set(calls));
}

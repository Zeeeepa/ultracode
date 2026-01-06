/**
 * Kotlin ANTLR Parser
 *
 * Extracts ParsedEntity and EntityRelationship from Kotlin source code
 * using the official Kotlin grammar via ANTLR4.
 *
 * This provides accurate AST-based parsing instead of regex-based parsing.
 */

import { CharStream, CommonTokenStream } from "antlr4ng";
import { KotlinLexer } from "../generated/kotlin/KotlinLexer.js";
import {
  type ClassDeclarationContext,
  type DeclarationContext,
  type ImportHeaderContext,
  type KotlinFileContext,
  KotlinParser,
} from "../generated/kotlin/KotlinParser.js";
import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

interface ParserContext {
  filePath: string;
  packageName: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  currentClass: string | null;
  imports: Map<string, string>;
}

type LocationInfo = {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
};

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

export class KotlinAntlrParser {
  /**
   * Parse Kotlin source code and extract entities/relationships
   */
  static parse(filePath: string, content: string): { entities: ParsedEntity[]; relationships: EntityRelationship[] } {
    const ctx: ParserContext = {
      filePath,
      packageName: "",
      entities: [],
      relationships: [],
      currentClass: null,
      imports: new Map(),
    };

    try {
      const inputStream = CharStream.fromString(content);
      const lexer = new KotlinLexer(inputStream);
      const tokenStream = new CommonTokenStream(lexer);
      const parser = new KotlinParser(tokenStream);

      // Disable error output for cleaner processing
      parser.removeErrorListeners();

      // Parse the file
      const tree = parser.kotlinFile();

      // Process AST
      processKotlinFile(tree, ctx);
    } catch (error) {
      log.e("KOTLINANTLR", "parse_err", { file: filePath, err: String(error) });
    }

    return {
      entities: ctx.entities,
      relationships: ctx.relationships,
    };
  }
}

// =============================================================================
// AST PROCESSING FUNCTIONS
// =============================================================================

function processKotlinFile(tree: KotlinFileContext, ctx: ParserContext): void {
  // Create module entity
  ctx.entities.push({
    name: ctx.filePath.split(/[/\\]/).pop() || "module",
    type: "module",
    filePath: ctx.filePath,
    location: getLocation(tree),
  });

  // Process package header
  const packageHeader = tree.packageHeader();
  if (packageHeader) {
    const identifier = packageHeader.identifier();
    if (identifier) {
      ctx.packageName = identifier.getText();
    }
  }

  // Process imports
  const importList = tree.importList();
  if (importList) {
    for (const importHeader of importList.importHeader()) {
      processImport(importHeader, ctx);
    }
  }

  // Process top-level declarations
  for (const topLevel of tree.topLevelObject()) {
    const declaration = topLevel.declaration();
    if (declaration) {
      processDeclaration(declaration, ctx);
    }
  }
}

function processImport(importHeader: ImportHeaderContext, ctx: ParserContext): void {
  const identifier = importHeader.identifier();
  if (!identifier) return;

  const importPath = identifier.getText();
  const alias = importHeader.importAlias()?.simpleIdentifier()?.getText();
  const isWildcard = importHeader.MULT() !== null;

  // Store import mapping
  const parts = importPath.split(".");
  const simpleName = alias || parts[parts.length - 1];
  if (!isWildcard && simpleName) {
    ctx.imports.set(simpleName, importPath);
  }

  // Create import entity
  ctx.entities.push({
    name: importPath,
    type: "import",
    filePath: ctx.filePath,
    location: getLocation(importHeader),
    metadata: {
      importData: {
        source: importPath,
        specifiers: alias ? [{ local: alias }] : [],
        isDefault: false,
        isNamespace: isWildcard,
      },
    },
  });

  // Create imports relationship
  ctx.relationships.push({
    from: ctx.filePath,
    to: importPath,
    type: "imports",
    metadata: { alias, isWildcard },
  });
}

function processDeclaration(declaration: DeclarationContext | null, ctx: ParserContext): void {
  if (!declaration) return;

  const classDecl = declaration.classDeclaration();
  if (classDecl) {
    processClassDeclaration(classDecl, ctx);
    return;
  }

  const objectDecl = declaration.objectDeclaration();
  if (objectDecl) {
    processObjectDeclaration(objectDecl, ctx);
    return;
  }

  const funcDecl = declaration.functionDeclaration();
  if (funcDecl) {
    processFunctionDeclaration(funcDecl, ctx);
    return;
  }

  const propDecl = declaration.propertyDeclaration();
  if (propDecl) {
    processPropertyDeclaration(propDecl, ctx);
    return;
  }

  const typeAlias = declaration.typeAlias();
  if (typeAlias) {
    processTypeAlias(typeAlias, ctx);
    return;
  }
}

// =============================================================================
// CLASS PROCESSING
// =============================================================================

function processClassDeclaration(classDecl: ClassDeclarationContext | null, ctx: ParserContext): void {
  if (!classDecl) return;

  const nameCtx = classDecl.simpleIdentifier();
  if (!nameCtx) return;

  const className = nameCtx.getText();
  const location = getLocation(classDecl);
  const modInfo = extractModifiers(classDecl.modifiers());

  // Determine entity type
  let entityType: ParsedEntity["type"] = "class";
  if (classDecl.INTERFACE() !== null) {
    entityType = "interface";
  } else if (modInfo.modifiers.includes("enum")) {
    entityType = "enum";
  }

  // Extract inheritance
  const inheritance = extractInheritance(classDecl.delegationSpecifiers());

  // Create entity
  const entity: ParsedEntity = {
    name: className,
    type: entityType,
    filePath: ctx.filePath,
    location,
    ...(modInfo.modifiers.length > 0 && { modifiers: modInfo.modifiers }),
    inheritance: inheritance.baseClasses.length > 0 || inheritance.interfaces.length > 0 ? inheritance : undefined,
    ...(modInfo.annotations.length > 0 && { decorators: modInfo.annotations }),
    children: [],
  };

  ctx.entities.push(entity);

  // Create inheritance relationships
  for (const base of inheritance.baseClasses) {
    ctx.relationships.push({
      from: className,
      to: base,
      type: "inherits",
      metadata: { line: location.start.line },
    });
  }

  for (const iface of inheritance.interfaces) {
    ctx.relationships.push({
      from: className,
      to: iface,
      type: "implements",
      metadata: { line: location.start.line },
    });
  }

  // Create decorates relationships
  for (const ann of modInfo.annotations) {
    ctx.relationships.push({
      from: ann.name,
      to: className,
      type: "decorates",
      metadata: { line: location.start.line, arguments: ann.arguments },
    });
  }

  // Process class members
  const prevClass = ctx.currentClass;
  ctx.currentClass = className;

  const classBody = classDecl.classBody();
  if (classBody) {
    const memberDecls = classBody.classMemberDeclarations();
    if (memberDecls) {
      for (const memberDecl of memberDecls.classMemberDeclaration()) {
        processClassMember(memberDecl, ctx);
      }
    }
  }

  // Process enum entries
  const enumBody = classDecl.enumClassBody();
  if (enumBody) {
    const entries = enumBody.enumEntries();
    if (entries) {
      for (const entry of entries.enumEntry()) {
        processEnumEntry(entry, ctx);
      }
    }
    const memberDecls = enumBody.classMemberDeclarations();
    if (memberDecls) {
      for (const memberDecl of memberDecls.classMemberDeclaration()) {
        processClassMember(memberDecl, ctx);
      }
    }
  }

  ctx.currentClass = prevClass;
}

function processClassMember(memberDecl: any, ctx: ParserContext): void {
  const declaration = memberDecl.declaration();
  if (declaration) {
    const funcDecl = declaration.functionDeclaration();
    if (funcDecl) {
      processFunctionDeclaration(funcDecl, ctx);
      return;
    }

    const propDecl = declaration.propertyDeclaration();
    if (propDecl) {
      processPropertyDeclaration(propDecl, ctx);
      return;
    }

    const classDecl = declaration.classDeclaration();
    if (classDecl) {
      processClassDeclaration(classDecl, ctx);
      return;
    }

    const objectDecl = declaration.objectDeclaration();
    if (objectDecl) {
      processObjectDeclaration(objectDecl, ctx);
      return;
    }
  }

  const companionObject = memberDecl.companionObject();
  if (companionObject) {
    processCompanionObject(companionObject, ctx);
  }

  const secondaryConstructor = memberDecl.secondaryConstructor();
  if (secondaryConstructor) {
    processSecondaryConstructor(secondaryConstructor, ctx);
  }
}

function processEnumEntry(entry: any, ctx: ParserContext): void {
  const nameCtx = entry.simpleIdentifier();
  if (!nameCtx) return;

  const entryName = nameCtx.getText();

  ctx.entities.push({
    name: entryName,
    type: "enum_variant",
    filePath: ctx.filePath,
    location: getLocation(entry),
  });

  if (ctx.currentClass) {
    ctx.relationships.push({
      from: ctx.currentClass,
      to: entryName,
      type: "contains",
      metadata: {},
    });
  }
}

// =============================================================================
// OBJECT PROCESSING
// =============================================================================

function processObjectDeclaration(objectDecl: any, ctx: ParserContext): void {
  if (!objectDecl) return;

  const nameCtx = objectDecl.simpleIdentifier();
  if (!nameCtx) return;

  const objectName = nameCtx.getText();
  const modInfo = extractModifiers(objectDecl.modifiers());

  ctx.entities.push({
    name: objectName,
    type: "class",
    filePath: ctx.filePath,
    location: getLocation(objectDecl),
    modifiers: [...modInfo.modifiers, "object"],
  });

  // Process members
  const prevClass = ctx.currentClass;
  ctx.currentClass = objectName;

  const classBody = objectDecl.classBody();
  if (classBody) {
    const memberDecls = classBody.classMemberDeclarations();
    if (memberDecls) {
      for (const memberDecl of memberDecls.classMemberDeclaration()) {
        processClassMember(memberDecl, ctx);
      }
    }
  }

  ctx.currentClass = prevClass;
}

function processCompanionObject(companionObject: any, ctx: ParserContext): void {
  const nameCtx = companionObject.simpleIdentifier();
  const objectName = nameCtx?.getText() || "Companion";

  const fullName = ctx.currentClass ? `${ctx.currentClass}.${objectName}` : objectName;

  ctx.entities.push({
    name: fullName,
    type: "class",
    filePath: ctx.filePath,
    location: getLocation(companionObject),
    modifiers: ["companion", "object"],
  });

  if (ctx.currentClass) {
    ctx.relationships.push({
      from: ctx.currentClass,
      to: fullName,
      type: "contains",
      metadata: {},
    });
  }

  const classBody = companionObject.classBody();
  if (classBody) {
    const prevClass = ctx.currentClass;
    ctx.currentClass = fullName;
    const memberDecls = classBody.classMemberDeclarations();
    if (memberDecls) {
      for (const memberDecl of memberDecls.classMemberDeclaration()) {
        processClassMember(memberDecl, ctx);
      }
    }
    ctx.currentClass = prevClass;
  }
}

// =============================================================================
// FUNCTION PROCESSING
// =============================================================================

function processFunctionDeclaration(funcDecl: any, ctx: ParserContext): void {
  if (!funcDecl) return;

  const nameCtx = funcDecl.simpleIdentifier();
  if (!nameCtx) return;

  const funcName = nameCtx.getText();
  const modInfo = extractModifiers(funcDecl.modifiers());
  const location = getLocation(funcDecl);

  const isSuspend = modInfo.modifiers.includes("suspend");
  const receiverType = funcDecl.receiverType()?.getText();
  const returnType = funcDecl.type?.()?.getText();

  const fullName = receiverType
    ? `${receiverType}.${funcName}`
    : ctx.currentClass
      ? `${ctx.currentClass}.${funcName}`
      : funcName;

  // Extract parameters
  const params = extractParameters(funcDecl.functionValueParameters());

  // Extract calls from function body
  const calls = extractCalls(funcDecl.functionBody());

  const entity: ParsedEntity = {
    name: fullName,
    type: ctx.currentClass ? "method" : isSuspend ? "async_function" : "function",
    filePath: ctx.filePath,
    location,
    ...(modInfo.modifiers.length > 0 && { modifiers: modInfo.modifiers }),
    ...(params.length > 0 && { parameters: params }),
    ...(returnType && { returnType: returnType }),
    ...(modInfo.annotations.length > 0 && { decorators: modInfo.annotations }),
  };

  ctx.entities.push(entity);

  // Create relationships
  if (ctx.currentClass) {
    ctx.relationships.push({
      from: ctx.currentClass,
      to: fullName,
      type: "contains",
      metadata: {},
    });
  }

  for (const ann of modInfo.annotations) {
    ctx.relationships.push({
      from: ann.name,
      to: fullName,
      type: "decorates",
      metadata: { line: location.start.line, arguments: ann.arguments },
    });
  }

  if (modInfo.modifiers.includes("override")) {
    ctx.relationships.push({
      from: fullName,
      to: `*.${funcName}`,
      type: "overrides",
      metadata: { line: location.start.line },
    });
  }

  for (const call of calls) {
    ctx.relationships.push({
      from: fullName,
      to: call,
      type: "calls",
      metadata: {},
    });
  }
}

function processSecondaryConstructor(ctor: any, ctx: ParserContext): void {
  if (!ctx.currentClass) return;

  const fullName = `${ctx.currentClass}.constructor`;
  const modInfo = extractModifiers(ctor.modifiers());
  const params = extractParameters(ctor.functionValueParameters());

  ctx.entities.push({
    name: fullName,
    type: "method",
    filePath: ctx.filePath,
    location: getLocation(ctor),
    modifiers: [...modInfo.modifiers, "constructor"],
    ...(params.length > 0 && { parameters: params }),
  });

  ctx.relationships.push({
    from: ctx.currentClass,
    to: fullName,
    type: "contains",
    metadata: {},
  });
}

// =============================================================================
// PROPERTY PROCESSING
// =============================================================================

function processPropertyDeclaration(propDecl: any, ctx: ParserContext): void {
  if (!propDecl) return;

  const modInfo = extractModifiers(propDecl.modifiers());
  const location = getLocation(propDecl);
  const isVal = propDecl.VAL() !== null;
  const isConst = modInfo.modifiers.includes("const");
  const receiverType = propDecl.receiverType()?.getText();

  const varDecl = propDecl.variableDeclaration();
  if (varDecl) {
    const nameCtx = varDecl.simpleIdentifier();
    if (!nameCtx) return;

    const propName = nameCtx.getText();
    const propType = varDecl.type?.()?.getText();

    const fullName = receiverType
      ? `${receiverType}.${propName}`
      : ctx.currentClass
        ? `${ctx.currentClass}.${propName}`
        : propName;

    ctx.entities.push({
      name: fullName,
      type: isVal || isConst ? "constant" : "property",
      filePath: ctx.filePath,
      location,
      modifiers: [...modInfo.modifiers, isVal ? "val" : "var"],
      metadata: propType ? { propertyType: propType } : undefined,
    });

    if (ctx.currentClass) {
      ctx.relationships.push({
        from: ctx.currentClass,
        to: fullName,
        type: "contains",
        metadata: {},
      });
    }

    if (propType) {
      ctx.relationships.push({
        from: fullName,
        to: propType.replace(/[?<>].*/, ""),
        type: "references",
        metadata: { referenceKind: "property" },
      });
    }
  }

  const multiVarDecl = propDecl.multiVariableDeclaration();
  if (multiVarDecl) {
    for (const v of multiVarDecl.variableDeclaration()) {
      const nameCtx = v.simpleIdentifier();
      if (!nameCtx) continue;

      const propName = nameCtx.getText();
      const fullName = ctx.currentClass ? `${ctx.currentClass}.${propName}` : propName;

      ctx.entities.push({
        name: fullName,
        type: isVal ? "constant" : "property",
        filePath: ctx.filePath,
        location: getLocation(v),
        modifiers: [...modInfo.modifiers, isVal ? "val" : "var"],
      });
    }
  }
}

// =============================================================================
// TYPE ALIAS PROCESSING
// =============================================================================

function processTypeAlias(typeAlias: any, ctx: ParserContext): void {
  if (!typeAlias) return;

  const nameCtx = typeAlias.simpleIdentifier();
  if (!nameCtx) return;

  const aliasName = nameCtx.getText();
  const modInfo = extractModifiers(typeAlias.modifiers());
  const aliasedType = typeAlias.type?.()?.getText();

  ctx.entities.push({
    name: aliasName,
    type: "type",
    filePath: ctx.filePath,
    location: getLocation(typeAlias),
    ...(modInfo.modifiers.length > 0 && { modifiers: modInfo.modifiers }),
    metadata: aliasedType ? { aliasedType } : undefined,
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getLocation(ctx: any): LocationInfo {
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

function extractModifiers(modifiersCtx: any): {
  modifiers: string[];
  annotations: Array<{ name: string; arguments?: string[] }>;
} {
  const result: {
    modifiers: string[];
    annotations: Array<{ name: string; arguments?: string[] }>;
  } = {
    modifiers: [],
    annotations: [],
  };

  if (!modifiersCtx) return result;

  // Process modifiers
  const modifiers = modifiersCtx.modifier?.() || [];
  for (const mod of modifiers) {
    const classMod = mod.classModifier?.();
    if (classMod) result.modifiers.push(classMod.getText());

    const memberMod = mod.memberModifier?.();
    if (memberMod) result.modifiers.push(memberMod.getText());

    const visMod = mod.visibilityModifier?.();
    if (visMod) result.modifiers.push(visMod.getText());

    const funcMod = mod.functionModifier?.();
    if (funcMod) result.modifiers.push(funcMod.getText());

    const propMod = mod.propertyModifier?.();
    if (propMod) result.modifiers.push(propMod.getText());

    const inhMod = mod.inheritanceModifier?.();
    if (inhMod) result.modifiers.push(inhMod.getText());

    const paramMod = mod.parameterModifier?.();
    if (paramMod) result.modifiers.push(paramMod.getText());

    const platMod = mod.platformModifier?.();
    if (platMod) result.modifiers.push(platMod.getText());
  }

  // Process annotations
  const annotations = modifiersCtx.annotation?.() || [];
  for (const ann of annotations) {
    const singleAnn = ann.singleAnnotation?.();
    if (singleAnn) {
      const unescaped = singleAnn.unescapedAnnotation?.();
      if (unescaped) {
        const userType = unescaped.constructorInvocation?.()?.userType?.() || unescaped.userType?.();
        if (userType) {
          const name = userType.getText();
          const args = unescaped.constructorInvocation?.()?.valueArguments?.();
          result.annotations.push({
            name,
            arguments: args ? [args.getText()] : undefined,
          });
        }
      }
    }
  }

  return result;
}

function extractInheritance(delegationCtx: any): {
  baseClasses: string[];
  interfaces: string[];
} {
  const result = { baseClasses: [] as string[], interfaces: [] as string[] };
  if (!delegationCtx) return result;

  const specifiers = delegationCtx.annotatedDelegationSpecifier?.() || [];
  for (const spec of specifiers) {
    const delSpec = spec.delegationSpecifier?.();
    if (!delSpec) continue;

    const ctorInv = delSpec.constructorInvocation?.();
    if (ctorInv) {
      const typeName = ctorInv.userType?.()?.getText();
      if (typeName) result.baseClasses.push(typeName);
      continue;
    }

    const userType = delSpec.userType?.();
    if (userType) {
      const typeName = userType.getText();
      if (typeName) result.interfaces.push(typeName);
    }
  }

  return result;
}

function extractParameters(paramsCtx: any): Array<{
  name: string;
  type?: string | undefined;
  optional?: boolean;
}> {
  const result: Array<{ name: string; type?: string | undefined; optional?: boolean }> = [];
  if (!paramsCtx) return result;

  const params = paramsCtx.functionValueParameter?.() || [];
  for (const param of params) {
    const paramDecl = param.parameter?.();
    if (!paramDecl) continue;

    const name = paramDecl.simpleIdentifier?.()?.getText();
    const type = paramDecl.type?.()?.getText();

    if (name) {
      result.push({
        name,
        type: type || undefined,
        optional: param.expression?.() !== null,
      });
    }
  }

  return result;
}

function extractCalls(bodyCtx: any): string[] {
  if (!bodyCtx) return [];

  const calls: string[] = [];
  const text = bodyCtx.getText() || "";

  // Simple regex extraction
  const callRe = /(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  const keywords = new Set(["if", "when", "for", "while", "return", "throw", "try", "catch", "else"]);

  while ((match = callRe.exec(text))) {
    const callName = match[1];
    if (callName && !keywords.has(callName)) {
      calls.push(callName);
    }
  }

  return Array.from(new Set(calls));
}

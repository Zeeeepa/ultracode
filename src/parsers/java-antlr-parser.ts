/**
 * Java ANTLR Parser
 *
 * Extracts ParsedEntity and EntityRelationship from Java source code
 * using the official Java20 grammar via ANTLR4.
 *
 * This provides accurate AST-based parsing instead of regex-based parsing.
 */

import { CharStream, CommonTokenStream } from "antlr4ng";
import { Java20Lexer } from "../generated/java/Java20Lexer.js";
import {
  type AnnotationInterfaceDeclarationContext,
  type ConstructorDeclarationContext,
  type EnumConstantContext,
  type EnumDeclarationContext,
  type FieldDeclarationContext,
  type ImportDeclarationContext,
  type InterfaceMethodDeclarationContext,
  Java20Parser,
  type MethodDeclarationContext,
  type NormalClassDeclarationContext,
  type NormalInterfaceDeclarationContext,
  type OrdinaryCompilationUnitContext,
  type RecordComponentContext,
  type RecordDeclarationContext,
} from "../generated/java/Java20Parser.js";
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

export class JavaAntlrParser {
  /**
   * Parse Java source code and extract entities/relationships
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
      const lexer = new Java20Lexer(inputStream);
      const tokenStream = new CommonTokenStream(lexer);
      const parser = new Java20Parser(tokenStream);

      // Disable error output for cleaner processing
      parser.removeErrorListeners();

      // Parse the file
      const tree = parser.start_();
      const compilationUnit = tree.compilationUnit();

      if (compilationUnit) {
        const ordinary = compilationUnit.ordinaryCompilationUnit();
        if (ordinary) {
          processOrdinaryCompilationUnit(ordinary, ctx);
        }
      }
    } catch (error) {
      console.error(`[JavaAntlrParser] Error parsing ${filePath}:`, error);
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

function processOrdinaryCompilationUnit(tree: OrdinaryCompilationUnitContext, ctx: ParserContext): void {
  // Create module entity
  ctx.entities.push({
    name: ctx.filePath.split(/[/\\]/).pop() || "module",
    type: "module",
    filePath: ctx.filePath,
    location: getLocation(tree),
  });

  // Process package declaration
  const packageDecl = tree.packageDeclaration();
  if (packageDecl) {
    // Package name is composed of identifiers separated by dots
    const identifiers = packageDecl.identifier();
    if (identifiers.length > 0) {
      ctx.packageName = identifiers.map((id) => id.getText()).join(".");
    }
  }

  // Process imports
  const imports = tree.importDeclaration();
  for (const imp of imports) {
    processImport(imp, ctx);
  }

  // Process top-level declarations
  const topLevelDecls = tree.topLevelClassOrInterfaceDeclaration();
  for (const topLevel of topLevelDecls) {
    const classDecl = topLevel.classDeclaration();
    if (classDecl) {
      const normalClass = classDecl.normalClassDeclaration();
      if (normalClass) {
        processNormalClassDeclaration(normalClass, ctx);
        continue;
      }

      const enumDecl = classDecl.enumDeclaration();
      if (enumDecl) {
        processEnumDeclaration(enumDecl, ctx);
        continue;
      }

      const recordDecl = classDecl.recordDeclaration();
      if (recordDecl) {
        processRecordDeclaration(recordDecl, ctx);
        continue;
      }
    }

    const interfaceDecl = topLevel.interfaceDeclaration();
    if (interfaceDecl) {
      const normalInterface = interfaceDecl.normalInterfaceDeclaration();
      if (normalInterface) {
        processNormalInterfaceDeclaration(normalInterface, ctx);
        continue;
      }

      const annotationInterface = interfaceDecl.annotationInterfaceDeclaration();
      if (annotationInterface) {
        processAnnotationInterfaceDeclaration(annotationInterface, ctx);
      }
    }
  }
}

function processImport(importDecl: ImportDeclarationContext, ctx: ParserContext): void {
  const singleType = importDecl.singleTypeImportDeclaration();
  const typeOnDemand = importDecl.typeImportOnDemandDeclaration();
  const singleStatic = importDecl.singleStaticImportDeclaration();
  const staticOnDemand = importDecl.staticImportOnDemandDeclaration();

  let importPath = "";
  let isStatic = false;
  let isWildcard = false;

  if (singleType) {
    const typeName = singleType.typeName();
    if (typeName) {
      importPath = typeName.getText();
    }
  } else if (typeOnDemand) {
    const packageOrType = typeOnDemand.packageOrTypeName();
    if (packageOrType) {
      importPath = packageOrType.getText() + ".*";
      isWildcard = true;
    }
  } else if (singleStatic) {
    const typeName = singleStatic.typeName();
    const identifier = singleStatic.identifier();
    if (typeName && identifier) {
      importPath = typeName.getText() + "." + identifier.getText();
      isStatic = true;
    }
  } else if (staticOnDemand) {
    const typeName = staticOnDemand.typeName();
    if (typeName) {
      importPath = typeName.getText() + ".*";
      isStatic = true;
      isWildcard = true;
    }
  }

  if (!importPath) return;

  // Store import mapping
  const parts = importPath.replace(".*", "").split(".");
  const simpleName = parts[parts.length - 1];
  if (!isWildcard && simpleName) {
    ctx.imports.set(simpleName, importPath);
  }

  // Create import entity
  ctx.entities.push({
    name: importPath,
    type: "import",
    filePath: ctx.filePath,
    location: getLocation(importDecl),
    metadata: {
      importData: {
        source: importPath,
        specifiers: [],
        isDefault: false,
        isNamespace: isWildcard,
      },
    },
    modifiers: isStatic ? ["static"] : undefined,
  });

  // Create imports relationship
  ctx.relationships.push({
    from: ctx.filePath,
    to: importPath,
    type: "imports",
    metadata: { isStatic, isWildcard },
  });
}

// =============================================================================
// CLASS PROCESSING
// =============================================================================

function processNormalClassDeclaration(classDecl: NormalClassDeclarationContext, ctx: ParserContext): void {
  const typeIdentifier = classDecl.typeIdentifier();
  if (!typeIdentifier) return;

  const className = typeIdentifier.getText();
  const location = getLocation(classDecl);
  const modifiers = extractClassModifiers(classDecl.classModifier());
  const annotations = extractAnnotations(classDecl.classModifier());

  // Extract inheritance
  const inheritance = extractClassInheritance(classDecl);

  // Create entity
  const entity: ParsedEntity = {
    name: className,
    type: "class",
    filePath: ctx.filePath,
    location,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    inheritance: inheritance.baseClasses.length > 0 || inheritance.interfaces.length > 0 ? inheritance : undefined,
    decorators: annotations.length > 0 ? annotations : undefined,
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
  for (const ann of annotations) {
    ctx.relationships.push({
      from: ann.name,
      to: className,
      type: "decorates",
      metadata: { line: location.start.line, arguments: ann.arguments },
    });
  }

  // Process class body
  const prevClass = ctx.currentClass;
  ctx.currentClass = className;

  const classBody = classDecl.classBody();
  if (classBody) {
    const bodyDecls = classBody.classBodyDeclaration();
    for (const bodyDecl of bodyDecls) {
      const memberDecl = bodyDecl.classMemberDeclaration();
      if (memberDecl) {
        processClassMemberDeclaration(memberDecl, ctx);
      }

      const constructorDecl = bodyDecl.constructorDeclaration();
      if (constructorDecl) {
        processConstructorDeclaration(constructorDecl, ctx);
      }
    }
  }

  ctx.currentClass = prevClass;
}

function processClassMemberDeclaration(memberDecl: any, ctx: ParserContext): void {
  const fieldDecl = memberDecl.fieldDeclaration?.();
  if (fieldDecl) {
    processFieldDeclaration(fieldDecl, ctx);
    return;
  }

  const methodDecl = memberDecl.methodDeclaration?.();
  if (methodDecl) {
    processMethodDeclaration(methodDecl, ctx);
    return;
  }

  const classDecl = memberDecl.classDeclaration?.();
  if (classDecl) {
    const normalClass = classDecl.normalClassDeclaration?.();
    if (normalClass) {
      processNormalClassDeclaration(normalClass, ctx);
      return;
    }

    const enumDecl = classDecl.enumDeclaration?.();
    if (enumDecl) {
      processEnumDeclaration(enumDecl, ctx);
      return;
    }

    const recordDecl = classDecl.recordDeclaration?.();
    if (recordDecl) {
      processRecordDeclaration(recordDecl, ctx);
      return;
    }
  }

  const interfaceDecl = memberDecl.interfaceDeclaration?.();
  if (interfaceDecl) {
    const normalInterface = interfaceDecl.normalInterfaceDeclaration?.();
    if (normalInterface) {
      processNormalInterfaceDeclaration(normalInterface, ctx);
      return;
    }
  }
}

// =============================================================================
// INTERFACE PROCESSING
// =============================================================================

function processNormalInterfaceDeclaration(interfaceDecl: NormalInterfaceDeclarationContext, ctx: ParserContext): void {
  const typeIdentifier = interfaceDecl.typeIdentifier();
  if (!typeIdentifier) return;

  const interfaceName = typeIdentifier.getText();
  const location = getLocation(interfaceDecl);
  const modifiers = extractInterfaceModifiers(interfaceDecl.interfaceModifier());
  const annotations = extractAnnotationsFromInterfaceModifiers(interfaceDecl.interfaceModifier());

  // Extract inheritance (extends)
  const inheritance = extractInterfaceInheritance(interfaceDecl);

  // Create entity
  const entity: ParsedEntity = {
    name: interfaceName,
    type: "interface",
    filePath: ctx.filePath,
    location,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    inheritance:
      inheritance.interfaces.length > 0 ? { baseClasses: [], interfaces: inheritance.interfaces } : undefined,
    decorators: annotations.length > 0 ? annotations : undefined,
    children: [],
  };

  ctx.entities.push(entity);

  // Create extends relationships
  for (const iface of inheritance.interfaces) {
    ctx.relationships.push({
      from: interfaceName,
      to: iface,
      type: "inherits",
      metadata: { line: location.start.line },
    });
  }

  // Process interface body
  const prevClass = ctx.currentClass;
  ctx.currentClass = interfaceName;

  const interfaceBody = interfaceDecl.interfaceBody();
  if (interfaceBody) {
    const memberDecls = interfaceBody.interfaceMemberDeclaration();
    for (const memberDecl of memberDecls) {
      processInterfaceMemberDeclaration(memberDecl, ctx);
    }
  }

  ctx.currentClass = prevClass;
}

function processInterfaceMemberDeclaration(memberDecl: any, ctx: ParserContext): void {
  const constantDecl = memberDecl.constantDeclaration?.();
  if (constantDecl) {
    processConstantDeclaration(constantDecl, ctx);
    return;
  }

  const methodDecl = memberDecl.interfaceMethodDeclaration?.();
  if (methodDecl) {
    processInterfaceMethodDeclaration(methodDecl, ctx);
    return;
  }

  const classDecl = memberDecl.classDeclaration?.();
  if (classDecl) {
    const normalClass = classDecl.normalClassDeclaration?.();
    if (normalClass) {
      processNormalClassDeclaration(normalClass, ctx);
    }
  }

  const interfaceDecl = memberDecl.interfaceDeclaration?.();
  if (interfaceDecl) {
    const normalInterface = interfaceDecl.normalInterfaceDeclaration?.();
    if (normalInterface) {
      processNormalInterfaceDeclaration(normalInterface, ctx);
    }
  }
}

function processAnnotationInterfaceDeclaration(
  annotationDecl: AnnotationInterfaceDeclarationContext,
  ctx: ParserContext,
): void {
  const typeIdentifier = annotationDecl.typeIdentifier();
  if (!typeIdentifier) return;

  const annotationName = typeIdentifier.getText();
  const location = getLocation(annotationDecl);
  const modifiers = extractInterfaceModifiers(annotationDecl.interfaceModifier());

  ctx.entities.push({
    name: annotationName,
    type: "interface",
    filePath: ctx.filePath,
    location,
    modifiers: [...modifiers, "annotation"],
  });
}

// =============================================================================
// ENUM PROCESSING
// =============================================================================

function processEnumDeclaration(enumDecl: EnumDeclarationContext, ctx: ParserContext): void {
  const typeIdentifier = enumDecl.typeIdentifier();
  if (!typeIdentifier) return;

  const enumName = typeIdentifier.getText();
  const location = getLocation(enumDecl);
  const modifiers = extractClassModifiers(enumDecl.classModifier());
  const annotations = extractAnnotations(enumDecl.classModifier());

  // Extract implements
  const interfaces: string[] = [];
  const classImplements = enumDecl.classImplements();
  if (classImplements) {
    const interfaceList = classImplements.interfaceTypeList();
    if (interfaceList) {
      for (const interfaceType of interfaceList.interfaceType()) {
        interfaces.push(interfaceType.getText());
      }
    }
  }

  ctx.entities.push({
    name: enumName,
    type: "enum",
    filePath: ctx.filePath,
    location,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    inheritance: interfaces.length > 0 ? { baseClasses: [], interfaces } : undefined,
    decorators: annotations.length > 0 ? annotations : undefined,
  });

  // Create implements relationships
  for (const iface of interfaces) {
    ctx.relationships.push({
      from: enumName,
      to: iface,
      type: "implements",
      metadata: { line: location.start.line },
    });
  }

  // Process enum body
  const prevClass = ctx.currentClass;
  ctx.currentClass = enumName;

  const enumBody = enumDecl.enumBody();
  if (enumBody) {
    // Process enum constants
    const enumConstantList = enumBody.enumConstantList();
    if (enumConstantList) {
      for (const enumConstant of enumConstantList.enumConstant()) {
        processEnumConstant(enumConstant, ctx);
      }
    }

    // Process enum body declarations (methods, fields)
    const enumBodyDecls = enumBody.enumBodyDeclarations();
    if (enumBodyDecls) {
      const classBodyDecls = enumBodyDecls.classBodyDeclaration();
      for (const bodyDecl of classBodyDecls) {
        const memberDecl = bodyDecl.classMemberDeclaration?.();
        if (memberDecl) {
          processClassMemberDeclaration(memberDecl, ctx);
        }

        const constructorDecl = bodyDecl.constructorDeclaration?.();
        if (constructorDecl) {
          processConstructorDeclaration(constructorDecl, ctx);
        }
      }
    }
  }

  ctx.currentClass = prevClass;
}

function processEnumConstant(enumConstant: EnumConstantContext, ctx: ParserContext): void {
  const identifier = enumConstant.identifier();
  if (!identifier) return;

  const constantName = identifier.getText();

  ctx.entities.push({
    name: constantName,
    type: "enum_variant",
    filePath: ctx.filePath,
    location: getLocation(enumConstant),
  });

  if (ctx.currentClass) {
    ctx.relationships.push({
      from: ctx.currentClass,
      to: constantName,
      type: "contains",
      metadata: {},
    });
  }
}

// =============================================================================
// RECORD PROCESSING
// =============================================================================

function processRecordDeclaration(recordDecl: RecordDeclarationContext, ctx: ParserContext): void {
  const typeIdentifier = recordDecl.typeIdentifier();
  if (!typeIdentifier) return;

  const recordName = typeIdentifier.getText();
  const location = getLocation(recordDecl);
  const modifiers = extractClassModifiers(recordDecl.classModifier());
  const annotations = extractAnnotations(recordDecl.classModifier());

  // Extract implements
  const interfaces: string[] = [];
  const classImplements = recordDecl.classImplements();
  if (classImplements) {
    const interfaceList = classImplements.interfaceTypeList();
    if (interfaceList) {
      for (const interfaceType of interfaceList.interfaceType()) {
        interfaces.push(interfaceType.getText());
      }
    }
  }

  // Extract record components (parameters)
  const params: Array<{ name: string; type?: string }> = [];
  const recordHeader = recordDecl.recordHeader();
  if (recordHeader) {
    const componentList = recordHeader.recordComponentList();
    if (componentList) {
      for (const component of componentList.recordComponent()) {
        processRecordComponent(component, params);
      }
    }
  }

  ctx.entities.push({
    name: recordName,
    type: "class",
    filePath: ctx.filePath,
    location,
    modifiers: [...modifiers, "record"],
    parameters: params.length > 0 ? params : undefined,
    inheritance: interfaces.length > 0 ? { baseClasses: [], interfaces } : undefined,
    decorators: annotations.length > 0 ? annotations : undefined,
  });

  // Process record body
  const prevClass = ctx.currentClass;
  ctx.currentClass = recordName;

  const recordBody = recordDecl.recordBody();
  if (recordBody) {
    const bodyDecls = recordBody.recordBodyDeclaration();
    for (const bodyDecl of bodyDecls) {
      const memberDecl = bodyDecl.classBodyDeclaration?.();
      if (memberDecl) {
        const classMember = memberDecl.classMemberDeclaration?.();
        if (classMember) {
          processClassMemberDeclaration(classMember, ctx);
        }
      }
    }
  }

  ctx.currentClass = prevClass;
}

function processRecordComponent(
  component: RecordComponentContext,
  params: Array<{ name: string; type?: string }>,
): void {
  const identifier = component.identifier();
  const unannType = component.unannType();

  if (identifier) {
    params.push({
      name: identifier.getText(),
      type: unannType?.getText() || undefined,
    });
  }
}

// =============================================================================
// METHOD PROCESSING
// =============================================================================

function processMethodDeclaration(methodDecl: MethodDeclarationContext, ctx: ParserContext): void {
  const methodHeader = methodDecl.methodHeader();
  if (!methodHeader) return;

  const methodDeclarator = methodHeader.methodDeclarator();
  if (!methodDeclarator) return;

  const identifier = methodDeclarator.identifier();
  if (!identifier) return;

  const methodName = identifier.getText();
  const location = getLocation(methodDecl);
  const modifiers = extractMethodModifiers(methodDecl.methodModifier());
  const annotations = extractAnnotationsFromMethodModifiers(methodDecl.methodModifier());

  // Extract return type
  const result = methodHeader.result();
  const returnType = result?.getText();

  // Extract parameters
  const params = extractMethodParameters(methodDeclarator);

  // Extract throws
  const throwsClause = methodHeader.throwsT?.();
  const throwsTypes: string[] = [];
  if (throwsClause) {
    const exceptionList = throwsClause.exceptionTypeList?.();
    if (exceptionList) {
      for (const exc of exceptionList.exceptionType?.() || []) {
        throwsTypes.push(exc.getText());
      }
    }
  }

  const fullName = ctx.currentClass ? `${ctx.currentClass}.${methodName}` : methodName;

  const entity: ParsedEntity = {
    name: fullName,
    type: "method",
    filePath: ctx.filePath,
    location,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    parameters: params.length > 0 ? params : undefined,
    returnType: returnType !== "void" ? returnType : undefined,
    decorators: annotations.length > 0 ? annotations : undefined,
    metadata: throwsTypes.length > 0 ? { throws: throwsTypes } : undefined,
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

  for (const ann of annotations) {
    ctx.relationships.push({
      from: ann.name,
      to: fullName,
      type: "decorates",
      metadata: { line: location.start.line, arguments: ann.arguments },
    });
  }

  // Check for Override annotation
  if (annotations.some((a) => a.name === "Override")) {
    ctx.relationships.push({
      from: fullName,
      to: `*.${methodName}`,
      type: "overrides",
      metadata: { line: location.start.line },
    });
  }

  // Extract calls from method body
  const methodBody = methodDecl.methodBody();
  if (methodBody) {
    const calls = extractCalls(methodBody);
    for (const call of calls) {
      ctx.relationships.push({
        from: fullName,
        to: call,
        type: "calls",
        metadata: {},
      });
    }
  }
}

function processInterfaceMethodDeclaration(methodDecl: InterfaceMethodDeclarationContext, ctx: ParserContext): void {
  const methodHeader = methodDecl.methodHeader();
  if (!methodHeader) return;

  const methodDeclarator = methodHeader.methodDeclarator();
  if (!methodDeclarator) return;

  const identifier = methodDeclarator.identifier();
  if (!identifier) return;

  const methodName = identifier.getText();
  const location = getLocation(methodDecl);
  const modifiers = extractInterfaceMethodModifiers(methodDecl.interfaceMethodModifier());

  // Extract return type
  const result = methodHeader.result();
  const returnType = result?.getText();

  // Extract parameters
  const params = extractMethodParameters(methodDeclarator);

  const fullName = ctx.currentClass ? `${ctx.currentClass}.${methodName}` : methodName;

  ctx.entities.push({
    name: fullName,
    type: "method",
    filePath: ctx.filePath,
    location,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    parameters: params.length > 0 ? params : undefined,
    returnType: returnType !== "void" ? returnType : undefined,
  });

  if (ctx.currentClass) {
    ctx.relationships.push({
      from: ctx.currentClass,
      to: fullName,
      type: "contains",
      metadata: {},
    });
  }
}

function processConstructorDeclaration(constructorDecl: ConstructorDeclarationContext, ctx: ParserContext): void {
  const declarator = constructorDecl.constructorDeclarator();
  if (!declarator) return;

  const location = getLocation(constructorDecl);
  const modifiers = extractConstructorModifiers(constructorDecl.constructorModifier());

  // Extract parameters
  const params = extractConstructorParameters(declarator);

  const fullName = ctx.currentClass ? `${ctx.currentClass}.${ctx.currentClass}` : "constructor";

  ctx.entities.push({
    name: fullName,
    type: "method",
    filePath: ctx.filePath,
    location,
    modifiers: [...modifiers, "constructor"],
    parameters: params.length > 0 ? params : undefined,
  });

  if (ctx.currentClass) {
    ctx.relationships.push({
      from: ctx.currentClass,
      to: fullName,
      type: "contains",
      metadata: {},
    });
  }
}

// =============================================================================
// FIELD PROCESSING
// =============================================================================

function processFieldDeclaration(fieldDecl: FieldDeclarationContext, ctx: ParserContext): void {
  const modifiers = extractFieldModifiers(fieldDecl.fieldModifier());
  const annotations = extractAnnotationsFromFieldModifiers(fieldDecl.fieldModifier());

  // Extract type
  const unannType = fieldDecl.unannType();
  const fieldType = unannType?.getText();

  // Extract variable declarators
  const variableDeclaratorList = fieldDecl.variableDeclaratorList();
  if (!variableDeclaratorList) return;

  for (const varDecl of variableDeclaratorList.variableDeclarator()) {
    const varDeclId = varDecl.variableDeclaratorId();
    if (!varDeclId) continue;

    const identifier = varDeclId.identifier();
    if (!identifier) continue;

    const fieldName = identifier.getText();
    const isConstant = modifiers.includes("final") && modifiers.includes("static");

    const fullName = ctx.currentClass ? `${ctx.currentClass}.${fieldName}` : fieldName;

    ctx.entities.push({
      name: fullName,
      type: isConstant ? "constant" : "property",
      filePath: ctx.filePath,
      location: getLocation(varDecl),
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      metadata: fieldType ? { propertyType: fieldType } : undefined,
      decorators: annotations.length > 0 ? annotations : undefined,
    });

    if (ctx.currentClass) {
      ctx.relationships.push({
        from: ctx.currentClass,
        to: fullName,
        type: "contains",
        metadata: {},
      });
    }

    if (fieldType) {
      const baseType = fieldType.replace(/<.*>/, "").replace(/\[\]/, "");
      ctx.relationships.push({
        from: fullName,
        to: baseType,
        type: "references",
        metadata: { referenceKind: "field" },
      });
    }
  }
}

function processConstantDeclaration(constantDecl: any, ctx: ParserContext): void {
  const modifiers = extractConstantModifiers(constantDecl.constantModifier?.());

  // Extract type
  const unannType = constantDecl.unannType?.();
  const fieldType = unannType?.getText();

  // Extract variable declarators
  const variableDeclaratorList = constantDecl.variableDeclaratorList?.();
  if (!variableDeclaratorList) return;

  for (const varDecl of variableDeclaratorList.variableDeclarator?.() || []) {
    const varDeclId = varDecl.variableDeclaratorId?.();
    if (!varDeclId) continue;

    const identifier = varDeclId.identifier?.();
    if (!identifier) continue;

    const constantName = identifier.getText();

    const fullName = ctx.currentClass ? `${ctx.currentClass}.${constantName}` : constantName;

    ctx.entities.push({
      name: fullName,
      type: "constant",
      filePath: ctx.filePath,
      location: getLocation(varDecl),
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      metadata: fieldType ? { propertyType: fieldType } : undefined,
    });

    if (ctx.currentClass) {
      ctx.relationships.push({
        from: ctx.currentClass,
        to: fullName,
        type: "contains",
        metadata: {},
      });
    }
  }
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

function extractClassModifiers(modifiersCtx: any[]): string[] {
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

function extractInterfaceModifiers(modifiersCtx: any[]): string[] {
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

function extractMethodModifiers(modifiersCtx: any[]): string[] {
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

function extractInterfaceMethodModifiers(modifiersCtx: any[]): string[] {
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

function extractFieldModifiers(modifiersCtx: any[]): string[] {
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

function extractConstructorModifiers(modifiersCtx: any[]): string[] {
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

function extractConstantModifiers(modifiersCtx: any[]): string[] {
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

function extractAnnotations(modifiersCtx: any[]): Array<{ name: string; arguments?: string[] }> {
  const annotations: Array<{ name: string; arguments?: string[] }> = [];
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

function extractAnnotationsFromInterfaceModifiers(modifiersCtx: any[]): Array<{ name: string; arguments?: string[] }> {
  return extractAnnotations(modifiersCtx);
}

function extractAnnotationsFromMethodModifiers(modifiersCtx: any[]): Array<{ name: string; arguments?: string[] }> {
  return extractAnnotations(modifiersCtx);
}

function extractAnnotationsFromFieldModifiers(modifiersCtx: any[]): Array<{ name: string; arguments?: string[] }> {
  return extractAnnotations(modifiersCtx);
}

function extractClassInheritance(classDecl: NormalClassDeclarationContext): {
  baseClasses: string[];
  interfaces: string[];
} {
  const result = { baseClasses: [] as string[], interfaces: [] as string[] };

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

function extractInterfaceInheritance(interfaceDecl: NormalInterfaceDeclarationContext): {
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

function extractMethodParameters(methodDeclarator: any): Array<{
  name: string;
  type?: string;
  optional?: boolean;
}> {
  const params: Array<{ name: string; type?: string; optional?: boolean }> = [];

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

function extractConstructorParameters(declarator: any): Array<{
  name: string;
  type?: string;
  optional?: boolean;
}> {
  const params: Array<{ name: string; type?: string; optional?: boolean }> = [];

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

function extractCalls(bodyCtx: any): string[] {
  if (!bodyCtx) return [];

  const calls: string[] = [];
  const text = bodyCtx.getText() || "";

  // Simple regex extraction
  const callRe = /(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  const keywords = new Set([
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

  while ((match = callRe.exec(text))) {
    const callName = match[1];
    if (callName && !keywords.has(callName)) {
      calls.push(callName);
    }
  }

  return Array.from(new Set(calls));
}

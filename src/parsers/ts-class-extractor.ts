/**
 * TypeScript Class Extractor
 *
 * Extracts class declarations with all members (methods, properties, constructors, accessors).
 */

import ts from "typescript";
import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";
import { extractAntipatternHints } from "./ts-antipattern-hints-extractor.js";
import { getDecorators, getLocation, getModifiers, getParameters, getReturnType } from "./ts-ast-helpers.js";
import { type CallInfo, extractCalls, extractTypeReferences, type TypeReference } from "./ts-call-extractor.js";
import { extractComplexity } from "./ts-complexity-analyzer.js";
import { extractControlFlow } from "./ts-control-flow-extractor.js";
import { extractDocumentation } from "./ts-doc-extractor.js";
import { extractJitHints } from "./ts-jit-hints-extractor.js";
import { extractNgRxEffectInfo, extractNgRxStoreUsage, type NgRxEffectInfo } from "./ts-ngrx-extractor.js";

export interface ClassExtractorContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
}

/**
 * Add type reference relationships (excluding extends/implements)
 */
function addTypeReferenceRelationships(
  entityName: string,
  typeRefs: TypeReference[] | undefined,
  filePath: string,
  relationships: EntityRelationship[],
): void {
  if (!typeRefs) return;
  for (const ref of typeRefs) {
    if (ref.kind === "extends" || ref.kind === "implements") continue;
    relationships.push({
      from: entityName,
      to: ref.name,
      type: "references",
      sourceFile: filePath,
      metadata: {
        line: ref.location.start.line,
        referenceKind: ref.kind,
      },
    });
  }
}

/**
 * Extract class declaration with all members
 */
export function extractClassDeclaration(node: ts.ClassDeclaration, ctx: ClassExtractorContext): void {
  if (!node.name) return;

  const { sourceFile, filePath, entities, relationships } = ctx;
  const className = node.name.text;
  const modifiers = getModifiers(node);

  // Extract base classes and interfaces
  const baseClasses: string[] = [];
  const interfaces: string[] = [];
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      for (const type of clause.types) {
        const typeName = type.expression.getText(sourceFile);
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          baseClasses.push(typeName);
        } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          interfaces.push(typeName);
        }
      }
    }
  }

  const classDocumentation = extractDocumentation(node, sourceFile);
  const classTypeRefs = extractTypeReferences(node, sourceFile);
  const classLocation = getLocation(sourceFile, node);

  const classEntity: ParsedEntity = {
    name: className,
    type: "class",
    filePath,
    location: classLocation,
    modifiers,
    decorators: getDecorators(node, sourceFile),
    inheritance:
      baseClasses.length > 0 || interfaces.length > 0
        ? {
            baseClasses,
            ...(interfaces.length > 0 && { interfaces }),
            isAbstract: modifiers.includes("abstract"),
          }
        : undefined,
    documentation: classDocumentation,
    typeReferences: classTypeRefs,
    children: [],
  };

  // Create inheritance relationships
  for (const baseClass of baseClasses) {
    relationships.push({
      from: className,
      to: baseClass,
      type: "inherits",
      sourceFile: filePath,
      metadata: { line: classLocation.start.line, isDirectRelation: true },
    });
  }

  // Create implements relationships
  for (const iface of interfaces) {
    relationships.push({
      from: className,
      to: iface,
      type: "implements",
      sourceFile: filePath,
      metadata: { line: classLocation.start.line, isDirectRelation: true },
    });
  }

  // Create decorates relationships for class decorators
  const classDecorators = getDecorators(node, sourceFile);
  if (classDecorators) {
    for (const dec of classDecorators) {
      relationships.push({
        from: dec.name,
        to: className,
        type: "decorates",
        sourceFile: filePath,
        metadata: { line: classLocation.start.line, decoratorArguments: dec.arguments },
      });
    }
  }

  // Add type references relationships for class
  addTypeReferenceRelationships(className, classTypeRefs, filePath, relationships);

  // Helper to add contains + calls relationships for a member
  const addMemberRelationships = (
    memberName: string,
    memberLocation: ParsedEntity["location"],
    calls: CallInfo[] | undefined,
  ): void => {
    relationships.push({
      from: className,
      to: memberName,
      type: "contains",
      sourceFile: filePath,
      metadata: { line: memberLocation.start.line, isDirectRelation: true },
    });

    if (calls) {
      for (const call of calls) {
        const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
        relationships.push({
          from: `${className}.${memberName}`,
          to: calledTarget,
          type: "calls",
          sourceFile: filePath,
          metadata: {
            line: call.location.start.line,
            isAwait: call.isAwait,
            isNew: call.isNew,
            argumentCount: call.argumentCount,
          },
        });
      }
    }
  };

  // Extract class members
  for (const member of node.members) {
    extractClassMember(member, {
      className,
      baseClasses,
      classEntity,
      sourceFile,
      filePath,
      relationships,
      addMemberRelationships,
      addTypeReferenceRelationships: (name, refs) => addTypeReferenceRelationships(name, refs, filePath, relationships),
    });
  }

  entities.push(classEntity);
}

interface MemberContext {
  className: string;
  baseClasses: string[];
  classEntity: ParsedEntity;
  sourceFile: ts.SourceFile;
  filePath: string;
  relationships: EntityRelationship[];
  addMemberRelationships: (name: string, loc: ParsedEntity["location"], calls?: CallInfo[]) => void;
  addTypeReferenceRelationships: (name: string, refs: TypeReference[] | undefined) => void;
}

/**
 * Extract a single class member
 */
function extractClassMember(member: ts.ClassElement, ctx: MemberContext): void {
  // Method
  if (ts.isMethodDeclaration(member) && member.name) {
    extractMethod(member, ctx);
    return;
  }

  // Property
  if (ts.isPropertyDeclaration(member) && member.name) {
    extractProperty(member, ctx);
    return;
  }

  // Constructor
  if (ts.isConstructorDeclaration(member)) {
    extractConstructor(member, ctx);
    return;
  }

  // Getter
  if (ts.isGetAccessor(member) && member.name) {
    extractAccessor(member, "getter", ctx);
    return;
  }

  // Setter
  if (ts.isSetAccessor(member) && member.name) {
    extractAccessor(member, "setter", ctx);
    return;
  }
}

/**
 * Extract method declaration
 */
function extractMethod(member: ts.MethodDeclaration, ctx: MemberContext): void {
  const { className, baseClasses, classEntity, sourceFile, filePath, relationships } = ctx;
  const methodName = member.name!.getText(sourceFile);
  const methodModifiers = getModifiers(member);
  const isAsync = methodModifiers.includes("async");
  const methodCalls = extractCalls(member, sourceFile);
  const methodControlFlow = extractControlFlow(member, sourceFile);
  const methodDoc = extractDocumentation(member, sourceFile);
  const methodTypeRefs = extractTypeReferences(member, sourceFile);
  const methodComplexity = extractComplexity(member, sourceFile);
  const methodJitHints = extractJitHints(member, sourceFile);
  const methodAntipatternHints = extractAntipatternHints(member, sourceFile);
  const methodLocation = getLocation(sourceFile, member);
  const methodDecorators = getDecorators(member, sourceFile);

  // Extract NgRx store.dispatch() and store.select() calls
  const ngrxStoreUsage = extractNgRxStoreUsage(member, sourceFile);

  classEntity.children!.push({
    name: methodName,
    type: isAsync ? "async_function" : "method",
    filePath,
    location: methodLocation,
    modifiers: methodModifiers,
    parameters: getParameters(member, sourceFile),
    returnType: getReturnType(member, sourceFile),
    decorators: methodDecorators,
    ...(methodCalls.length > 0 && { calls: methodCalls }),
    controlFlow: methodControlFlow,
    documentation: methodDoc,
    typeReferences: methodTypeRefs,
    complexity: methodComplexity,
    ...(methodJitHints && { jitHints: methodJitHints }),
    ...(methodAntipatternHints && { antipatternHints: methodAntipatternHints }),
    metadata:
      ngrxStoreUsage.dispatches.length > 0 || ngrxStoreUsage.selects.length > 0
        ? {
            ngrxStoreUsage: {
              dispatches: ngrxStoreUsage.dispatches.map((d) => d.actionName),
              selects: ngrxStoreUsage.selects.map((s) => s.selectorName),
            },
          }
        : undefined,
  });

  ctx.addMemberRelationships(methodName, methodLocation, methodCalls);

  // Add NgRx dispatches relationships
  for (const dispatch of ngrxStoreUsage.dispatches) {
    relationships.push({
      from: `${className}.${methodName}`,
      to: dispatch.actionName,
      type: "dispatches",
      sourceFile: filePath,
      metadata: { line: dispatch.location.line, relationKind: "ngrx_dispatch" },
    });
  }

  // Add NgRx selects relationships
  for (const sel of ngrxStoreUsage.selects) {
    relationships.push({
      from: `${className}.${methodName}`,
      to: sel.selectorName,
      type: "selects",
      sourceFile: filePath,
      metadata: { line: sel.location.line, relationKind: "ngrx_select" },
    });
  }

  // Create overrides relationship
  if (methodModifiers.includes("override") && baseClasses.length > 0) {
    relationships.push({
      from: `${className}.${methodName}`,
      to: `${baseClasses[0]}.${methodName}`,
      type: "overrides",
      sourceFile: filePath,
      metadata: { line: methodLocation.start.line },
    });
  }

  // Create decorates relationships for method decorators
  if (methodDecorators) {
    for (const dec of methodDecorators) {
      relationships.push({
        from: dec.name,
        to: `${className}.${methodName}`,
        type: "decorates",
        sourceFile: filePath,
        metadata: { line: methodLocation.start.line, decoratorArguments: dec.arguments },
      });
    }
  }

  ctx.addTypeReferenceRelationships(`${className}.${methodName}`, methodTypeRefs);
}

/**
 * Extract property declaration
 */
function extractProperty(member: ts.PropertyDeclaration, ctx: MemberContext): void {
  const { className, classEntity, sourceFile, filePath, relationships } = ctx;
  const propName = member.name!.getText(sourceFile);
  const propDoc = extractDocumentation(member, sourceFile);
  const propTypeRefs = extractTypeReferences(member, sourceFile);
  const propLocation = getLocation(sourceFile, member);

  // Check if this is an NgRx effect
  let ngrxEffectInfo: NgRxEffectInfo | undefined;
  let entityType: ParsedEntity["type"] = "property";

  if (member.initializer) {
    ngrxEffectInfo = extractNgRxEffectInfo(member.initializer, sourceFile);
    if (ngrxEffectInfo) {
      log.d("TSEXTRACT", "ngrx_effect", {
        cls: className,
        prop: propName,
        listens: ngrxEffectInfo.listensTo.map((a) => a.actionName).join(","),
      });
      entityType = "ngrx_effect";
    }
  }

  const propEntity: ParsedEntity = {
    name: propName,
    type: entityType,
    filePath,
    location: propLocation,
    modifiers: getModifiers(member),
    documentation: propDoc,
    typeReferences: propTypeRefs,
  };

  // Add NgRx-specific metadata
  if (ngrxEffectInfo) {
    propEntity.metadata = {
      ...propEntity.metadata,
      ngrxEffect: {
        listensTo: ngrxEffectInfo.listensTo.map((a) => a.actionName),
        dispatches: ngrxEffectInfo.dispatches.map((a) => a.actionName),
        dispatchFalse: ngrxEffectInfo.dispatchFalse,
        servicesCalled: ngrxEffectInfo.servicesCalled.map((s) => `${s.serviceName}.${s.methodName}`),
      },
    };

    // Create "listens_to" relationships
    for (const action of ngrxEffectInfo.listensTo) {
      relationships.push({
        from: `${className}.${propName}`,
        to: action.actionName,
        type: "listens_to",
        sourceFile: filePath,
        metadata: { line: action.location.line, relationKind: "ngrx_action_listener" },
      });
    }

    // Create "dispatches" relationships
    for (const action of ngrxEffectInfo.dispatches) {
      relationships.push({
        from: `${className}.${propName}`,
        to: action.actionName,
        type: "dispatches",
        sourceFile: filePath,
        metadata: { line: action.location.line, relationKind: "ngrx_action_dispatch" },
      });
    }

    // Create "calls" relationships for service methods
    for (const service of ngrxEffectInfo.servicesCalled) {
      relationships.push({
        from: `${className}.${propName}`,
        to: `${service.serviceName}.${service.methodName}`,
        type: "calls",
        sourceFile: filePath,
        metadata: { line: service.location.line, isNgrxEffect: true, relationKind: "ngrx_service_call" },
      });
    }
  }

  classEntity.children!.push(propEntity);

  // Contains relationship for properties
  relationships.push({
    from: className,
    to: propName,
    type: "contains",
    sourceFile: filePath,
    metadata: {
      line: propLocation.start.line,
      isDirectRelation: true,
      memberType: ngrxEffectInfo ? "ngrx_effect" : "property",
    },
  });

  ctx.addTypeReferenceRelationships(`${className}.${propName}`, propTypeRefs);
}

/**
 * Extract constructor
 */
function extractConstructor(member: ts.ConstructorDeclaration, ctx: MemberContext): void {
  const { className, classEntity, sourceFile, filePath } = ctx;
  const constructorCalls = extractCalls(member, sourceFile);
  const constructorControlFlow = extractControlFlow(member, sourceFile);
  const constructorDoc = extractDocumentation(member, sourceFile);
  const constructorTypeRefs = extractTypeReferences(member, sourceFile);
  const constructorComplexity = extractComplexity(member, sourceFile);
  const constructorAntipatternHints = extractAntipatternHints(member, sourceFile);
  const constructorLocation = getLocation(sourceFile, member);

  classEntity.children!.push({
    name: "constructor",
    type: "method",
    filePath,
    location: constructorLocation,
    modifiers: getModifiers(member),
    parameters: getParameters(member, sourceFile),
    ...(constructorCalls.length > 0 && { calls: constructorCalls }),
    controlFlow: constructorControlFlow,
    documentation: constructorDoc,
    typeReferences: constructorTypeRefs,
    complexity: constructorComplexity,
    ...(constructorAntipatternHints && { antipatternHints: constructorAntipatternHints }),
  });

  ctx.addMemberRelationships("constructor", constructorLocation, constructorCalls);
  ctx.addTypeReferenceRelationships(`${className}.constructor`, constructorTypeRefs);
}

/**
 * Extract getter or setter
 */
function extractAccessor(
  member: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  accessorType: "getter" | "setter",
  ctx: MemberContext,
): void {
  const { className, classEntity, sourceFile, filePath } = ctx;
  const accessorName = member.name!.getText(sourceFile);
  const accessorCalls = extractCalls(member, sourceFile);
  const accessorControlFlow = extractControlFlow(member, sourceFile);
  const accessorDoc = extractDocumentation(member, sourceFile);
  const accessorTypeRefs = extractTypeReferences(member, sourceFile);
  const accessorComplexity = extractComplexity(member, sourceFile);
  const accessorLocation = getLocation(sourceFile, member);

  const entity: ParsedEntity = {
    name: accessorName,
    type: "property",
    filePath,
    location: accessorLocation,
    modifiers: [...getModifiers(member), accessorType],
    ...(accessorCalls.length > 0 && { calls: accessorCalls }),
    controlFlow: accessorControlFlow,
    documentation: accessorDoc,
    typeReferences: accessorTypeRefs,
    complexity: accessorComplexity,
  };

  if (accessorType === "getter") {
    entity.returnType = getReturnType(member as ts.GetAccessorDeclaration, sourceFile);
  } else {
    entity.parameters = getParameters(member as ts.SetAccessorDeclaration, sourceFile);
  }

  classEntity.children!.push(entity);
  ctx.addMemberRelationships(accessorName, accessorLocation, accessorCalls);
  ctx.addTypeReferenceRelationships(`${className}.${accessorName}`, accessorTypeRefs);
}

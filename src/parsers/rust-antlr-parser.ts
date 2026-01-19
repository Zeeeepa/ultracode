/**
 * Rust ANTLR Parser
 *
 * Extracts ParsedEntity and EntityRelationship from Rust source code
 * using ANTLR4 grammar.
 *
 * This provides accurate AST-based parsing instead of regex-based parsing.
 */

import { CharStream, CommonTokenStream, PredictionMode, type TokenSource } from "antlr4ng";
import { RustLexer } from "../generated/rust/RustLexer.js";
import {
  type ConstantItemContext,
  type CrateContext,
  type EnumerationContext,
  type Function_Context,
  type ImplementationContext,
  type ItemContext,
  type ModuleContext,
  RustParser,
  type StaticItemContext,
  type Struct_Context,
  type Trait_Context,
  type TypeAliasContext,
  type UseDeclarationContext,
  type VisItemContext,
} from "../generated/rust/RustParser.js";
import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

interface AntlrToken {
  line?: number;
  column?: number;
  start?: number;
  stop?: number;
  text?: string;
}

interface AntlrParserRuleContext {
  start?: AntlrToken;
  _start?: AntlrToken;
  stop?: AntlrToken;
  _stop?: AntlrToken;
  getText?: () => string;
}

interface ParserWithErrorListeners {
  removeErrorListeners?: () => void;
}

interface ParserContext {
  filePath: string;
  modulePath: string[];
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  currentStruct: string | null;
  currentImpl: string | null;
}

type LocationInfo = {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
};

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

export class RustAntlrParser {
  /**
   * Parse Rust source code and extract entities/relationships
   */
  static parse(filePath: string, content: string): { entities: ParsedEntity[]; relationships: EntityRelationship[] } {
    const ctx: ParserContext = {
      filePath,
      modulePath: [],
      entities: [],
      relationships: [],
      currentStruct: null,
      currentImpl: null,
    };

    try {
      const inputStream = CharStream.fromString(content);
      const lexer = new RustLexer(inputStream);
      const tokenStream = new CommonTokenStream(lexer as unknown as TokenSource);
      const parser = new RustParser(tokenStream);

      // Disable error output for cleaner processing
      (parser as unknown as ParserWithErrorListeners).removeErrorListeners?.();

      // OPTIMIZATION: Use SLL mode first (15-20% faster), fallback to ALL(*) on ambiguity
      // SLL works for ~95% of valid Rust code
      let tree: CrateContext;
      const interpreter = (parser as any).interpreter;
      if (interpreter) {
        try {
          interpreter.predictionMode = PredictionMode.SLL;
          tree = parser.crate();
        } catch (_sllError) {
          // SLL failed, reset and use ALL(*)
          tokenStream.seek(0);
          (parser as any).reset?.();
          interpreter.predictionMode = PredictionMode.LL;
          tree = parser.crate();
        }
      } else {
        tree = parser.crate();
      }

      // Process AST
      processCrate(tree, ctx);
    } catch (error) {
      log.e("RUSTANTLR", "parse_err", { file: filePath, err: String(error) });
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

function processCrate(tree: CrateContext, ctx: ParserContext): void {
  // Create module entity
  ctx.entities.push({
    name: ctx.filePath.split(/[/\\]/).pop() || "module",
    type: "module",
    filePath: ctx.filePath,
    location: getLocation(tree),
  });

  // Process items
  const items = tree.item();
  for (const item of items) {
    processItem(item, ctx);
  }
}

function processItem(item: ItemContext, ctx: ParserContext): void {
  const visItem = item.visItem();
  if (visItem) {
    processVisItem(visItem, ctx);
    return;
  }

  const macroItem = item.macroItem();
  if (macroItem) {
    // Process macro invocations if needed
    const macroInvSemi = macroItem.macroInvocationSemi();
    if (macroInvSemi) {
      const simplePath = macroInvSemi.simplePath();
      if (simplePath) {
        const macroName = simplePath.getText();
        // Common macros that define items
        if (["derive", "cfg", "test", "bench"].includes(macroName)) {
          // Skip - these are attributes
        }
      }
    }
  }
}

function processVisItem(visItem: VisItemContext, ctx: ParserContext): void {
  const visibility = visItem.visibility()?.getText() || "";
  const isPublic = visibility.includes("pub");

  // Module
  const module = visItem.module();
  if (module) {
    processModule(module, ctx, isPublic);
    return;
  }

  // Use declaration (imports)
  const useDecl = visItem.useDeclaration();
  if (useDecl) {
    processUseDeclaration(useDecl, ctx);
    return;
  }

  // Function
  const func = visItem.function_();
  if (func) {
    processFunction(func, ctx, isPublic, false);
    return;
  }

  // Struct
  const struct = visItem.struct_();
  if (struct) {
    processStruct(struct, ctx, isPublic);
    return;
  }

  // Enum
  const enumDecl = visItem.enumeration();
  if (enumDecl) {
    processEnumeration(enumDecl, ctx, isPublic);
    return;
  }

  // Trait
  const trait = visItem.trait_();
  if (trait) {
    processTrait(trait, ctx, isPublic);
    return;
  }

  // Implementation
  const impl = visItem.implementation();
  if (impl) {
    processImplementation(impl, ctx);
    return;
  }

  // Type alias
  const typeAlias = visItem.typeAlias();
  if (typeAlias) {
    processTypeAlias(typeAlias, ctx, isPublic);
    return;
  }

  // Constant
  const constItem = visItem.constantItem();
  if (constItem) {
    processConstant(constItem, ctx, isPublic);
    return;
  }

  // Static
  const staticItem = visItem.staticItem();
  if (staticItem) {
    processStatic(staticItem, ctx, isPublic);
    return;
  }

  // Extern crate
  const externCrate = visItem.externCrate();
  if (externCrate) {
    const crateRef = externCrate.crateRef();
    if (crateRef) {
      const crateName = crateRef.identifier()?.getText() || crateRef.getText();
      ctx.entities.push({
        name: crateName,
        type: "import",
        filePath: ctx.filePath,
        location: getLocation(externCrate),
        metadata: {
          importData: {
            source: crateName,
            specifiers: [],
            isDefault: false,
            isNamespace: true,
          },
        },
      });

      ctx.relationships.push({
        from: ctx.filePath,
        to: crateName,
        type: "imports",
        metadata: { isExternCrate: true },
      });
    }
  }
}

// =============================================================================
// MODULE PROCESSING
// =============================================================================

function processModule(module: ModuleContext, ctx: ParserContext, isPublic: boolean): void {
  const identifier = module.identifier();
  if (!identifier) return;

  const moduleName = identifier.getText();
  const fullPath = [...ctx.modulePath, moduleName].join("::");

  ctx.entities.push({
    name: fullPath || moduleName,
    type: "module",
    filePath: ctx.filePath,
    location: getLocation(module),
    modifiers: isPublic ? ["pub"] : undefined,
  });

  // Process inner items if inline module
  const innerItems = module.item();
  if (innerItems.length > 0) {
    const prevPath = ctx.modulePath;
    ctx.modulePath = [...ctx.modulePath, moduleName];

    for (const item of innerItems) {
      processItem(item, ctx);
    }

    ctx.modulePath = prevPath;
  }
}

// =============================================================================
// USE DECLARATION (IMPORTS)
// =============================================================================

function processUseDeclaration(useDecl: UseDeclarationContext, ctx: ParserContext): void {
  const useTree = useDecl.useTree();
  if (!useTree) return;

  // Extract the import path
  const importPath = useTree.getText();

  ctx.entities.push({
    name: importPath,
    type: "import",
    filePath: ctx.filePath,
    location: getLocation(useDecl),
    metadata: {
      importData: {
        source: importPath,
        specifiers: [],
        isDefault: false,
        isNamespace: importPath.includes("*"),
      },
    },
  });

  ctx.relationships.push({
    from: ctx.filePath,
    to: importPath.replace(/\{.*\}/, "").replace("::*", ""),
    type: "imports",
    metadata: {},
  });
}

// =============================================================================
// FUNCTION PROCESSING
// =============================================================================

function processFunction(func: Function_Context, ctx: ParserContext, isPublic: boolean, _isMethod?: boolean): void {
  const identifier = func.identifier();
  if (!identifier) return;

  const funcName = identifier.getText();
  const location = getLocation(func);

  // Extract modifiers
  const modifiers: string[] = [];
  if (isPublic) modifiers.push("pub");

  const qualifiers = func.functionQualifiers();
  if (qualifiers) {
    if (qualifiers.KW_CONST()) modifiers.push("const");
    if (qualifiers.KW_ASYNC()) modifiers.push("async");
    if (qualifiers.KW_UNSAFE()) modifiers.push("unsafe");
    const abi = qualifiers.abi();
    if (abi) modifiers.push("extern");
  }

  // Extract parameters
  const params: Array<{ name: string; type?: string | undefined; optional?: boolean }> = [];
  const funcParams = func.functionParameters();
  if (funcParams) {
    // Self parameter
    const selfParam = funcParams.selfParam();
    if (selfParam) {
      const shorthand = selfParam.shorthandSelf();
      const typed = selfParam.typedSelf();
      if (shorthand) {
        params.push({
          name: shorthand.KW_MUT() ? "&mut self" : shorthand.AND() ? "&self" : "self",
        });
      } else if (typed) {
        params.push({
          name: "self",
          type: typed.type_()?.getText(),
        });
      }
    }

    // Regular parameters
    const funcParamList = funcParams.functionParam();
    for (const param of funcParamList) {
      const pattern = param.functionParamPattern();
      if (pattern) {
        const pat = pattern.pattern();
        const type = pattern.type_();
        if (pat) {
          params.push({
            name: pat.getText(),
            type: type?.getText(),
          });
        }
      }
    }
  }

  // Extract return type
  const returnTypeCtx = func.functionReturnType();
  const returnType = returnTypeCtx?.type_()?.getText();

  // Determine entity name and type
  let fullName = funcName;
  let entityType: ParsedEntity["type"] = "function";

  if (ctx.currentImpl) {
    fullName = `${ctx.currentImpl}::${funcName}`;
    entityType = "method";
  } else if (ctx.modulePath.length > 0) {
    fullName = [...ctx.modulePath, funcName].join("::");
  }

  const entity: ParsedEntity = {
    name: fullName,
    type: modifiers.includes("async") ? "async_function" : entityType,
    filePath: ctx.filePath,
    location,
    ...(modifiers.length > 0 && { modifiers: modifiers }),
    ...(params.length > 0 && { parameters: params }),
    ...(returnType && { returnType: returnType }),
  };

  ctx.entities.push(entity);

  // Create relationships
  if (ctx.currentImpl) {
    ctx.relationships.push({
      from: ctx.currentImpl,
      to: fullName,
      type: "contains",
      metadata: {},
    });
  }

  // Extract function calls from body
  const body = func.blockExpression();
  if (body) {
    const calls = extractCalls(body);
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

// =============================================================================
// STRUCT PROCESSING
// =============================================================================

function processStruct(struct: Struct_Context, ctx: ParserContext, isPublic: boolean): void {
  // Struct can be StructStruct or TupleStruct
  const structStruct = struct.structStruct();
  const tupleStruct = struct.tupleStruct();

  if (structStruct) {
    const identifier = structStruct.identifier();
    if (!identifier) return;

    const structName = identifier.getText();
    const location = getLocation(structStruct);

    const fullName = ctx.modulePath.length > 0 ? [...ctx.modulePath, structName].join("::") : structName;

    const entity: ParsedEntity = {
      name: fullName,
      type: "class", // Rust structs map to class entity type
      filePath: ctx.filePath,
      location,
      modifiers: isPublic ? ["pub", "struct"] : ["struct"],
      children: [],
    };

    ctx.entities.push(entity);

    // Process struct fields
    const structFields = structStruct.structFields();
    if (structFields) {
      const fields = structFields.structField();
      for (const field of fields) {
        const fieldVis = field.visibility()?.getText() || "";
        const fieldIsPublic = fieldVis.includes("pub");
        const fieldId = field.identifier();
        const fieldType = field.type_();

        if (fieldId) {
          const fieldName = fieldId.getText();
          const fieldFullName = `${fullName}::${fieldName}`;

          ctx.entities.push({
            name: fieldFullName,
            type: "property",
            filePath: ctx.filePath,
            location: getLocation(field),
            modifiers: fieldIsPublic ? ["pub"] : undefined,
            metadata: fieldType ? { propertyType: fieldType.getText() } : undefined,
          });

          ctx.relationships.push({
            from: fullName,
            to: fieldFullName,
            type: "contains",
            metadata: {},
          });

          if (fieldType) {
            ctx.relationships.push({
              from: fieldFullName,
              to: fieldType.getText().replace(/<.*>/, ""),
              type: "references",
              metadata: { referenceKind: "field" },
            });
          }
        }
      }
    }
  }

  if (tupleStruct) {
    const identifier = tupleStruct.identifier();
    if (!identifier) return;

    const structName = identifier.getText();
    const fullName = ctx.modulePath.length > 0 ? [...ctx.modulePath, structName].join("::") : structName;

    ctx.entities.push({
      name: fullName,
      type: "class",
      filePath: ctx.filePath,
      location: getLocation(tupleStruct),
      modifiers: isPublic ? ["pub", "struct", "tuple"] : ["struct", "tuple"],
    });
  }
}

// =============================================================================
// ENUM PROCESSING
// =============================================================================

function processEnumeration(enumDecl: EnumerationContext, ctx: ParserContext, isPublic: boolean): void {
  const identifier = enumDecl.identifier();
  if (!identifier) return;

  const enumName = identifier.getText();
  const location = getLocation(enumDecl);

  const fullName = ctx.modulePath.length > 0 ? [...ctx.modulePath, enumName].join("::") : enumName;

  ctx.entities.push({
    name: fullName,
    type: "enum",
    filePath: ctx.filePath,
    location,
    modifiers: isPublic ? ["pub"] : undefined,
  });

  // Process enum variants
  const enumItems = enumDecl.enumItems();
  if (enumItems) {
    const items = enumItems.enumItem();
    for (const item of items) {
      const variantId = item.identifier();
      if (variantId) {
        const variantName = variantId.getText();
        const variantFullName = `${fullName}::${variantName}`;

        ctx.entities.push({
          name: variantFullName,
          type: "enum_variant",
          filePath: ctx.filePath,
          location: getLocation(item),
        });

        ctx.relationships.push({
          from: fullName,
          to: variantFullName,
          type: "contains",
          metadata: {},
        });
      }
    }
  }
}

// =============================================================================
// TRAIT PROCESSING
// =============================================================================

function processTrait(trait: Trait_Context, ctx: ParserContext, isPublic: boolean): void {
  const identifier = trait.identifier();
  if (!identifier) return;

  const traitName = identifier.getText();
  const location = getLocation(trait);

  const fullName = ctx.modulePath.length > 0 ? [...ctx.modulePath, traitName].join("::") : traitName;

  // Check for unsafe trait
  const modifiers: string[] = [];
  if (isPublic) modifiers.push("pub");
  if (trait.KW_UNSAFE()) modifiers.push("unsafe");

  ctx.entities.push({
    name: fullName,
    type: "interface", // Rust traits map to interface entity type
    filePath: ctx.filePath,
    location,
    ...(modifiers.length > 0 && { modifiers: modifiers }),
  });

  // Process trait bounds (supertraits)
  const typeBounds = trait.typeParamBounds();
  if (typeBounds) {
    const bounds = typeBounds
      .getText()
      .split("+")
      .map((b) => b.trim());
    for (const bound of bounds) {
      if (bound && !bound.startsWith("'")) {
        // Skip lifetime bounds
        ctx.relationships.push({
          from: fullName,
          to: bound,
          type: "inherits",
          metadata: {},
        });
      }
    }
  }

  // Process associated items
  const prevImpl = ctx.currentImpl;
  ctx.currentImpl = fullName;

  const assocItems = trait.associatedItem();
  for (const item of assocItems) {
    const func = item.function_();
    if (func) {
      const itemVis = item.visibility()?.getText() || "";
      processFunction(func, ctx, itemVis.includes("pub"), true);
    }

    const typeAlias = item.typeAlias();
    if (typeAlias) {
      const typeId = typeAlias.identifier();
      if (typeId) {
        const typeName = `${fullName}::${typeId.getText()}`;
        ctx.entities.push({
          name: typeName,
          type: "type",
          filePath: ctx.filePath,
          location: getLocation(typeAlias),
        });
      }
    }
  }

  ctx.currentImpl = prevImpl;
}

// =============================================================================
// IMPLEMENTATION PROCESSING
// =============================================================================

function processImplementation(impl: ImplementationContext, ctx: ParserContext): void {
  const inherentImpl = impl.inherentImpl();
  const traitImpl = impl.traitImpl();

  if (inherentImpl) {
    // impl Type { ... }
    const type = inherentImpl.type_();
    if (!type) return;

    const typeName = type.getText().replace(/<.*>/, "");
    const prevImpl = ctx.currentImpl;
    ctx.currentImpl = typeName;

    const assocItems = inherentImpl.associatedItem();
    for (const item of assocItems) {
      const func = item.function_();
      if (func) {
        const itemVis = item.visibility()?.getText() || "";
        processFunction(func, ctx, itemVis.includes("pub"), true);
      }

      const constItem = item.constantItem();
      if (constItem) {
        const constId = constItem.identifier();
        if (constId) {
          const constName = `${typeName}::${constId.getText()}`;
          const constType = constItem.type_()?.getText();

          ctx.entities.push({
            name: constName,
            type: "constant",
            filePath: ctx.filePath,
            location: getLocation(constItem),
            metadata: constType ? { propertyType: constType } : undefined,
          });

          ctx.relationships.push({
            from: typeName,
            to: constName,
            type: "contains",
            metadata: {},
          });
        }
      }
    }

    ctx.currentImpl = prevImpl;
  }

  if (traitImpl) {
    // impl Trait for Type { ... }
    const traitPath = traitImpl.typePath();
    const type = traitImpl.type_();
    if (!traitPath || !type) return;

    const traitName = traitPath.getText();
    const typeName = type.getText().replace(/<.*>/, "");

    // Create implements relationship
    ctx.relationships.push({
      from: typeName,
      to: traitName,
      type: "implements",
      metadata: { line: getLocation(traitImpl).start.line },
    });

    const prevImpl = ctx.currentImpl;
    ctx.currentImpl = typeName;

    const assocItems = traitImpl.associatedItem();
    for (const item of assocItems) {
      const func = item.function_();
      if (func) {
        const itemVis = item.visibility()?.getText() || "";
        processFunction(func, ctx, itemVis.includes("pub"), true);
      }
    }

    ctx.currentImpl = prevImpl;
  }
}

// =============================================================================
// TYPE ALIAS PROCESSING
// =============================================================================

function processTypeAlias(typeAlias: TypeAliasContext, ctx: ParserContext, isPublic: boolean): void {
  const identifier = typeAlias.identifier();
  if (!identifier) return;

  const aliasName = identifier.getText();
  const aliasedType = typeAlias.type_()?.getText();

  const fullName = ctx.modulePath.length > 0 ? [...ctx.modulePath, aliasName].join("::") : aliasName;

  ctx.entities.push({
    name: fullName,
    type: "type",
    filePath: ctx.filePath,
    location: getLocation(typeAlias),
    modifiers: isPublic ? ["pub"] : undefined,
    metadata: aliasedType ? { aliasedType } : undefined,
  });
}

// =============================================================================
// CONSTANT PROCESSING
// =============================================================================

function processConstant(constItem: ConstantItemContext, ctx: ParserContext, isPublic: boolean): void {
  const identifier = constItem.identifier();
  if (!identifier) return;

  const constName = identifier.getText();
  const constType = constItem.type_()?.getText();

  const fullName = ctx.modulePath.length > 0 ? [...ctx.modulePath, constName].join("::") : constName;

  ctx.entities.push({
    name: fullName,
    type: "constant",
    filePath: ctx.filePath,
    location: getLocation(constItem),
    modifiers: isPublic ? ["pub", "const"] : ["const"],
    metadata: constType ? { propertyType: constType } : undefined,
  });
}

// =============================================================================
// STATIC PROCESSING
// =============================================================================

function processStatic(staticItem: StaticItemContext, ctx: ParserContext, isPublic: boolean): void {
  const identifier = staticItem.identifier();
  if (!identifier) return;

  const staticName = identifier.getText();
  const staticType = staticItem.type_()?.getText();

  const modifiers: string[] = [];
  if (isPublic) modifiers.push("pub");
  modifiers.push("static");
  if (staticItem.KW_MUT()) modifiers.push("mut");

  const fullName = ctx.modulePath.length > 0 ? [...ctx.modulePath, staticName].join("::") : staticName;

  ctx.entities.push({
    name: fullName,
    type: "constant",
    filePath: ctx.filePath,
    location: getLocation(staticItem),
    modifiers,
    metadata: staticType ? { propertyType: staticType } : undefined,
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getLocation(ctx: unknown): LocationInfo {
  const contextObj = ctx as AntlrParserRuleContext;
  const start = contextObj.start || contextObj._start || { line: 1, column: 0, start: 0 };
  const stop = contextObj.stop || contextObj._stop || start;

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

function extractCalls(bodyCtx: unknown): string[] {
  if (!bodyCtx) return [];

  const body = bodyCtx as AntlrParserRuleContext;
  const calls: string[] = [];
  const text = body.getText?.() || "";

  // Simple regex extraction for function calls
  const callRe = /(\w+(?:::\w+)*)\s*[!]?\s*\(/g;
  let match: RegExpExecArray | null;

  const keywords = new Set([
    "if",
    "else",
    "for",
    "while",
    "loop",
    "match",
    "return",
    "break",
    "continue",
    "let",
    "mut",
    "fn",
    "struct",
    "enum",
    "impl",
    "trait",
    "type",
    "pub",
    "use",
    "mod",
    "const",
    "static",
    "unsafe",
    "async",
    "await",
    "move",
    "ref",
    "self",
    "Self",
  ]);

  while ((match = callRe.exec(text))) {
    const callName = match[1];
    if (callName && !keywords.has(callName)) {
      calls.push(callName);
    }
  }

  return Array.from(new Set(calls));
}

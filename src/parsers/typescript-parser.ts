/**
 * TypeScript Native Parser
 *
 * Uses TypeScript Compiler API for parsing JavaScript/TypeScript/JSX/TSX files.
 * Provides full AST with type information, replacing tree-sitter for JS/TS.
 *
 * Architecture:
 * - ts.createSourceFile() for fast syntax-only parsing
 * - ts.createProgram() + TypeChecker for full type analysis (optional)
 * - Extracts entities compatible with ParseResult interface
 *
 * No native modules required - pure TypeScript implementation.
 */

import ts from "typescript";
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { enhanceWithAngularInfo, isAngularFile } from "./angular-parser.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

const SCRIPT_TARGETS: Record<string, ts.ScriptTarget> = {
  ".js": ts.ScriptTarget.ESNext,
  ".mjs": ts.ScriptTarget.ESNext,
  ".cjs": ts.ScriptTarget.ESNext,
  ".jsx": ts.ScriptTarget.ESNext,
  ".ts": ts.ScriptTarget.ESNext,
  ".mts": ts.ScriptTarget.ESNext,
  ".cts": ts.ScriptTarget.ESNext,
  ".tsx": ts.ScriptTarget.ESNext,
};

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
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

function getExtension(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : ".ts";
}

function getLanguage(filePath: string): SupportedLanguage {
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

function getPosition(
  sourceFile: ts.SourceFile,
  pos: number,
): { line: number; column: number; index: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, column: character, index: pos };
}

function getLocation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): ParsedEntity["location"] {
  return {
    start: getPosition(sourceFile, node.getStart(sourceFile)),
    end: getPosition(sourceFile, node.getEnd()),
  };
}

function getModifiers(node: ts.Node): string[] {
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

function getParameters(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
): ParsedEntity["parameters"] {
  return node.parameters.map((param) => {
    const name = param.name.getText(sourceFile);
    const type = param.type ? param.type.getText(sourceFile) : undefined;
    const optional = !!param.questionToken;
    const defaultValue = param.initializer
      ? param.initializer.getText(sourceFile)
      : undefined;

    return { name, type, optional, defaultValue };
  });
}

function getReturnType(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (node.type) {
    return node.type.getText(sourceFile);
  }
  return undefined;
}

function getDecorators(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): ParsedEntity["decorators"] {
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

        decorators.push({ name, arguments: args });
      }
    }
  }

  return decorators.length > 0 ? decorators : undefined;
}

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

interface ExtractorContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  entities: ParsedEntity[];
}

function extractEntities(ctx: ExtractorContext, node: ts.Node): void {
  const { sourceFile, filePath, entities } = ctx;

  // Function declarations
  if (ts.isFunctionDeclaration(node) && node.name) {
    const modifiers = getModifiers(node);
    const isAsync = modifiers.includes("async");

    entities.push({
      name: node.name.text,
      type: isAsync ? "async_function" : "function",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers,
      parameters: getParameters(node, sourceFile),
      returnType: getReturnType(node, sourceFile),
      decorators: getDecorators(node, sourceFile),
    });
  }

  // Arrow functions and function expressions assigned to variables
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) ||
          ts.isFunctionExpression(decl.initializer))
      ) {
        const name = decl.name.getText(sourceFile);
        const modifiers = getModifiers(node);
        const isAsync =
          modifiers.includes("async") ||
          (ts.canHaveModifiers(decl.initializer) &&
            ts.getModifiers(decl.initializer)?.some(
              (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
            ));

        entities.push({
          name,
          type: isAsync ? "async_function" : "function",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers: [...modifiers, ...(isAsync ? ["async"] : [])],
          parameters: getParameters(decl.initializer, sourceFile),
          returnType: getReturnType(decl.initializer, sourceFile),
        });
      } else if (decl.name && ts.isIdentifier(decl.name)) {
        // Regular variable/constant
        const modifiers = getModifiers(node);
        const isConst =
          (node.declarationList.flags & ts.NodeFlags.Const) !== 0;

        entities.push({
          name: decl.name.text,
          type: isConst ? "constant" : "variable",
          filePath,
          location: getLocation(sourceFile, decl),
          modifiers: [...modifiers, ...(isConst ? ["const"] : [])],
        });
      }
    }
  }

  // Class declarations
  if (ts.isClassDeclaration(node) && node.name) {
    const className = node.name.text;
    const modifiers = getModifiers(node);

    // Extract base classes
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

    const classEntity: ParsedEntity = {
      name: className,
      type: "class",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers,
      decorators: getDecorators(node, sourceFile),
      inheritance:
        baseClasses.length > 0 || interfaces.length > 0
          ? {
              baseClasses,
              interfaces: interfaces.length > 0 ? interfaces : undefined,
              isAbstract: modifiers.includes("abstract"),
            }
          : undefined,
      children: [],
    };

    // Extract class members
    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) && member.name) {
        const methodModifiers = getModifiers(member);
        const isAsync = methodModifiers.includes("async");

        classEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: isAsync ? "async_function" : "method",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: methodModifiers,
          parameters: getParameters(member, sourceFile),
          returnType: getReturnType(member, sourceFile),
          decorators: getDecorators(member, sourceFile),
        });
      } else if (ts.isPropertyDeclaration(member) && member.name) {
        classEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: "property",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: getModifiers(member),
        });
      } else if (ts.isConstructorDeclaration(member)) {
        classEntity.children!.push({
          name: "constructor",
          type: "method",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: getModifiers(member),
          parameters: getParameters(member, sourceFile),
        });
      } else if (ts.isGetAccessor(member) && member.name) {
        classEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: "property",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: [...getModifiers(member), "getter"],
          returnType: getReturnType(member, sourceFile),
        });
      } else if (ts.isSetAccessor(member) && member.name) {
        classEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: "property",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: [...getModifiers(member), "setter"],
          parameters: getParameters(member, sourceFile),
        });
      }
    }

    entities.push(classEntity);
    return; // Don't recurse into class - we've handled members
  }

  // Interface declarations
  if (ts.isInterfaceDeclaration(node)) {
    const modifiers = getModifiers(node);
    const interfaceEntity: ParsedEntity = {
      name: node.name.text,
      type: "interface",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers,
      children: [],
    };

    // Extract interface members
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        interfaceEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: "property",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: member.questionToken ? ["optional"] : [],
        });
      } else if (ts.isMethodSignature(member) && member.name) {
        interfaceEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: "method",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: member.questionToken ? ["optional"] : [],
          parameters: getParameters(member as any, sourceFile),
          returnType: member.type ? member.type.getText(sourceFile) : undefined,
        });
      }
    }

    entities.push(interfaceEntity);
    return;
  }

  // Type alias declarations
  if (ts.isTypeAliasDeclaration(node)) {
    entities.push({
      name: node.name.text,
      type: "type",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers: getModifiers(node),
    });
  }

  // Enum declarations
  if (ts.isEnumDeclaration(node)) {
    const enumEntity: ParsedEntity = {
      name: node.name.text,
      type: "enum",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers: getModifiers(node),
      children: [],
    };

    for (const member of node.members) {
      enumEntity.children!.push({
        name: member.name.getText(sourceFile),
        type: "enum_variant",
        filePath,
        location: getLocation(sourceFile, member),
      });
    }

    entities.push(enumEntity);
    return;
  }

  // Import declarations
  if (ts.isImportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier.getText(sourceFile);
    const source = moduleSpecifier.slice(1, -1); // Remove quotes

    const specifiers: Array<{
      local: string;
      imported?: string;
      alias?: string;
    }> = [];
    let isDefault = false;
    let isNamespace = false;

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        isDefault = true;
        specifiers.push({ local: node.importClause.name.text });
      }

      // Named imports
      if (
        node.importClause.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        for (const element of node.importClause.namedBindings.elements) {
          specifiers.push({
            local: element.name.text,
            imported: element.propertyName?.text,
            alias: element.propertyName ? element.name.text : undefined,
          });
        }
      }

      // Namespace import
      if (
        node.importClause.namedBindings &&
        ts.isNamespaceImport(node.importClause.namedBindings)
      ) {
        isNamespace = true;
        specifiers.push({
          local: node.importClause.namedBindings.name.text,
        });
      }
    }

    entities.push({
      name: source,
      type: "import",
      filePath,
      location: getLocation(sourceFile, node),
      importData: {
        source,
        specifiers,
        isDefault,
        isNamespace,
      },
    });
  }

  // Export declarations
  if (ts.isExportDeclaration(node)) {
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        entities.push({
          name: element.name.text,
          type: "export",
          filePath,
          location: getLocation(sourceFile, element),
        });
      }
    }
  }

  // Recurse into children (except for nodes we've already handled)
  ts.forEachChild(node, (child) => extractEntities(ctx, child));
}

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

export interface ParserStats {
  filesParsed: number;
  cacheHits: number;
  cacheMisses: number;
  avgParseTimeMs: number;
  totalParseTimeMs: number;
  throughput: number;
  cacheMemoryMB: number;
  errorCount: number;
}

// =============================================================================
// INCREMENTAL LANGUAGE SERVICE
// =============================================================================

interface FileVersion {
  version: number;
  content: string;
  snapshot: ts.IScriptSnapshot;
}

/**
 * Incremental TypeScript Language Service Host
 * Provides file management and versioning for the Language Service
 */
class IncrementalLanguageServiceHost implements ts.LanguageServiceHost {
  private files = new Map<string, FileVersion>();
  private rootDir: string;
  private compilerOptions: ts.CompilerOptions;

  constructor(rootDir: string, compilerOptions?: ts.CompilerOptions) {
    this.rootDir = rootDir;
    this.compilerOptions = compilerOptions || {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      checkJs: true,
      strict: false,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    };
  }

  /**
   * Add or update a file in the service
   */
  updateFile(filePath: string, content: string): void {
    const existing = this.files.get(filePath);
    const version = existing ? existing.version + 1 : 1;

    this.files.set(filePath, {
      version,
      content,
      snapshot: ts.ScriptSnapshot.fromString(content),
    });
  }

  /**
   * Remove a file from the service
   */
  removeFile(filePath: string): void {
    this.files.delete(filePath);
  }

  /**
   * Check if a file exists in the service
   */
  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  /**
   * Get file version (for change detection)
   */
  getFileVersion(filePath: string): number {
    return this.files.get(filePath)?.version ?? 0;
  }

  // LanguageServiceHost implementation

  getCompilationSettings(): ts.CompilerOptions {
    return this.compilerOptions;
  }

  getScriptFileNames(): string[] {
    return Array.from(this.files.keys());
  }

  getScriptVersion(fileName: string): string {
    const file = this.files.get(fileName);
    return file ? String(file.version) : "0";
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    const file = this.files.get(fileName);
    if (file) {
      return file.snapshot;
    }

    // Try to read from disk for lib files
    if (fileName.includes("lib.") && fileName.endsWith(".d.ts")) {
      try {
        const libPath = ts.getDefaultLibFilePath(this.compilerOptions);
        const libDir = libPath.substring(0, libPath.lastIndexOf("/") + 1);
        const content = ts.sys.readFile(libDir + fileName.split("/").pop());
        if (content) {
          return ts.ScriptSnapshot.fromString(content);
        }
      } catch {
        // Ignore lib file loading errors
      }
    }

    return undefined;
  }

  getCurrentDirectory(): string {
    return this.rootDir;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(path: string): boolean {
    return this.files.has(path) || ts.sys.fileExists(path);
  }

  readFile(path: string): string | undefined {
    const file = this.files.get(path);
    if (file) {
      return file.content;
    }
    return ts.sys.readFile(path);
  }

  readDirectory(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number,
  ): string[] {
    return ts.sys.readDirectory(path, extensions, exclude, include, depth);
  }

  directoryExists(path: string): boolean {
    return ts.sys.directoryExists(path);
  }

  getDirectories(path: string): string[] {
    return ts.sys.getDirectories(path);
  }
}

/**
 * Incremental TypeScript Builder
 * Uses Language Service for efficient incremental compilation with type information
 */
export class IncrementalTypeScriptBuilder {
  private host: IncrementalLanguageServiceHost;
  private service: ts.LanguageService;
  private typeCache = new Map<string, Map<string, string>>(); // filePath -> entityName -> type

  constructor(rootDir: string = process.cwd()) {
    this.host = new IncrementalLanguageServiceHost(rootDir);
    this.service = ts.createLanguageService(this.host, ts.createDocumentRegistry());
  }

  /**
   * Update a file and get incremental parse result
   */
  updateFile(filePath: string, content: string): void {
    this.host.updateFile(filePath, content);
    // Invalidate type cache for this file
    this.typeCache.delete(filePath);
  }

  /**
   * Remove a file from the builder
   */
  removeFile(filePath: string): void {
    this.host.removeFile(filePath);
    this.typeCache.delete(filePath);
  }

  /**
   * Get the TypeScript program (for advanced analysis)
   */
  getProgram(): ts.Program | undefined {
    return this.service.getProgram();
  }

  /**
   * Get type checker for type resolution
   */
  getTypeChecker(): ts.TypeChecker | undefined {
    return this.getProgram()?.getTypeChecker();
  }

  /**
   * Get diagnostics for a file
   */
  getDiagnostics(filePath: string): ts.Diagnostic[] {
    const syntactic = this.service.getSyntacticDiagnostics(filePath);
    const semantic = this.service.getSemanticDiagnostics(filePath);
    return [...syntactic, ...semantic];
  }

  /**
   * Get document symbols (outline)
   */
  getDocumentSymbols(filePath: string): ts.NavigationTree | undefined {
    return this.service.getNavigationTree(filePath);
  }

  /**
   * Get completions at position
   */
  getCompletions(filePath: string, position: number): ts.CompletionInfo | undefined {
    return this.service.getCompletionsAtPosition(filePath, position, undefined);
  }

  /**
   * Get quick info (hover)
   */
  getQuickInfo(filePath: string, position: number): ts.QuickInfo | undefined {
    return this.service.getQuickInfoAtPosition(filePath, position);
  }

  /**
   * Get definition locations
   */
  getDefinition(filePath: string, position: number): readonly ts.DefinitionInfo[] | undefined {
    return this.service.getDefinitionAtPosition(filePath, position);
  }

  /**
   * Get references
   */
  getReferences(filePath: string, position: number): ts.ReferencedSymbol[] | undefined {
    return this.service.findReferences(filePath, position);
  }

  /**
   * Get inferred type for a node at position
   */
  getTypeAtPosition(filePath: string, position: number): string | undefined {
    const quickInfo = this.service.getQuickInfoAtPosition(filePath, position);
    if (quickInfo?.displayParts) {
      return quickInfo.displayParts.map(p => p.text).join("");
    }
    return undefined;
  }

  /**
   * Get all files that would be affected by changes to a file
   */
  getAffectedFiles(filePath: string): string[] {
    const program = this.getProgram();
    if (!program) return [filePath];

    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) return [filePath];

    const affected = new Set<string>([filePath]);

    // Find files that import this file
    for (const file of program.getSourceFiles()) {
      if (file.fileName === filePath) continue;

      // Check imports
      ts.forEachChild(file, (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const importPath = node.moduleSpecifier.text;
          // Simplified resolution - would need proper module resolution for accuracy
          if (importPath.includes(filePath.replace(/\.[^.]+$/, ""))) {
            affected.add(file.fileName);
          }
        }
      });
    }

    return Array.from(affected);
  }

  /**
   * Extract entities with full type information
   */
  extractEntitiesWithTypes(filePath: string, content: string): ParsedEntity[] {
    // Ensure file is in the service
    if (!this.host.hasFile(filePath)) {
      this.host.updateFile(filePath, content);
    }

    const program = this.getProgram();
    const sourceFile = program?.getSourceFile(filePath);
    const typeChecker = this.getTypeChecker();

    if (!sourceFile || !typeChecker) {
      // Fallback to syntax-only parsing
      return this.extractEntitiesSyntaxOnly(filePath, content);
    }

    const entities: ParsedEntity[] = [];

    const visit = (node: ts.Node): void => {
      // Functions
      if (ts.isFunctionDeclaration(node) && node.name) {
        const symbol = typeChecker.getSymbolAtLocation(node.name);
        const type = symbol ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(symbol, node)) : undefined;

        const modifiers = getModifiers(node);
        entities.push({
          name: node.name.text,
          type: modifiers.includes("async") ? "async_function" : "function",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers,
          parameters: getParameters(node, sourceFile),
          returnType: type || getReturnType(node, sourceFile),
          decorators: getDecorators(node, sourceFile),
        });
      }

      // Classes
      if (ts.isClassDeclaration(node) && node.name) {
        const modifiers = getModifiers(node);

        const baseClasses: string[] = [];
        const interfaces: string[] = [];

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            for (const typeNode of clause.types) {
              const inheritedType = typeChecker.getTypeAtLocation(typeNode);
              const typeName = typeChecker.typeToString(inheritedType);

              if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                baseClasses.push(typeName);
              } else {
                interfaces.push(typeName);
              }
            }
          }
        }

        const classEntity: ParsedEntity = {
          name: node.name.text,
          type: "class",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers,
          decorators: getDecorators(node, sourceFile),
          inheritance: baseClasses.length > 0 || interfaces.length > 0
            ? { baseClasses, interfaces: interfaces.length > 0 ? interfaces : undefined, isAbstract: modifiers.includes("abstract") }
            : undefined,
          children: [],
        };

        // Extract members with types
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            const memberSymbol = typeChecker.getSymbolAtLocation(member.name);
            const methodType = memberSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(memberSymbol, member))
              : undefined;

            const methodModifiers = getModifiers(member);
            classEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: methodModifiers.includes("async") ? "async_function" : "method",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: methodModifiers,
              parameters: getParameters(member, sourceFile),
              returnType: methodType || getReturnType(member, sourceFile),
              decorators: getDecorators(member, sourceFile),
            });
          } else if (ts.isPropertyDeclaration(member) && member.name) {
            const propSymbol = typeChecker.getSymbolAtLocation(member.name);
            const propType = propSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(propSymbol, member))
              : undefined;

            classEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: "property",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: getModifiers(member),
              returnType: propType,
            });
          } else if (ts.isConstructorDeclaration(member)) {
            classEntity.children!.push({
              name: "constructor",
              type: "method",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: getModifiers(member),
              parameters: getParameters(member, sourceFile),
            });
          }
        }

        entities.push(classEntity);
        return;
      }

      // Interfaces
      if (ts.isInterfaceDeclaration(node)) {
        const interfaceEntity: ParsedEntity = {
          name: node.name.text,
          type: "interface",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers: getModifiers(node),
          children: [],
        };

        for (const member of node.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propSymbol = typeChecker.getSymbolAtLocation(member.name);
            const propType = propSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(propSymbol, member))
              : member.type?.getText(sourceFile);

            interfaceEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: "property",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: member.questionToken ? ["optional"] : [],
              returnType: propType,
            });
          } else if (ts.isMethodSignature(member) && member.name) {
            const methodSymbol = typeChecker.getSymbolAtLocation(member.name);
            const methodType = methodSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(methodSymbol, member))
              : undefined;

            interfaceEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: "method",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: member.questionToken ? ["optional"] : [],
              returnType: methodType || member.type?.getText(sourceFile),
            });
          }
        }

        entities.push(interfaceEntity);
        return;
      }

      // Type aliases
      if (ts.isTypeAliasDeclaration(node)) {
        const symbol = typeChecker.getSymbolAtLocation(node.name);
        const aliasType = symbol
          ? typeChecker.typeToString(typeChecker.getDeclaredTypeOfSymbol(symbol))
          : node.type.getText(sourceFile);

        entities.push({
          name: node.name.text,
          type: "type",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers: getModifiers(node),
          returnType: aliasType,
        });
      }

      // Variables
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const symbol = typeChecker.getSymbolAtLocation(decl.name);
            const varType = symbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(symbol, decl))
              : undefined;

            const modifiers = getModifiers(node);
            const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;

            // Check if it's a function expression
            if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
              const isAsync = ts.canHaveModifiers(decl.initializer) &&
                ts.getModifiers(decl.initializer)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);

              entities.push({
                name: decl.name.text,
                type: isAsync ? "async_function" : "function",
                filePath,
                location: getLocation(sourceFile, decl),
                modifiers: [...modifiers, ...(isAsync ? ["async"] : [])],
                parameters: getParameters(decl.initializer, sourceFile),
                returnType: varType || getReturnType(decl.initializer, sourceFile),
              });
            } else {
              entities.push({
                name: decl.name.text,
                type: isConst ? "constant" : "variable",
                filePath,
                location: getLocation(sourceFile, decl),
                modifiers: [...modifiers, ...(isConst ? ["const"] : [])],
                returnType: varType,
              });
            }
          }
        }
      }

      // Imports
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText(sourceFile);
        const source = moduleSpecifier.slice(1, -1);

        const specifiers: Array<{ local: string; imported?: string; alias?: string }> = [];
        let isDefault = false;
        let isNamespace = false;

        if (node.importClause) {
          if (node.importClause.name) {
            isDefault = true;
            specifiers.push({ local: node.importClause.name.text });
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const el of node.importClause.namedBindings.elements) {
                specifiers.push({
                  local: el.name.text,
                  imported: el.propertyName?.text,
                  alias: el.propertyName ? el.name.text : undefined,
                });
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              isNamespace = true;
              specifiers.push({ local: node.importClause.namedBindings.name.text });
            }
          }
        }

        entities.push({
          name: source,
          type: "import",
          filePath,
          location: getLocation(sourceFile, node),
          importData: { source, specifiers, isDefault, isNamespace },
        });
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return entities;
  }

  /**
   * Fallback syntax-only extraction (when type checker unavailable)
   */
  private extractEntitiesSyntaxOnly(filePath: string, content: string): ParsedEntity[] {
    const ext = getExtension(filePath);
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      SCRIPT_TARGETS[ext] || ts.ScriptTarget.ESNext,
      true,
      SCRIPT_KINDS[ext] || ts.ScriptKind.TS,
    );

    const entities: ParsedEntity[] = [];
    const ctx: ExtractorContext = { sourceFile, filePath, entities };
    ts.forEachChild(sourceFile, (node) => extractEntities(ctx, node));
    return entities;
  }

  /**
   * Dispose the language service
   */
  dispose(): void {
    this.service.dispose();
    this.typeCache.clear();
  }
}

export class TypeScriptParser {
  private stats: ParserStats = {
    filesParsed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgParseTimeMs: 0,
    totalParseTimeMs: 0,
    throughput: 0,
    cacheMemoryMB: 0,
    errorCount: 0,
  };

  /**
   * Initialize the parser (no-op for TypeScript API, kept for interface compatibility)
   */
  async initialize(): Promise<void> {
    console.error("[TypeScriptParser] Initialized (TypeScript Compiler API)");
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = getExtension(filePath);
    return ext in SCRIPT_KINDS;
  }

  /**
   * Parse a file and extract entities
   */
  async parse(
    filePath: string,
    content: string,
    contentHash: string,
  ): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      const ext = getExtension(filePath);
      const scriptTarget = SCRIPT_TARGETS[ext] || ts.ScriptTarget.ESNext;
      const scriptKind = SCRIPT_KINDS[ext] || ts.ScriptKind.TS;

      // Parse the source file (syntax only, no type checking for speed)
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        scriptTarget,
        true, // setParentNodes
        scriptKind,
      );

      // Extract entities
      const entities: ParsedEntity[] = [];
      const ctx: ExtractorContext = {
        sourceFile,
        filePath,
        entities,
      };

      ts.forEachChild(sourceFile, (node) => extractEntities(ctx, node));

      // Enhance with Angular metadata if this is an Angular file
      if (isAngularFile(sourceFile)) {
        enhanceWithAngularInfo(entities, sourceFile);
      }

      // Collect diagnostics
      const errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

      // Get syntax errors from the source file (using internal API)
      const syntaxDiagnostics = (sourceFile as any).parseDiagnostics as ts.Diagnostic[] | undefined;
      if (syntaxDiagnostics) {
        for (const diag of syntaxDiagnostics) {
          const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
          if (diag.start !== undefined) {
            const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
            errors.push({
              message,
              location: { line: pos.line + 1, column: pos.character },
            });
          } else {
            errors.push({ message });
          }
        }
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs =
        this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: getLanguage(filePath),
        entities,
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: getLanguage(filePath),
        entities: [],
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Parse with incremental support (uses same logic - TS API handles this internally)
   */
  async parseIncremental(
    filePath: string,
    content: string,
    contentHash: string,
    _edits: any[],
  ): Promise<ParseResult> {
    // TypeScript's createSourceFile is already very fast
    // For true incremental, we'd need ts.createLanguageService
    return this.parse(filePath, content, contentHash);
  }

  /**
   * Get parser statistics
   */
  getStats(): ParserStats {
    return { ...this.stats };
  }

  /**
   * Clear any internal caches
   */
  clearCache(): void {
    // No internal cache in this implementation
  }
}

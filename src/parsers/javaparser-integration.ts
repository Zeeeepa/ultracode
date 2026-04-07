/**
 * JavaParser Integration
 *
 * Provides full Java AST parsing using JavaParser library.
 * JavaParser is invoked via subprocess with a small Java wrapper.
 *
 * Requirements:
 * - JDK installed (java command available)
 * - JavaParser JAR (downloaded on first use)
 *
 * Philosophy: Java developers always have JDK installed.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../logging/index.js";
import type { ParsedEntity } from "../types/parser.js";
import { sleep } from "../utils/runtime-detection.js";

// =============================================================================
// TYPES
// =============================================================================

export interface JavaParseResult {
  entities: ParsedEntity[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const JAVAPARSER_VERSION = "3.26.2";
const JAVAPARSER_JAR = `javaparser-core-${JAVAPARSER_VERSION}.jar`;
const MAVEN_REPO = "https://repo1.maven.org/maven2";
const JAVAPARSER_URL = `${MAVEN_REPO}/com/github/javaparser/javaparser-core/${JAVAPARSER_VERSION}/${JAVAPARSER_JAR}`;

// Get the lib directory path
function getLibDir(): string {
  // Use process.cwd() as base since import.meta is not available in all environments
  // The lib directory is at project root level
  return join(process.cwd(), "lib", "java");
}

// =============================================================================
// JAVA PARSER WRAPPER SOURCE
// =============================================================================

/**
 * Java source code for the parser wrapper
 * This gets compiled and run with JavaParser on the classpath
 */
const JAVA_PARSER_WRAPPER = `
import com.github.javaparser.*;
import com.github.javaparser.ast.*;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.type.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.visitor.*;
import java.util.*;
import java.io.*;

public class JavaParserWrapper {
    public static void main(String[] args) throws Exception {
        String filePath = args.length > 0 ? args[0] : "<stdin>";
        StringBuilder content = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        String line;
        while ((line = reader.readLine()) != null) {
            content.append(line).append("\\n");
        }

        try {
            ParseResult<CompilationUnit> result = new JavaParser().parse(content.toString());

            if (result.isSuccessful() && result.getResult().isPresent()) {
                CompilationUnit cu = result.getResult().get();
                List<Map<String, Object>> entities = extractEntities(cu, filePath);

                StringBuilder json = new StringBuilder();
                json.append("{\\"entities\\": ");
                json.append(toJson(entities));
                json.append(", \\"errors\\": []}");
                System.out.println(json);
            } else {
                List<Map<String, Object>> errors = new ArrayList<>();
                for (Problem p : result.getProblems()) {
                    Map<String, Object> error = new HashMap<>();
                    error.put("message", p.getMessage());
                    if (p.getLocation().isPresent()) {
                        Map<String, Object> location = new HashMap<>();
                        location.put("line", p.getLocation().get().getBegin().getRange().get().begin.line);
                        location.put("column", p.getLocation().get().getBegin().getRange().get().begin.column);
                        error.put("location", location);
                    }
                    errors.add(error);
                }

                StringBuilder json = new StringBuilder();
                json.append("{\\"entities\\": [], \\"errors\\": ");
                json.append(toJson(errors));
                json.append("}");
                System.out.println(json);
            }
        } catch (Exception e) {
            System.out.println("{\\"entities\\": [], \\"errors\\": [{\\"message\\": \\"" +
                escapeJson(e.getMessage()) + "\\"}]}");
        }
    }

    static List<Map<String, Object>> extractEntities(CompilationUnit cu, String filePath) {
        List<Map<String, Object>> entities = new ArrayList<>();

        // Package
        cu.getPackageDeclaration().ifPresent(pkg -> {
            Map<String, Object> entity = new HashMap<>();
            entity.put("name", pkg.getNameAsString());
            entity.put("type", "module");
            entity.put("filePath", filePath);
            entity.put("location", getLocation(pkg));
            entities.add(entity);
        });

        // Imports
        for (ImportDeclaration imp : cu.getImports()) {
            Map<String, Object> entity = new HashMap<>();
            entity.put("name", imp.getNameAsString());
            entity.put("type", "import");
            entity.put("filePath", filePath);
            entity.put("location", getLocation(imp));
            if (imp.isStatic()) {
                entity.put("modifiers", Collections.singletonList("static"));
            }
            entities.add(entity);
        }

        // Types
        for (TypeDeclaration<?> type : cu.getTypes()) {
            extractType(type, filePath, entities);
        }

        return entities;
    }

    static void extractType(TypeDeclaration<?> type, String filePath, List<Map<String, Object>> entities) {
        Map<String, Object> entity = new HashMap<>();
        entity.put("name", type.getNameAsString());
        entity.put("filePath", filePath);
        entity.put("location", getLocation(type));

        List<String> modifiers = getModifiers(type.getModifiers());
        if (!modifiers.isEmpty()) {
            entity.put("modifiers", modifiers);
        }

        if (type instanceof ClassOrInterfaceDeclaration) {
            ClassOrInterfaceDeclaration cid = (ClassOrInterfaceDeclaration) type;
            entity.put("type", cid.isInterface() ? "interface" : "class");

            List<String> baseClasses = new ArrayList<>();
            List<String> interfaces = new ArrayList<>();

            for (ClassOrInterfaceType ext : cid.getExtendedTypes()) {
                if (cid.isInterface()) {
                    interfaces.add(ext.getNameAsString());
                } else {
                    baseClasses.add(ext.getNameAsString());
                }
            }
            for (ClassOrInterfaceType impl : cid.getImplementedTypes()) {
                interfaces.add(impl.getNameAsString());
            }

            if (!baseClasses.isEmpty() || !interfaces.isEmpty()) {
                Map<String, Object> inheritance = new HashMap<>();
                if (!baseClasses.isEmpty()) inheritance.put("baseClasses", baseClasses);
                if (!interfaces.isEmpty()) inheritance.put("interfaces", interfaces);
                inheritance.put("isAbstract", modifiers.contains("abstract"));
                entity.put("inheritance", inheritance);
            }
        } else if (type instanceof EnumDeclaration) {
            entity.put("type", "enum");
        } else if (type instanceof AnnotationDeclaration) {
            entity.put("type", "interface");
        } else if (type instanceof RecordDeclaration) {
            entity.put("type", "class");
            modifiers.add("record");
            entity.put("modifiers", modifiers);
        }

        // Members
        List<Map<String, Object>> children = new ArrayList<>();

        for (BodyDeclaration<?> member : type.getMembers()) {
            if (member instanceof MethodDeclaration) {
                MethodDeclaration method = (MethodDeclaration) member;
                Map<String, Object> methodEntity = new HashMap<>();
                methodEntity.put("name", method.getNameAsString());
                methodEntity.put("type", "method");
                methodEntity.put("filePath", filePath);
                methodEntity.put("location", getLocation(method));
                methodEntity.put("returnType", method.getTypeAsString());

                List<String> methodMods = getModifiers(method.getModifiers());
                if (!methodMods.isEmpty()) {
                    methodEntity.put("modifiers", methodMods);
                }

                List<Map<String, Object>> params = new ArrayList<>();
                for (Parameter p : method.getParameters()) {
                    Map<String, Object> param = new HashMap<>();
                    param.put("name", p.getNameAsString());
                    param.put("type", p.getTypeAsString());
                    params.add(param);
                }
                if (!params.isEmpty()) {
                    methodEntity.put("parameters", params);
                }

                children.add(methodEntity);
            } else if (member instanceof ConstructorDeclaration) {
                ConstructorDeclaration ctor = (ConstructorDeclaration) member;
                Map<String, Object> ctorEntity = new HashMap<>();
                ctorEntity.put("name", "constructor");
                ctorEntity.put("type", "method");
                ctorEntity.put("filePath", filePath);
                ctorEntity.put("location", getLocation(ctor));

                List<String> ctorMods = getModifiers(ctor.getModifiers());
                if (!ctorMods.isEmpty()) {
                    ctorEntity.put("modifiers", ctorMods);
                }

                List<Map<String, Object>> params = new ArrayList<>();
                for (Parameter p : ctor.getParameters()) {
                    Map<String, Object> param = new HashMap<>();
                    param.put("name", p.getNameAsString());
                    param.put("type", p.getTypeAsString());
                    params.add(param);
                }
                if (!params.isEmpty()) {
                    ctorEntity.put("parameters", params);
                }

                children.add(ctorEntity);
            } else if (member instanceof FieldDeclaration) {
                FieldDeclaration field = (FieldDeclaration) member;
                List<String> fieldMods = getModifiers(field.getModifiers());

                for (VariableDeclarator var : field.getVariables()) {
                    Map<String, Object> fieldEntity = new HashMap<>();
                    fieldEntity.put("name", var.getNameAsString());
                    fieldEntity.put("type", fieldMods.contains("final") ? "constant" : "field");
                    fieldEntity.put("filePath", filePath);
                    fieldEntity.put("location", getLocation(field));
                    if (!fieldMods.isEmpty()) {
                        fieldEntity.put("modifiers", fieldMods);
                    }

                    Map<String, Object> metadata = new HashMap<>();
                    metadata.put("fieldType", var.getTypeAsString());
                    fieldEntity.put("metadata", metadata);

                    children.add(fieldEntity);
                }
            } else if (member instanceof TypeDeclaration) {
                extractType((TypeDeclaration<?>) member, filePath, children);
            }
        }

        if (!children.isEmpty()) {
            entity.put("children", children);
        }

        entities.add(entity);
    }

    static List<String> getModifiers(NodeList<Modifier> modifiers) {
        List<String> result = new ArrayList<>();
        for (Modifier mod : modifiers) {
            result.add(mod.getKeyword().asString());
        }
        return result;
    }

    static Map<String, Object> getLocation(Node node) {
        Map<String, Object> location = new HashMap<>();
        Map<String, Object> start = new HashMap<>();
        Map<String, Object> end = new HashMap<>();

        if (node.getRange().isPresent()) {
            com.github.javaparser.Range range = node.getRange().get();
            start.put("line", range.begin.line);
            start.put("column", range.begin.column - 1);
            start.put("index", 0);
            end.put("line", range.end.line);
            end.put("column", range.end.column);
            end.put("index", 0);
        } else {
            start.put("line", 1);
            start.put("column", 0);
            start.put("index", 0);
            end.put("line", 1);
            end.put("column", 0);
            end.put("index", 0);
        }

        location.put("start", start);
        location.put("end", end);
        return location;
    }

    static String toJson(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof String) return "\\"" + escapeJson((String) obj) + "\\"";
        if (obj instanceof Number) return obj.toString();
        if (obj instanceof Boolean) return obj.toString();
        if (obj instanceof List) {
            List<?> list = (List<?>) obj;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(list.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) obj;
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\\"").append(escapeJson(entry.getKey().toString())).append("\\":");
                sb.append(toJson(entry.getValue()));
            }
            sb.append("}");
            return sb.toString();
        }
        return "\\"" + escapeJson(obj.toString()) + "\\"";
    }

    static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\\\", "\\\\\\\\")
                .replace("\\"", "\\\\\\"")
                .replace("\\n", "\\\\n")
                .replace("\\r", "\\\\r")
                .replace("\\t", "\\\\t");
    }
}
`;

// =============================================================================
// JAVAPARSER INTEGRATION
// =============================================================================

let javaPath: string | null = null;
let javaParserAvailable: boolean | null = null;
let initAttempted = false;

/**
 * Find Java executable
 */
async function findJava(): Promise<string | null> {
  const commands = ["java"];

  for (const cmd of commands) {
    try {
      const result = spawnSync(cmd, ["-version"], {
        timeout: 5000,
        encoding: "utf-8",
        windowsHide: true,
      });
      if (result.status === 0 || result.stderr?.includes("version")) {
        return cmd;
      }
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Download JavaParser JAR if not present
 */
async function ensureJavaParserJar(): Promise<string | null> {
  const libDir = getLibDir();
  const jarPath = join(libDir, JAVAPARSER_JAR);

  if (existsSync(jarPath)) {
    return jarPath;
  }

  // Create lib directory
  if (!existsSync(libDir)) {
    mkdirSync(libDir, { recursive: true });
  }

  log.i("JPINTEGRATION", "download_start", { ver: JAVAPARSER_VERSION });

  try {
    // Use fetch to download
    const response = await fetch(JAVAPARSER_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    writeFileSync(jarPath, buffer);

    log.i("JPINTEGRATION", "download_done");
    return jarPath;
  } catch (error) {
    log.e("JPINTEGRATION", "download_fail", { err: String(error) });
    return null;
  }
}

/**
 * Compile and save the wrapper class
 */
async function ensureWrapperCompiled(jarPath: string): Promise<boolean> {
  const libDir = getLibDir();
  const wrapperJava = join(libDir, "JavaParserWrapper.java");
  const wrapperClass = join(libDir, "JavaParserWrapper.class");

  // Write wrapper source
  writeFileSync(wrapperJava, JAVA_PARSER_WRAPPER);

  // Compile wrapper (always recompile to ensure consistency)
  // biome-ignore lint/correctness/noConstantCondition: intentional - always recompile during development
  if (!existsSync(wrapperClass) || true) {
    log.d("JPINTEGRATION", "compile_start");

    const java = await findJava();
    if (!java) return false;

    // Get javac path (replace java with javac)
    const javac = java.replace(/java$/, "javac").replace(/java\.exe$/, "javac.exe");

    try {
      const result = spawnSync(javac, ["-cp", jarPath, "-d", libDir, wrapperJava], {
        timeout: 30000,
        encoding: "utf-8",
        cwd: libDir,
        windowsHide: true,
      });

      if (result.status !== 0) {
        log.e("JPINTEGRATION", "compile_fail", { err: result.stderr });
        return false;
      }

      log.i("JPINTEGRATION", "compile_done");
      return true;
    } catch (error) {
      log.e("JPINTEGRATION", "compile_err", { err: String(error) });
      return false;
    }
  }

  return true;
}

/**
 * Initialize JavaParser integration
 */
export async function initializeJavaParser(): Promise<boolean> {
  if (initAttempted) {
    return javaParserAvailable ?? false;
  }

  initAttempted = true;

  // Find Java
  javaPath = await findJava();
  if (!javaPath) {
    log.w("JPINTEGRATION", "no_java");
    javaParserAvailable = false;
    return false;
  }

  // Ensure JAR is present
  const jarPath = await ensureJavaParserJar();
  if (!jarPath) {
    javaParserAvailable = false;
    return false;
  }

  // Compile wrapper
  const compiled = await ensureWrapperCompiled(jarPath);
  if (!compiled) {
    javaParserAvailable = false;
    return false;
  }

  javaParserAvailable = true;
  log.i("JPINTEGRATION", "init_done");
  return true;
}

/**
 * Check if JavaParser is available
 */
export function isJavaParserAvailable(): boolean {
  return javaParserAvailable ?? false;
}

/**
 * Parse Java file using JavaParser
 */
export async function parseWithJavaParser(filePath: string, content: string): Promise<JavaParseResult> {
  if (!javaParserAvailable || !javaPath) {
    return { entities: [], errors: [{ message: "JavaParser not available" }] };
  }

  const javaCommand = javaPath;
  const libDir = getLibDir();
  const jarPath = join(libDir, JAVAPARSER_JAR);
  const classpath = process.platform === "win32" ? `${jarPath};${libDir}` : `${jarPath}:${libDir}`;

  const proc = spawn(javaCommand, ["-cp", classpath, "JavaParserWrapper", filePath], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  const abortController = new AbortController();

  proc.stdout.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  proc.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  proc.stdin.write(content);
  proc.stdin.end();

  const resultPromise = new Promise<JavaParseResult>((resolve) => {
    proc.on("close", (_code: number | null) => {
      abortController.abort();
      const rawOut = stdout;
      const rawErr = stderr;
      stdout = ""; // release buffers — can be large for big Java files
      stderr = "";
      try {
        const result = JSON.parse(rawOut);
        resolve(result as JavaParseResult);
      } catch {
        resolve({
          entities: [],
          errors: [{ message: `Parse error: ${rawErr || rawOut}` }],
        });
      }
    });

    proc.on("error", (err: Error) => {
      abortController.abort();
      resolve({
        entities: [],
        errors: [{ message: `Spawn error: ${err.message}` }],
      });
    });
  });

  const timeoutPromise = (async (): Promise<JavaParseResult> => {
    await sleep(30000);
    if (!abortController.signal.aborted) {
      proc.kill();
      return { entities: [], errors: [{ message: "JavaParser timeout" }] };
    }
    return new Promise(() => {});
  })();

  return Promise.race([resultPromise, timeoutPromise]);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { findJava };

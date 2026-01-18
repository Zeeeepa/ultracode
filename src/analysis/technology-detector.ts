/**
 * Technology Detector - Stack and Framework Detection
 *
 * Automatically detects:
 * - Programming languages
 * - Frameworks (React, Vue, Angular, Express, etc.)
 * - Build tools (Webpack, Vite, etc.)
 * - Dependencies from package.json
 *
 * Features:
 * - Integration with embeddings (tech context)
 * - Confidence scoring
 * - Evidence tracking
 *
 * Architecture References:
 * - Graph Storage: src/storage/graph-storage.ts
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../logging/index.js";
import type { EntityType, GraphStorage } from "../types/storage.js";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface TechnologyStack {
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  buildTools: BuildToolInfo[];
  dependencies: DependencyInfo[];
  confidence: number; // 0-1
}

export interface LanguageInfo {
  name: string;
  version?: string;
  percentage: number; // % of codebase
  fileCount: number;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  category: "frontend" | "backend" | "testing" | "build" | "other";
  confidence: number;
  evidence: string[];
}

export interface BuildToolInfo {
  name: string;
  configFiles: string[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: "prod" | "dev";
}

// =============================================================================
// TECHNOLOGY DETECTOR IMPLEMENTATION
// =============================================================================

export class TechnologyDetector {
  private detectionPatterns: Map<string, DetectionPattern> = new Map();

  constructor(
    private graphStorage: GraphStorage,
    private workingDirectory: string,
  ) {
    this.initializePatterns();
  }

  /**
   * Detect full technology stack
   */
  async detectStack(): Promise<TechnologyStack> {
    const languages = await this.detectLanguages();
    const frameworks = await this.detectFrameworks();
    const buildTools = await this.detectBuildTools();
    const dependencies = await this.detectDependencies();

    const confidence = this.calculateConfidence(frameworks);

    return {
      languages,
      frameworks,
      buildTools,
      dependencies,
      confidence,
    };
  }

  /**
   * Generate tech context string for embeddings
   */
  generateTechContext(stack: TechnologyStack): string {
    const parts: string[] = [];

    parts.push(`Languages: ${stack.languages.map((l) => l.name).join(", ")}`);
    parts.push(`Frameworks: ${stack.frameworks.map((f) => f.name).join(", ")}`);
    parts.push(`Build Tools: ${stack.buildTools.map((b) => b.name).join(", ")}`);

    return parts.join(" | ");
  }

  // =============================================================================
  // PRIVATE: LANGUAGE DETECTION
  // =============================================================================

  private async detectLanguages(): Promise<LanguageInfo[]> {
    const entities = await this.graphStorage.findEntities({
      filters: {},
    });

    const languageCounts = new Map<string, number>();
    const fileCounts = new Map<string, Set<string>>();

    for (const entity of entities) {
      const lang = entity.language || "unknown";
      languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);

      if (!fileCounts.has(lang)) {
        fileCounts.set(lang, new Set());
      }
      fileCounts.get(lang)!.add(entity.filePath);
    }

    const totalEntities = entities.length;
    const languages: LanguageInfo[] = [];

    for (const [name, count] of languageCounts.entries()) {
      if (name === "unknown") continue;

      languages.push({
        name,
        percentage: (count / totalEntities) * 100,
        fileCount: fileCounts.get(name)!.size,
      });
    }

    return languages.sort((a, b) => b.percentage - a.percentage);
  }

  // =============================================================================
  // PRIVATE: FRAMEWORK DETECTION
  // =============================================================================

  private async detectFrameworks(): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];

    // Detect from package.json (Node.js/JavaScript projects)
    const packageFrameworks = await this.detectFromPackageJson();
    frameworks.push(...packageFrameworks);

    // Detect from imports in code (all languages)
    const importFrameworks = await this.detectFromImports();
    frameworks.push(...importFrameworks);

    // Detect from build files (Maven pom.xml, Gradle build.gradle)
    const buildFileFrameworks = await this.detectFromBuildFiles();
    frameworks.push(...buildFileFrameworks);

    // Deduplicate by framework name
    const seen = new Map<string, FrameworkInfo>();
    for (const framework of frameworks) {
      const existing = seen.get(framework.name);
      if (!existing || existing.confidence < framework.confidence) {
        seen.set(framework.name, framework);
      }
    }

    return Array.from(seen.values());
  }

  private async detectFromPackageJson(): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];
    const packageJsonPath = join(this.workingDirectory, "package.json");

    if (!existsSync(packageJsonPath)) {
      return frameworks;
    }

    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Frontend frameworks
      if (deps["react"]) {
        frameworks.push({
          name: "React",
          version: deps["react"],
          category: "frontend",
          confidence: 1.0,
          evidence: ["package.json:dependencies.react"],
        });
      }

      if (deps["next"]) {
        frameworks.push({
          name: "Next.js",
          version: deps["next"],
          category: "frontend",
          confidence: 1.0,
          evidence: ["package.json:dependencies.next"],
        });
      }

      if (deps["vue"]) {
        frameworks.push({
          name: "Vue",
          version: deps["vue"],
          category: "frontend",
          confidence: 1.0,
          evidence: ["package.json:dependencies.vue"],
        });
      }

      if (deps["@angular/core"]) {
        frameworks.push({
          name: "Angular",
          version: deps["@angular/core"],
          category: "frontend",
          confidence: 1.0,
          evidence: ["package.json:dependencies.@angular/core"],
        });
      }

      // Backend frameworks
      if (deps["express"]) {
        frameworks.push({
          name: "Express",
          version: deps["express"],
          category: "backend",
          confidence: 1.0,
          evidence: ["package.json:dependencies.express"],
        });
      }

      if (deps["@nestjs/core"]) {
        frameworks.push({
          name: "NestJS",
          version: deps["@nestjs/core"],
          category: "backend",
          confidence: 1.0,
          evidence: ["package.json:dependencies.@nestjs/core"],
        });
      }

      if (deps["fastify"]) {
        frameworks.push({
          name: "Fastify",
          version: deps["fastify"],
          category: "backend",
          confidence: 1.0,
          evidence: ["package.json:dependencies.fastify"],
        });
      }

      // Testing frameworks
      if (deps["jest"]) {
        frameworks.push({
          name: "Jest",
          version: deps["jest"],
          category: "testing",
          confidence: 1.0,
          evidence: ["package.json:devDependencies.jest"],
        });
      }

      if (deps["vitest"]) {
        frameworks.push({
          name: "Vitest",
          version: deps["vitest"],
          category: "testing",
          confidence: 1.0,
          evidence: ["package.json:devDependencies.vitest"],
        });
      }

      // Build tools
      if (deps["typescript"]) {
        frameworks.push({
          name: "TypeScript",
          version: deps["typescript"],
          category: "build",
          confidence: 1.0,
          evidence: ["package.json:devDependencies.typescript"],
        });
      }
    } catch (error) {
      log.w("TECHDETECT", "deps_parse_fail", { err: String(error) });
    }

    return frameworks;
  }

  private async detectFromImports(): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];

    // Query all import entities
    const imports = await this.graphStorage.findEntities({
      filters: { entityType: "import" as EntityType },
    });

    const importCounts = new Map<string, number>();
    const importFiles = new Map<string, Set<string>>();

    for (const imp of imports) {
      const source = imp.metadata.importData?.source || "";

      // =================================================================
      // JavaScript/TypeScript Frameworks
      // =================================================================

      // React
      if (source === "react" || source.startsWith("react/")) {
        importCounts.set("React", (importCounts.get("React") || 0) + 1);
        if (!importFiles.has("React")) importFiles.set("React", new Set());
        importFiles.get("React")!.add(imp.filePath);
      }

      // Vue
      if (source === "vue" || source.startsWith("vue/")) {
        importCounts.set("Vue", (importCounts.get("Vue") || 0) + 1);
        if (!importFiles.has("Vue")) importFiles.set("Vue", new Set());
        importFiles.get("Vue")!.add(imp.filePath);
      }

      // Angular
      if (source.startsWith("@angular/")) {
        importCounts.set("Angular", (importCounts.get("Angular") || 0) + 1);
        if (!importFiles.has("Angular")) importFiles.set("Angular", new Set());
        importFiles.get("Angular")!.add(imp.filePath);
      }

      // Express
      if (source === "express") {
        importCounts.set("Express", (importCounts.get("Express") || 0) + 1);
        if (!importFiles.has("Express")) importFiles.set("Express", new Set());
        importFiles.get("Express")!.add(imp.filePath);
      }

      // =================================================================
      // Java Frameworks
      // =================================================================

      // Spring Framework
      if (source.startsWith("org.springframework.")) {
        importCounts.set("Spring", (importCounts.get("Spring") || 0) + 1);
        if (!importFiles.has("Spring")) importFiles.set("Spring", new Set());
        importFiles.get("Spring")!.add(imp.filePath);
      }

      // JPA/Hibernate
      if (
        source.startsWith("javax.persistence.") ||
        source.startsWith("jakarta.persistence.") ||
        source.startsWith("org.hibernate.")
      ) {
        importCounts.set("JPA/Hibernate", (importCounts.get("JPA/Hibernate") || 0) + 1);
        if (!importFiles.has("JPA/Hibernate")) importFiles.set("JPA/Hibernate", new Set());
        importFiles.get("JPA/Hibernate")!.add(imp.filePath);
      }

      // Lombok
      if (source.startsWith("lombok.")) {
        importCounts.set("Lombok", (importCounts.get("Lombok") || 0) + 1);
        if (!importFiles.has("Lombok")) importFiles.set("Lombok", new Set());
        importFiles.get("Lombok")!.add(imp.filePath);
      }

      // =================================================================
      // Kotlin Frameworks
      // =================================================================

      // Android
      if (source.startsWith("android.") || source.startsWith("androidx.") || source.startsWith("com.android.")) {
        importCounts.set("Android", (importCounts.get("Android") || 0) + 1);
        if (!importFiles.has("Android")) importFiles.set("Android", new Set());
        importFiles.get("Android")!.add(imp.filePath);
      }

      // Kotlin Coroutines
      if (source.startsWith("kotlinx.coroutines.")) {
        importCounts.set("Coroutines", (importCounts.get("Coroutines") || 0) + 1);
        if (!importFiles.has("Coroutines")) importFiles.set("Coroutines", new Set());
        importFiles.get("Coroutines")!.add(imp.filePath);
      }

      // Ktor
      if (source.startsWith("io.ktor.")) {
        importCounts.set("Ktor", (importCounts.get("Ktor") || 0) + 1);
        if (!importFiles.has("Ktor")) importFiles.set("Ktor", new Set());
        importFiles.get("Ktor")!.add(imp.filePath);
      }
    }

    // Create framework info from import analysis
    for (const [name, count] of importCounts.entries()) {
      const files = importFiles.get(name)!;

      // Determine category based on framework type
      let category: "frontend" | "backend" | "testing" | "build" | "other";
      if (["React", "Vue", "Angular", "Android"].includes(name)) {
        category = "frontend";
      } else if (["Spring", "Express", "Ktor", "JPA/Hibernate"].includes(name)) {
        category = "backend";
      } else if (["Lombok", "Coroutines"].includes(name)) {
        category = "other";
      } else {
        category = "backend";
      }

      frameworks.push({
        name,
        category,
        confidence: Math.min(count / 10, 1.0), // More imports = higher confidence
        evidence: [`${count} imports in ${files.size} files`],
      });
    }

    return frameworks;
  }

  // =============================================================================
  // PRIVATE: BUILD TOOL DETECTION
  // =============================================================================

  private async detectBuildTools(): Promise<BuildToolInfo[]> {
    const buildTools: BuildToolInfo[] = [];

    // Check for common build tool config files
    const configFiles = [
      { name: "webpack", files: ["webpack.config.js", "webpack.config.ts"] },
      { name: "vite", files: ["vite.config.js", "vite.config.ts"] },
      { name: "rollup", files: ["rollup.config.js", "rollup.config.ts"] },
      { name: "tsup", files: ["tsup.config.ts"] },
      { name: "esbuild", files: ["esbuild.config.js"] },
      { name: "parcel", files: [".parcelrc"] },
    ];

    for (const { name, files } of configFiles) {
      const found: string[] = [];
      for (const file of files) {
        const path = join(this.workingDirectory, file);
        if (existsSync(path)) {
          found.push(file);
        }
      }

      if (found.length > 0) {
        buildTools.push({ name, configFiles: found });
      }
    }

    return buildTools;
  }

  // =============================================================================
  // PRIVATE: DEPENDENCY DETECTION
  // =============================================================================

  private async detectDependencies(): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];
    const packageJsonPath = join(this.workingDirectory, "package.json");

    if (!existsSync(packageJsonPath)) {
      return dependencies;
    }

    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

      // Production dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({ name, version: version as string, type: "prod" });
        }
      }

      // Dev dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          dependencies.push({ name, version: version as string, type: "dev" });
        }
      }
    } catch (error) {
      log.w("TECHDETECT", "deps_parse_fail", { err: String(error) });
    }

    return dependencies;
  }

  // =============================================================================
  // PRIVATE: UTILITIES
  // =============================================================================

  private calculateConfidence(frameworks: FrameworkInfo[]): number {
    if (frameworks.length === 0) return 0;
    const avgConfidence = frameworks.reduce((sum, f) => sum + f.confidence, 0) / frameworks.length;
    return avgConfidence;
  }

  private initializePatterns(): void {
    // =================================================================
    // JavaScript/TypeScript Detection Patterns
    // =================================================================

    this.detectionPatterns.set("React", {
      imports: ["react", "react-dom"],
      files: ["*.jsx", "*.tsx"],
      keywords: ["useState", "useEffect", "Component"],
    });

    this.detectionPatterns.set("Vue", {
      imports: ["vue"],
      files: ["*.vue"],
      keywords: ["createApp", "ref", "reactive"],
    });

    this.detectionPatterns.set("Angular", {
      imports: ["@angular/core"],
      files: ["*.component.ts"],
      keywords: ["@Component", "@Injectable"],
    });

    // =================================================================
    // Java Detection Patterns
    // =================================================================

    this.detectionPatterns.set("Spring", {
      imports: ["org.springframework"],
      files: ["*.java"],
      keywords: ["@Controller", "@Service", "@Repository", "@Autowired", "@SpringBootApplication"],
    });

    this.detectionPatterns.set("JPA/Hibernate", {
      imports: ["javax.persistence", "jakarta.persistence", "org.hibernate"],
      files: ["*.java"],
      keywords: ["@Entity", "@Table", "@OneToMany", "@ManyToOne", "@Repository"],
    });

    this.detectionPatterns.set("Lombok", {
      imports: ["lombok"],
      files: ["*.java"],
      keywords: ["@Data", "@Builder", "@Getter", "@Setter", "@Slf4j"],
    });

    // =================================================================
    // Kotlin Detection Patterns
    // =================================================================

    this.detectionPatterns.set("Android", {
      imports: ["android", "androidx"],
      files: ["*.kt"],
      keywords: ["Activity", "Fragment", "ViewModel", "@Composable", "LiveData"],
    });

    this.detectionPatterns.set("Coroutines", {
      imports: ["kotlinx.coroutines"],
      files: ["*.kt"],
      keywords: ["suspend", "launch", "async", "Flow", "withContext"],
    });

    this.detectionPatterns.set("Ktor", {
      imports: ["io.ktor"],
      files: ["*.kt"],
      keywords: ["embeddedServer", "routing", "get", "post", "call.respond"],
    });
  }

  // =============================================================================
  // PRIVATE: JAVA/KOTLIN BUILD FILE DETECTION
  // =============================================================================

  /**
   * Detect frameworks from Maven pom.xml or Gradle build files
   */
  async detectFromBuildFiles(): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];

    // Check pom.xml for Maven projects
    const pomPath = join(this.workingDirectory, "pom.xml");
    if (existsSync(pomPath)) {
      try {
        const pomContent = await readFile(pomPath, "utf-8");
        frameworks.push(...this.detectFromPom(pomContent));
      } catch (error) {
        log.w("TECHDETECT", "pom_parse_fail", { err: String(error) });
      }
    }

    // Check build.gradle or build.gradle.kts
    const gradlePath = join(this.workingDirectory, "build.gradle");
    const gradleKtsPath = join(this.workingDirectory, "build.gradle.kts");
    const gradleFilePath = existsSync(gradleKtsPath) ? gradleKtsPath : existsSync(gradlePath) ? gradlePath : null;

    if (gradleFilePath) {
      try {
        const gradleContent = await readFile(gradleFilePath, "utf-8");
        frameworks.push(...this.detectFromGradle(gradleContent));
      } catch (error) {
        log.w("TECHDETECT", "gradle_parse_fail", { err: String(error) });
      }
    }

    return frameworks;
  }

  private detectFromPom(content: string): FrameworkInfo[] {
    const frameworks: FrameworkInfo[] = [];

    // Spring Boot
    if (content.includes("spring-boot-starter")) {
      frameworks.push({
        name: "Spring Boot",
        category: "backend",
        confidence: 1.0,
        evidence: ["pom.xml:spring-boot-starter"],
      });
    }

    // Spring Framework
    if (content.includes("org.springframework")) {
      frameworks.push({
        name: "Spring",
        category: "backend",
        confidence: 1.0,
        evidence: ["pom.xml:org.springframework"],
      });
    }

    // JPA/Hibernate
    if (content.includes("hibernate") || content.includes("spring-boot-starter-data-jpa")) {
      frameworks.push({
        name: "JPA/Hibernate",
        category: "backend",
        confidence: 1.0,
        evidence: ["pom.xml:hibernate"],
      });
    }

    // Lombok
    if (content.includes("lombok")) {
      frameworks.push({
        name: "Lombok",
        category: "other",
        confidence: 1.0,
        evidence: ["pom.xml:lombok"],
      });
    }

    return frameworks;
  }

  private detectFromGradle(content: string): FrameworkInfo[] {
    const frameworks: FrameworkInfo[] = [];

    // Spring Boot
    if (content.includes("org.springframework.boot") || content.includes("spring-boot-starter")) {
      frameworks.push({
        name: "Spring Boot",
        category: "backend",
        confidence: 1.0,
        evidence: ["build.gradle:spring-boot"],
      });
    }

    // Android
    if (content.includes("com.android.application") || content.includes("com.android.library")) {
      frameworks.push({
        name: "Android",
        category: "frontend",
        confidence: 1.0,
        evidence: ["build.gradle:android-plugin"],
      });
    }

    // Kotlin Coroutines
    if (content.includes("kotlinx-coroutines")) {
      frameworks.push({
        name: "Coroutines",
        category: "other",
        confidence: 1.0,
        evidence: ["build.gradle:kotlinx-coroutines"],
      });
    }

    // Ktor
    if (content.includes("io.ktor")) {
      frameworks.push({
        name: "Ktor",
        category: "backend",
        confidence: 1.0,
        evidence: ["build.gradle:io.ktor"],
      });
    }

    // JPA/Hibernate
    if (content.includes("hibernate") || content.includes("spring-boot-starter-data-jpa")) {
      frameworks.push({
        name: "JPA/Hibernate",
        category: "backend",
        confidence: 1.0,
        evidence: ["build.gradle:hibernate"],
      });
    }

    // Lombok
    if (content.includes("lombok")) {
      frameworks.push({
        name: "Lombok",
        category: "other",
        confidence: 1.0,
        evidence: ["build.gradle:lombok"],
      });
    }

    return frameworks;
  }
}

interface DetectionPattern {
  imports?: string[];
  files?: string[];
  keywords?: string[];
}

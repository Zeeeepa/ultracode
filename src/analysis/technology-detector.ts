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
      type: "entity",
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

    // Detect from package.json
    const packageFrameworks = await this.detectFromPackageJson();
    frameworks.push(...packageFrameworks);

    // Detect from imports in code
    const importFrameworks = await this.detectFromImports();
    frameworks.push(...importFrameworks);

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
      type: "entity",
      filters: { entityType: "import" as EntityType },
    });

    const importCounts = new Map<string, number>();
    const importFiles = new Map<string, Set<string>>();

    for (const imp of imports) {
      const source = imp.metadata.importData?.source || "";

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
    }

    // Create framework info from import analysis
    for (const [name, count] of importCounts.entries()) {
      const files = importFiles.get(name)!;
      const category = ["React", "Vue", "Angular"].includes(name) ? "frontend" : "backend";

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
    // Detection patterns for various frameworks/tools
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
  }
}

interface DetectionPattern {
  imports?: string[];
  files?: string[];
  keywords?: string[];
}

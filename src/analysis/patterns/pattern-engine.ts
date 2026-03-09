/**
 * Pattern Engine — Main orchestrator for pattern detection pipeline
 *
 * Pipeline:
 * 1. Initialize (lazy): load registry + exemplar store + register detectors
 * 2. Get entities from storage
 * 3. Auto-detect language
 * 4. Get applicable patterns
 * 5. Structural detection (fast pass)
 * 6. Semantic validation (embedding comparison)
 * 7. Filter, group, score → PatternScanResult
 */

import { join } from "node:path";
import { log } from "../../logging/index.js";
import type { EmbeddingGenerator } from "../../semantic/embedding-generator.js";
import type { Entity, GraphStorage } from "../../types/storage.js";
import * as commonDetectors from "./detectors/common.js";
import * as csharpDetectors from "./detectors/csharp.js";
import * as goDetectors from "./detectors/go.js";
import * as javaDetectors from "./detectors/java.js";
import * as pythonDetectors from "./detectors/python.js";
import * as typescriptDetectors from "./detectors/typescript.js";
import * as zigDetectors from "./detectors/zig.js";
import { ExemplarStore } from "./exemplar-store.js";
import { PatternRegistry } from "./pattern-registry.js";
import { SemanticValidator } from "./semantic-validator.js";
import { registerDetectors, StructuralDetector } from "./structural-detector.js";
import type {
  CustomDetectorFn,
  PatternCategory,
  PatternMatch,
  PatternScanOptions,
  PatternScanResult,
  PatternSeverity,
} from "./types.js";

const SEVERITY_WEIGHTS: Record<PatternSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** Maps language keys to statically imported detector modules */
// biome-ignore lint/complexity/noBannedTypes: detector modules export heterogeneous function shapes
const LANGUAGE_DETECTOR_MAP: Record<string, Record<string, Function>> = {
  typescript: typescriptDetectors,
  javascript: typescriptDetectors,
  python: pythonDetectors,
  csharp: csharpDetectors,
  java: javaDetectors,
  kotlin: javaDetectors,
  go: goDetectors,
  zig: zigDetectors,
};

export class PatternEngine {
  private registry = new PatternRegistry();
  private exemplarStore = new ExemplarStore();
  private structuralDetector = new StructuralDetector();
  private semanticValidator: SemanticValidator | null = null;
  private initialized = false;
  private loadedDetectorModules = new Set<string>();

  constructor(private embeddingGen?: EmbeddingGenerator) {}

  /**
   * Lazy initialization — loads YAML rules, exemplars, and common detectors.
   * Language-specific detectors are loaded on-demand per scan.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const baseDir = import.meta.dirname;

    // Load YAML rules and exemplars
    await this.registry.load(join(baseDir, "rules"));
    await this.exemplarStore.load(join(baseDir, "exemplars"));

    // Register only common detectors at init — language-specific loaded on demand
    registerDetectors(commonDetectors);

    // Setup semantic validator
    this.semanticValidator = new SemanticValidator(this.exemplarStore, this.embeddingGen);

    this.initialized = true;
    log.i("PATTERN_ENGINE", "initialized", {
      patterns: this.registry.size,
      exemplars: this.exemplarStore.size,
    });
  }

  /**
   * Load language-specific detectors on demand (cached — each module loaded only once)
   */
  private ensureDetectorsForLanguage(language: string | undefined): void {
    if (!language) return;

    const langKey = language.toLowerCase();
    if (this.loadedDetectorModules.has(langKey)) return;

    const detectors = LANGUAGE_DETECTOR_MAP[langKey];
    if (!detectors) return;

    registerDetectors(detectors as unknown as Record<string, CustomDetectorFn>);
    this.loadedDetectorModules.add(langKey);
    log.i("PATTERN_ENGINE", "loaded_detectors", { language });
  }

  /**
   * Full scan — the main entry point
   */
  async scan(options: PatternScanOptions, storage: GraphStorage): Promise<PatternScanResult> {
    await this.initialize();

    const startMs = Date.now();
    const {
      filePath,
      language,
      category = "all",
      tags,
      minConfidence = 0.5,
      severity = "all",
      offset = 0,
      limit = 50,
      entityLimit = 10_000,
      suppressPatterns,
    } = options;

    // 1. DB-level paginated scan — load and process entities in small pages (DB_PAGE entities at a time).
    // This prevents JSC GC SEGFAULT: instead of loading 15K+ entities with ~63MB metadata JSON
    // into one array (causing ~150MB JS heap spike), each page is loaded, processed, and GC'd
    // before the next page is fetched. Maximum ~2000 Entity objects live at any time.
    const DB_PAGE = 5000;

    // 1a. First page — needed for language detection
    let firstPage: Entity[];
    if (filePath) {
      const isDirectory = /[\\/]$/.test(filePath) || !/\.\w+$/.test(filePath.split(/[\\/]/).pop() ?? "");
      if (isDirectory && typeof (storage as any).searchEntitiesInDirectory === "function") {
        firstPage = await (storage as any).searchEntitiesInDirectory(filePath);
      } else {
        firstPage = await storage.findEntities({ filters: { filePath }, limit: DB_PAGE, offset: 0, lightweight: true });
      }
    } else {
      firstPage = await storage.findEntities({ limit: DB_PAGE, offset: 0, lightweight: true });
    }
    if (firstPage.length === 0) {
      return this.emptyResult();
    }

    // 2. Auto-detect language from first page
    const detectedLanguage = language ?? this.detectLanguage(firstPage);

    // 3. Load detectors for detected language (lazy, cached)
    this.ensureDetectorsForLanguage(detectedLanguage);

    // 4. Get applicable patterns
    let patterns = this.registry.getPatterns({
      ...(detectedLanguage != null ? { language: detectedLanguage } : {}),
      category: category as PatternCategory | "all",
      ...(tags != null ? { tags } : {}),
      enabledOnly: true,
    });

    // 4b. Apply suppressions
    if (suppressPatterns?.length) {
      const suppressSet = new Set(suppressPatterns);
      patterns = patterns.filter((p) => !suppressSet.has(p.id));
    }

    if (patterns.length === 0) {
      return this.emptyResult(firstPage.length);
    }

    // 5. Paginated structural detection — fetch pages from DB, detect, strip, GC
    let totalEntityCount = 0;
    let candidates: import("./types.js").StructuralCandidate[] = [];

    const stripCandidates = (cs: import("./types.js").StructuralCandidate[]) => {
      for (const c of cs) {
        c.entity = {
          id: c.entity.id,
          name: c.entity.name,
          type: c.entity.type,
          filePath: c.entity.filePath,
          location: c.entity.location ? { start: c.entity.location.start } : undefined,
          language: c.entity.language,
        } as import("../../types/storage.js").Entity;
      }
    };

    // Helper: load a page of entities from DB
    const loadPage = async (pageOffset: number): Promise<Entity[]> => {
      if (filePath) {
        const isDirectory = /[\\/]$/.test(filePath) || !/\.\w+$/.test(filePath.split(/[\\/]/).pop() ?? "");
        if (isDirectory && typeof (storage as any).searchEntitiesInDirectory === "function") {
          // Directory search doesn't support pagination — already loaded all
          return [];
        }
        return storage.findEntities({ filters: { filePath }, limit: DB_PAGE, offset: pageOffset, lightweight: true });
      }
      return storage.findEntities({ limit: DB_PAGE, offset: pageOffset, lightweight: true });
    };

    try {
      // Process first page (already loaded)
      let pageIdx = 0;
      let currentPage = firstPage;

      while (currentPage.length > 0) {
        pageIdx++;
        totalEntityCount += currentPage.length;
        log.i("PATTERN_ENGINE", "detect_page", {
          page: pageIdx,
          size: currentPage.length,
          totalSoFar: totalEntityCount,
        });

        const pageCandidates = await this.structuralDetector.detect(currentPage, patterns, storage);
        stripCandidates(pageCandidates);
        candidates.push(...pageCandidates);

        // Release page reference and force GC before loading next page
        const wasFullPage = currentPage.length >= DB_PAGE;
        currentPage = null!;
        if (typeof globalThis["Bun"]?.["gc"] === "function") {
          globalThis["Bun"]["gc"](true);
        }

        // Stop if last page was partial (no more data) or we hit entityLimit
        if (!wasFullPage || totalEntityCount >= entityLimit) break;

        // Load next page from DB — previous page's entities are now GC-eligible
        currentPage = await loadPage(totalEntityCount);
      }
    } catch (err) {
      log.e("PATTERN_ENGINE", "structural_detect_crash", { error: String(err), stack: (err as Error)?.stack });
      return this.emptyResult(totalEntityCount);
    }

    // 5b. Cap candidates to prevent overload (keep top by confidence)
    log.i("PATTERN_ENGINE", "post_structural", { candidates: candidates.length, ms: Date.now() - startMs });
    const MAX_CANDIDATES = 2000;
    if (candidates.length > MAX_CANDIDATES) {
      log.w("PATTERN_ENGINE", "candidates_capped", {
        original: candidates.length,
        capped: MAX_CANDIDATES,
      });
      candidates.sort((a, b) => b.confidence - a.confidence);
      candidates = candidates.slice(0, MAX_CANDIDATES);
    }

    // 6. Semantic validation
    log.i("PATTERN_ENGINE", "pre_semantic", { candidates: candidates.length });
    const patternMap = new Map(patterns.map((p) => [p.id, p]));
    let confirmed: import("./types.js").PatternMatch[];
    try {
      confirmed = this.semanticValidator
        ? await this.semanticValidator.validate(candidates, patternMap)
        : candidates.map(
            (c) =>
              ({
                patternId: c.pattern.id,
                pattern: c.pattern,
                entityId: c.entity.id,
                entityName: c.entity.name,
                entityType: c.entity.type,
                filePath: c.entity.filePath,
                line: c.entity.location?.start?.line ?? 0,
                structuralConfidence: c.confidence,
                semanticSimilarity: 1.0,
                combinedScore: c.confidence,
                matchedCriteria: c.matchedCriteria,
              }) as PatternMatch,
          );
    } catch (err) {
      log.e("PATTERN_ENGINE", "semantic_validate_crash", { error: String(err), stack: (err as Error)?.stack });
      return this.emptyResult(totalEntityCount);
    }
    log.i("PATTERN_ENGINE", "post_semantic", { confirmed: confirmed.length, ms: Date.now() - startMs });

    // 7. Filter by minConfidence and severity
    let filtered = confirmed.filter((m) => m.combinedScore >= minConfidence);
    if (severity !== "all") {
      filtered = filtered.filter((m) => m.pattern.severity === severity);
    }

    // Sort by combined score descending
    filtered.sort((a, b) => b.combinedScore - a.combinedScore);

    // 8. Group by category
    const antiPatterns = filtered.filter((m) => m.pattern.category === "anti-pattern");
    const bestPatterns = filtered.filter((m) => m.pattern.category === "best-pattern");
    const codeSmells = filtered.filter((m) => m.pattern.category === "code-smell");
    const optimizations = filtered.filter((m) => m.pattern.category === "optimization");

    // 9. Compute health score + top issues (use full counts before truncation)
    const healthScore = this.computeHealthScore(antiPatterns, bestPatterns, codeSmells);
    const topIssues = this.computeTopIssues([...antiPatterns, ...codeSmells, ...optimizations]);
    log.i("PATTERN_ENGINE", "post_grouping", {
      anti: antiPatterns.length,
      best: bestPatterns.length,
      smells: codeSmells.length,
      opts: optimizations.length,
      health: healthScore,
      ms: Date.now() - startMs,
    });

    // 10. Apply pagination — keep only page slice to limit response size
    const applyPagination = <T>(arr: T[]): T[] => arr.slice(offset, offset + limit);

    const result: PatternScanResult = {
      antiPatterns: applyPagination(antiPatterns),
      bestPatterns: applyPagination(bestPatterns),
      codeSmells: applyPagination(codeSmells),
      optimizations: applyPagination(optimizations),
      summary: {
        totalEntitiesScanned: totalEntityCount,
        antiPatternCount: antiPatterns.length,
        bestPatternCount: bestPatterns.length,
        codeSmellCount: codeSmells.length,
        optimizationCount: optimizations.length,
        topIssues,
        healthScore,
      },
    };

    log.i("PATTERN_ENGINE", "scan_complete", {
      entities: totalEntityCount,
      patterns: patterns.length,
      candidates: candidates.length,
      confirmed: confirmed.length,
      filtered: filtered.length,
      durationMs: Date.now() - startMs,
    });

    return result;
  }

  /**
   * Check patterns for a specific entity
   */
  async checkEntity(
    entityId: string,
    storage: GraphStorage,
    category: PatternCategory | "all" = "all",
  ): Promise<PatternMatch[]> {
    await this.initialize();

    const entity = await storage.getEntity(entityId);
    if (!entity) return [];

    const language = entity.language ?? (entity.metadata?.language as string | undefined);
    this.ensureDetectorsForLanguage(language);
    const patterns = this.registry.getPatterns({
      ...(language != null ? { language } : {}),
      category,
      enabledOnly: true,
    });

    const candidates = await this.structuralDetector.detect([entity], patterns, storage);
    const patternMap = new Map(patterns.map((p) => [p.id, p]));

    return this.semanticValidator
      ? await this.semanticValidator.validate(candidates, patternMap)
      : candidates.map(
          (c) =>
            ({
              patternId: c.pattern.id,
              pattern: c.pattern,
              entityId: c.entity.id,
              entityName: c.entity.name,
              entityType: c.entity.type,
              filePath: c.entity.filePath,
              line: c.entity.location?.start?.line ?? 0,
              structuralConfidence: c.confidence,
              semanticSimilarity: 1.0,
              combinedScore: c.confidence,
              matchedCriteria: c.matchedCriteria,
            }) as PatternMatch,
        );
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private detectLanguage(entities: Entity[]): string | undefined {
    const langCounts = new Map<string, number>();
    for (const e of entities) {
      const lang = e.language ?? (e.metadata?.language as string | undefined);
      if (lang) {
        langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
      }
    }
    if (langCounts.size === 0) return undefined;
    return [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  private computeHealthScore(
    antiPatterns: PatternMatch[],
    bestPatterns: PatternMatch[],
    codeSmells: PatternMatch[],
  ): number {
    let antiWeight = 0;
    for (const m of antiPatterns) {
      antiWeight += SEVERITY_WEIGHTS[m.pattern.severity] ?? 1;
    }
    for (const m of codeSmells) {
      antiWeight += (SEVERITY_WEIGHTS[m.pattern.severity] ?? 1) * 0.5;
    }

    const bestWeight = bestPatterns.length;
    const score = Math.round((100 * (bestWeight + 1)) / (bestWeight + antiWeight + 1));
    return Math.max(0, Math.min(100, score));
  }

  private computeTopIssues(
    matches: PatternMatch[],
  ): Array<{ patternId: string; count: number; severity: PatternSeverity }> {
    const counts = new Map<string, { count: number; severity: PatternSeverity }>();
    for (const m of matches) {
      const existing = counts.get(m.patternId);
      if (existing) {
        existing.count++;
      } else {
        counts.set(m.patternId, { count: 1, severity: m.pattern.severity });
      }
    }

    return [...counts.entries()]
      .map(([patternId, data]) => ({ patternId, ...data }))
      .sort((a, b) => {
        const severityDiff = (SEVERITY_WEIGHTS[b.severity] ?? 0) - (SEVERITY_WEIGHTS[a.severity] ?? 0);
        return severityDiff !== 0 ? severityDiff : b.count - a.count;
      })
      .slice(0, 10);
  }

  private emptyResult(scanned = 0): PatternScanResult {
    return {
      antiPatterns: [],
      bestPatterns: [],
      codeSmells: [],
      optimizations: [],
      summary: {
        totalEntitiesScanned: scanned,
        antiPatternCount: 0,
        bestPatternCount: 0,
        codeSmellCount: 0,
        optimizationCount: 0,
        topIssues: [],
        healthScore: 100,
      },
    };
  }
}

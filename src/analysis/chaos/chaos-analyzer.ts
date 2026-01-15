/**
 * Chaos Analyzer
 *
 * Analyzes state patterns for chaos (scattered state) and race conditions.
 * Provides AI-friendly and detailed output formats.
 */

import type {
  ChaosAnalysisOptions,
  ChaosAnalysisResult,
  ChaosAnalysisSummary,
  DivergenceRisk,
  RaceAnalysis,
  RaceRisk,
} from "../../types/chaos-analysis.js";
import type { GraphStorage } from "../../types/storage.js";
import { StateDetector, type StatePatternWithRaces } from "./state-detector.js";

export class ChaosAnalyzer {
  private detector: StateDetector;

  constructor(storage: GraphStorage) {
    this.detector = new StateDetector(storage);
  }

  async analyze(options: ChaosAnalysisOptions): Promise<ChaosAnalysisResult[]> {
    const patterns = await this.detector.detectPatterns(options);
    const results: ChaosAnalysisResult[] = [];

    for (const pattern of patterns) {
      const { raceAnalysis } = pattern;
      const files = new Set(pattern.operations.map((op) => op.file));
      const chaosScore = this.calculateChaosScore(pattern, raceAnalysis);
      const divergenceRisk = this.assessDivergenceRisk(pattern, raceAnalysis);

      // Generate hotspots from operations and race conflicts
      const hotspots = this.generateHotspots(pattern, raceAnalysis);

      // Generate quick fixes based on analysis
      const quickFixes = this.generateQuickFixes(pattern, raceAnalysis);

      // Choose refactoring strategy
      const strategy = this.chooseStrategy(pattern, raceAnalysis);

      const summary: ChaosAnalysisSummary = {
        overview: {
          stateIdentifier: pattern.identifier,
          totalFiles: files.size,
          totalOperations: pattern.operations.length,
          chaosScore,
          divergenceRisk,
          raceRisk: raceAnalysis.raceRisk,
          writers: raceAnalysis.writers,
          conflicts: raceAnalysis.conflicts.length,
        },
        hotspots,
        raceConflicts: raceAnalysis.conflicts.map((c) => ({
          pattern: c.pattern,
          severity: c.severity,
          locations: c.locations.map((l) => `${l.file}:${l.line}`),
          suggestion: c.suggestion,
        })),
        quickFixes,
        refactoringStrategy: strategy,
        estimatedEffort: this.estimateEffort(pattern, raceAnalysis),
      };

      // Count mutations from race analysis
      const writeOps = pattern.operations.filter(
        (op) => op.operationType === "write" || op.operationType === "initialize" || op.operationType === "emit",
      );
      const mutationFiles = new Set(writeOps.map((op) => op.file));

      results.push({
        statePattern: pattern,
        flowMap: {
          stateIdentifier: pattern.identifier,
          origin: {
            file: pattern.operations[0]?.file || "",
            line: pattern.operations[0]?.line || 0,
            entityName: pattern.identifier,
            type: "initialization",
            code: pattern.operations[0]?.code || "",
          },
          nodes: [],
          edges: [],
          totalOperations: pattern.operations.length,
          mutationPoints: raceAnalysis.writers,
          maxDepth: Math.max(...pattern.operations.map((op) => op.depth), 0),
        },
        metrics: {
          stateIdentifier: pattern.identifier,
          coupling: {
            score: Math.min(100, files.size * 15),
            affectedComponents: pattern.operations.length,
            sharedStateCount: pattern.relatedIdentifiers.length,
            bidirectionalBindings: 0,
          },
          defensive: {
            nullChecks: pattern.operations.filter((op) => op.isDefensive).length,
            typeGuards: 0,
            defaultValues: 0,
            tryCatch: 0,
            localCopies: 0,
          },
          mutationSpread: {
            totalMutations: raceAnalysis.writers,
            filesWithMutations: mutationFiles.size,
            componentsWithMutations: raceAnalysis.mutations.length,
            averageMutationsPerComponent: mutationFiles.size > 0 ? raceAnalysis.writers / mutationFiles.size : 0,
          },
          divergenceRisk,
          complexity: {
            cyclomaticComplexity: 0,
            cognitiveComplexity: 0,
          },
          score: chaosScore,
        },
        raceAnalysis,
        refactoringPlan: {
          stateIdentifier: pattern.identifier,
          currentMetrics: {
            stateIdentifier: pattern.identifier,
            coupling: {
              score: Math.min(100, files.size * 15),
              affectedComponents: pattern.operations.length,
              sharedStateCount: pattern.relatedIdentifiers.length,
              bidirectionalBindings: 0,
            },
            defensive: {
              nullChecks: pattern.operations.filter((op) => op.isDefensive).length,
              typeGuards: 0,
              defaultValues: 0,
              tryCatch: 0,
              localCopies: 0,
            },
            mutationSpread: {
              totalMutations: raceAnalysis.writers,
              filesWithMutations: mutationFiles.size,
              componentsWithMutations: raceAnalysis.mutations.length,
              averageMutationsPerComponent: mutationFiles.size > 0 ? raceAnalysis.writers / mutationFiles.size : 0,
            },
            divergenceRisk,
            complexity: {
              cyclomaticComplexity: 0,
              cognitiveComplexity: 0,
            },
            score: chaosScore,
          },
          strategy,
          reasoning: this.generateReasoning(strategy, raceAnalysis),
          steps: [],
          newComponents: [],
          benefits: {
            reducedCoupling: strategy === "Service" ? 40 : 60,
            reducedMutations: Math.floor(raceAnalysis.writers / 2),
            reducedComplexity: raceAnalysis.conflicts.length > 0 ? 50 : 30,
            improvedTestability: true,
            improvedMaintainability: true,
            estimatedLOCChange: 0,
          },
          risks: raceAnalysis.conflicts.length > 0 ? ["Требуется тщательное тестирование синхронизации"] : [],
          prerequisites: [],
        },
        summary,
        timestamp: new Date().toISOString(),
      });
    }

    return results;
  }

  /**
   * Format results for AI consumption (compact, token-efficient)
   */
  formatForAI(results: ChaosAnalysisResult[]): string {
    if (results.length === 0) {
      return "No state patterns detected.";
    }

    const output: string[] = ["# State Chaos Analysis\n"];

    for (const result of results) {
      const { summary, raceAnalysis } = result;
      const { overview } = summary;

      // Header with risk indicators
      const riskEmoji = this.getRiskEmoji(overview.raceRisk);
      output.push(`## ${riskEmoji} ${overview.stateIdentifier}`);

      // Compact metrics line
      output.push(
        `Chaos: ${overview.chaosScore}/100 | ` +
          `Files: ${overview.totalFiles} | ` +
          `Writers: ${overview.writers} | ` +
          `Race: ${overview.raceRisk}`,
      );

      // Race conflicts (most important)
      if (raceAnalysis.conflicts.length > 0) {
        output.push("\n**⚠️ Race Conditions:**");
        for (const conflict of raceAnalysis.conflicts) {
          output.push(`- **${conflict.pattern}** (${conflict.severity})`);
          output.push(`  ${conflict.explanation}`);
          output.push(`  📍 ${conflict.locations.map((l) => `${l.entityName}:${l.line}`).join(", ")}`);
          output.push(`  💡 ${conflict.suggestion}`);
        }
      }

      // Quick fixes
      if (summary.quickFixes.length > 0) {
        output.push("\n**Quick Fixes:**");
        for (const fix of summary.quickFixes) {
          output.push(`- ${fix}`);
        }
      }

      output.push(`\n**Strategy:** ${summary.refactoringStrategy}`);
      output.push(`**Effort:** ${summary.estimatedEffort}\n`);
      output.push("---\n");
    }

    return output.join("\n");
  }

  /**
   * Format single result with full details
   */
  formatDetailed(result: ChaosAnalysisResult): string {
    const { statePattern: pattern, raceAnalysis, metrics, summary } = result;
    const lines: string[] = [];

    lines.push(`# Анализ состояния: ${pattern.identifier}`);
    lines.push(`**Тип:** ${pattern.type || "unknown"}`);
    lines.push(`**Scope:** ${pattern.scope}`);
    lines.push("");

    // Metrics section
    lines.push("## Метрики");
    lines.push(`- **Chaos Score:** ${metrics.score}/100`);
    lines.push(`- **Divergence Risk:** ${metrics.divergenceRisk}`);
    lines.push(`- **Race Risk:** ${raceAnalysis.raceRisk}`);
    lines.push(`- **Операций:** ${pattern.operations.length}`);
    lines.push(`- **Файлов:** ${new Set(pattern.operations.map((op) => op.file)).size}`);
    lines.push(`- **Писателей:** ${raceAnalysis.writers} (async: ${raceAnalysis.asyncWriters})`);
    lines.push("");

    // Race analysis section
    if (raceAnalysis.conflicts.length > 0) {
      lines.push("## ⚠️ Обнаруженные гонки");
      for (const conflict of raceAnalysis.conflicts) {
        lines.push(`### ${conflict.pattern} (${conflict.severity})`);
        lines.push(`**Описание:** ${conflict.description}`);
        lines.push(`**Объяснение:** ${conflict.explanation}`);
        lines.push("**Локации:**");
        for (const loc of conflict.locations) {
          lines.push(`- \`${loc.entityName}\` в ${loc.file}:${loc.line}`);
          if (loc.condition) {
            lines.push(`  Условие: \`${loc.condition}\``);
          }
        }
        lines.push(`**Рекомендация:** ${conflict.suggestion}`);
        lines.push("");
      }
    }

    // Mutations section
    if (raceAnalysis.mutations.length > 0) {
      lines.push("## Точки мутации");
      for (const mut of raceAnalysis.mutations) {
        const flags: string[] = [];
        if (mut.isAsync) flags.push("async");
        if (!mut.hasLock) flags.push("no-lock");
        const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
        lines.push(`- **${mut.entityName}** (${mut.mutationType})${flagStr}`);
        lines.push(`  ${mut.file}:${mut.line}`);
        if (mut.condition) {
          lines.push(`  Условие: \`${mut.condition}\``);
        }
      }
      lines.push("");
    }

    // Related identifiers
    if (pattern.relatedIdentifiers.length > 0) {
      lines.push("## Связанные идентификаторы");
      lines.push(pattern.relatedIdentifiers.map((id) => `\`${id}\``).join(", "));
      lines.push("");
    }

    // Refactoring recommendation
    lines.push("## Рекомендации");
    lines.push(`**Стратегия:** ${summary.refactoringStrategy}`);
    lines.push(`**Обоснование:** ${result.refactoringPlan.reasoning}`);
    lines.push(`**Effort:** ${summary.estimatedEffort}`);

    return lines.join("\n");
  }

  /**
   * Calculate overall chaos score combining spread and race risk
   */
  private calculateChaosScore(pattern: StatePatternWithRaces, raceAnalysis: RaceAnalysis): number {
    const baseScore = Math.min(50, pattern.operations.length * 3); // 0-50 from operations
    const fileScore = Math.min(20, new Set(pattern.operations.map((op) => op.file)).size * 5); // 0-20 from files
    const raceScore = this.raceRiskToScore(raceAnalysis.raceRisk); // 0-30 from race risk

    return Math.min(100, baseScore + fileScore + raceScore);
  }

  private raceRiskToScore(risk: RaceRisk): number {
    const scores: Record<RaceRisk, number> = {
      none: 0,
      low: 5,
      medium: 15,
      high: 25,
      critical: 30,
    };
    return scores[risk];
  }

  /**
   * Assess divergence risk combining chaos and race factors
   */
  private assessDivergenceRisk(pattern: StatePatternWithRaces, raceAnalysis: RaceAnalysis): DivergenceRisk {
    const opCount = pattern.operations.length;
    const fileCount = new Set(pattern.operations.map((op) => op.file)).size;
    const raceRisk = raceAnalysis.raceRisk;

    // Critical if race risk is critical or high + many operations
    if (raceRisk === "critical") return "critical";
    if (raceRisk === "high" && opCount >= 10) return "critical";
    if (raceRisk === "high" || (fileCount >= 5 && opCount >= 15)) return "high";
    if (raceRisk === "medium" || (fileCount >= 3 && opCount >= 8)) return "medium";
    return "low";
  }

  /**
   * Generate hotspots from pattern and race analysis
   */
  private generateHotspots(
    _pattern: StatePatternWithRaces,
    raceAnalysis: RaceAnalysis,
  ): ChaosAnalysisSummary["hotspots"] {
    const hotspots: ChaosAnalysisSummary["hotspots"] = [];

    // Add race conflict locations as high-priority hotspots
    for (const conflict of raceAnalysis.conflicts) {
      for (const loc of conflict.locations) {
        hotspots.push({
          file: loc.file,
          entity: loc.entityName,
          issues: [conflict.pattern, conflict.description],
          priority: conflict.severity === "critical" || conflict.severity === "high" ? "high" : "medium",
        });
      }
    }

    // Add unprotected async writers
    for (const mut of raceAnalysis.mutations) {
      if (mut.isAsync && !mut.hasLock) {
        const existing = hotspots.find((h) => h.file === mut.file && h.entity === mut.entityName);
        if (existing) {
          existing.issues.push("unprotected async write");
        } else {
          hotspots.push({
            file: mut.file,
            entity: mut.entityName,
            issues: ["unprotected async write"],
            priority: "medium",
          });
        }
      }
    }

    // Limit and sort by priority
    return hotspots.sort((a, b) => (a.priority === "high" ? -1 : b.priority === "high" ? 1 : 0)).slice(0, 5);
  }

  /**
   * Generate quick fix suggestions
   */
  private generateQuickFixes(pattern: StatePatternWithRaces, raceAnalysis: RaceAnalysis): string[] {
    const fixes: string[] = [];

    if (raceAnalysis.conflicts.some((c) => c.pattern === "competing-resets")) {
      fixes.push("Объедините функции сброса состояния в единый метод reset()");
    }

    if (raceAnalysis.asyncWriters > 0 && raceAnalysis.unprotectedWriters > 0) {
      fixes.push("Добавьте мьютекс или используйте queue для асинхронных операций");
    }

    if (raceAnalysis.conflicts.some((c) => c.pattern === "check-then-act")) {
      fixes.push("Используйте атомарные операции или compare-and-swap паттерн");
    }

    if (pattern.relatedIdentifiers.length > 2) {
      fixes.push(`Консолидируйте связанные переменные: ${pattern.relatedIdentifiers.slice(0, 3).join(", ")}`);
    }

    if (new Set(pattern.operations.map((op) => op.file)).size > 3) {
      fixes.push("Создайте централизованный сервис для управления состоянием");
    }

    return fixes;
  }

  /**
   * Choose refactoring strategy based on analysis
   */
  private chooseStrategy(
    pattern: StatePatternWithRaces,
    raceAnalysis: RaceAnalysis,
  ): ChaosAnalysisSummary["refactoringStrategy"] {
    // Critical race conditions → State machine
    if (raceAnalysis.raceRisk === "critical" || raceAnalysis.conflicts.length >= 3) {
      return "StateMachine";
    }

    // High race with async → Event-driven
    if (raceAnalysis.raceRisk === "high" && raceAnalysis.asyncWriters > 2) {
      return "EventBus";
    }

    // Many files → Centralized store
    const files = new Set(pattern.operations.map((op) => op.file)).size;
    if (files > 5) {
      return "Store";
    }

    // Angular context with observables
    if (pattern.operations.some((op) => op.angularPattern === "behavior_subject")) {
      return "Service";
    }

    // Default to service for moderate cases
    return "Service";
  }

  /**
   * Generate reasoning for chosen strategy
   */
  private generateReasoning(strategy: ChaosAnalysisSummary["refactoringStrategy"], raceAnalysis: RaceAnalysis): string {
    const reasons: Record<ChaosAnalysisSummary["refactoringStrategy"], string> = {
      StateMachine: `Обнаружены критические гонки (${raceAnalysis.conflicts.length} конфликтов). State machine обеспечит явные переходы и предотвратит invalid states.`,
      EventBus: `${raceAnalysis.asyncWriters} асинхронных писателей создают непредсказуемое поведение. Event-driven архитектура упорядочит обновления.`,
      Store: "Состояние разбросано по многим файлам. Централизованный store обеспечит single source of truth.",
      Service: "Централизованный сервис упростит управление состоянием и добавит контроль доступа.",
      Context: "Context API подойдёт для передачи состояния через дерево компонентов.",
      Signal: "Angular Signals обеспечат реактивность с автоматическим отслеживанием зависимостей.",
      StateManager: "Кастомный StateManager позволит реализовать специфичную логику синхронизации.",
    };
    return reasons[strategy];
  }

  /**
   * Estimate implementation effort
   */
  private estimateEffort(pattern: StatePatternWithRaces, raceAnalysis: RaceAnalysis): string {
    const files = new Set(pattern.operations.map((op) => op.file)).size;
    const conflicts = raceAnalysis.conflicts.length;

    if (conflicts >= 3 || files > 10) return "Высокая (1-2 недели)";
    if (conflicts >= 1 || files > 5) return "Средняя (2-5 дней)";
    return "Низкая (1-2 дня)";
  }

  /**
   * Get emoji for risk level
   */
  private getRiskEmoji(risk: RaceRisk): string {
    const emojis: Record<RaceRisk, string> = {
      none: "✅",
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      critical: "🔴",
    };
    return emojis[risk];
  }
}

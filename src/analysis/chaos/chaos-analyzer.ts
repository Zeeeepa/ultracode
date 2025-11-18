/**
 * Chaos Analyzer (Simplified Implementation)
 */

import type { ChaosAnalysisOptions, ChaosAnalysisResult, ChaosAnalysisSummary } from "../../types/chaos-analysis.js";
import type { GraphStorage } from "../../types/storage.js";
import { StateDetector } from "./state-detector.js";

export class ChaosAnalyzer {
  private detector: StateDetector;

  constructor(storage: GraphStorage) {
    this.detector = new StateDetector(storage);
  }

  async analyze(options: ChaosAnalysisOptions): Promise<ChaosAnalysisResult[]> {
    const patterns = await this.detector.detectPatterns(options);
    const results: ChaosAnalysisResult[] = [];

    for (const pattern of patterns) {
      const summary: ChaosAnalysisSummary = {
        overview: {
          stateIdentifier: pattern.identifier,
          totalFiles: new Set(pattern.operations.map((op) => op.file)).size,
          totalOperations: pattern.operations.length,
          chaosScore: this.calculateSimpleScore(pattern.operations.length),
          divergenceRisk: this.assessRisk(pattern.operations.length),
        },
        hotspots: [],
        quickFixes: [],
        refactoringStrategy: "Service",
        estimatedEffort: pattern.operations.length > 10 ? "Высокая" : "Низкая",
      };

      results.push({
        statePattern: pattern,
        flowMap: {
          stateIdentifier: pattern.identifier,
          origin: {
            file: pattern.operations[0]?.file || "",
            line: pattern.operations[0]?.line || 0,
            entityName: pattern.identifier,
            type: "initialization",
            code: "",
          },
          nodes: [],
          edges: [],
          totalOperations: pattern.operations.length,
          mutationPoints: 0,
          maxDepth: 0,
        },
        metrics: {
          stateIdentifier: pattern.identifier,
          coupling: {
            score: this.calculateSimpleScore(pattern.operations.length),
            affectedComponents: pattern.operations.length,
            sharedStateCount: 0,
            bidirectionalBindings: 0,
          },
          defensive: {
            nullChecks: 0,
            typeGuards: 0,
            defaultValues: 0,
            tryCatch: 0,
            localCopies: 0,
          },
          mutationSpread: {
            totalMutations: 0,
            filesWithMutations: 0,
            componentsWithMutations: 0,
            averageMutationsPerComponent: 0,
          },
          divergenceRisk: this.assessRisk(pattern.operations.length),
          complexity: {
            cyclomaticComplexity: 0,
            cognitiveComplexity: 0,
          },
          score: this.calculateSimpleScore(pattern.operations.length),
        },
        refactoringPlan: {
          stateIdentifier: pattern.identifier,
          currentMetrics: {} as any,
          strategy: "Service",
          reasoning: "Централизованный сервис упростит управление состоянием",
          steps: [],
          newComponents: [],
          benefits: {
            reducedCoupling: 40,
            reducedMutations: Math.floor(pattern.operations.length / 2),
            reducedComplexity: 30,
            improvedTestability: true,
            improvedMaintainability: true,
            estimatedLOCChange: 0,
          },
          risks: [],
          prerequisites: [],
        },
        summary,
        timestamp: new Date().toISOString(),
      });
    }

    return results;
  }

  formatForAI(results: ChaosAnalysisResult[]): string {
    if (results.length === 0) {
      return "No state patterns detected.";
    }

    const output: string[] = [];
    for (const result of results) {
      const { summary } = result;
      output.push(`## ${summary.overview.stateIdentifier}`);
      output.push(`Хаос: ${summary.overview.chaosScore}/100 (${summary.overview.divergenceRisk})`);
      output.push(`Файлов: ${summary.overview.totalFiles}, Операций: ${summary.overview.totalOperations}`);
      output.push(`Стратегия: ${summary.refactoringStrategy}`);
      output.push("");
    }

    return output.join("\n");
  }

  formatDetailed(result: ChaosAnalysisResult): string {
    return (
      `# Анализ состояния: ${result.statePattern.identifier}\n\n` +
      `**Оценка:** ${result.metrics.score}/100\n` +
      `**Риск:** ${result.metrics.divergenceRisk}\n` +
      `**Операций:** ${result.statePattern.operations.length}\n` +
      `**Файлов:** ${new Set(result.statePattern.operations.map((op) => op.file)).size}\n\n` +
      `**Рекомендация:** ${result.refactoringPlan.strategy}\n` +
      `**Обоснование:** ${result.refactoringPlan.reasoning}`
    );
  }

  private calculateSimpleScore(operationCount: number): number {
    return Math.min(100, operationCount * 5);
  }

  private assessRisk(operationCount: number): "low" | "medium" | "high" | "critical" {
    if (operationCount >= 20) return "critical";
    if (operationCount >= 10) return "high";
    if (operationCount >= 5) return "medium";
    return "low";
  }
}

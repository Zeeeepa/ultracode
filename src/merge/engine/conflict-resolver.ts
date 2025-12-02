import type { CodeUnit } from "../models/code-unit.js";
import {
  ConflictSeverity,
  ConflictType,
  type Resolution,
  ResolutionStrategy,
  type SemanticConflict,
} from "../models/semantic-conflict.js";
import type { AIConflictResolver } from "./ai-conflict-resolver.js";
import { hashText } from "../../utils/fast-hash.js";

/**
 * Conflict Resolver - Разрешение конфликтов при слиянии
 *
 * Генерирует предложения по разрешению конфликтов:
 * - Автоматическое разрешение для простых случаев
 * - AI-assisted suggestions для сложных конфликтов (через embeddings)
 * - Preview merged code для разных стратегий
 * - Confidence scoring для каждого предложения
 */

export interface ConflictResolverConfig {
  // AI integration (опционально)
  aiEnabled: boolean; // default: false
  aiResolver?: AIConflictResolver; // AI resolver для semantic analysis

  // Resolution preferences
  preferBranchA: boolean; // default: false - приоритет branchA при равных условиях
  preferNewerCode: boolean; // default: true - приоритет более новому коду
  minConfidenceThreshold: number; // default: 0.5 - минимальный confidence для auto-resolve
}

export class ConflictResolver {
  private config: ConflictResolverConfig;
  private aiResolver?: AIConflictResolver;

  constructor(_config: Partial<ConflictResolverConfig> = {}) {
    this.config = {
      aiEnabled: false,
      preferBranchA: false,
      preferNewerCode: true,
      minConfidenceThreshold: 0.5,
      ..._config,
    };

    this.aiResolver = _config.aiResolver;
  }

  /**
   * Разрешить конфликт
   *
   * @param conflict - Конфликт для разрешения
   * @returns Resolution с предложенным решением
   */
  async resolveConflict(conflict: SemanticConflict): Promise<Resolution> {
    // Если AI включен и доступен - используем AI analysis
    if (this.config.aiEnabled && this.aiResolver) {
      try {
        const aiAnalysis = await this.aiResolver.analyzeConflict(conflict);

        // Если AI confidence выше порога - используем AI resolution
        if (aiAnalysis.confidence >= this.config.minConfidenceThreshold) {
          return this.aiResolver.createResolution(aiAnalysis);
        }

        // AI не уверен - продолжаем с fallback логикой
        console.error(
          `[ConflictResolver] AI confidence ${aiAnalysis.confidence.toFixed(2)} below threshold ${this.config.minConfidenceThreshold}, using fallback`,
        );
      } catch (error) {
        console.warn("[ConflictResolver] AI analysis failed, using fallback:", error);
      }
    }

    // Fallback: традиционная логика разрешения

    // Если конфликт уже помечен как auto-resolvable
    if (conflict.autoResolvable) {
      return this.autoResolve(conflict);
    }

    // Если конфликт критический - только manual review
    if (conflict.severity === ConflictSeverity.Critical) {
      return this.createManualReviewResolution(conflict, "Critical conflict requires manual review");
    }

    // Пытаемся разрешить на основе типа конфликта
    switch (conflict.type) {
      case ConflictType.OverlappingChanges:
        return this.resolveOverlappingChanges(conflict);

      case ConflictType.IncompatibleIntents:
        return this.resolveIncompatibleIntents(conflict);

      case ConflictType.APIBreakingChange:
        return this.resolveAPIBreakingChange(conflict);

      case ConflictType.LogicConflict:
        return this.resolveLogicConflict(conflict);

      case ConflictType.MovedAndModified:
        return this.resolveMovedAndModified(conflict);

      default:
        return this.createManualReviewResolution(conflict, "Unknown conflict type");
    }
  }

  /**
   * Автоматическое разрешение для auto-resolvable конфликтов
   */
  private autoResolve(conflict: SemanticConflict): Resolution {
    const { branchAIntent, branchBIntent } = conflict;

    // Если оба намерения совместимы и Low severity - пробуем слить
    if (branchAIntent && branchBIntent && conflict.severity === ConflictSeverity.Low) {
      // Если оба BugFix или оба Refactoring - merge both
      if (
        (branchAIntent.type === "BugFix" && branchBIntent.type === "BugFix") ||
        (branchAIntent.type === "Refactoring" && branchBIntent.type === "Refactoring")
      ) {
        return this.mergeBothChanges(conflict);
      }

      // BugFix + Refactoring - merge both (обычно совместимы)
      if (
        (branchAIntent.type === "BugFix" && branchBIntent.type === "Refactoring") ||
        (branchAIntent.type === "Refactoring" && branchBIntent.type === "BugFix")
      ) {
        return this.mergeBothChanges(conflict);
      }
    }

    // Default: manual review
    return this.createManualReviewResolution(conflict, "Auto-resolve failed");
  }

  /**
   * Разрешение OverlappingChanges
   */
  private resolveOverlappingChanges(conflict: SemanticConflict): Resolution {
    const { baseUnit, branchAUnit, branchBUnit } = conflict;

    // Если изменения идентичны - take either (учитываем preferBranchA)
    if (branchAUnit.contentHash === branchBUnit.contentHash) {
      const strategy = this.config.preferBranchA ? ResolutionStrategy.TakeBranchA : ResolutionStrategy.TakeBranchB;
      const mergedCode = this.config.preferBranchA ? branchAUnit.content : branchBUnit.content;

      return {
        strategy,
        confidence: 1.0,
        mergedCode,
        explanation: "Both branches made identical changes",
      };
    }

    // Если один не изменился относительно base - take другой
    if (baseUnit) {
      const branchAUnchanged = baseUnit.contentHash === branchAUnit.contentHash;
      const branchBUnchanged = baseUnit.contentHash === branchBUnit.contentHash;

      if (branchAUnchanged && !branchBUnchanged) {
        return {
          strategy: ResolutionStrategy.TakeBranchB,
          confidence: 0.95,
          mergedCode: branchBUnit.content,
          explanation: "Only branchB modified this unit",
        };
      }

      if (branchBUnchanged && !branchAUnchanged) {
        return {
          strategy: ResolutionStrategy.TakeBranchA,
          confidence: 0.95,
          mergedCode: branchAUnit.content,
          explanation: "Only branchA modified this unit",
        };
      }
    }

    // Оба изменили - попробовать merge или manual review
    if (conflict.severity === ConflictSeverity.Low) {
      return this.mergeBothChanges(conflict);
    }

    return this.createManualReviewResolution(conflict, "Both branches modified the unit differently");
  }

  /**
   * Разрешение IncompatibleIntents
   */
  private resolveIncompatibleIntents(conflict: SemanticConflict): Resolution {
    const { branchAIntent, branchBIntent } = conflict;

    // APIChange всегда требует manual review
    if (branchAIntent?.type === "APIChange" || branchBIntent?.type === "APIChange") {
      return this.createManualReviewResolution(conflict, "API changes require manual review");
    }

    // Если один FeatureAddition, другой BugFix - можно попробовать merge
    if (
      (branchAIntent?.type === "FeatureAddition" && branchBIntent?.type === "BugFix") ||
      (branchAIntent?.type === "BugFix" && branchBIntent?.type === "FeatureAddition")
    ) {
      return this.mergeBothChanges(conflict);
    }

    return this.createManualReviewResolution(conflict, "Incompatible change intents detected");
  }

  /**
   * Разрешение APIBreakingChange
   */
  private resolveAPIBreakingChange(conflict: SemanticConflict): Resolution {
    // API breaking changes всегда требуют manual review
    return this.createManualReviewResolution(conflict, "API breaking changes require careful manual review");
  }

  /**
   * Разрешение LogicConflict
   */
  private resolveLogicConflict(conflict: SemanticConflict): Resolution {
    // Logic conflicts требуют manual review
    return this.createManualReviewResolution(conflict, "Logic conflicts require domain expertise");
  }

  /**
   * Разрешение MovedAndModified
   */
  private resolveMovedAndModified(conflict: SemanticConflict): Resolution {
    // Если файл перемещён и изменён - manual review
    return this.createManualReviewResolution(conflict, "File was both moved and modified");
  }

  /**
   * Попытка слить обе версии
   */
  private mergeBothChanges(conflict: SemanticConflict): Resolution {
    const { branchAUnit, branchBUnit, baseUnit } = conflict;

    // Простая стратегия: пытаемся объединить изменения
    // Для production можно использовать diff3 или tree-merge
    const mergedCode = this.attemptSimpleMerge(baseUnit?.content || "", branchAUnit.content, branchBUnit.content);

    if (mergedCode) {
      const confidence = 0.7;

      // Проверяем минимальный порог confidence
      if (confidence < this.config.minConfidenceThreshold) {
        return this.createManualReviewResolution(
          conflict,
          `Confidence ${confidence} below threshold ${this.config.minConfidenceThreshold}`,
        );
      }

      return {
        strategy: ResolutionStrategy.MergeBoth,
        confidence,
        mergedCode,
        explanation: "Automatically merged both changes",
      };
    }

    // Если простое слияние не удалось - manual review
    return this.createManualReviewResolution(conflict, "Automatic merge failed");
  }

  /**
   * Простой алгоритм слияния
   *
   * Пытается объединить изменения из branchA и branchB.
   * Возвращает null если автоматическое слияние невозможно.
   */
  private attemptSimpleMerge(baseContent: string, branchAContent: string, branchBContent: string): string | null {
    // Если base пустой - выбираем более длинную версию
    if (!baseContent) {
      return branchAContent.length > branchBContent.length ? branchAContent : branchBContent;
    }

    // Простая эвристика: если изменения не пересекаются по строкам
    const baseLines = baseContent.split("\n");
    const branchALines = branchAContent.split("\n");
    const branchBLines = branchBContent.split("\n");

    // Если размеры сильно отличаются - невозможно автоматически слить
    const maxLen = Math.max(baseLines.length, branchALines.length, branchBLines.length);
    const minLen = Math.min(baseLines.length, branchALines.length, branchBLines.length);

    if (maxLen > minLen * 1.5) {
      // Слишком разные - manual review
      return null;
    }

    // Для простоты возвращаем null (требуется более продвинутый diff3)
    // TODO: implement proper 3-way merge algorithm
    return null;
  }

  /**
   * Создать Resolution для manual review
   */
  private createManualReviewResolution(conflict: SemanticConflict, reason: string): Resolution {
    // Предоставляем preview обеих версий
    const preview = this.generateConflictMarkers(conflict);

    return {
      strategy: ResolutionStrategy.ManualReview,
      confidence: 0.0,
      mergedCode: preview,
      explanation: reason,
    };
  }

  /**
   * Сгенерировать conflict markers в стиле Git
   */
  private generateConflictMarkers(conflict: SemanticConflict): string {
    const { branchAUnit, branchBUnit, baseUnit } = conflict;

    let result = "";

    result += `<<<<<<< branchA: ${branchAUnit.fullyQualifiedName}\n`;
    result += branchAUnit.content;
    result += "\n";

    if (baseUnit) {
      result += `||||||| base\n`;
      result += baseUnit.content;
      result += "\n";
    }

    result += `=======\n`;
    result += branchBUnit.content;
    result += "\n";
    result += `>>>>>>> branchB: ${branchBUnit.fullyQualifiedName}\n`;

    return result;
  }

  /**
   * Batch resolution для нескольких конфликтов
   */
  async resolveConflicts(conflicts: SemanticConflict[]): Promise<Map<string, Resolution>> {
    const resolutions = new Map<string, Resolution>();

    for (const conflict of conflicts) {
      const resolution = await this.resolveConflict(conflict);
      resolutions.set(conflict.id, resolution);
    }

    return resolutions;
  }

  /**
   * Получить preview для разных стратегий
   *
   * @param conflict - Конфликт
   * @param strategy - Стратегия разрешения
   * @returns Preview merged code
   */
  getPreview(conflict: SemanticConflict, strategy: ResolutionStrategy): string {
    switch (strategy) {
      case ResolutionStrategy.TakeBranchA:
        return conflict.branchAUnit.content;

      case ResolutionStrategy.TakeBranchB:
        return conflict.branchBUnit.content;

      case ResolutionStrategy.MergeBoth:
        return (
          this.attemptSimpleMerge(
            conflict.baseUnit?.content || "",
            conflict.branchAUnit.content,
            conflict.branchBUnit.content,
          ) || this.generateConflictMarkers(conflict)
        );

      case ResolutionStrategy.ManualReview:
        return this.generateConflictMarkers(conflict);

      default:
        return this.generateConflictMarkers(conflict);
    }
  }

  /**
   * Применить resolution к code unit
   *
   * @param conflict - Конфликт
   * @param resolution - Resolution для применения
   * @returns Merged code unit
   */
  applyResolution(conflict: SemanticConflict, resolution: Resolution): CodeUnit {
    const baseUnit = conflict.branchAUnit; // Используем branchA как base для merged unit

    return {
      ...baseUnit,
      content: resolution.mergedCode,
      contentHash: this.computeHash(resolution.mergedCode),
      metadata: {
        ...baseUnit.metadata,
        mergeResolution: {
          strategy: resolution.strategy,
          confidence: resolution.confidence,
          timestamp: new Date().toISOString(),
        },
      },
    };
  }

  /**
   * Вычислить hash
   */
  private computeHash(content: string): string {
    return hashText(content);
  }
}

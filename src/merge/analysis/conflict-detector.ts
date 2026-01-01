import { type ChangeIntent, ChangeIntentType } from "../models/change-intent.js";
import type { CodeUnit } from "../models/code-unit.js";
import {
  ConflictSeverity,
  ConflictType,
  createAPIBreakingConflict,
  createIncompatibleIntentsConflict,
  createOverlappingConflict,
  type SemanticConflict,
} from "../models/semantic-conflict.js";

/**
 * Conflict Detector - Детекция конфликтов при слиянии
 *
 * Анализирует, когда обе ветки изменили один и тот же код,
 * определяет тип конфликта и severity.
 */

export class ConflictDetector {
  /**
   * Определить, есть ли конфликт между двумя изменениями
   *
   * @param baseUnit - Unit в base (может быть null)
   * @param branchAUnit - Unit в branchA
   * @param branchBUnit - Unit в branchB
   * @param branchAIntent - Intent изменения в branchA (опционально)
   * @param branchBIntent - Intent изменения в branchB (опционально)
   * @returns SemanticConflict если есть конфликт, null если нет
   */
  detectConflict(
    baseUnit: CodeUnit | null,
    branchAUnit: CodeUnit,
    branchBUnit: CodeUnit,
    branchAIntent?: ChangeIntent | undefined,
    branchBIntent?: ChangeIntent | undefined,
  ): SemanticConflict | null {
    // Если обе ветки сделали идентичные изменения - нет конфликта
    if (branchAUnit.contentHash === branchBUnit.contentHash) {
      return null;
    }

    // Проверяем API breaking changes
    const apiConflict = this.detectAPIConflict(baseUnit, branchAUnit, branchBUnit);
    if (apiConflict) {
      return apiConflict;
    }

    // Проверяем несовместимые намерения
    if (branchAIntent && branchBIntent) {
      const intentConflict = this.detectIntentConflict(
        baseUnit,
        branchAUnit,
        branchBUnit,
        branchAIntent,
        branchBIntent,
      );
      if (intentConflict) {
        return intentConflict;
      }
    }

    // Overlapping changes - обе ветки изменили один и тот же код
    const conflict = createOverlappingConflict(baseUnit, branchAUnit, branchBUnit);

    // Определяем severity на основе extent of changes
    conflict.severity = this.classifySeverity(baseUnit, branchAUnit, branchBUnit);

    // Проверяем, можно ли автоматически разрешить
    conflict.autoResolvable = this.isAutoResolvable(conflict, branchAIntent, branchBIntent);

    return conflict;
  }

  /**
   * Детекция API breaking changes
   */
  private detectAPIConflict(
    baseUnit: CodeUnit | null,
    branchAUnit: CodeUnit,
    branchBUnit: CodeUnit,
  ): SemanticConflict | null {
    if (!baseUnit) return null;

    // Проверяем signature changes
    const branchASignatureChanged = baseUnit.signature !== branchAUnit.signature;
    const branchBSignatureChanged = baseUnit.signature !== branchBUnit.signature;

    // Обе ветки изменили signature - это API breaking change
    if (branchASignatureChanged && branchBSignatureChanged) {
      return createAPIBreakingConflict(baseUnit, branchAUnit, branchBUnit);
    }

    // FQN changed (moved/renamed)
    const branchAFQNChanged = baseUnit.fullyQualifiedName !== branchAUnit.fullyQualifiedName;
    const branchBFQNChanged = baseUnit.fullyQualifiedName !== branchBUnit.fullyQualifiedName;

    if (branchAFQNChanged && branchBFQNChanged) {
      return createAPIBreakingConflict(baseUnit, branchAUnit, branchBUnit);
    }

    return null;
  }

  /**
   * Детекция конфликта намерений
   */
  private detectIntentConflict(
    baseUnit: CodeUnit | null,
    branchAUnit: CodeUnit,
    branchBUnit: CodeUnit,
    branchAIntent: ChangeIntent,
    branchBIntent: ChangeIntent,
  ): SemanticConflict | null {
    // Проверяем совместимость намерений
    const compatible = this.areIntentsCompatible(branchAIntent.type, branchBIntent.type);

    if (!compatible) {
      return createIncompatibleIntentsConflict(baseUnit, branchAUnit, branchBUnit, branchAIntent, branchBIntent);
    }

    return null;
  }

  /**
   * Проверка совместимости намерений
   */
  private areIntentsCompatible(intentA: ChangeIntentType, intentB: ChangeIntentType): boolean {
    // Матрица совместимости намерений
    const compatibilityMatrix: Record<ChangeIntentType, Set<ChangeIntentType>> = {
      [ChangeIntentType.BugFix]: new Set([
        ChangeIntentType.BugFix, // Два bug fix'а обычно compatible
        ChangeIntentType.Refactoring, // BugFix + Refactoring = OK
      ]),
      [ChangeIntentType.Refactoring]: new Set([ChangeIntentType.BugFix, ChangeIntentType.Refactoring]),
      [ChangeIntentType.FeatureAddition]: new Set([
        ChangeIntentType.FeatureAddition, // Два feature addition могут быть compatible
      ]),
      [ChangeIntentType.APIChange]: new Set([
        // API changes обычно incompatible с другими изменениями
      ]),
      [ChangeIntentType.Unknown]: new Set([ChangeIntentType.Unknown]),
    };

    const compatibleWith = compatibilityMatrix[intentA];
    return compatibleWith ? compatibleWith.has(intentB) : false;
  }

  /**
   * Классификация severity конфликта
   */
  private classifySeverity(baseUnit: CodeUnit | null, branchAUnit: CodeUnit, branchBUnit: CodeUnit): ConflictSeverity {
    if (!baseUnit) {
      // Оба добавили новый unit (маловероятно, но возможно)
      return ConflictSeverity.Medium;
    }

    // Вычисляем extent of changes
    const branchADiff = this.computeDifference(baseUnit.content, branchAUnit.content);
    const branchBDiff = this.computeDifference(baseUnit.content, branchBUnit.content);

    // Если оба изменили много - High severity
    if (branchADiff > 0.5 && branchBDiff > 0.5) {
      return ConflictSeverity.High;
    }

    // Если один изменил много - Medium severity
    if (branchADiff > 0.3 || branchBDiff > 0.3) {
      return ConflictSeverity.Medium;
    }

    // Малые изменения - Low severity
    return ConflictSeverity.Low;
  }

  /**
   * Вычислить разницу между двумя версиями кода (0.0-1.0)
   */
  private computeDifference(baseContent: string, changedContent: string): number {
    // Простая метрика: Levenshtein distance normalized
    // Для production можно использовать diff library
    const maxLength = Math.max(baseContent.length, changedContent.length);
    if (maxLength === 0) return 0.0;

    // Упрощённая версия: просто сравниваем длину
    const lengthDiff = Math.abs(baseContent.length - changedContent.length);
    return Math.min(lengthDiff / maxLength, 1.0);
  }

  /**
   * Проверка, можно ли автоматически разрешить конфликт
   */
  private isAutoResolvable(
    conflict: SemanticConflict,
    branchAIntent?: ChangeIntent | undefined,
    branchBIntent?: ChangeIntent | undefined,
  ): boolean {
    // Critical conflicts - не разрешаются автоматически
    if (conflict.severity === ConflictSeverity.Critical) {
      return false;
    }

    // API breaking changes - не разрешаются автоматически
    if (conflict.type === ConflictType.APIBreakingChange) {
      return false;
    }

    // Если намерения совместимы и severity Low - можно попробовать автоматически
    if (
      branchAIntent &&
      branchBIntent &&
      this.areIntentsCompatible(branchAIntent.type, branchBIntent.type) &&
      conflict.severity === ConflictSeverity.Low
    ) {
      return true;
    }

    // По умолчанию не разрешаем автоматически
    return false;
  }

  /**
   * Batch detection для нескольких пар units
   */
  detectConflicts(
    matches: Array<{
      baseUnit: CodeUnit | null;
      branchAUnit: CodeUnit;
      branchBUnit: CodeUnit;
      branchAIntent?: ChangeIntent | undefined;
      branchBIntent?: ChangeIntent | undefined;
    }>,
  ): SemanticConflict[] {
    const conflicts: SemanticConflict[] = [];

    for (const match of matches) {
      const conflict = this.detectConflict(
        match.baseUnit,
        match.branchAUnit,
        match.branchBUnit,
        match.branchAIntent,
        match.branchBIntent,
      );

      if (conflict) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }
}

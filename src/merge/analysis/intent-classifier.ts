import {
  type ChangeEvidence,
  type ChangeIntent,
  ChangeIntentType,
  createAPIChangeIntent,
  createBugFixIntent,
  createFeatureAdditionIntent,
  createRefactoringIntent,
  createUnknownIntent,
  EvidenceType,
} from "../models/change-intent.js";
import type { CodeUnit } from "../models/code-unit.js";

/**
 * Intent Classifier - Классификация намерений изменений
 *
 * Анализирует разницу между base и changed unit,
 * определяет намерение изменения (BugFix, Refactoring, FeatureAddition, APIChange).
 *
 * Основан на эвристиках и pattern matching.
 */

export class IntentClassifier {
  /**
   * Классифицировать намерение изменения
   *
   * @param baseUnit - Unit до изменения (может быть null для новых units)
   * @param changedUnit - Unit после изменения
   * @returns ChangeIntent с типом и confidence
   */
  classifyIntent(baseUnit: CodeUnit | null, changedUnit: CodeUnit): ChangeIntent {
    // Если baseUnit нет - это FeatureAddition
    if (!baseUnit) {
      return this.classifyNewUnit(changedUnit);
    }

    // Собираем доказательства для каждого типа намерения
    const bugFixEvidence = this.collectBugFixEvidence(baseUnit, changedUnit);
    const refactoringEvidence = this.collectRefactoringEvidence(baseUnit, changedUnit);
    const featureEvidence = this.collectFeatureAdditionEvidence(baseUnit, changedUnit);
    const apiChangeEvidence = this.collectAPIChangeEvidence(baseUnit, changedUnit);

    // Выбираем тип с наибольшим количеством доказательств
    const evidenceCounts = [
      { type: ChangeIntentType.BugFix, evidence: bugFixEvidence, count: bugFixEvidence.length },
      {
        type: ChangeIntentType.Refactoring,
        evidence: refactoringEvidence,
        count: refactoringEvidence.length,
      },
      {
        type: ChangeIntentType.FeatureAddition,
        evidence: featureEvidence,
        count: featureEvidence.length,
      },
      {
        type: ChangeIntentType.APIChange,
        evidence: apiChangeEvidence,
        count: apiChangeEvidence.length,
      },
    ];

    evidenceCounts.sort((a, b) => b.count - a.count);

    const winner = evidenceCounts[0];
    if (!winner || winner.count === 0) {
      return createUnknownIntent();
    }

    // Создаём intent на основе победившего типа
    switch (winner.type) {
      case ChangeIntentType.BugFix:
        return createBugFixIntent(bugFixEvidence);
      case ChangeIntentType.Refactoring:
        return createRefactoringIntent(refactoringEvidence);
      case ChangeIntentType.FeatureAddition:
        return createFeatureAdditionIntent(featureEvidence);
      case ChangeIntentType.APIChange:
        return createAPIChangeIntent(apiChangeEvidence);
      default:
        return createUnknownIntent();
    }
  }

  /**
   * Классифицировать новый unit (baseUnit === null)
   */
  private classifyNewUnit(changedUnit: CodeUnit): ChangeIntent {
    const evidence: ChangeEvidence[] = [];

    // Новый unit - это всегда FeatureAddition
    if (changedUnit.type === "class") {
      evidence.push({
        type: EvidenceType.NewClass,
        description: `Added new class: ${changedUnit.name}`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    } else if (changedUnit.type === "function" || changedUnit.type === "method") {
      evidence.push({
        type: EvidenceType.NewMethod,
        description: `Added new method: ${changedUnit.name}`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    } else if (changedUnit.type === "property") {
      evidence.push({
        type: EvidenceType.NewProperty,
        description: `Added new property: ${changedUnit.name}`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    return createFeatureAdditionIntent(evidence);
  }

  /**
   * Собрать доказательства BugFix
   */
  private collectBugFixEvidence(baseUnit: CodeUnit, changedUnit: CodeUnit): ChangeEvidence[] {
    const evidence: ChangeEvidence[] = [];
    const baseContent = baseUnit.content.toLowerCase();
    const changedContent = changedUnit.content.toLowerCase();

    // Добавлен try-catch
    if (!baseContent.includes("try") && changedContent.includes("try")) {
      evidence.push({
        type: EvidenceType.AddedTryCatch,
        description: "Added try-catch block for error handling",
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    // Добавлена валидация (if, guard clause)
    const baseIfCount = (baseContent.match(/\bif\s*\(/g) || []).length;
    const changedIfCount = (changedContent.match(/\bif\s*\(/g) || []).length;
    if (changedIfCount > baseIfCount) {
      evidence.push({
        type: EvidenceType.AddedValidation,
        description: `Added validation checks (+${changedIfCount - baseIfCount} if statements)`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    // Добавлена null check
    const hasNullCheck =
      changedContent.includes("!= null") ||
      changedContent.includes("!== null") ||
      changedContent.includes("== null") ||
      changedContent.includes("=== null");

    if (hasNullCheck && !baseContent.includes("null")) {
      evidence.push({
        type: EvidenceType.AddedNullCheck,
        description: "Added null/undefined check",
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    return evidence;
  }

  /**
   * Собрать доказательства Refactoring
   */
  private collectRefactoringEvidence(baseUnit: CodeUnit, changedUnit: CodeUnit): ChangeEvidence[] {
    const evidence: ChangeEvidence[] = [];

    // Переименование (имя изменилось, но структура та же)
    if (baseUnit.name !== changedUnit.name && baseUnit.structuralHash === changedUnit.structuralHash) {
      evidence.push({
        type: EvidenceType.RenamedVariable,
        description: `Renamed ${baseUnit.name} to ${changedUnit.name}`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    // Структура сохранена (CFG preserved)
    // Если structuralHash одинаковый, но contentHash разный - это скорее всего refactoring
    if (baseUnit.structuralHash === changedUnit.structuralHash && baseUnit.contentHash !== changedUnit.contentHash) {
      evidence.push({
        type: EvidenceType.CFGPreserved,
        description: "Code structure preserved (likely refactoring)",
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    return evidence;
  }

  /**
   * Собрать доказательства FeatureAddition
   */
  private collectFeatureAdditionEvidence(baseUnit: CodeUnit, changedUnit: CodeUnit): ChangeEvidence[] {
    const evidence: ChangeEvidence[] = [];

    // Добавлены новые методы (children)
    const newChildren = changedUnit.childIds.length - baseUnit.childIds.length;
    if (newChildren > 0) {
      evidence.push({
        type: EvidenceType.NewMethod,
        description: `Added ${newChildren} new methods/properties`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    // Размер кода значительно увеличился (>30%)
    const sizeIncrease = (changedUnit.content.length - baseUnit.content.length) / baseUnit.content.length;

    if (sizeIncrease > 0.3) {
      evidence.push({
        type: EvidenceType.NewMethod,
        description: `Code size increased by ${Math.round(sizeIncrease * 100)}%`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    return evidence;
  }

  /**
   * Собрать доказательства APIChange
   */
  private collectAPIChangeEvidence(baseUnit: CodeUnit, changedUnit: CodeUnit): ChangeEvidence[] {
    const evidence: ChangeEvidence[] = [];

    // Signature изменилась
    if (baseUnit.signature && changedUnit.signature && baseUnit.signature !== changedUnit.signature) {
      evidence.push({
        type: EvidenceType.SignatureChanged,
        description: `Signature changed: ${baseUnit.signature} → ${changedUnit.signature}`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    // FQN изменился (переименование или перемещение)
    if (baseUnit.fullyQualifiedName !== changedUnit.fullyQualifiedName) {
      evidence.push({
        type: EvidenceType.SignatureChanged,
        description: `Fully qualified name changed: ${baseUnit.fullyQualifiedName} → ${changedUnit.fullyQualifiedName}`,
        location: `${changedUnit.filePath}:${changedUnit.startLine}`,
      });
    }

    return evidence;
  }
}

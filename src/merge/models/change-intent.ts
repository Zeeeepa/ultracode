/**
 * Change Intent - Классификация намерения изменения
 *
 * Определяет, какую цель преследовало изменение кода:
 * - BugFix - исправление бага
 * - Refactoring - рефакторинг без изменения логики
 * - FeatureAddition - добавление новой функциональности
 * - APIChange - изменение API/сигнатуры
 */

export enum ChangeIntentType {
  BugFix = "BugFix",
  Refactoring = "Refactoring",
  FeatureAddition = "FeatureAddition",
  APIChange = "APIChange",
  Unknown = "Unknown",
}

/**
 * Детали намерения изменения
 */
export interface ChangeIntent {
  type: ChangeIntentType;
  confidence: number; // 0.0-1.0, насколько уверены в классификации
  evidence: ChangeEvidence[]; // Доказательства для классификации
  description: string; // Человекочитаемое описание
}

/**
 * Доказательство для классификации намерения
 */
export interface ChangeEvidence {
  type: EvidenceType;
  description: string;
  location?: string; // Где найдено (file:line)
  snippet?: string; // Фрагмент кода
}

export enum EvidenceType {
  // BugFix evidence
  AddedTryCatch = "AddedTryCatch",
  AddedValidation = "AddedValidation",
  AddedNullCheck = "AddedNullCheck",
  FixedOffByOne = "FixedOffByOne",

  // Refactoring evidence
  RenamedVariable = "RenamedVariable",
  ExtractedMethod = "ExtractedMethod",
  InlinedVariable = "InlinedVariable",
  CFGPreserved = "CFGPreserved", // Control Flow Graph не изменился

  // FeatureAddition evidence
  NewClass = "NewClass",
  NewMethod = "NewMethod",
  NewProperty = "NewProperty",
  NewParameter = "NewParameter",

  // APIChange evidence
  SignatureChanged = "SignatureChanged",
  ReturnTypeChanged = "ReturnTypeChanged",
  ParameterAdded = "ParameterAdded",
  ParameterRemoved = "ParameterRemoved",
}

/**
 * Создать BugFix intent
 */
export function createBugFixIntent(evidence: ChangeEvidence[]): ChangeIntent {
  return {
    type: ChangeIntentType.BugFix,
    confidence: evidence.length > 0 ? Math.min(0.7 + evidence.length * 0.1, 1.0) : 0.5,
    evidence,
    description: "Code change appears to fix a bug",
  };
}

/**
 * Создать Refactoring intent
 */
export function createRefactoringIntent(evidence: ChangeEvidence[]): ChangeIntent {
  return {
    type: ChangeIntentType.Refactoring,
    confidence: evidence.length > 0 ? Math.min(0.7 + evidence.length * 0.1, 1.0) : 0.5,
    evidence,
    description: "Code change is refactoring without logic changes",
  };
}

/**
 * Создать FeatureAddition intent
 */
export function createFeatureAdditionIntent(evidence: ChangeEvidence[]): ChangeIntent {
  return {
    type: ChangeIntentType.FeatureAddition,
    confidence: evidence.length > 0 ? Math.min(0.7 + evidence.length * 0.1, 1.0) : 0.5,
    evidence,
    description: "Code change adds new functionality",
  };
}

/**
 * Создать APIChange intent
 */
export function createAPIChangeIntent(evidence: ChangeEvidence[]): ChangeIntent {
  return {
    type: ChangeIntentType.APIChange,
    confidence: evidence.length > 0 ? Math.min(0.7 + evidence.length * 0.1, 1.0) : 0.5,
    evidence,
    description: "Code change modifies API signatures",
  };
}

/**
 * Создать Unknown intent (не удалось классифицировать)
 */
export function createUnknownIntent(): ChangeIntent {
  return {
    type: ChangeIntentType.Unknown,
    confidence: 0.0,
    evidence: [],
    description: "Unable to classify change intent",
  };
}

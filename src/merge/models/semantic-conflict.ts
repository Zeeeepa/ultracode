import type { ChangeIntent } from "./change-intent.js";
import type { CodeUnit } from "./code-unit.js";

/**
 * Semantic Conflict - Конфликт при слиянии
 *
 * Возникает когда обе ветки изменили один и тот же код,
 * и изменения несовместимы или требуют ручного разрешения.
 */

export enum ConflictSeverity {
  Low = "Low", // Автоматически разрешимо
  Medium = "Medium", // Требует проверки
  High = "High", // Требует ручного разрешения
  Critical = "Critical", // Критический конфликт (breaking changes)
}

export enum ConflictType {
  OverlappingChanges = "OverlappingChanges", // Оба изменили одно и то же
  IncompatibleIntents = "IncompatibleIntents", // Несовместимые намерения
  APIBreakingChange = "APIBreakingChange", // Breaking change в API
  LogicConflict = "LogicConflict", // Конфликт в логике
  MovedAndModified = "MovedAndModified", // Файл перемещён и изменён
  DeleteModify = "DeleteModify", // Удалён в одной ветке, изменён в другой
}

/**
 * Конфликт между двумя версиями unit
 */
export interface SemanticConflict {
  id: string; // Уникальный ID конфликта
  type: ConflictType;
  severity: ConflictSeverity;

  // Affected units
  baseUnit: CodeUnit | null; // Unit в base (может не быть для новых)
  branchAUnit: CodeUnit; // Unit в branchA
  branchBUnit: CodeUnit; // Unit в branchB

  // Intent information
  branchAIntent?: ChangeIntent;
  branchBIntent?: ChangeIntent;

  // Conflict details
  description: string; // Человекочитаемое описание
  conflictingRegions: ConflictRegion[]; // Конфликтующие участки кода

  // Resolution info
  autoResolvable: boolean; // Можно ли автоматически разрешить
  suggestedResolution?: Resolution; // Предложенное решение
}

/**
 * Регион конфликта (участок кода)
 */
export interface ConflictRegion {
  startLine: number;
  endLine: number;
  branchAContent: string; // Контент из branchA
  branchBContent: string; // Контент из branchB
  baseContent?: string; // Контент из base (если есть)
}

/**
 * Предложенное решение конфликта
 */
export interface Resolution {
  strategy: ResolutionStrategy;
  confidence: number; // 0.0-1.0
  mergedCode: string; // Результирующий код
  explanation: string; // Объяснение решения
}

export enum ResolutionStrategy {
  TakeBranchA = "TakeBranchA", // Взять версию из branchA
  TakeBranchB = "TakeBranchB", // Взять версию из branchB
  MergeBoth = "MergeBoth", // Слить обе версии
  ManualReview = "ManualReview", // Требуется ручная проверка
}

/**
 * Создать конфликт OverlappingChanges
 */
export function createOverlappingConflict(
  baseUnit: CodeUnit | null,
  branchAUnit: CodeUnit,
  branchBUnit: CodeUnit,
): SemanticConflict {
  const id = `conflict-${branchAUnit.id}-${branchBUnit.id}-${Date.now()}`;

  return {
    id,
    type: ConflictType.OverlappingChanges,
    severity: ConflictSeverity.Medium,
    baseUnit,
    branchAUnit,
    branchBUnit,
    description: `Both branches modified ${branchAUnit.fullyQualifiedName}`,
    conflictingRegions: [],
    autoResolvable: false,
  };
}

/**
 * Создать конфликт IncompatibleIntents
 */
export function createIncompatibleIntentsConflict(
  baseUnit: CodeUnit | null,
  branchAUnit: CodeUnit,
  branchBUnit: CodeUnit,
  branchAIntent: ChangeIntent,
  branchBIntent: ChangeIntent,
): SemanticConflict {
  const id = `conflict-${branchAUnit.id}-${branchBUnit.id}-${Date.now()}`;

  return {
    id,
    type: ConflictType.IncompatibleIntents,
    severity: ConflictSeverity.High,
    baseUnit,
    branchAUnit,
    branchBUnit,
    branchAIntent,
    branchBIntent,
    description: `Incompatible intents: ${branchAIntent.type} vs ${branchBIntent.type}`,
    conflictingRegions: [],
    autoResolvable: false,
  };
}

/**
 * Создать конфликт APIBreakingChange
 */
export function createAPIBreakingConflict(
  baseUnit: CodeUnit | null,
  branchAUnit: CodeUnit,
  branchBUnit: CodeUnit,
): SemanticConflict {
  const id = `conflict-${branchAUnit.id}-${branchBUnit.id}-${Date.now()}`;

  return {
    id,
    type: ConflictType.APIBreakingChange,
    severity: ConflictSeverity.Critical,
    baseUnit,
    branchAUnit,
    branchBUnit,
    description: `API breaking change in ${branchAUnit.fullyQualifiedName}`,
    conflictingRegions: [],
    autoResolvable: false,
  };
}

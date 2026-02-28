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
 * Conflict Detector - Detects conflicts during merge
 *
 * Analyzes when both branches modified the same code,
 * determines conflict type and severity.
 */

export class ConflictDetector {
  /**
   * Determine whether there is a conflict between two changes
   *
   * @param baseUnit - Unit in base (may be null)
   * @param branchAUnit - Unit in branchA
   * @param branchBUnit - Unit in branchB
   * @param branchAIntent - Change intent in branchA (optional)
   * @param branchBIntent - Change intent in branchB (optional)
   * @returns SemanticConflict if there is a conflict, null if not
   */
  detectConflict(
    baseUnit: CodeUnit | null,
    branchAUnit: CodeUnit,
    branchBUnit: CodeUnit,
    branchAIntent?: ChangeIntent | undefined,
    branchBIntent?: ChangeIntent | undefined,
  ): SemanticConflict | null {
    // If both branches made identical changes - no conflict
    if (branchAUnit.contentHash === branchBUnit.contentHash) {
      return null;
    }

    // Check for API breaking changes
    const apiConflict = this.detectAPIConflict(baseUnit, branchAUnit, branchBUnit);
    if (apiConflict) {
      return apiConflict;
    }

    // Check for incompatible intents
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

    // Overlapping changes - both branches modified the same code
    const conflict = createOverlappingConflict(baseUnit, branchAUnit, branchBUnit);

    // Determine severity based on extent of changes
    conflict.severity = this.classifySeverity(baseUnit, branchAUnit, branchBUnit);

    // Check if it can be automatically resolved
    conflict.autoResolvable = this.isAutoResolvable(conflict, branchAIntent, branchBIntent);

    return conflict;
  }

  /**
   * Detect API breaking changes
   */
  private detectAPIConflict(
    baseUnit: CodeUnit | null,
    branchAUnit: CodeUnit,
    branchBUnit: CodeUnit,
  ): SemanticConflict | null {
    if (!baseUnit) return null;

    // Check signature changes
    const branchASignatureChanged = baseUnit.signature !== branchAUnit.signature;
    const branchBSignatureChanged = baseUnit.signature !== branchBUnit.signature;

    // Both branches changed signature - this is an API breaking change
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
   * Detect intent conflict
   */
  private detectIntentConflict(
    baseUnit: CodeUnit | null,
    branchAUnit: CodeUnit,
    branchBUnit: CodeUnit,
    branchAIntent: ChangeIntent,
    branchBIntent: ChangeIntent,
  ): SemanticConflict | null {
    // Check intent compatibility
    const compatible = this.areIntentsCompatible(branchAIntent.type, branchBIntent.type);

    if (!compatible) {
      return createIncompatibleIntentsConflict(baseUnit, branchAUnit, branchBUnit, branchAIntent, branchBIntent);
    }

    return null;
  }

  /**
   * Check intent compatibility
   */
  private areIntentsCompatible(intentA: ChangeIntentType, intentB: ChangeIntentType): boolean {
    // Intent compatibility matrix
    const compatibilityMatrix: Record<ChangeIntentType, Set<ChangeIntentType>> = {
      [ChangeIntentType.BugFix]: new Set([
        ChangeIntentType.BugFix, // Two bug fixes are usually compatible
        ChangeIntentType.Refactoring, // BugFix + Refactoring = OK
      ]),
      [ChangeIntentType.Refactoring]: new Set([ChangeIntentType.BugFix, ChangeIntentType.Refactoring]),
      [ChangeIntentType.FeatureAddition]: new Set([
        ChangeIntentType.FeatureAddition, // Two feature additions can be compatible
      ]),
      [ChangeIntentType.APIChange]: new Set([
        // API changes are usually incompatible with other changes
      ]),
      [ChangeIntentType.Unknown]: new Set([ChangeIntentType.Unknown]),
    };

    const compatibleWith = compatibilityMatrix[intentA];
    return compatibleWith ? compatibleWith.has(intentB) : false;
  }

  /**
   * Classify conflict severity
   */
  private classifySeverity(baseUnit: CodeUnit | null, branchAUnit: CodeUnit, branchBUnit: CodeUnit): ConflictSeverity {
    if (!baseUnit) {
      // Both added a new unit (unlikely, but possible)
      return ConflictSeverity.Medium;
    }

    // Compute extent of changes
    const branchADiff = this.computeDifference(baseUnit.content, branchAUnit.content);
    const branchBDiff = this.computeDifference(baseUnit.content, branchBUnit.content);

    // If both changed a lot - High severity
    if (branchADiff > 0.5 && branchBDiff > 0.5) {
      return ConflictSeverity.High;
    }

    // If one changed a lot - Medium severity
    if (branchADiff > 0.3 || branchBDiff > 0.3) {
      return ConflictSeverity.Medium;
    }

    // Small changes - Low severity
    return ConflictSeverity.Low;
  }

  /**
   * Compute difference between two code versions (0.0-1.0)
   */
  private computeDifference(baseContent: string, changedContent: string): number {
    // Simple metric: Levenshtein distance normalized
    // For production a diff library can be used
    const maxLength = Math.max(baseContent.length, changedContent.length);
    if (maxLength === 0) return 0.0;

    // Simplified version: just compare lengths
    const lengthDiff = Math.abs(baseContent.length - changedContent.length);
    return Math.min(lengthDiff / maxLength, 1.0);
  }

  /**
   * Check whether the conflict can be automatically resolved
   */
  private isAutoResolvable(
    conflict: SemanticConflict,
    branchAIntent?: ChangeIntent | undefined,
    branchBIntent?: ChangeIntent | undefined,
  ): boolean {
    // Critical conflicts - cannot be auto-resolved
    if (conflict.severity === ConflictSeverity.Critical) {
      return false;
    }

    // API breaking changes - cannot be auto-resolved
    if (conflict.type === ConflictType.APIBreakingChange) {
      return false;
    }

    // If intents are compatible and severity is Low - can try auto-resolve
    if (
      branchAIntent &&
      branchBIntent &&
      this.areIntentsCompatible(branchAIntent.type, branchBIntent.type) &&
      conflict.severity === ConflictSeverity.Low
    ) {
      return true;
    }

    // By default do not auto-resolve
    return false;
  }

  /**
   * Batch detection for multiple unit pairs
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

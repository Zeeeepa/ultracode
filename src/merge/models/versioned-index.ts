import type { CodeUnit, CodeUnitType } from "./code-unit.js";

/**
 * Индекс для одной версии кода (base/branchA/branchB).
 *
 * Содержит все CodeUnit для версии плюс оптимизированные lookup индексы
 * для Fast Path matching (O(1) lookup по hash/signature).
 */
export interface VersionedIndex {
  // Version info
  branch: string; // Branch name (e.g., "main", "feature/auth")
  commit?: string; // Git commit hash (if available)
  indexedAt: Date; // Timestamp when indexed

  // Code units storage
  units: Map<string, CodeUnit>; // unitId → CodeUnit

  // Lookup indexes (для Fast Path O(1) matching)
  contentHashIndex: Map<string, string[]>; // contentHash → unitIds
  structuralHashIndex: Map<string, string[]>; // structuralHash → unitIds
  signatureIndex: Map<string, string[]>; // signature → unitIds
  filePathIndex: Map<string, string[]>; // filePath → unitIds

  // Statistics
  stats: {
    totalUnits: number;
    byType: Map<CodeUnitType, number>; // Type → count
    byLanguage: Map<string, number>; // Language → count
    byFile: Map<string, number>; // File → count
  };
}

/**
 * Создать пустой индекс для ветки.
 */
export function createVersionedIndex(branch: string, commit?: string): VersionedIndex {
  return {
    branch,
    commit,
    indexedAt: new Date(),
    units: new Map(),
    contentHashIndex: new Map(),
    structuralHashIndex: new Map(),
    signatureIndex: new Map(),
    filePathIndex: new Map(),
    stats: {
      totalUnits: 0,
      byType: new Map(),
      byLanguage: new Map(),
      byFile: new Map(),
    },
  };
}

/**
 * Добавить CodeUnit в индекс (обновляет все lookup таблицы).
 */
export function addUnitToIndex(index: VersionedIndex, unit: CodeUnit): void {
  // Add to main storage
  index.units.set(unit.id, unit);

  // Update hash indexes for Fast Path lookup
  addToMultiMap(index.contentHashIndex, unit.contentHash, unit.id);
  addToMultiMap(index.structuralHashIndex, unit.structuralHash, unit.id);

  if (unit.signature) {
    addToMultiMap(index.signatureIndex, unit.signature, unit.id);
  }

  addToMultiMap(index.filePathIndex, unit.filePath, unit.id);

  // Update statistics
  index.stats.totalUnits++;
  incrementMapValue(index.stats.byType, unit.type);
  incrementMapValue(index.stats.byLanguage, unit.language);
  incrementMapValue(index.stats.byFile, unit.filePath);
}

/**
 * Найти units по contentHash (Fast Path Level 1).
 */
export function findByContentHash(index: VersionedIndex, hash: string): CodeUnit[] {
  const ids = index.contentHashIndex.get(hash) || [];
  return ids.map((id) => index.units.get(id)!).filter(Boolean);
}

/**
 * Найти units по structuralHash (Fast Path Level 2).
 */
export function findByStructuralHash(index: VersionedIndex, hash: string): CodeUnit[] {
  const ids = index.structuralHashIndex.get(hash) || [];
  return ids.map((id) => index.units.get(id)!).filter(Boolean);
}

/**
 * Найти units по signature (Fast Path Level 3).
 */
export function findBySignature(index: VersionedIndex, signature: string): CodeUnit[] {
  const ids = index.signatureIndex.get(signature) || [];
  return ids.map((id) => index.units.get(id)!).filter(Boolean);
}

/**
 * Найти units по filePath.
 */
export function findByFilePath(index: VersionedIndex, filePath: string): CodeUnit[] {
  const ids = index.filePathIndex.get(filePath) || [];
  return ids.map((id) => index.units.get(id)!).filter(Boolean);
}

// Helper functions

function addToMultiMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key)!.push(value);
}

function incrementMapValue<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) || 0) + 1);
}

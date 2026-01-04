/**
 * Python Layer 3: Relationship Mapping
 *
 * Inheritance hierarchies, method overrides, import dependencies, cross-file references.
 */

import type { ASTNode, EntityRelationship, ImportDependency } from "../../types/parser.js";
import { findNodesByType } from "../base-parser-utils.js";
import type { AnalysisContext } from "./types.js";
import { withPerformanceMonitoring } from "./utils/helpers.js";

// =============================================================================
// LAYER 3 ANALYZER CLASS
// =============================================================================

export class Layer3RelationshipAnalyzer {
  /**
   * Execute Layer 3 analysis - relationship mapping
   */
  async executeAnalysis(rootNode: ASTNode, context: AnalysisContext): Promise<void> {
    console.error("[PythonAnalyzer] Executing Layer 3: Relationship Mapping");
    const layer3StartTime = Date.now();

    await withPerformanceMonitoring(
      "Layer3Analysis",
      () => {
        this.analyzeInheritanceHierarchy(context);
        this.analyzeMethodOverrides(context);
        this.analyzeImportDependencies(rootNode, context);
        this.createCrossReferences(context);
        this.analyzeMethodResolutionOrder(context);
      },
      context.metrics,
    );

    context.metrics.relationshipMapping.timeMs = Date.now() - layer3StartTime;
    console.error(`[PythonAnalyzer] Layer 3 completed in ${context.metrics.relationshipMapping.timeMs}ms`);
  }

  /**
   * Analyze inheritance hierarchy and create relationships
   */
  private analyzeInheritanceHierarchy(context: AnalysisContext): void {
    for (const [className, classInfo] of context.classes.entries()) {
      if (classInfo.baseClasses && classInfo.baseClasses.length > 0) {
        for (const baseClass of classInfo.baseClasses) {
          const relationship: EntityRelationship = {
            from: className,
            to: baseClass,
            type: "inherits",
            sourceFile: context.filePath,
            metadata: {
              isDirectRelation: true,
              line: classInfo.location?.start.line,
            },
          };
          context.relationships.push(relationship);
          context.metrics.relationshipMapping.inheritanceHierarchiesBuilt++;
        }
      }
    }
  }

  /**
   * Analyze method overrides between classes
   */
  private analyzeMethodOverrides(context: AnalysisContext): void {
    for (const [className, classInfo] of context.classes.entries()) {
      const methods = classInfo.methods || [];
      if (!methods.length) continue;
      const bases = classInfo.baseClasses || [];

      for (const base of bases) {
        const baseInfo = context.classes.get(base);
        if (!baseInfo) continue;
        const baseMethods = baseInfo.methods || [];
        if (!baseMethods.length) continue;

        for (const m of methods) {
          if (baseMethods.includes(m)) {
            const relationship: EntityRelationship = {
              from: `${className}.${m}`,
              to: `${base}.${m}`,
              type: "overrides",
              sourceFile: context.filePath,
              metadata: { isDirectRelation: true },
            };
            context.relationships.push(relationship);
            context.metrics.relationshipMapping.methodOverridesDetected++;
            context.metrics.relationshipMapping.methodOverrides =
              (context.metrics.relationshipMapping.methodOverrides || 0) + 1;
          }
        }
      }
    }
  }

  /**
   * Analyze import dependencies
   */
  private analyzeImportDependencies(rootNode: ASTNode, context: AnalysisContext): void {
    const importNodes = findNodesByType(rootNode, ["import_statement", "import_from_statement"]);

    for (const importNode of importNodes) {
      if (importNode.type === "import_statement") {
        const nameNode = importNode.namedChildren.find((c) => c.type === "dotted_name");
        if (nameNode) {
          const dependency: ImportDependency = {
            sourceFile: context.filePath,
            targetModule: nameNode.text,
            importType: "absolute",
            symbols: [{ name: nameNode.text }],
            line: importNode.startPosition.row + 1,
            isUsed: false,
            usageLocations: [],
          };
          context.imports.push(dependency);

          if (!context.metrics.relationshipMapping.importDependencies) {
            context.metrics.relationshipMapping.importDependencies = 0;
          }
          context.metrics.relationshipMapping.importDependencies++;
        }
      } else if (importNode.type === "import_from_statement") {
        const moduleNode = importNode.namedChildren.find((c) => c.type === "dotted_name");
        const importList = importNode.namedChildren.find((c) => c.type === "import_list");

        if (moduleNode && importList) {
          for (const importItem of importList.namedChildren) {
            if (importItem.type === "," || !importItem.text) continue;

            const dependency: ImportDependency = {
              sourceFile: context.filePath,
              targetModule: moduleNode.text,
              importType: moduleNode.text.startsWith(".") ? "relative" : "absolute",
              symbols: [{ name: importItem.text }],
              line: importNode.startPosition.row + 1,
              isUsed: false,
              usageLocations: [],
            };
            context.imports.push(dependency);

            if (!context.metrics.relationshipMapping.importDependencies) {
              context.metrics.relationshipMapping.importDependencies = 0;
            }
            context.metrics.relationshipMapping.importDependencies++;
          }
        }
      }
    }
  }

  /**
   * Create cross-references between entities
   */
  private createCrossReferences(context: AnalysisContext): void {
    for (const entity of context.entities) {
      if (entity.references) {
        for (const ref of entity.references) {
          const relationship: EntityRelationship = {
            from: entity.name,
            to: ref,
            type: "references",
            sourceFile: context.filePath,
            metadata: {
              line: entity.location?.start?.line,
              isDirectRelation: true,
            },
          };
          context.relationships.push(relationship);

          if (!context.metrics.relationshipMapping.crossReferences) {
            context.metrics.relationshipMapping.crossReferences = 0;
          }
          context.metrics.relationshipMapping.crossReferences++;
        }
      }
    }
  }

  /**
   * Analyze method resolution order for classes
   */
  private analyzeMethodResolutionOrder(context: AnalysisContext): void {
    for (const [className, classInfo] of context.classes.entries()) {
      if (classInfo.baseClasses && classInfo.baseClasses.length > 0) {
        const mro = this.calculateMRO(className, context.classes);
        classInfo.mro = mro;
        classInfo.methodResolutionOrder = mro;
        context.metrics.relationshipMapping.mroCalculations =
          (context.metrics.relationshipMapping.mroCalculations || 0) + 1;
      }
    }
  }

  /**
   * Calculate Method Resolution Order (simplified C3 linearization)
   */
  private calculateMRO(className: string, classes: Map<string, any>): string[] {
    const mro = [className];
    const classInfo = classes.get(className);

    if (classInfo?.baseClasses) {
      for (const baseClass of classInfo.baseClasses) {
        if (!mro.includes(baseClass)) {
          mro.push(baseClass);
        }
      }
    }
    return mro;
  }
}

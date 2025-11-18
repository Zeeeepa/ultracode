/**
 * Angular-Specific TypeScript Analyzer Extension
 *
 * Extends TypeScript parsing with Angular 18+ specific features:
 * - @Component/@Directive/@Injectable decorators
 * - @Input/@Output properties
 * - Standalone components
 * - Signals (signal(), computed(), effect())
 * - Template/Style metadata
 */

import type { ParsedEntity, TreeSitterNode } from "../types/parser.js";

export class AngularAnalyzer {
  /**
   * Extract Angular-specific metadata from decorators
   */
  static extractAngularMetadata(decorators: TreeSitterNode[], entity: ParsedEntity): void {
    // Ensure metadata exists
    entity.metadata = entity.metadata || {};

    for (const decorator of decorators) {
      const decoratorName = AngularAnalyzer.getDecoratorName(decorator);

      switch (decoratorName) {
        case "Component":
          entity.metadata.isAngularComponent = true;
          entity.metadata.componentMetadata = AngularAnalyzer.parseComponentDecorator(decorator);
          break;

        case "Directive":
          entity.metadata.isAngularDirective = true;
          break;

        case "Injectable":
          entity.metadata.isAngularService = true;
          break;

        case "Input":
          entity.metadata.isAngularInput = true;
          break;

        case "Output":
          entity.metadata.isAngularOutput = true;
          break;

        case "ViewChild":
        case "ViewChildren":
        case "ContentChild":
        case "ContentChildren":
          entity.metadata.isAngularQuery = true;
          entity.metadata.queryType = decoratorName;
          break;
      }
    }
  }

  /**
   * Parse @Component decorator
   */
  private static parseComponentDecorator(decorator: TreeSitterNode): Record<string, any> {
    const metadata: Record<string, any> = {};

    // Look for decorator arguments
    const args = decorator.children?.find((c) => c.type === "arguments");
    if (!args) return metadata;

    const objectLiteral = args.children?.find((c) => c.type === "object");
    if (!objectLiteral) return metadata;

    // Parse object properties
    for (const prop of objectLiteral.children || []) {
      if (prop.type === "pair") {
        const key = prop.children?.[0]?.text;
        const value = prop.children?.[1]?.text;

        if (key === "selector") {
          metadata.selector = value?.replace(/['"]/g, "");
        } else if (key === "standalone") {
          metadata.standalone = value === "true";
        } else if (key === "template" || key === "templateUrl") {
          metadata.hasTemplate = true;
        } else if (key === "styles" || key === "styleUrls") {
          metadata.hasStyles = true;
        } else if (key === "imports") {
          metadata.hasImports = true;
          metadata.isStandalone = true;
        }
      }
    }

    return metadata;
  }

  /**
   * Get decorator name from node
   */
  private static getDecoratorName(decorator: TreeSitterNode): string | null {
    // @Component(...) -> "Component"
    const callExpr = decorator.children?.find((c) => c.type === "call_expression");
    if (callExpr) {
      const identifier = callExpr.children?.find((c) => c.type === "identifier");
      return identifier?.text || null;
    }

    // @Injectable -> "Injectable"
    const identifier = decorator.children?.find((c) => c.type === "identifier");
    return identifier?.text || null;
  }

  /**
   * Detect Angular signals (signal(), computed(), effect())
   */
  static isAngularSignal(node: TreeSitterNode): boolean {
    if (node.type === "call_expression") {
      const funcName = node.children?.[0]?.text;
      return funcName === "signal" || funcName === "computed" || funcName === "effect";
    }
    return false;
  }
}

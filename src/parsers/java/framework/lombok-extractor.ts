/**
 * Java Lombok Framework Extractor
 *
 * Extracts Lombok-specific patterns and annotations from Java code.
 * Handles: @Data, @Builder, @Getter, @Setter, @NoArgsConstructor,
 *          @AllArgsConstructor, @Slf4j, @Log, @Value, @With, etc.
 *
 * Key features:
 * - Detects Lombok annotations
 * - Infers generated methods (getters, setters, builders)
 * - Identifies logging patterns
 * - Helps understand implicit code generation
 */

import type { EntityRelationship, ParsedEntity } from "../../../types/parser.js";
import type { AnnotationInfo, LombokInfo } from "../types.js";

// =============================================================================
// LOMBOK ANNOTATION PATTERNS
// =============================================================================

/**
 * Lombok class-level annotations (exported for external use)
 */
export const LOMBOK_CLASS_ANNOTATIONS = new Set([
  "Data",
  "Value",
  "Builder",
  "NoArgsConstructor",
  "AllArgsConstructor",
  "RequiredArgsConstructor",
  "EqualsAndHashCode",
  "ToString",
  "With",
]);

/**
 * Lombok field-level annotations (exported for external use)
 */
export const LOMBOK_FIELD_ANNOTATIONS = new Set(["Getter", "Setter", "NonNull", "Singular", "Builder.Default"]);

/**
 * Lombok logging annotations
 */
const LOMBOK_LOGGING_ANNOTATIONS = new Map<string, string>([
  ["Slf4j", "org.slf4j.Logger"],
  ["Log", "java.util.logging.Logger"],
  ["Log4j", "org.apache.log4j.Logger"],
  ["Log4j2", "org.apache.logging.log4j.Logger"],
  ["CommonsLog", "org.apache.commons.logging.Log"],
  ["JBossLog", "org.jboss.logging.Logger"],
  ["Flogger", "com.google.common.flogger.FluentLogger"],
  ["CustomLog", "custom"],
]);

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Check if code contains Lombok imports
 */
export function detectLombokFramework(code: string): boolean {
  const lombokPatterns = [
    /import\s+lombok\./,
    /@(Data|Builder|Getter|Setter|Slf4j|Value)/,
    /@(NoArgsConstructor|AllArgsConstructor|RequiredArgsConstructor)/,
  ];

  return lombokPatterns.some((pattern) => pattern.test(code));
}

/**
 * Detect Lombok framework confidence level
 */
export function getLombokConfidence(code: string): number {
  let confidence = 0;

  if (/import\s+lombok\./.test(code)) confidence += 0.5;
  if (/@Data/.test(code)) confidence += 0.3;
  if (/@(Getter|Setter)/.test(code)) confidence += 0.1;
  if (/@(Slf4j|Log4j|Log)/.test(code)) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

// =============================================================================
// ANNOTATION EXTRACTION
// =============================================================================

/**
 * Extract Lombok-specific information from annotations
 */
export function extractLombokInfo(annotations: AnnotationInfo[]): LombokInfo {
  const info: LombokInfo = {};

  for (const annotation of annotations) {
    const annotationName = annotation.name.replace(/^.*\./, ""); // Remove package prefix

    switch (annotationName) {
      case "Data":
        info.hasData = true;
        info.hasGetter = true;
        info.hasSetter = true;
        break;
      case "Value":
        info.hasData = true;
        info.hasGetter = true;
        break;
      case "Builder":
        info.hasBuilder = true;
        break;
      case "Getter":
        info.hasGetter = true;
        break;
      case "Setter":
        info.hasSetter = true;
        break;
      case "NoArgsConstructor":
        info.hasNoArgsConstructor = true;
        break;
      case "AllArgsConstructor":
        info.hasAllArgsConstructor = true;
        break;
      case "Slf4j":
      case "Log":
      case "Log4j":
      case "Log4j2":
      case "CommonsLog":
      case "JBossLog":
      case "Flogger":
        info.hasSlf4j = true; // Generic flag for logging
        break;
    }
  }

  return info;
}

// =============================================================================
// GENERATED METHODS INFERENCE
// =============================================================================

/**
 * Infer generated methods from Lombok annotations
 */
export function inferGeneratedMethods(entity: ParsedEntity, fields: ParsedEntity[]): ParsedEntity[] {
  const generatedMethods: ParsedEntity[] = [];

  if (!entity.decorators) return generatedMethods;

  const lombokInfo = extractLombokInfo(entity.decorators);

  // Generate getter methods
  if (lombokInfo.hasGetter || lombokInfo.hasData) {
    for (const field of fields) {
      if (field.type !== "property") continue;

      const fieldName = field.name.split(".").pop() || field.name;
      const capitalizedName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
      const getterName = `${entity.name}.get${capitalizedName}`;

      generatedMethods.push({
        name: getterName,
        type: "method",
        filePath: entity.filePath,
        location: field.location,
        modifiers: ["public", "generated"],
        returnType: (field.metadata as any)?.propertyType,
        parameters: [],
        metadata: {
          generatedBy: "lombok",
          lombokAnnotation: lombokInfo.hasData ? "Data" : "Getter",
        },
      });
    }
  }

  // Generate setter methods
  if (lombokInfo.hasSetter || lombokInfo.hasData) {
    for (const field of fields) {
      if (field.type !== "property") continue;
      if (field.modifiers?.includes("final")) continue; // No setters for final fields

      const fieldName = field.name.split(".").pop() || field.name;
      const capitalizedName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
      const setterName = `${entity.name}.set${capitalizedName}`;
      const propertyType = (field.metadata as any)?.propertyType;

      generatedMethods.push({
        name: setterName,
        type: "method",
        filePath: entity.filePath,
        location: field.location,
        modifiers: ["public", "generated"],
        returnType: "void",
        parameters: propertyType ? [{ name: fieldName, type: propertyType }] : [{ name: fieldName }],
        metadata: {
          generatedBy: "lombok",
          lombokAnnotation: lombokInfo.hasData ? "Data" : "Setter",
        },
      });
    }
  }

  // Generate builder methods
  if (lombokInfo.hasBuilder) {
    // Add builder() static method
    generatedMethods.push({
      name: `${entity.name}.builder`,
      type: "method",
      filePath: entity.filePath,
      location: entity.location,
      modifiers: ["public", "static", "generated"],
      returnType: `${entity.name}Builder`,
      parameters: [],
      metadata: {
        generatedBy: "lombok",
        lombokAnnotation: "Builder",
      },
    });

    // Add Builder inner class with builder methods for each field
    generatedMethods.push({
      name: `${entity.name}.${entity.name}Builder`,
      type: "class",
      filePath: entity.filePath,
      location: entity.location,
      modifiers: ["public", "static", "generated"],
      metadata: {
        generatedBy: "lombok",
        lombokAnnotation: "Builder",
      },
    });
  }

  // Generate constructors
  if (lombokInfo.hasNoArgsConstructor) {
    generatedMethods.push({
      name: `${entity.name}.${entity.name}`,
      type: "method",
      filePath: entity.filePath,
      location: entity.location,
      modifiers: ["public", "constructor", "generated"],
      parameters: [],
      metadata: {
        generatedBy: "lombok",
        lombokAnnotation: "NoArgsConstructor",
      },
    });
  }

  if (lombokInfo.hasAllArgsConstructor) {
    const params = fields
      .filter((f) => f.type === "property")
      .map((f) => ({
        name: f.name.split(".").pop() || f.name,
        type: (f.metadata as any)?.propertyType,
      }));

    generatedMethods.push({
      name: `${entity.name}.${entity.name}`,
      type: "method",
      filePath: entity.filePath,
      location: entity.location,
      modifiers: ["public", "constructor", "generated"],
      parameters: params,
      metadata: {
        generatedBy: "lombok",
        lombokAnnotation: "AllArgsConstructor",
      },
    });
  }

  return generatedMethods;
}

// =============================================================================
// ENTITY ENRICHMENT
// =============================================================================

/**
 * Enrich parsed entity with Lombok information
 */
export function enrichEntityWithLombok(entity: ParsedEntity): {
  entity: ParsedEntity;
  relationships: EntityRelationship[];
} {
  const relationships: EntityRelationship[] = [];

  if (!entity.decorators) {
    return { entity, relationships };
  }

  const lombokInfo = extractLombokInfo(entity.decorators);

  if (Object.keys(lombokInfo).length > 0) {
    entity.metadata = {
      ...entity.metadata,
      lombok: lombokInfo,
    };

    // Add relationship to indicate Lombok is processing this entity
    relationships.push({
      from: "lombok",
      to: entity.name,
      type: "decorates",
      metadata: {
        annotations: Object.entries(lombokInfo)
          .filter(([_, v]) => v)
          .map(([k]) => k),
      },
    });
  }

  return { entity, relationships };
}

// =============================================================================
// LOGGING DETECTION
// =============================================================================

/**
 * Check if entity uses Lombok logging
 */
export function hasLombokLogging(entity: ParsedEntity): boolean {
  if (!entity.decorators) return false;

  return entity.decorators.some((a) => LOMBOK_LOGGING_ANNOTATIONS.has(a.name.replace(/^.*\./, "")));
}

/**
 * Get the logger type from Lombok annotation
 */
export function getLoggerType(entity: ParsedEntity): string | undefined {
  if (!entity.decorators) return undefined;

  for (const annotation of entity.decorators) {
    const annotationName = annotation.name.replace(/^.*\./, "");
    const loggerType = LOMBOK_LOGGING_ANNOTATIONS.get(annotationName);
    if (loggerType) {
      return loggerType;
    }
  }

  return undefined;
}

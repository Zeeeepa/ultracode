/**
 * GraphQL Code Linking Types
 *
 * Type definitions for linking GraphQL schemas to source code.
 * Follows the pattern from src/parsers/swagger/types.ts.
 */

import type { RelationType } from "../../types/storage.js";

/**
 * A link between a GraphQL entity and a code entity
 */
export interface GraphQLCodeLink {
  /** Name of the type/query/mutation in GraphQL */
  graphqlEntityName: string;
  /** Name of the resolver/type in code */
  codeEntityName: string;
  /** File path of the code entity */
  codeFilePath: string;
  /** File path of the GraphQL schema */
  graphqlFilePath: string;
  /** Type of link */
  linkType: "produces_api" | "consumes_api" | "generated_from";
  /** Confidence score 0-1 */
  confidence: number;
  /** Evidence for why these were linked */
  evidence: string[];
}

/**
 * Complete GraphQL analysis result for a project
 */
export interface GraphQLAnalysis {
  /** Resolver implementations */
  resolvers: GraphQLCodeLink[];
  /** Generated hooks/queries (consumers) */
  consumers: GraphQLCodeLink[];
  /** Generated types */
  generatedTypes: GraphQLCodeLink[];
  /** Markers found in generated files */
  generatedFileMarkers: string[];
  /** Codegen config files found */
  codegenConfigs: string[];
}

/**
 * GraphQL relationship for graph storage
 */
export interface GraphQLRelationship {
  fromName: string;
  toName: string;
  type: RelationType;
  fromFile?: string;
  toFile?: string;
  metadata: {
    confidence?: number;
    evidence?: string[];
    typeName?: string;
    fieldName?: string;
    context?: string;
  };
}

/**
 * GraphQL field argument
 */
export interface GraphQLArg {
  name: string;
  type: string;
  defaultValue?: string;
}

/**
 * GraphQL field definition
 */
export interface GraphQLFieldDef {
  name: string;
  type: string;
  isNonNull: boolean;
  isList: boolean;
  args: GraphQLArg[];
  description?: string;
}

/**
 * GraphQL Parser Module
 *
 * Re-exports all GraphQL parsing and linking functionality.
 */

export {
  analyzeGraphQLCodeLinks,
  buildGraphQLRelationships,
  getGraphQLCodegenConfigFiles,
  getGraphQLGeneratedCodeMarkers,
} from "./graphql-code-linker.js";
export * from "./types.js";

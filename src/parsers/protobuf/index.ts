/**
 * Protobuf Parser Module
 *
 * Re-exports all Protobuf parsing and linking functionality.
 */

export {
  analyzeProtobufCodeLinks,
  buildProtobufRelationships,
  getProtobufCodegenConfigFiles,
  getProtobufGeneratedCodeMarkers,
} from "./protobuf-code-linker.js";
export * from "./types.js";

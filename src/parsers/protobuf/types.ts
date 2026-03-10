/**
 * Protobuf Code Linking Types
 *
 * Type definitions for linking protobuf specifications to source code.
 * Follows the pattern from src/parsers/swagger/types.ts.
 */

import type { RelationType } from "../../types/storage.js";

/**
 * A link between a protobuf entity and a code entity
 */
export interface ProtobufCodeLink {
  /** Name of the service/message/enum in proto */
  protoEntityName: string;
  /** Name of the implementation/type in code */
  codeEntityName: string;
  /** File path of the code entity */
  codeFilePath: string;
  /** File path of the proto file */
  protoFilePath: string;
  /** Type of link */
  linkType: "produces_api" | "consumes_api" | "generated_from";
  /** Confidence score 0-1 */
  confidence: number;
  /** Evidence for why these were linked */
  evidence: string[];
}

/**
 * Complete protobuf analysis result for a project
 */
export interface ProtobufAnalysis {
  /** gRPC service implementations (servers) */
  producers: ProtobufCodeLink[];
  /** gRPC client stubs */
  consumers: ProtobufCodeLink[];
  /** Generated message types */
  generatedTypes: ProtobufCodeLink[];
  /** Markers found in generated files */
  generatedFileMarkers: string[];
  /** Codegen config files found */
  codegenConfigs: string[];
}

/**
 * Protobuf relationship for graph storage
 */
export interface ProtobufRelationship {
  fromName: string;
  toName: string;
  type: RelationType;
  fromFile?: string;
  toFile?: string;
  metadata: {
    confidence?: number;
    evidence?: string[];
    serviceName?: string;
    rpcName?: string;
    messageType?: string;
    context?: string;
  };
}

/**
 * Proto field definition
 */
export interface ProtoField {
  name: string;
  type: string;
  number: number;
  repeated: boolean;
  optional: boolean;
  mapKey?: string;
  mapValue?: string;
  oneofGroup?: string;
}

/**
 * Proto enum value
 */
export interface ProtoEnumValue {
  name: string;
  number: number;
}

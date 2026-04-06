/**
 * Protobuf Usage Detector
 *
 * Detects actively used proto files via multi-signal scoring.
 * Delegates to base-usage-detector with Protobuf-specific config.
 */

import type { GraphStorage } from "../types/storage.js";
import {
  applyUsageMetadata,
  detectUsage,
  type FileUsage,
  type UsageResult,
  type UsageSignal,
} from "./base-usage-detector.js";

// Backward-compatible type aliases
export type ProtobufUsageResult = UsageResult;
export type ProtobufFileUsage = FileUsage;
export type ProtobufUsageSignal = UsageSignal;

export async function detectProtobufUsage(storage: GraphStorage): Promise<UsageResult> {
  return detectUsage(storage, {
    logTag: "PROTOBUF_USAGE",
    entityFilter: (e) => e.metadata?.["protoType"] === "package" || e.metadata?.["protoType"] === "service",
    importPathMatcher: (toId) =>
      toId.includes("_pb2") ||
      toId.includes(".pb.") ||
      toId.includes("_pb.") ||
      toId.includes("Grpc.") ||
      toId.includes("_grpc"),
    codegenKeywords: ["buf generate", "protoc", "grpc_tools", "protoc-gen", "buf build"],
    configFileNames: ["buf.gen.yaml", "buf.yaml", "buf.lock", "buf.work.yaml"],
    generatedFilter: (e) => {
      const patterns = [/_pb2\.py$/, /\.pb\.go$/, /_grpc\.pb\.go$/, /Grpc\.cs$/, /_pb\.ts$/, /_pb\.js$/];
      return patterns.some((pat) => pat.test(e.filePath));
    },
  });
}

export async function applyProtobufUsageMetadata(storage: GraphStorage, usage: UsageResult): Promise<number> {
  return applyUsageMetadata(storage, usage);
}

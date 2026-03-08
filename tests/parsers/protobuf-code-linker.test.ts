import { describe, expect, it } from "bun:test";
import {
  analyzeProtobufCodeLinks,
  buildProtobufRelationships,
} from "../../src/parsers/protobuf/protobuf-code-linker.js";
import type { Entity } from "../../src/types/storage.js";

function makeEntity(overrides: Partial<Entity>): Entity {
  return {
    id: overrides.id ?? `id-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? "unknown",
    type: overrides.type ?? "class",
    filePath: overrides.filePath ?? "src/test.ts",
    location: overrides.location ?? { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    metadata: overrides.metadata ?? {},
    contentHash: "hash",
  };
}

describe("analyzeProtobufCodeLinks", () => {
  it("detects Go gRPC server producer", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "UserService",
        type: "class",
        filePath: "api/user.proto",
        metadata: { protoType: "service", isApiContract: true },
      }),
      makeEntity({
        name: "UserServiceServer",
        type: "class",
        filePath: "server/user_server.go",
        metadata: { signature: "func (s *server) RegisterUserServiceServer()" },
      }),
      makeEntity({
        name: "UnimplementedUserServiceServer",
        type: "class",
        filePath: "server/user_server.go",
        metadata: { signature: "type UnimplementedUserServiceServer struct{}" },
      }),
    ];

    const analysis = analyzeProtobufCodeLinks(entities);
    expect(analysis.producers.length).toBeGreaterThan(0);
    expect(analysis.producers[0]!.protoEntityName).toBe("UserService");
    expect(analysis.producers[0]!.linkType).toBe("produces_api");
  });

  it("detects Python gRPC servicer", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "OrderService",
        type: "class",
        filePath: "proto/order.proto",
        metadata: { protoType: "service", isApiContract: true },
      }),
      makeEntity({
        name: "OrderServiceServicer",
        type: "class",
        filePath: "service/order_service.py",
        metadata: { signature: "class OrderServiceServicer:" },
      }),
    ];

    const analysis = analyzeProtobufCodeLinks(entities);
    expect(analysis.producers.length).toBeGreaterThan(0);
  });

  it("detects generated pb files as consumers", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "UserService",
        type: "class",
        filePath: "api/user.proto",
        metadata: { protoType: "service", isApiContract: true },
      }),
      makeEntity({
        name: "UserServiceClient",
        type: "class",
        filePath: "gen/user_pb2_grpc.py",
        metadata: { signature: "class UserServiceStub(object):" },
      }),
    ];

    const analysis = analyzeProtobufCodeLinks(entities);
    expect(analysis.consumers.length).toBeGreaterThan(0);
  });

  it("matches proto message types to generated code types", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "UserRequest",
        type: "type",
        filePath: "api/user.proto",
        metadata: { protoType: "message", isApiContract: true, fields: [{ name: "id", type: "string" }] },
      }),
      makeEntity({
        name: "UserRequest",
        type: "type",
        filePath: "gen/user_pb.ts",
        metadata: {},
      }),
    ];

    const analysis = analyzeProtobufCodeLinks(entities);
    expect(analysis.generatedTypes.length).toBeGreaterThan(0);
    expect(analysis.generatedTypes[0]!.linkType).toBe("generated_from");
  });

  it("finds codegen config files", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "UserService",
        type: "class",
        filePath: "api/user.proto",
        metadata: { protoType: "service", isApiContract: true },
      }),
      makeEntity({
        name: "buf.gen.yaml",
        type: "file",
        filePath: "buf.gen.yaml",
        metadata: {},
      }),
    ];

    const analysis = analyzeProtobufCodeLinks(entities);
    expect(analysis.codegenConfigs).toContain("buf.gen.yaml");
  });

  it("builds relationships from analysis", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "UserService",
        type: "class",
        filePath: "api/user.proto",
        metadata: { protoType: "service", isApiContract: true },
      }),
      makeEntity({
        name: "UnimplementedUserServiceServer",
        type: "class",
        filePath: "server/user.go",
        metadata: { signature: "UnimplementedUserServiceServer" },
      }),
    ];

    const analysis = analyzeProtobufCodeLinks(entities);
    const rels = buildProtobufRelationships(analysis);

    if (analysis.producers.length > 0) {
      expect(rels.length).toBeGreaterThan(0);
      expect(rels[0]!.type).toBe("produces_api");
    }
  });

  it("returns empty results for non-proto projects", () => {
    const entities: Entity[] = [makeEntity({ name: "AppComponent", type: "class", filePath: "src/app.ts" })];

    const analysis = analyzeProtobufCodeLinks(entities);
    expect(analysis.producers).toHaveLength(0);
    expect(analysis.consumers).toHaveLength(0);
    expect(analysis.generatedTypes).toHaveLength(0);
  });
});

import { describe, expect, it } from "bun:test";
import { analyzeGraphQLCodeLinks, buildGraphQLRelationships } from "../../src/parsers/graphql/graphql-code-linker.js";
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

describe("analyzeGraphQLCodeLinks", () => {
  it("detects type-graphql resolver", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "Query",
        type: "class",
        filePath: "schema.graphql",
        metadata: { graphqlType: "query", isApiContract: true },
      }),
      makeEntity({
        name: "UserResolver",
        type: "class",
        filePath: "src/resolvers/user.resolver.ts",
        metadata: { signature: "@Resolver()" },
        decorators: [{ name: "Resolver" }],
      }),
    ];

    const analysis = analyzeGraphQLCodeLinks(entities);
    expect(analysis.resolvers.length).toBeGreaterThan(0);
    expect(analysis.resolvers[0]!.linkType).toBe("produces_api");
  });

  it("detects NestJS GraphQL resolver", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "Mutation",
        type: "class",
        filePath: "schema.graphql",
        metadata: { graphqlType: "mutation", isApiContract: true },
      }),
      makeEntity({
        name: "UserMutationResolver",
        type: "class",
        filePath: "src/resolvers/user-mutation.resolver.ts",
        metadata: { signature: "@Resolver() @Query()" },
        decorators: [{ name: "Resolver" }, { name: "Query" }],
      }),
    ];

    const analysis = analyzeGraphQLCodeLinks(entities);
    expect(analysis.resolvers.length).toBeGreaterThan(0);
  });

  it("detects generated hooks as consumers", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "Query",
        type: "class",
        filePath: "schema.graphql",
        metadata: { graphqlType: "query", isApiContract: true },
      }),
      makeEntity({
        name: "useGetUsersQuery",
        type: "function",
        filePath: "src/generated/graphql.generated.ts",
        metadata: {},
      }),
      makeEntity({
        name: "useCreateUserMutation",
        type: "function",
        filePath: "src/generated/graphql.generated.ts",
        metadata: {},
      }),
    ];

    const analysis = analyzeGraphQLCodeLinks(entities);
    expect(analysis.consumers.length).toBeGreaterThan(0);
    expect(analysis.consumers.some((c) => c.codeEntityName === "useGetUsersQuery")).toBe(true);
  });

  it("matches GraphQL types to generated code types", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "User",
        type: "type",
        filePath: "schema.graphql",
        metadata: { graphqlType: "type", isApiContract: true },
      }),
      makeEntity({
        name: "User",
        type: "type",
        filePath: "src/__generated__/types.ts",
        metadata: {},
      }),
    ];

    const analysis = analyzeGraphQLCodeLinks(entities);
    expect(analysis.generatedTypes.length).toBeGreaterThan(0);
    expect(analysis.generatedTypes[0]!.linkType).toBe("generated_from");
  });

  it("matches IUser to User", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "User",
        type: "type",
        filePath: "schema.graphql",
        metadata: { graphqlType: "type", isApiContract: true },
      }),
      makeEntity({
        name: "IUser",
        type: "interface",
        filePath: "src/generated/types.generated.ts",
        metadata: {},
      }),
    ];

    const analysis = analyzeGraphQLCodeLinks(entities);
    expect(analysis.generatedTypes.length).toBeGreaterThan(0);
  });

  it("finds codegen config files", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "Query",
        type: "class",
        filePath: "schema.graphql",
        metadata: { graphqlType: "query", isApiContract: true },
      }),
      makeEntity({
        name: "codegen.yml",
        type: "file",
        filePath: "codegen.yml",
        metadata: {},
      }),
      makeEntity({
        name: ".graphqlrc.yml",
        type: "file",
        filePath: ".graphqlrc.yml",
        metadata: {},
      }),
    ];

    const analysis = analyzeGraphQLCodeLinks(entities);
    expect(analysis.codegenConfigs).toContain("codegen.yml");
    expect(analysis.codegenConfigs).toContain(".graphqlrc.yml");
  });

  it("builds relationships from analysis", () => {
    const entities: Entity[] = [
      makeEntity({
        name: "Query",
        type: "class",
        filePath: "schema.graphql",
        metadata: { graphqlType: "query", isApiContract: true },
      }),
      makeEntity({
        name: "UserResolver",
        type: "class",
        filePath: "src/resolvers/user.ts",
        metadata: { signature: "@Resolver()" },
        decorators: [{ name: "Resolver" }],
      }),
    ];

    const analysis = analyzeGraphQLCodeLinks(entities);
    const rels = buildGraphQLRelationships(analysis);

    if (analysis.resolvers.length > 0) {
      expect(rels.length).toBeGreaterThan(0);
      expect(rels[0]!.type).toBe("produces_api");
    }
  });

  it("returns empty results for non-graphql projects", () => {
    const entities: Entity[] = [makeEntity({ name: "AppComponent", type: "class", filePath: "src/app.ts" })];

    const analysis = analyzeGraphQLCodeLinks(entities);
    expect(analysis.resolvers).toHaveLength(0);
    expect(analysis.consumers).toHaveLength(0);
    expect(analysis.generatedTypes).toHaveLength(0);
  });
});

/**
 * DB Code Linker Tests
 */

import { describe, expect, it } from "bun:test";
import { analyzeDbCodeLinks, buildDbRelationships } from "../../src/parsers/db/db-code-linker.js";
import { type Entity, EntityType } from "../../src/types/storage.js";

function makeEntity(overrides: Partial<Entity>): Entity {
  return {
    id: "id-" + Math.random().toString(36).slice(2, 8),
    name: "TestEntity",
    type: EntityType.CLASS,
    filePath: "test.ts",
    hash: "hash1",
    location: { start: { line: 1, column: 0, index: 0 }, end: { line: 1, column: 0, index: 0 } },
    metadata: {},
    ...overrides,
  };
}

describe("DB Code Linker", () => {
  it("should detect repository → table link by class name", () => {
    const dbEntity = makeEntity({
      name: "users",
      type: EntityType.TYPE,
      filePath: "schema.sql",
      metadata: { isDbSchema: true, dbType: "table", tableName: "users" },
    });
    const repoEntity = makeEntity({
      name: "UserRepository",
      type: EntityType.CLASS,
      filePath: "src/repos/user-repository.ts",
      metadata: {},
    });

    const analysis = analyzeDbCodeLinks([dbEntity, repoEntity]);
    expect(analysis.repositories.length).toBe(1);
    expect(analysis.repositories[0]!.dbEntityName).toBe("users");
    expect(analysis.repositories[0]!.codeEntityName).toBe("UserRepository");
  });

  it("should detect SQL strings in code → table link", () => {
    const dbEntity = makeEntity({
      name: "orders",
      type: EntityType.TYPE,
      filePath: "schema.sql",
      metadata: { isDbSchema: true, dbType: "table", tableName: "orders" },
    });
    const codeEntity = makeEntity({
      name: "getOrders",
      type: EntityType.FUNCTION,
      filePath: "src/services/order-service.ts",
      metadata: { body: 'const result = await db.query("SELECT * FROM orders WHERE status = 1")' },
    });

    const analysis = analyzeDbCodeLinks([dbEntity, codeEntity]);
    expect(analysis.tableLinks.length).toBe(1);
    expect(analysis.tableLinks[0]!.linkType).toBe("reads_table");
  });

  it("should detect write operations in SQL strings", () => {
    const dbEntity = makeEntity({
      name: "audit_log",
      type: EntityType.TYPE,
      filePath: "schema.sql",
      metadata: { isDbSchema: true, dbType: "table", tableName: "audit_log" },
    });
    const codeEntity = makeEntity({
      name: "logAction",
      type: EntityType.FUNCTION,
      filePath: "src/audit.ts",
      metadata: { body: 'await db.query("INSERT INTO audit_log (action) VALUES ($1)")' },
    });

    const analysis = analyzeDbCodeLinks([dbEntity, codeEntity]);
    expect(analysis.tableLinks.length).toBe(1);
    expect(analysis.tableLinks[0]!.linkType).toBe("writes_table");
  });

  it("should detect migration file → table link", () => {
    const dbEntity = makeEntity({
      name: "products",
      type: EntityType.TYPE,
      filePath: "schema.sql",
      metadata: { isDbSchema: true, dbType: "table", tableName: "products" },
    });
    const migrationEntity = makeEntity({
      name: "createProducts",
      type: EntityType.FUNCTION,
      filePath: "db/migrations/001_create_products.ts",
      metadata: { body: "CREATE TABLE products (id INT PRIMARY KEY, name TEXT)" },
    });

    const analysis = analyzeDbCodeLinks([dbEntity, migrationEntity]);
    expect(analysis.tableLinks.length).toBe(1);
    expect(analysis.tableLinks[0]!.linkType).toBe("writes_table");
    expect(analysis.tableLinks[0]!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should detect JPA repository → table link", () => {
    const dbEntity = makeEntity({
      name: "users",
      type: EntityType.TYPE,
      filePath: "schema.sql",
      metadata: { isDbSchema: true, dbType: "table", tableName: "users" },
    });
    const repoEntity = makeEntity({
      name: "UserRepo",
      type: EntityType.CLASS,
      filePath: "src/UserRepo.java",
      metadata: { superClass: "JpaRepository<User, Long>" },
    });

    const analysis = analyzeDbCodeLinks([dbEntity, repoEntity]);
    expect(analysis.repositories.length).toBeGreaterThan(0);
  });

  it("should build relationships from analysis", () => {
    const analysis = {
      tableLinks: [
        {
          dbEntityName: "users",
          codeEntityName: "getUsers",
          codeFilePath: "src/service.ts",
          linkType: "reads_table" as const,
          confidence: 0.8,
          evidence: ["SQL string"],
        },
      ],
      ormModels: [
        {
          dbEntityName: "users",
          codeEntityName: "User",
          codeFilePath: "src/models/User.ts",
          linkType: "maps_to_table" as const,
          confidence: 0.9,
          evidence: ["TypeORM @Entity"],
          orm: "typeorm",
        },
      ],
      repositories: [],
      redisPatterns: [],
    };

    const rels = buildDbRelationships(analysis);
    expect(rels.length).toBe(2);
  });

  it("should return empty analysis for projects without DB entities", () => {
    const codeEntity = makeEntity({
      name: "helper",
      type: EntityType.FUNCTION,
      filePath: "src/utils.ts",
      metadata: {},
    });

    const analysis = analyzeDbCodeLinks([codeEntity]);
    expect(analysis.tableLinks.length).toBe(0);
    expect(analysis.repositories.length).toBe(0);
  });

  it("should not link code entities to DB entities that are API contracts", () => {
    const apiEntity = makeEntity({
      name: "GetUsersEndpoint",
      type: EntityType.FUNCTION,
      filePath: "swagger.json",
      metadata: { isApiContract: true, swaggerType: "endpoint" },
    });

    const analysis = analyzeDbCodeLinks([apiEntity]);
    expect(analysis.tableLinks.length).toBe(0);
  });
});

/**
 * ORM Detector Tests
 */

import { describe, expect, it } from "bun:test";
import { detectOrmSchemas } from "../../src/parsers/db/orm-detector.js";
import { type Entity, EntityType } from "../../src/types/storage.js";

function makeEntity(overrides: Partial<Entity>): Entity {
  return {
    id: "test-id-" + Math.random().toString(36).slice(2, 8),
    name: "TestEntity",
    type: EntityType.CLASS,
    filePath: "test.ts",
    hash: "hash1",
    location: { start: { line: 1, column: 0, index: 0 }, end: { line: 1, column: 0, index: 0 } },
    metadata: {},
    ...overrides,
  };
}

describe("ORM Detector", () => {
  // TypeORM
  it("should detect TypeORM @Entity() decorator", () => {
    const entity = makeEntity({
      name: "UserProfile",
      metadata: {
        decorators: [{ name: "Entity", arguments: ['"user_profiles"'] }],
        language: "typescript",
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.orm).toBe("typeorm");
    expect(links[0]!.dbEntityName).toBe("user_profiles");
    expect(links[0]!.linkType).toBe("maps_to_table");
  });

  it("should detect TypeORM @Entity() without arg → snake_case", () => {
    const entity = makeEntity({
      name: "UserProfile",
      metadata: {
        decorators: [{ name: "Entity" }],
        language: "typescript",
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.dbEntityName).toBe("user_profile");
  });

  // Sequelize
  it("should detect Sequelize extends Model", () => {
    const entity = makeEntity({
      name: "Order",
      metadata: {
        superClass: "Model",
        language: "typescript",
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.orm).toBe("sequelize");
    expect(links[0]!.dbEntityName).toBe("orders");
  });

  // SQLAlchemy
  it("should detect SQLAlchemy __tablename__", () => {
    const entity = makeEntity({
      name: "User",
      filePath: "models.py",
      metadata: {
        language: "python",
        members: [{ name: "__tablename__", value: '"users"' }],
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.orm).toBe("sqlalchemy");
    expect(links[0]!.dbEntityName).toBe("users");
  });

  it("should detect Django models.Model", () => {
    const entity = makeEntity({
      name: "Article",
      filePath: "models.py",
      metadata: {
        language: "python",
        superClass: "models.Model",
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.orm).toBe("django");
    expect(links[0]!.dbEntityName).toBe("article");
  });

  // JPA
  it("should detect JPA @Entity + @Table(name=...)", () => {
    const entity = makeEntity({
      name: "Customer",
      filePath: "Customer.java",
      metadata: {
        language: "java",
        decorators: [{ name: "Entity" }, { name: "Table", arguments: ['name = "customers"'] }],
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.orm).toBe("jpa");
    expect(links[0]!.dbEntityName).toBe("customers");
  });

  it("should detect JPA @Entity without @Table → className", () => {
    const entity = makeEntity({
      name: "Product",
      filePath: "Product.java",
      metadata: {
        language: "java",
        decorators: [{ name: "Entity" }],
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.dbEntityName).toBe("Product");
  });

  // EF Core
  it("should detect EF Core [Table(...)] attribute", () => {
    const entity = makeEntity({
      name: "Invoice",
      filePath: "Invoice.cs",
      metadata: {
        language: "csharp",
        decorators: [{ name: "Table", arguments: ['"invoices"'] }],
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.orm).toBe("efcore");
    expect(links[0]!.dbEntityName).toBe("invoices");
  });

  // GORM
  it("should detect GORM struct tags", () => {
    const entity = makeEntity({
      name: "Payment",
      type: EntityType.TYPE,
      filePath: "payment.go",
      metadata: {
        language: "go",
        members: [
          { name: "ID", tags: 'gorm:"primaryKey"' },
          { name: "Amount", tags: 'gorm:"column:amount"' },
        ],
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(1);
    expect(links[0]!.orm).toBe("gorm");
    expect(links[0]!.dbEntityName).toBe("payments");
  });

  // Dapper
  it("should detect Dapper Query patterns in method bodies", () => {
    const entity = makeEntity({
      name: "GetUsers",
      type: EntityType.FUNCTION,
      filePath: "UserRepo.cs",
      metadata: {
        language: "csharp",
        body: 'var users = connection.Query<User>("SELECT * FROM users WHERE active = 1");',
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBeGreaterThanOrEqual(1);
    const dapperLink = links.find((l) => l.orm === "dapper");
    expect(dapperLink).toBeDefined();
    expect(dapperLink!.dbEntityName).toBe("users");
  });

  // linq2db
  it("should detect linq2db GetTable patterns", () => {
    const entity = makeEntity({
      name: "GetOrders",
      type: EntityType.FUNCTION,
      filePath: "OrderService.cs",
      metadata: {
        language: "csharp",
        body: "var orders = db.GetTable<Order>().Where(o => o.Status == 1);",
      },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBeGreaterThanOrEqual(1);
    const l2dbLink = links.find((l) => l.orm === "linq2db");
    expect(l2dbLink).toBeDefined();
    expect(l2dbLink!.dbEntityName).toBe("order");
  });

  // Skip already-detected
  it("should skip entities with isDbSchema=true", () => {
    const entity = makeEntity({
      name: "users",
      metadata: { isDbSchema: true, dbType: "table" },
    });
    const links = detectOrmSchemas([entity]);
    expect(links.length).toBe(0);
  });
});

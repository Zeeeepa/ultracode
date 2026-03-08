/**
 * Schema Drift Detector Tests
 */

import { describe, expect, it } from "bun:test";
import { detectSchemaDrift } from "../../src/parsers/db/schema-drift-detector.js";
import type { DbCodeLink, EffectiveTable, MigrationSchema } from "../../src/parsers/db/types.js";
import type { Entity } from "../../src/types/storage.js";

// Helper: create a mock Entity
function mockEntity(name: string, filePath: string, meta?: Record<string, unknown>): Entity {
  return {
    id: `ent_${name}`,
    name,
    type: "class",
    filePath,
    metadata: meta || {},
    location: { start: { line: 1, column: 0, index: 0 }, end: { line: 1, column: 0, index: 0 } },
  } as Entity;
}

// Helper: create MigrationSchema with tables
function mockMigrationSchema(
  tables: Array<{ name: string; columns: Array<{ name: string; type: string; nullable?: boolean }> }>,
): MigrationSchema {
  const tableMap = new Map<string, EffectiveTable>();
  for (const t of tables) {
    const cols = new Map<string, { name: string; type: string; nullable?: boolean }>();
    for (const c of t.columns) {
      cols.set(c.name.toLowerCase(), c);
    }
    tableMap.set(t.name.toLowerCase(), {
      name: t.name.toLowerCase(),
      columns: cols,
      indexes: [],
      foreignKeys: [],
      createdBy: "migration.sql",
      lastModifiedBy: "migration.sql",
    });
  }
  return { tables: tableMap, migrations: [], warnings: [] };
}

// Helper: create ORM link
function ormLink(tableName: string, className: string, filePath: string, orm = "typeorm"): DbCodeLink {
  return {
    dbEntityName: tableName,
    codeEntityName: className,
    codeFilePath: filePath,
    linkType: "maps_to_table",
    confidence: 0.9,
    evidence: [`${orm} model`],
    orm,
  };
}

describe("Schema Drift Detector", () => {
  it("should detect no drift when ORM and migrations match", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts")];
    const schema = mockMigrationSchema([
      {
        name: "users",
        columns: [
          { name: "id", type: "integer" },
          { name: "email", type: "varchar" },
        ],
      },
    ]);
    const entities = [
      mockEntity("User", "src/User.ts", {
        members: [
          { name: "id", type: "number" },
          { name: "email", type: "string" },
        ],
      }),
    ];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    expect(drift.driftScore).toBe(0);
    expect(drift.missingMigrations.length).toBe(0);
    expect(drift.orphanedTables.length).toBe(0);
  });

  it("should detect table in ORM but missing from migrations", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts"), ormLink("profiles", "Profile", "src/Profile.ts")];
    const schema = mockMigrationSchema([{ name: "users", columns: [{ name: "id", type: "integer" }] }]);
    const entities = [mockEntity("User", "src/User.ts"), mockEntity("Profile", "src/Profile.ts")];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    expect(drift.missingMigrations.length).toBe(1);
    expect(drift.missingMigrations[0]!.tableName).toBe("profiles");
    expect(drift.driftScore).toBeGreaterThan(0);
  });

  it("should detect table in migrations but not in ORM", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts")];
    const schema = mockMigrationSchema([
      { name: "users", columns: [{ name: "id", type: "integer" }] },
      { name: "audit_log", columns: [{ name: "id", type: "integer" }] },
    ]);
    const entities = [mockEntity("User", "src/User.ts")];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    expect(drift.orphanedTables.length).toBe(1);
    expect(drift.orphanedTables[0]!.tableName).toBe("audit_log");
  });

  it("should detect column missing in migration", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts")];
    const schema = mockMigrationSchema([{ name: "users", columns: [{ name: "id", type: "integer" }] }]);
    const entities = [
      mockEntity("User", "src/User.ts", {
        members: [
          { name: "id", type: "number" },
          { name: "avatar", type: "string" },
        ],
      }),
    ];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    const avatarDrift = drift.columnDrifts.find((d) => d.columnName === "avatar");
    expect(avatarDrift).toBeDefined();
    expect(avatarDrift!.issue).toBe("missing_in_migration");
  });

  it("should detect column missing in ORM", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts")];
    const schema = mockMigrationSchema([
      {
        name: "users",
        columns: [
          { name: "id", type: "integer" },
          { name: "legacy_field", type: "text" },
        ],
      },
    ]);
    const entities = [
      mockEntity("User", "src/User.ts", {
        members: [{ name: "id", type: "number" }],
      }),
    ];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    const legacyDrift = drift.columnDrifts.find((d) => d.columnName === "legacy_field");
    expect(legacyDrift).toBeDefined();
    expect(legacyDrift!.issue).toBe("missing_in_orm");
  });

  it("should detect type mismatch between ORM and migration", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts")];
    const schema = mockMigrationSchema([{ name: "users", columns: [{ name: "status", type: "integer" }] }]);
    const entities = [
      mockEntity("User", "src/User.ts", {
        members: [{ name: "status", type: "string" }],
      }),
    ];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    const statusDrift = drift.columnDrifts.find((d) => d.columnName === "status" && d.issue === "type_mismatch");
    expect(statusDrift).toBeDefined();
    expect(statusDrift!.ormValue).toBe("varchar");
    expect(statusDrift!.migrationValue).toBe("integer");
  });

  it("should treat equivalent types as matching (int ≈ integer)", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts")];
    const schema = mockMigrationSchema([{ name: "users", columns: [{ name: "id", type: "int4" }] }]);
    const entities = [
      mockEntity("User", "src/User.ts", {
        members: [{ name: "id", type: "number" }],
      }),
    ];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    // int4 ≈ integer ≈ number → no type_mismatch
    const typeDrift = drift.columnDrifts.find((d) => d.columnName === "id" && d.issue === "type_mismatch");
    expect(typeDrift).toBeUndefined();
  });

  it("should calculate drift score proportionally", () => {
    const ormLinks = [
      ormLink("users", "User", "src/User.ts"),
      ormLink("posts", "Post", "src/Post.ts"),
      ormLink("comments", "Comment", "src/Comment.ts"),
    ];
    const schema = mockMigrationSchema([{ name: "users", columns: [{ name: "id", type: "integer" }] }]);
    const entities = [
      mockEntity("User", "src/User.ts"),
      mockEntity("Post", "src/Post.ts"),
      mockEntity("Comment", "src/Comment.ts"),
    ];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    // 2 missing migrations out of 3 ORM tables → high drift
    expect(drift.driftScore).toBeGreaterThan(0.3);
    expect(drift.summary).toContain("ORM without migrations");
  });

  it("should produce readable summary", () => {
    const ormLinks = [ormLink("users", "User", "src/User.ts")];
    const schema = mockMigrationSchema([
      { name: "users", columns: [{ name: "id", type: "integer" }] },
      { name: "orphaned", columns: [] },
    ]);
    const entities = [
      mockEntity("User", "src/User.ts", {
        members: [
          { name: "id", type: "number" },
          { name: "new_col", type: "string" },
        ],
      }),
    ];

    const drift = detectSchemaDrift(ormLinks, schema, entities);
    expect(drift.summary.length).toBeGreaterThan(0);
    // Should mention orphaned table and column drift
    expect(drift.orphanedTables.length).toBe(1);
    expect(drift.columnDrifts.length).toBeGreaterThan(0);
  });

  it("should handle empty inputs gracefully", () => {
    const drift = detectSchemaDrift([], { tables: new Map(), migrations: [], warnings: [] }, []);
    expect(drift.driftScore).toBe(0);
    expect(drift.summary).toContain("No schema drift");
  });
});

/**
 * SQL Parser Tests
 */

import { describe, expect, it } from "bun:test";
import { SqlParser } from "../../src/parsers/db/sql-parser.js";

const parser = new SqlParser();

const POSTGRES_SQL = `
-- PostgreSQL dialect
CREATE TABLE organizations (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name TEXT,
  org_id INT REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_org ON users(org_id, email);

CREATE VIEW active_users AS
  SELECT u.*, o.name as org_name
  FROM users u JOIN organizations o ON u.org_id = o.id
  WHERE u.status = 'active';

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD CONSTRAINT chk_status CHECK (status IN ('active', 'inactive', 'banned'));
`;

describe("SqlParser", () => {
  it("should support .sql files", () => {
    expect(parser.supportsFile("schema.sql")).toBe(true);
    expect(parser.supportsFile("schema.SQL")).toBe(true);
    expect(parser.supportsFile("schema.ts")).toBe(false);
  });

  it("should parse CREATE TABLE with columns and types", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const org = result.entities.find((e) => e.name === "organizations");
    expect(org).toBeDefined();
    expect(org!.type).toBe("type");
    expect(org!.metadata?.["dbType"]).toBe("table");
    const fields = org!.metadata?.["fields"] as Array<{ name: string; type: string }>;
    expect(fields.length).toBe(3);
    expect(fields[0]!.name).toBe("id");
  });

  it("should detect PRIMARY KEY (inline)", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const org = result.entities.find((e) => e.name === "organizations");
    const fields = org!.metadata?.["fields"] as Array<{ name: string; primaryKey?: boolean }>;
    const idField = fields.find((f) => f.name === "id");
    expect(idField?.primaryKey).toBe(true);
  });

  it("should detect NOT NULL, UNIQUE, DEFAULT", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const users = result.entities.find((e) => e.name === "users");
    const fields = users!.metadata?.["fields"] as Array<{
      name: string;
      nullable?: boolean;
      unique?: boolean;
      default?: string;
    }>;

    const email = fields.find((f) => f.name === "email");
    expect(email?.nullable).toBe(false); // NOT NULL
    expect(email?.unique).toBe(true);

    const status = fields.find((f) => f.name === "status");
    expect(status?.default).toBeDefined();
  });

  it("should detect FOREIGN KEY with ON DELETE/UPDATE (inline REFERENCES)", async () => {
    const sql = `
CREATE TABLE parent (id INT PRIMARY KEY);
CREATE TABLE child (
  id INT PRIMARY KEY,
  parent_id INT,
  FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE CASCADE
);`;
    const result = await parser.parse("test.sql", sql, "hash1");
    const child = result.entities.find((e) => e.name === "child");
    const fks = child!.metadata?.["foreignKeys"] as Array<{
      refTable: string;
      onDelete?: string;
    }>;
    expect(fks.length).toBe(1);
    expect(fks[0]!.refTable).toBe("parent");
    expect(fks[0]!.onDelete).toBe("CASCADE");
  });

  it("should parse CREATE INDEX (regular and UNIQUE)", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const idx = result.entities.find((e) => e.name === "idx_users_email");
    expect(idx).toBeDefined();
    expect(idx!.type).toBe("constant");
    expect(idx!.metadata?.["dbType"]).toBe("index");
    expect(idx!.metadata?.["tableName"]).toBe("users");

    const uniqueIdx = result.entities.find((e) => e.name === "idx_users_org");
    expect(uniqueIdx!.metadata?.["unique"]).toBe(true);
  });

  it("should parse CREATE VIEW with source tables", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const view = result.entities.find((e) => e.name === "active_users");
    expect(view).toBeDefined();
    expect(view!.metadata?.["dbType"]).toBe("view");
    const sourceTables = view!.metadata?.["sourceTables"] as string[];
    expect(sourceTables).toContain("users");
    expect(sourceTables).toContain("organizations");
  });

  it("should parse CREATE FUNCTION with parameters and return type", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const func = result.entities.find((e) => e.name === "update_timestamp");
    expect(func).toBeDefined();
    expect(func!.type).toBe("function");
    expect(func!.metadata?.["dbType"]).toBe("function");
    expect(func!.metadata?.["returnType"]).toBe("TRIGGER");
  });

  it("should parse CREATE TRIGGER", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const trigger = result.entities.find((e) => e.name === "set_timestamp");
    expect(trigger).toBeDefined();
    expect(trigger!.metadata?.["dbType"]).toBe("trigger");
    expect(trigger!.metadata?.["tableName"]).toBe("users");
    expect(trigger!.metadata?.["timing"]).toBe("BEFORE");
    expect(trigger!.metadata?.["event"]).toBe("UPDATE");
  });

  it("should handle ALTER TABLE ADD COLUMN", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const users = result.entities.find((e) => e.name === "users");
    const fields = users!.metadata?.["fields"] as Array<{ name: string }>;
    const avatarField = fields.find((f) => f.name === "avatar_url");
    expect(avatarField).toBeDefined();
  });

  it("should handle ALTER TABLE ADD CONSTRAINT", async () => {
    // The constraint is a CHECK — just verify no parse errors
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    expect(result.errors.length).toBe(0);
  });

  it("should detect PostgreSQL dialect", async () => {
    const result = await parser.parse("test.sql", POSTGRES_SQL, "hash1");
    const table = result.entities.find((e) => e.metadata?.["dbType"] === "table");
    expect(table!.metadata?.["dbEngine"]).toBe("postgres");
  });

  it("should create relationships for FK between tables", async () => {
    const sql = `
CREATE TABLE parent (id INT PRIMARY KEY);
CREATE TABLE child (
  id INT PRIMARY KEY,
  parent_id INT,
  FOREIGN KEY (parent_id) REFERENCES parent(id)
);`;
    const result = await parser.parse("fk.sql", sql, "hash1");
    expect(result.relationships.length).toBeGreaterThan(0);
    const fkRel = result.relationships.find((r) => r.from.includes("child") && r.to.includes("parent"));
    expect(fkRel).toBeDefined();
  });

  it("should handle empty/minimal SQL", async () => {
    const result = await parser.parse("empty.sql", "", "hash1");
    expect(result.entities.length).toBe(0);
    expect(result.errors.length).toBe(0);

    const result2 = await parser.parse("minimal.sql", "SELECT 1;", "hash2");
    expect(result2.entities.length).toBe(0);
  });

  it("should parse ClickHouse ENGINE = MergeTree(), ORDER BY", async () => {
    const ch = `
CREATE TABLE events (
  event_date Date,
  user_id UInt64,
  action String
) ENGINE = MergeTree()
ORDER BY (event_date, user_id)
PARTITION BY toYYYYMM(event_date);
`;
    const result = await parser.parse("ch.sql", ch, "hash1");
    const table = result.entities.find((e) => e.name === "events");
    expect(table).toBeDefined();
    expect(table!.metadata?.["dbEngine"]).toBe("clickhouse");
    expect(table!.metadata?.["engine"]).toBe("MergeTree()");
    expect(table!.metadata?.["orderBy"]).toEqual(["event_date", "user_id"]);
  });
});

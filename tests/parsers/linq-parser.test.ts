/**
 * LINQ Parser Tests
 */

import { describe, expect, it } from "bun:test";
import { LinqParser } from "../../src/parsers/db/linq-parser.js";

const parser = new LinqParser();

const FULL_LINQ = `<Query Kind="Statements">
  <Connection>
    <ID>test-connection</ID>
  </Connection>
  <NuGetReference>Dapper</NuGetReference>
</Query>

var users = from u in Users
            where u.Age > 18
            orderby u.Name
            select new { u.Name, u.Email };

var count = Users.Count(u => u.IsActive);

connection.Query<User>("SELECT * FROM users WHERE id = @id", new { id = 1 });
`;

describe("LinqParser", () => {
  it("should support .linq files", () => {
    expect(parser.supportsFile("query.linq")).toBe(true);
    expect(parser.supportsFile("query.LINQ")).toBe(true);
    expect(parser.supportsFile("query.cs")).toBe(false);
  });

  it("should parse XML header (Kind, Connection, NuGetReference)", async () => {
    const result = await parser.parse("test.linq", FULL_LINQ, "hash1");
    const module = result.entities.find((e) => e.type === "module");
    expect(module).toBeDefined();
    expect(module!.metadata?.["queryKind"]).toBe("Statements");
    expect(module!.metadata?.["connection"]).toBe("test-connection");
    const nugets = module!.metadata?.["nugetReferences"] as string[];
    expect(nugets).toContain("Dapper");
  });

  it("should extract LINQ query syntax referenced tables", async () => {
    const result = await parser.parse("test.linq", FULL_LINQ, "hash1");
    const queryEntity = result.entities.find(
      (e) => e.metadata?.["dbType"] === "linq_expression" && e.metadata?.["syntax"] === "query",
    );
    expect(queryEntity).toBeDefined();
    const tables = queryEntity!.metadata?.["referencedTables"] as string[];
    expect(tables).toContain("Users");
  });

  it("should extract LINQ method syntax referenced tables", async () => {
    const result = await parser.parse("test.linq", FULL_LINQ, "hash1");
    const methodEntity = result.entities.find(
      (e) => e.metadata?.["dbType"] === "linq_expression" && e.metadata?.["syntax"] === "method",
    );
    expect(methodEntity).toBeDefined();
    const tables = methodEntity!.metadata?.["referencedTables"] as string[];
    expect(tables).toContain("Users");
  });

  it("should extract raw SQL string referenced tables", async () => {
    const result = await parser.parse("test.linq", FULL_LINQ, "hash1");
    const rawSql = result.entities.find((e) => e.metadata?.["dbType"] === "raw_sql");
    expect(rawSql).toBeDefined();
    const tables = rawSql!.metadata?.["referencedTables"] as string[];
    expect(tables).toContain("users");
  });

  it("should extract Dapper query referenced tables", async () => {
    const linq = `<Query Kind="Statements">
</Query>

connection.Query<Order>("SELECT * FROM orders WHERE status = @status", new { status = "active" });
`;
    const result = await parser.parse("dapper.linq", linq, "hash1");
    const rawSql = result.entities.find((e) => e.metadata?.["dbType"] === "raw_sql");
    expect(rawSql).toBeDefined();
    const tables = rawSql!.metadata?.["referencedTables"] as string[];
    expect(tables).toContain("orders");
  });

  it("should handle empty LINQ file", async () => {
    const result = await parser.parse("empty.linq", "", "hash1");
    expect(result.entities.length).toBeGreaterThan(0); // Module entity
    expect(result.errors.length).toBe(0);
  });

  it("should handle LINQ without XML header (plain C#)", async () => {
    const plain = `var users = from u in Users where u.Age > 18 select u;`;
    const result = await parser.parse("plain.linq", plain, "hash1");
    expect(result.entities.length).toBeGreaterThanOrEqual(1); // Module + query
  });

  it("should handle multiple queries in one file", async () => {
    const multi = `<Query Kind="Statements">
</Query>

var users = from u in Users where u.Active select u;
var orders = from o in Orders where o.Total > 100 select o;
`;
    const result = await parser.parse("multi.linq", multi, "hash1");
    const queries = result.entities.filter((e) => e.metadata?.["dbType"] === "linq_expression");
    expect(queries.length).toBe(2);
  });
});

/**
 * Prisma Parser Tests
 */

import { describe, expect, it } from "bun:test";
import { PrismaParser } from "../../src/parsers/db/prisma-parser.js";

const parser = new PrismaParser();

const PRISMA_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
  posts Post[]
  profile Profile?

  @@index([email])
  @@map("users")
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  content  String?
  author   User   @relation(fields: [authorId], references: [id])
  authorId Int

  @@unique([title, authorId])
}

enum Role {
  ADMIN
  USER
  MODERATOR
}
`;

describe("PrismaParser", () => {
  it("should support .prisma files", () => {
    expect(parser.supportsFile("schema.prisma")).toBe(true);
    expect(parser.supportsFile("schema.ts")).toBe(false);
  });

  it("should parse datasource with provider", async () => {
    const result = await parser.parse("schema.prisma", PRISMA_SCHEMA, "hash1");
    const ds = result.entities.find((e) => e.metadata?.["dbType"] === "datasource");
    expect(ds).toBeDefined();
    expect(ds!.name).toBe("db");
    expect(ds!.metadata?.["provider"]).toBe("postgresql");
    expect(ds!.metadata?.["dbEngine"]).toBe("postgres");
  });

  it("should parse generator", async () => {
    const result = await parser.parse("schema.prisma", PRISMA_SCHEMA, "hash1");
    const gen = result.entities.find((e) => e.metadata?.["dbType"] === "generator");
    expect(gen).toBeDefined();
    expect(gen!.metadata?.["provider"]).toBe("prisma-client-js");
  });

  it("should parse model with fields", async () => {
    const result = await parser.parse("schema.prisma", PRISMA_SCHEMA, "hash1");
    const user = result.entities.find((e) => e.name === "User" && e.metadata?.["dbType"] === "table");
    expect(user).toBeDefined();
    expect(user!.metadata?.["tableName"]).toBe("users"); // from @@map

    const fields = user!.metadata?.["fields"] as Array<{
      name: string;
      type: string;
      primaryKey?: boolean;
      unique?: boolean;
      autoIncrement?: boolean;
    }>;
    expect(fields.length).toBeGreaterThanOrEqual(3);

    const idField = fields.find((f) => f.name === "id");
    expect(idField?.primaryKey).toBe(true);
    expect(idField?.autoIncrement).toBe(true);

    const emailField = fields.find((f) => f.name === "email");
    expect(emailField?.unique).toBe(true);
  });

  it("should parse model relationships", async () => {
    const result = await parser.parse("schema.prisma", PRISMA_SCHEMA, "hash1");
    const rels = result.relationships.filter((r) => r.from.includes("User") || r.from.includes("Post"));
    expect(rels.length).toBeGreaterThan(0);
  });

  it("should parse @@index and @@unique", async () => {
    const result = await parser.parse("schema.prisma", PRISMA_SCHEMA, "hash1");
    const user = result.entities.find((e) => e.name === "User" && e.metadata?.["dbType"] === "table");
    const indexes = user!.metadata?.["indexes"] as Array<{ name: string; columns: string[] }>;
    expect(indexes.length).toBeGreaterThan(0);

    const post = result.entities.find((e) => e.name === "Post" && e.metadata?.["dbType"] === "table");
    const uniqueConstraints = post!.metadata?.["uniqueConstraints"] as string[][];
    expect(uniqueConstraints.length).toBe(1);
  });

  it("should parse enum", async () => {
    const result = await parser.parse("schema.prisma", PRISMA_SCHEMA, "hash1");
    const role = result.entities.find((e) => e.name === "Role" && e.metadata?.["dbType"] === "enum");
    expect(role).toBeDefined();
    const values = role!.metadata?.["values"] as string[];
    expect(values).toContain("ADMIN");
    expect(values).toContain("USER");
    expect(values).toContain("MODERATOR");
  });

  it("should handle empty prisma file", async () => {
    const result = await parser.parse("empty.prisma", "", "hash1");
    expect(result.entities.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});

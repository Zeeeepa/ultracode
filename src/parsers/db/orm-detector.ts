/**
 * ORM Detector
 *
 * Post-indexing step: analyzes already-indexed entities to find ORM patterns.
 * Creates "virtual" DB entities from code-first ORM models.
 *
 * Supports: TypeORM, Sequelize, Drizzle, MikroORM, Prisma,
 *           SQLAlchemy, Django, JPA/Hibernate, EF Core, GORM,
 *           Dapper, linq2db.
 */

import type { Entity } from "../../types/storage.js";
import type { DbCodeLink } from "./types.js";

// =============================================================================
// ORM Detector
// =============================================================================

/**
 * Detect ORM schemas from already-indexed entities.
 * Returns DbCodeLink[] for each detected ORM model → table mapping.
 */
export function detectOrmSchemas(allEntities: Entity[]): DbCodeLink[] {
  const links: DbCodeLink[] = [];

  // Filter classes/types that might be ORM models
  const candidates = allEntities.filter(
    (e) =>
      (e.type === "class" || e.type === "type" || e.type === "function") && e.filePath && !e.metadata?.["isDbSchema"], // Skip already-detected DB entities
  );

  for (const entity of candidates) {
    const link = detectOrm(entity);
    if (link) links.push(link);
  }

  // Detect Dapper/linq2db patterns from function/method entities
  const functionEntities = allEntities.filter(
    (e) => (e.type === "function" || e.type === "method") && e.filePath && !e.metadata?.["isDbSchema"],
  );
  for (const entity of functionEntities) {
    const dapperLinks = detectDapperPatterns(entity);
    links.push(...dapperLinks);
  }

  return links;
}

// =============================================================================
// Per-entity ORM Detection
// =============================================================================

function detectOrm(entity: Entity): DbCodeLink | null {
  const decorators = (entity.metadata?.["decorators"] as Array<{ name: string; arguments?: string[] }>) || [];
  const decoratorNames = decorators.map((d) => d.name);
  const lang = (entity.metadata?.["language"] as string) || "";
  const superClass = (entity.metadata?.["superClass"] as string) || "";

  // --- Java ORMs (check BEFORE TypeORM — both use @Entity) ---

  // JPA/Hibernate: @Entity + @Table(name="users")
  if (decoratorNames.includes("Entity") && lang === "java") {
    const tableDec = decorators.find((d) => d.name === "Table");
    const tableName = extractNameFromAnnotation(tableDec) || entity.name;
    return makeLink(entity, tableName, "jpa", 0.9);
  }

  // --- TypeScript/JavaScript ORMs ---
  if (decoratorNames.includes("Entity")) {
    // MikroORM: @Entity({ tableName: "..." })
    if (decorators.some((d) => d.name === "Entity" && d.arguments?.some((a) => a.includes("tableName")))) {
      const entityDec = decorators.find((d) => d.name === "Entity");
      const tableName = extractTableNameFromObj(entityDec) || toSnakeCase(entity.name);
      return makeLink(entity, tableName, "mikroorm", 0.85);
    }

    // TypeORM: @Entity("tableName") or @Entity()
    const entityDec = decorators.find((d) => d.name === "Entity");
    const tableName = extractDecoratorStringArg(entityDec) || toSnakeCase(entity.name);
    return makeLink(entity, tableName, "typeorm", 0.9);
  }

  // Drizzle: pgTable("users", {...}) / mysqlTable(...)
  // These appear as function calls, not classes — detected in code linker instead

  // Sequelize: extends Model, Model.init({}, { tableName: "..." })
  if (superClass === "Model" || superClass.includes("Model")) {
    const language = entity.metadata?.["language"] as string;
    if (language === "typescript" || language === "javascript") {
      // Check for Sequelize patterns (not Django Model)
      const tableName = toSnakeCase(entity.name) + "s"; // Sequelize pluralizes
      return makeLink(entity, tableName, "sequelize", 0.75);
    }
  }

  // --- Python ORMs ---

  // SQLAlchemy: __tablename__ = "users"
  if (lang === "python") {
    const members = (entity.metadata?.["members"] as Array<{ name: string; value?: string }>) || [];
    const tableNameMember = members.find((m) => m.name === "__tablename__");
    if (tableNameMember?.value) {
      const tableName = tableNameMember.value.replace(/["']/g, "");
      return makeLink(entity, tableName, "sqlalchemy", 0.9);
    }

    // Django: models.Model + class Meta: db_table = "..."
    if (superClass.includes("Model") || superClass.includes("models.Model")) {
      const tableName = toSnakeCase(entity.name);
      return makeLink(entity, tableName, "django", 0.8);
    }
  }

  // --- C# ORMs ---

  // EF Core: [Table("users")] attribute or DbSet<T> property
  if (decoratorNames.includes("Table") && (lang === "csharp" || entity.filePath.endsWith(".cs"))) {
    const tableDec = decorators.find((d) => d.name === "Table");
    const tableName = extractDecoratorStringArg(tableDec) || entity.name;
    return makeLink(entity, tableName, "efcore", 0.9);
  }

  // linq2db: [Table("users")] or class extends DataConnection, or class with [Column] attributes
  if ((lang === "csharp" || entity.filePath.endsWith(".cs")) && !decoratorNames.includes("Table")) {
    // linq2db patterns: DataConnection subclass or entity with [Column] attributes
    if (superClass.includes("DataConnection")) {
      const tableName = toSnakeCase(entity.name);
      return makeLink(entity, tableName, "linq2db", 0.7);
    }
    // Classes with multiple [Column] decorators are likely linq2db or EF models
    const columnDecorators = decorators.filter((d) => d.name === "Column");
    if (columnDecorators.length >= 2) {
      const tableName = toSnakeCase(entity.name);
      return makeLink(entity, tableName, "linq2db", 0.65);
    }
  }

  // --- Go ORMs ---

  // GORM: struct tags with `gorm:"column:name"` or TableName() method
  if (lang === "go" && entity.type === "type") {
    const members = (entity.metadata?.["members"] as Array<{ name: string; tags?: string }>) || [];
    const hasGormTags = members.some((m) => m.tags?.includes("gorm:"));
    if (hasGormTags) {
      const tableName = toSnakeCase(entity.name) + "s"; // GORM pluralizes
      return makeLink(entity, tableName, "gorm", 0.8);
    }
  }

  return null;
}

// =============================================================================
// Helpers
// =============================================================================

function makeLink(entity: Entity, tableName: string, orm: string, confidence: number): DbCodeLink {
  return {
    dbEntityName: tableName,
    codeEntityName: entity.name,
    codeFilePath: entity.filePath,
    linkType: "maps_to_table",
    confidence,
    evidence: [
      `${orm} ORM model detected`,
      `decorators: ${JSON.stringify((entity.metadata?.["decorators"] as unknown[])?.map((d: unknown) => (d as { name: string }).name) || [])}`,
    ],
    orm,
  };
}

function extractDecoratorStringArg(dec?: { name: string; arguments?: string[] }): string | undefined {
  if (!dec?.arguments?.length) return undefined;
  const first = dec.arguments[0]!;
  // Extract string from "tableName" or 'tableName'
  const match = first.match(/^["']([^"']+)["']$/);
  return match ? match[1] : undefined;
}

function extractTableNameFromObj(dec?: { name: string; arguments?: string[] }): string | undefined {
  if (!dec?.arguments?.length) return undefined;
  for (const arg of dec.arguments) {
    const match = arg.match(/tableName\s*:\s*["']([^"']+)["']/);
    if (match) return match[1];
  }
  return undefined;
}

function extractNameFromAnnotation(dec?: { name: string; arguments?: string[] }): string | undefined {
  if (!dec?.arguments?.length) return undefined;
  for (const arg of dec.arguments) {
    const match = arg.match(/name\s*=\s*["']([^"']+)["']/);
    if (match) return match[1];
  }
  return undefined;
}

// =============================================================================
// Dapper / linq2db Detection (from function bodies)
// =============================================================================

/**
 * Detect Dapper and linq2db patterns in function/method bodies.
 * Dapper: connection.Query<T>("SQL"), connection.Execute("SQL")
 * linq2db: db.GetTable<T>(), db.Insert(), from t in db.GetTable<T>()
 */
function detectDapperPatterns(entity: Entity): DbCodeLink[] {
  const links: DbCodeLink[] = [];
  const body = (entity.metadata?.["body"] as string) || "";
  if (!body) return links;

  const seenTables = new Set<string>();

  // Dapper: .Query<Type>("SQL"), .Execute("SQL"), .QueryFirst<Type>("SQL")
  const dapperMatches = body.matchAll(
    /\.(?:Query|QueryFirst|QuerySingle|QueryMultiple|Execute|ExecuteScalar)\s*(?:<(\w+)>)?\s*\(\s*(?:@?"([^"]+)")/gi,
  );
  for (const m of dapperMatches) {
    const typeName = m[1]; // generic type param
    const sql = m[2] || "";
    const tables = extractTablesFromSql(sql);

    for (const table of tables) {
      if (!seenTables.has(table)) {
        seenTables.add(table);
        const isWrite = /INSERT|UPDATE|DELETE/i.test(sql);
        links.push({
          dbEntityName: table,
          codeEntityName: entity.name,
          codeFilePath: entity.filePath,
          linkType: isWrite ? "writes_table" : "reads_table",
          confidence: 0.8,
          evidence: [`Dapper ${m[0]!.slice(1, 30)} references table ${table}`],
          orm: "dapper",
        });
      }
    }

    // Also link type param as ORM model
    if (typeName && !seenTables.has(typeName)) {
      links.push({
        dbEntityName: toSnakeCase(typeName),
        codeEntityName: entity.name,
        codeFilePath: entity.filePath,
        linkType: "reads_table",
        confidence: 0.6,
        evidence: [`Dapper Query<${typeName}> — possible table mapping`],
        orm: "dapper",
      });
    }
  }

  // linq2db: db.GetTable<Type>(), db.Insert(), db.InsertOrReplace()
  const linq2dbMatches = body.matchAll(/\.(?:GetTable|Insert|InsertOrReplace|Update|Delete|BulkCopy)\s*<(\w+)>/gi);
  for (const m of linq2dbMatches) {
    const typeName = m[1]!;
    if (!seenTables.has(typeName)) {
      seenTables.add(typeName);
      const method = m[0]!.slice(1).split("<")[0]!.toLowerCase();
      const isWrite = method !== "gettable";
      links.push({
        dbEntityName: toSnakeCase(typeName),
        codeEntityName: entity.name,
        codeFilePath: entity.filePath,
        linkType: isWrite ? "writes_table" : "reads_table",
        confidence: 0.8,
        evidence: [`linq2db ${m[0]!.slice(1)} references type ${typeName}`],
        orm: "linq2db",
      });
    }
  }

  // linq2db LINQ syntax: from t in db.GetTable<Type>() select t
  const linq2dbQueryMatches = body.matchAll(/from\s+\w+\s+in\s+\w+\.GetTable\s*<(\w+)>/gi);
  for (const m of linq2dbQueryMatches) {
    const typeName = m[1]!;
    if (!seenTables.has(typeName)) {
      seenTables.add(typeName);
      links.push({
        dbEntityName: toSnakeCase(typeName),
        codeEntityName: entity.name,
        codeFilePath: entity.filePath,
        linkType: "reads_table",
        confidence: 0.85,
        evidence: [`linq2db query over ${typeName}`],
        orm: "linq2db",
      });
    }
  }

  return links;
}

function extractTablesFromSql(sql: string): string[] {
  const tables: string[] = [];
  const matches = sql.matchAll(/(?:FROM|JOIN|INTO|UPDATE)\s+["'`[]?(\w+)["'`\]]?/gi);
  for (const m of matches) {
    const name = m[1]!;
    if (
      !["SELECT", "WHERE", "ON", "AND", "OR", "AS", "SET", "VALUES", "INSERT", "DELETE"].includes(name.toUpperCase())
    ) {
      tables.push(name.toLowerCase());
    }
  }
  return tables;
}

function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

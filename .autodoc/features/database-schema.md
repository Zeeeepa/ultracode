# Database Schema Analysis

**Language**: [EN] | [RU](./database-schema_ru.md)

---

Comprehensive database schema reconstruction from SQL files, Prisma schemas, LINQ queries, ORM models, and Redis key patterns. Includes migration analysis and schema drift detection.

---

## How It Works

When your project contains database-related files, UltraCode automatically:

1. **Parses schema definitions** — SQL (CREATE TABLE/VIEW/INDEX/PROCEDURE/FUNCTION/TRIGGER), Prisma models, LINQ files
2. **Detects ORM models** — identifies entity definitions in 10 ORM frameworks and maps them to database tables
3. **Detects Redis patterns** — extracts key patterns from ioredis/redis client usage
4. **Analyzes migrations** — classifies migration files from 11 frameworks, replays them to build effective schema
5. **Detects schema drift** — compares ORM models vs migration-derived schema with fuzzy type matching
6. **Links DB entities to code** — repository/DAO matching, SQL strings in source code, migration file linking

### Supported File Types

| File Type | Parser | Description |
|-----------|--------|-------------|
| `.sql` | SqlParser | CREATE/ALTER/DROP statements with dialect detection |
| `.prisma` | PrismaParser | Prisma schema models, enums, datasources, generators |
| `.linq` | LinqParser | LINQPad files with XML headers and C# LINQ/Dapper/raw SQL |

### SQL Dialect Detection

| Dialect | Detection Signals |
|---------|-------------------|
| **PostgreSQL** | `SERIAL`, `TEXT`, `JSONB`, `BYTEA`, `UUID`, `CREATE EXTENSION` |
| **MySQL** | `AUTO_INCREMENT`, `ENGINE=`, `UNSIGNED`, `TINYINT`, `MEDIUMINT` |
| **ClickHouse** | `ENGINE = MergeTree`, `ORDER BY`, `PARTITION BY`, `Array()`, `Nullable()` |
| **SQLite** | `AUTOINCREMENT`, `INTEGER PRIMARY KEY`, `PRAGMA`, `WITHOUT ROWID` |
| **MS SQL** | `IDENTITY`, `NVARCHAR`, `UNIQUEIDENTIFIER`, `GO`, `EXEC` |

### ORM Detection (10 Frameworks)

| ORM | Language | Detection Signals |
|-----|----------|-------------------|
| **TypeORM** | TypeScript | `@Entity()`, `@Column()`, `@PrimaryGeneratedColumn()` |
| **Sequelize** | TypeScript/JS | `Model.init()`, `sequelize.define()`, `DataTypes.` |
| **MikroORM** | TypeScript | `@Entity()`, `@Property()`, `@ManyToOne()` |
| **SQLAlchemy** | Python | `Column()`, `relationship()`, `Base = declarative_base()` |
| **Django** | Python | `models.Model`, `models.CharField`, `models.ForeignKey` |
| **JPA/Hibernate** | Java/Kotlin | `@Entity`, `@Table`, `@Column`, `@Id` |
| **EF Core** | C# | `DbContext`, `DbSet<>`, `modelBuilder.Entity<>()` |
| **GORM** | Go | `gorm.Model`, `` `gorm:"column:..."` `` |
| **Dapper** | C# | `connection.Query<>`, `connection.Execute()` |
| **linq2db** | C# | `[Table]`, `[Column]`, `ITable<>` |

### Migration Detection (11 Frameworks)

| Framework | Detection Pattern |
|-----------|-------------------|
| **Flyway** | `V{version}__{description}.sql` |
| **EF Core** | `*_Migration.cs`, `*_InitialCreate.cs` |
| **Prisma** | `prisma/migrations/*/migration.sql` |
| **Django** | `{app}/migrations/{number}_*.py` |
| **Alembic** | `alembic/versions/*.py` |
| **TypeORM** | `migrations/*-*.ts` with TypeORM imports |
| **Sequelize** | `migrations/*-*.js` with `queryInterface` |
| **Knex** | `migrations/*_*.js` with `exports.up` |
| **Goose** | `*.sql` with `-- +goose Up/Down` |
| **dbmate** | `*.sql` with `-- migrate:up/down` |
| **Raw SQL** | Timestamped `.sql` files in migration-like paths |

---

## get_database_schema

Show database schema reconstructed from code analysis.

### Parameters

| Parameter | Type | Required | Description |
|----------|------|----------|-------------|
| `projectPath` | string | no | Project directory path |
| `tableName` | string | no | Filter by table name (partial match) |
| `dbEngine` | string | no | Filter: `postgres`, `mysql`, `clickhouse`, `redis`, `sqlite`, `mssql` |
| `includeRelationships` | boolean | no | Include FK and code relationships |

### Returns

```typescript
{
  success: true;
  summary: {
    tables: number;
    views: number;
    procedures: number;
    triggers: number;
    indexes: number;
    enums: number;
    redisKeys: number;
    linqQueries: number;
    migrations: number;
  };
  tables: Array<{
    name: string;
    schema?: string;
    engine: string;         // postgres, mysql, etc.
    file: string;
    columns: Array<{ name: string; type: string; nullable?: boolean; default?: string; }>;
    indexes: Array<{ name: string; columns: string[]; unique?: boolean; }>;
    foreignKeys: Array<{ column: string; references: string; }>;
  }>;
  views: Array<{ name: string; file: string; sourceTables: string[]; isMaterialized: boolean; }>;
  procedures: Array<{ name: string; type: string; file: string; parameters: any[]; }>;
  // ... triggers, indexes, enums, redisKeys, linqQueries
  migrations?: Array<{ file: string; framework: string; label: string; order: number; }>;
  schemaDrift?: {
    driftScore: number;
    summary: string;
    missingMigrations: string[];
    orphanedTables: string[];
    columnDrifts: Array<{ table: string; column: string; issue: string; }>;
  };
  relationships?: Array<{ from: string; to: string; type: string; }>;
}
```

### Examples

**Full database schema:**
```
get_database_schema()
```

**Filter by table name:**
```
get_database_schema({
  tableName: "users"
})
```

**PostgreSQL tables only:**
```
get_database_schema({
  dbEngine: "postgres",
  includeRelationships: true
})
```

**Redis key patterns:**
```
get_database_schema({
  dbEngine: "redis"
})
```

---

## Schema Drift Detection

When both ORM models and migration files are present, UltraCode automatically compares them to detect drift:

| Drift Type | Description |
|-----------|-------------|
| **Missing migration** | ORM model has a table/column not covered by any migration |
| **Orphaned table** | Migration creates a table with no corresponding ORM model |
| **Column drift** | Type mismatch between ORM annotation and migration DDL |
| **Nullable mismatch** | ORM says required but migration says NULL (or vice versa) |

Drift score ranges from 0 (perfect sync) to 1 (critical divergence).

Fuzzy type matching handles equivalences like `VARCHAR(255)` ≈ `string`, `INT` ≈ `number`, `JSONB` ≈ `Record<string, unknown>`.

---

## Enhancements to Existing Tools

### trace_flow / trace_backwards — DB Boundary Annotations

Trace steps that cross database boundaries are annotated:

```typescript
{
  crossesDbBoundary: true,
  dbInfo: {
    type: "sql" | "orm" | "redis",
    operation: "read" | "write",
    tableName?: string
  }
}
```

---

## Zero Overhead for Non-DB Projects

All database-related processing is lazy-loaded and gated behind checks for DB-related file extensions. Projects without `.sql`, `.prisma`, `.linq` files or ORM decorators have **zero performance overhead**.

# Db

Database schema parsing, ORM detection, and code-to-database entity linking framework.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `DbCodeLink` | interface | Type representing code-to-database entity mapping | [→ types.ts:36-45] |
| `DbColumn` | interface | Type representing a database column with metadata | [→ types.ts:10-19] |
| `DbEngine` | type | Type for database engine identifier (postgres, mysql, etc.) | [→ types.ts:63] |
| `DbForeignKey` | interface | Type representing a foreign key constraint | [→ types.ts:28-34] |
| `DbIndex` | interface | Type representing a database index definition | [→ types.ts:21-26] |
| `DbRelationship` | interface | Type representing relationships between database entities | [→ types.ts:54-61] |
| `DbSchemaAnalysis` | interface | Type for comprehensive database schema analysis results | [→ types.ts:47-52] |
| `detectOrmSchemas` | function | Identifies ORM models from indexed code entities | [→ orm-detector.ts:23-47] |
| `detectRedisPatterns` | function | Extracts Redis key patterns from code usage | [→ redis-detector.ts:18-38] |
| `LinqParser` | class | Parser class for extracting LINQ queries from .linq files | [→ linq-parser.ts:15-92] |
| `PrismaParser` | class | Parser class for Prisma schema file analysis | [→ prisma-parser.ts:16-116] |
| `SqlParser` | class | Parser class for SQL files with dialect detection | [→ sql-parser.ts:18-108] |

## Files

- **index.ts** — Public API exports for parsers and schema analysis utilities
- **linq-parser.ts** — Extracts LINQ queries and metadata from LINQPad files
- **orm-detector.ts** — Identifies ORM models and maps them to database tables
- **prisma-parser.ts** — Parses Prisma schema files into database entities
- **redis-detector.ts** — Detects Redis key patterns and data structure usage
- **sql-parser.ts** — Parses SQL files with dialect detection and schema extraction
- **types.ts** — Type definitions for database entities and code relationships

# Db

## Overview

The Db module analyzes database schemas and links them to code entities, enabling detection of ORM patterns, Redis usage, and data access relationships throughout the codebase. It provides parsers for multiple schema definition formats (SQL, Prisma, LINQ) and pattern detectors to extract database usage from code. By connecting schema metadata to code entities, the module enables impact analysis of database changes and discovery of how applications interact with persistent data stores.

## Flow

```
Schema Files (SQL, Prisma, LINQ)
        ↓
    [Parsers]
    /   |   \
   ↓    ↓    ↓
 SqlParser  PrismaParser  LinqParser
        ↓
  [Schema Extraction]
  Tables, Columns, Constraints
        ↓
  [Pattern Detectors]
  /           \
 ↓             ↓
ORM Models    Redis Patterns
        ↓
[DbSchemaAnalysis]
        ↓
Code Entity → Database Entity Links
(reads_table, writes_table, maps_to_table)
```

## Entity Listing

### Type Definitions

| Entity | Description | Location |
|--------|-------------|----------|
| `DbEngine` | Identifier for supported database engines (postgres, mysql, sqlite, etc.). | types.ts:63 |
| `DbColumn` | Database column definition including name, type, constraints, and default values. | types.ts:10-19 |
| `DbIndex` | Index definition with indexed column names, uniqueness flag, and index type. | types.ts:21-26 |
| `DbForeignKey` | Foreign key constraint linking one or more columns to a referenced table. | types.ts:28-34 |
| `DbCodeLink` | Mapping between a code entity and a database entity with link type and context. | types.ts:36-45 |
| `DbSchemaAnalysis` | Complete database schema analysis result containing tables, indexes, foreign keys, relationships, and code links. | types.ts:47-52 |
| `DbRelationship` | Relationship between database entities defining cardinality and join conditions. | types.ts:54-61 |

### Parsers

| Entity | Description | Location |
|--------|-------------|----------|
| `SqlParser` | Parses SQL files with dialect detection (PostgreSQL, MySQL, SQLite) to extract table definitions, columns, indexes, and constraints. | sql-parser.ts:18-108 |
| `PrismaParser` | Parses Prisma schema files (.prisma) into structured database entity definitions with models and relationships. | prisma-parser.ts:16-116 |
| `LinqParser` | Extracts LINQ queries and metadata from .linq files for analyzing LINQ-based data access patterns. | linq-parser.ts:15-92 |

### Pattern Detectors

| Entity | Description | Location |
|--------|-------------|----------|
| `detectOrmSchemas` | Identifies ORM model classes from indexed code entities and maps them to database tables via naming and field matching. | orm-detector.ts:23-47 |
| `detectRedisPatterns` | Extracts Redis key patterns and data structure operations (sets, hashes, sorted sets) from code usage. | redis-detector.ts:18-38 |

## Dependencies

**Internal:**
- `Entity` type from `../../types/storage.js` — indexed code entities representing classes, functions, and methods
- `RelationType` from `../../types/storage.js` — enumeration of relationship types (reads_table, writes_table, maps_to_table) connecting code to database

## Design Patterns

- **Parser Pattern**: SqlParser, PrismaParser, and LinqParser follow a consistent interface for extracting structured data from different schema definition formats.
- **Detector Pattern**: ORM and Redis detectors use heuristics (naming conventions, field types, metadata analysis) to infer database usage without explicit markers.
- **Linker Pattern**: Creates relationship edges between code entities and database entities for impact analysis, following the pattern established by swagger-code-linker and protobuf-code-linker.
# Анализ схемы базы данных

**Language**: [EN](./database-schema.md) | [RU]

---

Комплексная реконструкция схемы БД из SQL-файлов, Prisma-схем, LINQ-запросов, ORM-моделей и паттернов Redis-ключей. Включает анализ миграций и обнаружение дрифта схемы.

---

## Как это работает

Когда в проекте есть файлы, связанные с базами данных, UltraCode автоматически:

1. **Парсит определения схемы** — SQL (CREATE TABLE/VIEW/INDEX/PROCEDURE/FUNCTION/TRIGGER), Prisma-модели, LINQ-файлы
2. **Обнаруживает ORM-модели** — идентифицирует определения сущностей в 10 ORM-фреймворках и сопоставляет их с таблицами БД
3. **Обнаруживает паттерны Redis** — извлекает паттерны ключей из использования ioredis/redis
4. **Анализирует миграции** — классифицирует файлы миграций 11 фреймворков, воспроизводит их для построения эффективной схемы
5. **Обнаруживает дрифт схемы** — сравнивает ORM-модели со схемой из миграций с нечётким сопоставлением типов
6. **Связывает DB-сущности с кодом** — сопоставление repository/DAO, SQL-строки в исходном коде, привязка файлов миграций

### Поддерживаемые типы файлов

| Тип файла | Парсер | Описание |
|-----------|--------|----------|
| `.sql` | SqlParser | CREATE/ALTER/DROP с определением диалекта |
| `.prisma` | PrismaParser | Prisma-модели, enums, datasources, generators |
| `.linq` | LinqParser | LINQPad-файлы с XML-заголовками и C# LINQ/Dapper/raw SQL |

### Определение диалекта SQL

| Диалект | Сигналы определения |
|---------|---------------------|
| **PostgreSQL** | `SERIAL`, `TEXT`, `JSONB`, `BYTEA`, `UUID`, `CREATE EXTENSION` |
| **MySQL** | `AUTO_INCREMENT`, `ENGINE=`, `UNSIGNED`, `TINYINT`, `MEDIUMINT` |
| **ClickHouse** | `ENGINE = MergeTree`, `ORDER BY`, `PARTITION BY`, `Array()`, `Nullable()` |
| **SQLite** | `AUTOINCREMENT`, `INTEGER PRIMARY KEY`, `PRAGMA`, `WITHOUT ROWID` |
| **MS SQL** | `IDENTITY`, `NVARCHAR`, `UNIQUEIDENTIFIER`, `GO`, `EXEC` |

### Определение ORM (10 фреймворков)

| ORM | Язык | Сигналы определения |
|-----|------|---------------------|
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

### Определение миграций (11 фреймворков)

| Фреймворк | Паттерн определения |
|-----------|---------------------|
| **Flyway** | `V{version}__{description}.sql` |
| **EF Core** | `*_Migration.cs`, `*_InitialCreate.cs` |
| **Prisma** | `prisma/migrations/*/migration.sql` |
| **Django** | `{app}/migrations/{number}_*.py` |
| **Alembic** | `alembic/versions/*.py` |
| **TypeORM** | `migrations/*-*.ts` с импортами TypeORM |
| **Sequelize** | `migrations/*-*.js` с `queryInterface` |
| **Knex** | `migrations/*_*.js` с `exports.up` |
| **Goose** | `*.sql` с `-- +goose Up/Down` |
| **dbmate** | `*.sql` с `-- migrate:up/down` |
| **Raw SQL** | `.sql` файлы с таймстемпами в migration-подобных путях |

---

## get_database_schema

Показывает схему БД, восстановленную из анализа кода.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `projectPath` | string | нет | Путь к директории проекта |
| `tableName` | string | нет | Фильтр по имени таблицы (частичное совпадение) |
| `dbEngine` | string | нет | Фильтр: `postgres`, `mysql`, `clickhouse`, `redis`, `sqlite`, `mssql` |
| `includeRelationships` | boolean | нет | Включить FK и связи с кодом |

### Возвращает

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
    engine: string;         // postgres, mysql и т.д.
    file: string;
    columns: Array<{ name: string; type: string; nullable?: boolean; default?: string; }>;
    indexes: Array<{ name: string; columns: string[]; unique?: boolean; }>;
    foreignKeys: Array<{ column: string; references: string; }>;
  }>;
  // views, procedures, triggers, indexes, enums, redisKeys, linqQueries
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

### Примеры

**Полная схема БД:**
```
get_database_schema()
```

**Фильтр по имени таблицы:**
```
get_database_schema({
  tableName: "users"
})
```

**Только PostgreSQL таблицы:**
```
get_database_schema({
  dbEngine: "postgres",
  includeRelationships: true
})
```

**Паттерны ключей Redis:**
```
get_database_schema({
  dbEngine: "redis"
})
```

---

## Обнаружение дрифта схемы

Когда в проекте есть и ORM-модели, и файлы миграций, UltraCode автоматически сравнивает их для обнаружения дрифта:

| Тип дрифта | Описание |
|-----------|----------|
| **Отсутствующая миграция** | ORM-модель содержит таблицу/столбец, не покрытые ни одной миграцией |
| **Осиротевшая таблица** | Миграция создаёт таблицу без соответствующей ORM-модели |
| **Дрифт столбца** | Несоответствие типа между ORM-аннотацией и DDL миграции |
| **Несоответствие nullable** | ORM говорит required, но миграция говорит NULL (или наоборот) |

Оценка дрифта варьируется от 0 (полная синхронизация) до 1 (критическое расхождение).

Нечёткое сопоставление типов обрабатывает эквивалентности: `VARCHAR(255)` ≈ `string`, `INT` ≈ `number`, `JSONB` ≈ `Record<string, unknown>`.

---

## Обогащение существующих инструментов

### trace_flow / trace_backwards — Аннотации границ БД

Шаги трассировки, пересекающие границы баз данных, аннотируются:

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

## Нулевой overhead для проектов без БД

Вся обработка БД lazy-loaded и защищена проверками наличия DB-расширений файлов. Проекты без `.sql`, `.prisma`, `.linq` или ORM-декораторов имеют **нулевой overhead по производительности**.

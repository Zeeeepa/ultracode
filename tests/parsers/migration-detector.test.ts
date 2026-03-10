/**
 * Migration Detector Tests
 */

import { describe, expect, it } from "bun:test";
import {
  detectMigration,
  extractMigrationOperations,
  isMigrationFile,
} from "../../src/parsers/db/migration-detector.js";

describe("Migration Detector", () => {
  // ─── Framework Detection ───────────────────────────────────────────

  it("should detect Flyway migration (V1__name.sql)", () => {
    const info = detectMigration("db/migrations/V1__create_users.sql");
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("flyway");
    expect(info!.order).toBe(1);
    expect(info!.label).toContain("V1");
  });

  it("should detect Flyway versioned migration (V2.1__name.sql)", () => {
    const info = detectMigration("db/migrations/V2.1__add_email.sql");
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("flyway");
    expect(info!.order).toBe(2.1);
  });

  it("should detect Prisma migration", () => {
    const info = detectMigration("prisma/migrations/20230515120000_create_users/migration.sql");
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("prisma");
    expect(info!.order).toBe(20230515120000);
  });

  it("should detect EF Core migration (.cs)", () => {
    const content = `
      public partial class CreateUsers : Migration {
        protected override void Up(MigrationBuilder migrationBuilder) {
          migrationBuilder.CreateTable(name: "users", columns: ...);
        }
      }
    `;
    const info = detectMigration("Migrations/20230515120000_CreateUsers.cs", content);
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("efcore");
    expect(info!.direction).toBe("both");
  });

  it("should skip EF Core Designer files", () => {
    const info = detectMigration("Migrations/20230515120000_CreateUsers.Designer.cs");
    expect(info).toBeNull();
  });

  it("should detect Alembic migration", () => {
    const content = `
revision = 'abc123def456'
down_revision = 'prev_revision'

def upgrade():
    op.create_table('users', ...)
    `;
    const info = detectMigration("alembic/versions/abc123def456_create_users.py", content);
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("alembic");
    expect(info!.direction).toBe("both");
  });

  it("should detect Django migration", () => {
    const content = `
class Migration(migrations.Migration):
    dependencies = [('app', '0001_initial')]
    operations = [
        migrations.CreateModel(name='User', fields=[...])
    ]
    `;
    const info = detectMigration("app/migrations/0002_add_email.py", content);
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("django");
    expect(info!.order).toBe(2);
  });

  it("should detect TypeORM migration (timestamp)", () => {
    const info = detectMigration("src/migrations/1684152000000-CreateUsers.ts");
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("typeorm");
    expect(info!.order).toBe(1684152000000);
  });

  it("should detect Sequelize migration", () => {
    const info = detectMigration("migrations/20230515120000-create-users.js");
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("sequelize");
  });

  it("should detect Knex migration", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id');
  });
};
    `;
    const info = detectMigration("migrations/20230515120000_create_users.js", content);
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("knex");
  });

  it("should detect goose migration", () => {
    const content = `
-- +goose Up
CREATE TABLE users (id INT PRIMARY KEY);

-- +goose Down
DROP TABLE users;
    `;
    const info = detectMigration("db/migrations/001_create_users.sql", content);
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("goose");
  });

  it("should detect dbmate migration", () => {
    const content = `
-- migrate:up
CREATE TABLE users (id INT PRIMARY KEY);

-- migrate:down
DROP TABLE users;
    `;
    const info = detectMigration("db/migrations/20230515120000_create_users.sql", content);
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("dbmate");
  });

  it("should detect generic SQL migration in migrations dir", () => {
    const info = detectMigration("db/migrations/001_create_users.sql");
    expect(info).not.toBeNull();
    expect(info!.framework).toBe("raw");
    expect(info!.order).toBe(1);
  });

  it("should NOT detect regular SQL file as migration", () => {
    const info = detectMigration("src/schema.sql");
    expect(info).toBeNull();
  });

  it("should NOT detect regular .ts file as migration", () => {
    const info = detectMigration("src/user.service.ts");
    expect(info).toBeNull();
  });

  // ─── isMigrationFile shortcut ──────────────────────────────────────

  it("should return true/false from isMigrationFile", () => {
    expect(isMigrationFile("migrations/V1__init.sql")).toBe(true);
    expect(isMigrationFile("src/models/user.ts")).toBe(false);
  });

  // ─── Operation Extraction ──────────────────────────────────────────

  it("should extract CREATE TABLE operations", () => {
    const ops = extractMigrationOperations("CREATE TABLE users (id INT); CREATE TABLE posts (id INT);");
    expect(ops.filter((o) => o.type === "create_table").length).toBe(2);
    expect(ops[0]!.tableName).toBe("users");
  });

  it("should extract DROP TABLE operations", () => {
    const ops = extractMigrationOperations("DROP TABLE IF EXISTS users;");
    expect(ops.length).toBeGreaterThanOrEqual(1);
    expect(ops[0]!.type).toBe("drop_table");
    expect(ops[0]!.tableName).toBe("users");
  });

  it("should extract ALTER TABLE ADD COLUMN", () => {
    const ops = extractMigrationOperations("ALTER TABLE users ADD COLUMN email VARCHAR(255);");
    const addCol = ops.find((o) => o.type === "add_column");
    expect(addCol).toBeDefined();
    expect(addCol!.tableName).toBe("users");
    expect(addCol!.details?.["column"]).toBe("email");
  });

  it("should extract EF Core migrationBuilder operations", () => {
    const content = `
      migrationBuilder.CreateTable(name: "users", columns: table => new { ... });
      migrationBuilder.AddColumn<string>(name: "email", table: "users");
      migrationBuilder.DropTable(name: "old_table");
    `;
    const ops = extractMigrationOperations(content);
    expect(ops.filter((o) => o.type === "create_table").length).toBe(1);
    expect(ops.filter((o) => o.type === "add_column").length).toBe(1);
    expect(ops.filter((o) => o.type === "drop_table").length).toBe(1);
  });

  it("should extract Django migration operations", () => {
    const content = `
      migrations.CreateModel(name='User', fields=[('id', models.AutoField())])
      migrations.AddField(model_name='User', name='email', field=models.EmailField())
      migrations.DeleteModel(name='Post')
    `;
    const ops = extractMigrationOperations(content);
    expect(ops.filter((o) => o.type === "create_table").length).toBe(1);
    expect(ops.filter((o) => o.type === "add_column").length).toBe(1);
    expect(ops.filter((o) => o.type === "drop_table").length).toBe(1);
  });

  it("should extract Knex schema operations", () => {
    const content = `
      knex.schema.createTable('users', (table) => { table.increments('id'); });
      knex.schema.dropTable('old_table');
      knex.schema.alterTable('users', (table) => { table.string('email'); });
    `;
    const ops = extractMigrationOperations(content);
    expect(ops.filter((o) => o.type === "create_table").length).toBe(1);
    expect(ops.filter((o) => o.type === "drop_table").length).toBe(1);
    expect(ops.filter((o) => o.type === "alter_table").length).toBe(1);
  });
});

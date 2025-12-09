/**
 * Analyze entity sizes after expansion
 * Parses TypeScript files and applies entity expander to see the effect
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, relative } from "path";
import ts from "typescript";
import { expandLargeEntities, estimateEntityTokens, getExpansionStats } from "../src/semantic/entity-expander.js";
import type { ParsedEntity } from "../src/types/parser.js";

// Simple TypeScript parser that extracts entities with children
function parseTypeScript(code: string, filePath: string): ParsedEntity[] {
  const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
  const entities: ParsedEntity[] = [];

  function getLocation(node: ts.Node) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      start: { line: start.line + 1, column: start.character, index: node.getStart() },
      end: { line: end.line + 1, column: end.character, index: node.getEnd() },
    };
  }

  function visit(node: ts.Node) {
    // Classes
    if (ts.isClassDeclaration(node) && node.name) {
      const children: ParsedEntity[] = [];

      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          children.push({
            name: member.name.getText(sourceFile),
            type: "method",
            filePath,
            location: getLocation(member),
          });
        } else if (ts.isConstructorDeclaration(member)) {
          children.push({
            name: "constructor",
            type: "method",
            filePath,
            location: getLocation(member),
          });
        } else if (ts.isPropertyDeclaration(member) && member.name) {
          children.push({
            name: member.name.getText(sourceFile),
            type: "property",
            filePath,
            location: getLocation(member),
          });
        }
      }

      entities.push({
        id: `class:${node.name.text}`,
        name: node.name.text,
        type: "class",
        filePath,
        location: getLocation(node),
        children: children.length > 0 ? children : undefined,
      });
    }

    // Interfaces
    if (ts.isInterfaceDeclaration(node) && node.name) {
      const children: ParsedEntity[] = [];

      for (const member of node.members) {
        if (ts.isMethodSignature(member) && member.name) {
          children.push({
            name: member.name.getText(sourceFile),
            type: "method",
            filePath,
            location: getLocation(member),
          });
        } else if (ts.isPropertySignature(member) && member.name) {
          children.push({
            name: member.name.getText(sourceFile),
            type: "property",
            filePath,
            location: getLocation(member),
          });
        }
      }

      entities.push({
        id: `interface:${node.name.text}`,
        name: node.name.text,
        type: "interface",
        filePath,
        location: getLocation(node),
        children: children.length > 0 ? children : undefined,
      });
    }

    // Functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      entities.push({
        id: `function:${node.name.text}`,
        name: node.name.text,
        type: "function",
        filePath,
        location: getLocation(node),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return entities;
}

function walkDir(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  const skipDirs = ["node_modules", "dist", ".git", "models", "external-tools"];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || skipDirs.includes(entry)) continue;

      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...walkDir(fullPath, extensions));
        } else if (extensions.includes(extname(entry)) && !entry.endsWith(".d.ts")) {
          files.push(fullPath);
        }
      } catch {}
    }
  } catch {}

  return files;
}

async function main() {
  const rootDir = process.cwd();
  const srcDir = join(rootDir, "src");

  console.log("=== Анализ размеров сущностей после Entity Expansion ===\n");
  console.log(`Директория: ${srcDir}\n`);

  const files = walkDir(srcDir, [".ts"]);
  console.log(`Найдено файлов: ${files.length}\n`);

  const allEntities: ParsedEntity[] = [];

  for (const file of files) {
    try {
      const code = readFileSync(file, "utf-8");
      const entities = parseTypeScript(code, relative(rootDir, file));
      allEntities.push(...entities);
    } catch (e) {
      // Skip files that fail to parse
    }
  }

  console.log(`Всего сущностей (до expansion): ${allEntities.length}\n`);

  // Test with different maxTokens
  for (const maxTokens of [512, 8192]) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`=== maxTokens: ${maxTokens} ===`);
    console.log(`${"=".repeat(60)}\n`);

    const stats = getExpansionStats(allEntities, { maxTokens });
    console.log("Статистика ДО expansion:");
    console.log(`  Всего сущностей: ${stats.total}`);
    console.log(`  Нуждаются в expansion: ${stats.needsExpansion}`);
    console.log(`  Children для expansion: ${stats.childrenCount}`);
    if (stats.largestEntity) {
      console.log(`  Самая большая: ${stats.largestEntity.name} (${stats.largestEntity.tokens} токенов)`);
    }

    const expanded = expandLargeEntities(allEntities, { maxTokens });

    console.log(`\nСтатистика ПОСЛЕ expansion:`);
    console.log(`  Всего сущностей: ${expanded.length}`);
    console.log(`  Изменение: ${allEntities.length} → ${expanded.length} (+${expanded.length - allEntities.length})`);

    // Count by size ranges
    const ranges = [
      { min: 0, max: 100, label: "0-100" },
      { min: 100, max: 256, label: "100-256" },
      { min: 256, max: 512, label: "256-512" },
      { min: 512, max: 1024, label: "512-1K" },
      { min: 1024, max: 2048, label: "1K-2K" },
      { min: 2048, max: 4096, label: "2K-4K" },
      { min: 4096, max: 8192, label: "4K-8K" },
      { min: 8192, max: Infinity, label: "8K+" },
    ];

    console.log("\nРаспределение по токенам (после expansion):");
    for (const { min, max, label } of ranges) {
      const count = expanded.filter(e => {
        const tokens = estimateEntityTokens(e);
        return tokens >= min && tokens < max;
      }).length;
      const pct = ((count / expanded.length) * 100).toFixed(1);
      const bar = "█".repeat(Math.ceil(count / expanded.length * 40));
      console.log(`  ${label.padEnd(10)} ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar}`);
    }

    // Count entities still over limit
    const overLimit = expanded.filter(e => estimateEntityTokens(e) > maxTokens);
    const over8K = expanded.filter(e => estimateEntityTokens(e) > 8192);

    console.log(`\nСущности превышающие лимит:`);
    console.log(`  > ${maxTokens} токенов: ${overLimit.length} (${((overLimit.length / expanded.length) * 100).toFixed(1)}%)`);
    console.log(`  > 8192 токенов: ${over8K.length} (${((over8K.length / expanded.length) * 100).toFixed(1)}%)`);

    if (overLimit.length > 0 && overLimit.length <= 10) {
      console.log("\nСущности превышающие лимит:");
      for (const e of overLimit.slice(0, 10)) {
        const tokens = estimateEntityTokens(e);
        console.log(`  ${e.type.padEnd(10)} ${e.name.padEnd(40)} ${tokens} токенов`);
      }
    }

    // Sample of expanded entities
    if (maxTokens === 512) {
      console.log("\nПример expanded сущностей (первые 15):");
      const sample = expanded.filter(e => e.name.includes(".") || e.name.includes("(header)")).slice(0, 15);
      for (const e of sample) {
        const tokens = estimateEntityTokens(e);
        const status = tokens <= maxTokens ? "✅" : "⚠️";
        console.log(`  ${status} ${e.type.padEnd(10)} ${e.name.padEnd(45)} ${tokens} токенов`);
      }
    }
  }

  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log("=== ИТОГ ===");
  console.log("=".repeat(60));

  const expanded512 = expandLargeEntities(allEntities, { maxTokens: 512 });
  const expanded8K = expandLargeEntities(allEntities, { maxTokens: 8192 });

  const over512after = expanded512.filter(e => estimateEntityTokens(e) > 512).length;
  const over8Kafter = expanded8K.filter(e => estimateEntityTokens(e) > 8192).length;

  console.log(`\nС maxTokens=512:`);
  console.log(`  До expansion: ${allEntities.length} сущностей`);
  console.log(`  После expansion: ${expanded512.length} сущностей`);
  console.log(`  Всё ещё > 512: ${over512after} сущностей (это методы > 512 токенов)`);

  console.log(`\nС maxTokens=8192:`);
  console.log(`  До expansion: ${allEntities.length} сущностей`);
  console.log(`  После expansion: ${expanded8K.length} сущностей`);
  console.log(`  Всё ещё > 8K: ${over8Kafter} сущностей`);

  // Check if chunking would help for remaining large entities
  if (over512after > 0) {
    console.log(`\n⚠️  ${over512after} методов всё ещё > 512 токенов.`);
    console.log(`   Для них нужен дополнительный chunking (smart-chunker.ts)`);
  }
}

main().catch(console.error);

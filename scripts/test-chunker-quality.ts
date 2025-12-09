/**
 * Test smart chunker quality - check for semantic loss
 */

import { readFileSync } from "fs";
import { chunkCode, estimateTokens, getChunkSettings } from "../src/semantic/smart-chunker.js";

async function main() {
  console.log("=== Проверка качества Smart Chunker ===\n");

  // Read a real complex function
  const indexTs = readFileSync("src/index.ts", "utf-8");
  const lines = indexTs.split("\n");

  // Extract executeToolCall
  const startLine = lines.findIndex(l => l.includes("async function executeToolCall"));
  let braceCount = 0, foundStart = false, endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i] ?? "";
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;
    if (braceCount > 0) foundStart = true;
    if (foundStart && braceCount === 0) { endLine = i; break; }
  }
  const functionCode = lines.slice(startLine, endLine + 1).join("\n");

  const settings = getChunkSettings(512);
  const header = "executeToolCall - MCP tool dispatcher";
  const chunks = chunkCode("executeToolCall", functionCode, header, settings);

  console.log(`Функция: executeToolCall`);
  console.log(`Токенов: ${estimateTokens(functionCode)}`);
  console.log(`Чанков: ${chunks.length}`);
  console.log(`Overlap: ${settings.overlapTokens} токенов\n`);

  // 1. Check header preservation
  console.log("=== 1. Сохранение header в каждом чанке ===");
  const allHaveHeader = chunks.every(c => c.content.includes(header));
  console.log(`Все чанки имеют header: ${allHaveHeader ? "✅ Да" : "❌ Нет"}`);

  // 2. Check overlap between consecutive chunks
  console.log("\n=== 2. Проверка overlap между чанками ===");
  let overlapIssues = 0;
  for (let i = 1; i < Math.min(5, chunks.length); i++) {
    const prev = chunks[i - 1]!;
    const curr = chunks[i]!;

    // Check if there's line overlap
    const hasOverlap = curr.startLine <= prev.endLine;
    const overlapLines = hasOverlap ? prev.endLine - curr.startLine + 1 : 0;

    console.log(`  Чанк ${i-1} → ${i}: строки ${prev.startLine}-${prev.endLine} → ${curr.startLine}-${curr.endLine}`);
    console.log(`    Overlap: ${overlapLines} строк ${hasOverlap ? "✅" : "⚠️ нет overlap"}`);

    if (!hasOverlap) overlapIssues++;
  }

  // 3. Check chunk boundaries - are they at logical points?
  console.log("\n=== 3. Проверка границ чанков (логические точки) ===");
  const codeLines = functionCode.split("\n");

  for (let i = 0; i < Math.min(5, chunks.length); i++) {
    const chunk = chunks[i]!;
    const endLineContent = codeLines[chunk.endLine]?.trim() ?? "";
    const startLineContent = codeLines[chunk.startLine]?.trim() ?? "";

    // Good boundaries: empty lines, closing braces, comments
    const goodEnd = endLineContent === "" ||
                    endLineContent === "}" ||
                    endLineContent.startsWith("//") ||
                    endLineContent.endsWith(";") ||
                    endLineContent === "break;";

    const goodStart = startLineContent === "" ||
                      startLineContent.startsWith("//") ||
                      startLineContent.startsWith("case ") ||
                      startLineContent.startsWith("default:");

    console.log(`  Чанк ${i}:`);
    console.log(`    Начало (${chunk.startLine}): "${startLineContent.slice(0, 50)}..." ${goodStart ? "✅" : "⚠️"}`);
    console.log(`    Конец (${chunk.endLine}): "${endLineContent.slice(0, 50)}..." ${goodEnd ? "✅" : "⚠️"}`);
  }

  // 4. Check for mid-statement cuts
  console.log("\n=== 4. Проверка обрезки посреди statement ===");
  let midStatementCuts = 0;

  for (const chunk of chunks.slice(0, 10)) {
    const content = chunk.content;
    const lastLine = content.split("\n").pop()?.trim() ?? "";

    // Bad: ends with opening brace, comma, operator
    const badEnding = lastLine.endsWith("{") ||
                      lastLine.endsWith(",") ||
                      lastLine.endsWith("(") ||
                      lastLine.endsWith("&&") ||
                      lastLine.endsWith("||");

    if (badEnding) {
      midStatementCuts++;
      console.log(`  ⚠️ Чанк ${chunk.index}: обрезка на "${lastLine.slice(-30)}"`);
    }
  }

  if (midStatementCuts === 0) {
    console.log("  ✅ Нет обрезок посреди statement в первых 10 чанках");
  }

  // 5. Show actual chunk content samples
  console.log("\n=== 5. Примеры содержимого чанков ===");

  for (let i = 0; i < 3; i++) {
    const chunk = chunks[i]!;
    console.log(`\n--- Чанк ${i} (${chunk.tokenCount} токенов, строки ${chunk.startLine}-${chunk.endLine}) ---`);

    // Show first and last 5 lines of actual code (without header)
    const contentLines = chunk.content.split("\n");
    const codeStart = contentLines.findIndex(l => !l.startsWith("executeToolCall") && !l.startsWith("// ..."));

    console.log("Начало:");
    for (let j = codeStart; j < Math.min(codeStart + 4, contentLines.length); j++) {
      console.log(`  ${j}: ${contentLines[j]?.slice(0, 70)}`);
    }

    console.log("  ...");
    console.log("Конец:");
    for (let j = Math.max(contentLines.length - 3, codeStart); j < contentLines.length; j++) {
      console.log(`  ${j}: ${contentLines[j]?.slice(0, 70)}`);
    }
  }

  // 6. Test reconstruction
  console.log("\n=== 6. Тест восстановления (все case statements) ===");

  // Find all case statements in original
  const originalCases = functionCode.match(/case ["'][\w-]+["']:/g) || [];

  // Find all case statements across chunks
  const chunkCases = new Set<string>();
  for (const chunk of chunks) {
    const cases = chunk.content.match(/case ["'][\w-]+["']:/g) || [];
    cases.forEach(c => chunkCases.add(c));
  }

  console.log(`  Оригинал: ${originalCases.length} case statements`);
  console.log(`  В чанках: ${chunkCases.size} уникальных case statements`);

  const missingCases = originalCases.filter(c => !chunkCases.has(c));
  if (missingCases.length === 0) {
    console.log("  ✅ Все case statements сохранены!");
  } else {
    console.log(`  ❌ Потеряно: ${missingCases.join(", ")}`);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("=== ИТОГ ===");
  console.log("=".repeat(50));
  console.log(`
✅ Header сохраняется: ${allHaveHeader ? "Да" : "Нет"}
✅ Overlap между чанками: ${overlapIssues === 0 ? "Да" : `${overlapIssues} проблем`}
✅ Обрезки посреди statement: ${midStatementCuts === 0 ? "Нет" : `${midStatementCuts} найдено`}
✅ Все case statements сохранены: ${missingCases.length === 0 ? "Да" : "Нет"}

Потенциальные проблемы:
- При поиске "case X" - найдётся чанк с этим case ✅
- При поиске логики внутри case - контекст может быть неполным ⚠️
  (но overlap минимизирует эту проблему)
- Header позволяет понять к какой функции относится чанк ✅
`);
}

main().catch(console.error);

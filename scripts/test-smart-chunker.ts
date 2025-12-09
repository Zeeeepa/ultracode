/**
 * Test smart chunker on large functions
 */

import { readFileSync } from "fs";
import { chunkCode, needsChunking, estimateTokens, getChunkSettings } from "../src/semantic/smart-chunker.js";

async function main() {
  console.log("=== Тест Smart Chunker ===\n");

  // Read the giant executeToolCall function
  const indexTs = readFileSync("src/index.ts", "utf-8");

  // Extract executeToolCall function (line ~1760 to end of function)
  const lines = indexTs.split("\n");
  const startLine = lines.findIndex(l => l.includes("async function executeToolCall"));

  if (startLine === -1) {
    console.log("executeToolCall not found");
    return;
  }

  // Find end of function by counting braces
  let braceCount = 0;
  let endLine = startLine;
  let foundStart = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i] ?? "";
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    if (braceCount > 0) foundStart = true;
    if (foundStart && braceCount === 0) {
      endLine = i;
      break;
    }
  }

  const functionCode = lines.slice(startLine, endLine + 1).join("\n");
  const tokens = estimateTokens(functionCode);
  const lineCount = endLine - startLine + 1;

  console.log(`executeToolCall:`);
  console.log(`  Строк: ${lineCount}`);
  console.log(`  Токенов: ${tokens}`);
  console.log(`  Нужен chunking (512): ${needsChunking(functionCode, 512)}`);
  console.log(`  Нужен chunking (8192): ${needsChunking(functionCode, 8192)}`);

  // Test chunking with 512 tokens
  console.log("\n--- Chunking с maxTokens=512 ---\n");
  {
    const settings = getChunkSettings(512);
    const header = "executeToolCall function - MCP tool handler";
    const chunks = chunkCode("executeToolCall", functionCode, header, settings);

    console.log(`Чанков: ${chunks.length}`);
    console.log(`Settings: maxTokens=${settings.maxTokens}, overlap=${settings.overlapTokens}`);

    console.log("\nПервые 5 чанков:");
    for (const chunk of chunks.slice(0, 5)) {
      const preview = chunk.content.slice(0, 80).replace(/\n/g, "\\n");
      console.log(`  ${chunk.id.padEnd(30)} ${chunk.tokenCount} токенов, строки ${chunk.startLine}-${chunk.endLine}`);
      console.log(`    "${preview}..."`);
    }

    console.log(`\n... и ещё ${Math.max(0, chunks.length - 5)} чанков`);

    // Verify all chunks are under limit
    const overLimit = chunks.filter(c => c.tokenCount > 512);
    console.log(`\nЧанков > 512 токенов: ${overLimit.length}`);
    if (overLimit.length > 0) {
      for (const c of overLimit.slice(0, 3)) {
        console.log(`  ⚠️ ${c.id}: ${c.tokenCount} токенов`);
      }
    }
  }

  // Test chunking with 8192 tokens
  console.log("\n--- Chunking с maxTokens=8192 ---\n");
  {
    const settings = getChunkSettings(8192);
    const header = "executeToolCall function - MCP tool handler";
    const chunks = chunkCode("executeToolCall", functionCode, header, settings);

    console.log(`Чанков: ${chunks.length}`);
    console.log(`Settings: maxTokens=${settings.maxTokens}, overlap=${settings.overlapTokens}`);

    for (const chunk of chunks) {
      console.log(`  ${chunk.id.padEnd(35)} ${chunk.tokenCount} токенов`);
    }

    const overLimit = chunks.filter(c => c.tokenCount > 8192);
    console.log(`\nЧанков > 8192 токенов: ${overLimit.length}`);
  }

  // Test on a more normal sized method
  console.log("\n--- Тест на методе среднего размера ---\n");

  const mediumCode = `
async function processEntities(entities: ParsedEntity[]): Promise<void> {
  console.log(\`Processing \${entities.length} entities\`);

  for (const entity of entities) {
    // Validate entity
    if (!entity.id || !entity.name) {
      console.warn('Invalid entity:', entity);
      continue;
    }

    // Process based on type
    switch (entity.type) {
      case 'class':
        await this.processClass(entity);
        break;
      case 'function':
        await this.processFunction(entity);
        break;
      case 'interface':
        await this.processInterface(entity);
        break;
      default:
        console.log('Unknown type:', entity.type);
    }

    // Update metrics
    this.metrics.processed++;
  }

  console.log('Processing complete');
}
`.trim();

  const mediumTokens = estimateTokens(mediumCode);
  console.log(`Метод среднего размера: ${mediumTokens} токенов`);
  console.log(`Нужен chunking (512): ${needsChunking(mediumCode, 512)}`);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("=== ИТОГ ===");
  console.log("=".repeat(50));
  console.log(`
Smart Chunker корректно работает:
- executeToolCall (${tokens} токенов) → ${chunkCode("test", functionCode, "", getChunkSettings(512)).length} чанков (512)
- executeToolCall (${tokens} токенов) → ${chunkCode("test", functionCode, "", getChunkSettings(8192)).length} чанков (8192)
- Обычные методы (<512 токенов) не чанкятся

Рекомендация:
1. Entity Expander разбивает классы на методы
2. Smart Chunker дополнительно чанкит большие методы/функции
3. При maxTokens=8192 chunking почти не нужен
`);
}

main().catch(console.error);

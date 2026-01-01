#!/usr/bin/env bun
/**
 * Quality test for multilingual OpenVINO models
 */

import { OpenVINOProvider } from "../src/semantic/providers/openvino-provider.js";

const MODELS = [
  { id: "paraphrase-multilingual-MiniLM-L12-v2", langs: "50+" },
  { id: "distiluse-base-multilingual-cased-v2", langs: "15" },
  { id: "multilingual-e5-base", langs: "94" },
  { id: "multilingual-e5-small", langs: "94" },
];

// Test pairs: [query, positive (similar), negative (different)]
const testCases = [
  {
    name: "Function similarity",
    query: "async function fetchUserData(userId: string): Promise<User>",
    positive: "async function getUserById(id: string): Promise<UserEntity>",
    negative: "const colors = ['red', 'green', 'blue'];",
  },
  {
    name: "Error handling",
    query: "try { await api.call(); } catch (error) { logger.error(error); }",
    positive: "try { const result = await fetch(url); } catch (e) { console.error(e); }",
    negative: "export interface Config { host: string; port: number; }",
  },
  {
    name: "Database query",
    query: "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
    positive: "db.query('SELECT id, name FROM accounts WHERE active = true')",
    negative: "const PI = 3.14159; function calculateArea(r) { return PI * r * r; }",
  },
  {
    name: "React component",
    query: "function Button({ onClick, children }) { return <button onClick={onClick}>{children}</button>; }",
    positive: "const IconButton = ({ icon, onPress }) => <TouchableOpacity onPress={onPress}>{icon}</TouchableOpacity>",
    negative: "CREATE TABLE orders (id SERIAL PRIMARY KEY, total DECIMAL);",
  },
  {
    name: "Logging",
    query: "logger.info('User logged in', { userId, timestamp: new Date() });",
    positive: "console.log('Login successful', { user: userId, time: Date.now() });",
    negative: "interface Vector3 { x: number; y: number; z: number; }",
  },
];

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function testModelQuality(modelId: string, langs: string) {
  console.log(`\nTesting quality: ${modelId} (${langs} langs)...`);

  try {
    const provider = new OpenVINOProvider({
      model: modelId,
      device: "CPU",
      autoDownload: true,
    });
    await provider.initialize();

    let totalPositive = 0;
    let totalNegative = 0;

    for (const tc of testCases) {
      const queryEmb = await provider.embed(tc.query);
      const posEmb = await provider.embed(tc.positive);
      const negEmb = await provider.embed(tc.negative);

      const positiveSim = cosineSimilarity(queryEmb, posEmb);
      const negativeSim = cosineSimilarity(queryEmb, negEmb);

      totalPositive += positiveSim;
      totalNegative += negativeSim;
    }

    await provider.close?.();

    const avgPos = totalPositive / testCases.length;
    const avgNeg = totalNegative / testCases.length;
    const gap = avgPos - avgNeg;

    return {
      model: modelId,
      langs,
      avgPositive: Number(avgPos.toFixed(3)),
      avgNegative: Number(avgNeg.toFixed(3)),
      gap: Number(gap.toFixed(3)),
      status: "success",
    };
  } catch (error: any) {
    return {
      model: modelId,
      langs,
      status: "error",
      error: error.message,
    };
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Multilingual Models Quality Test                              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  const results = [];

  for (const model of MODELS) {
    const result = await testModelQuality(model.id, model.langs);
    results.push(result);
  }

  console.log("\n\n" + "═".repeat(70));
  console.log("QUALITY RESULTS (sorted by gap)");
  console.log("═".repeat(70) + "\n");

  // Sort by gap descending
  results.sort((a, b) => (b.gap || 0) - (a.gap || 0));

  console.log("| Model | Langs | Pos Sim | Neg Sim | Gap |");
  console.log("|-------|-------|---------|---------|-----|");

  for (const r of results) {
    if (r.status === "success") {
      console.log(`| ${r.model} | ${r.langs} | ${r.avgPositive} | ${r.avgNegative} | **${r.gap}** |`);
    } else {
      console.log(`| ${r.model} | ${r.langs} | ERROR | - | - |`);
    }
  }
}

main().catch(console.error);

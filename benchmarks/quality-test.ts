#!/usr/bin/env bun
/**
 * Embedding Quality Test
 * Tests semantic similarity quality across different models
 */

const OLLAMA = "http://127.0.0.1:11434";
const TEI = "http://127.0.0.1:8081";

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

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embedOllama(model: string, texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${OLLAMA}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    const data = await res.json();
    embeddings.push(data.embeddings[0]);
  }
  return embeddings;
}

async function embedTEI(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${TEI}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: texts, truncate: true }),
  });
  return await res.json();
}

interface ModelResult {
  model: string;
  provider: string;
  avgPositiveSim: number;
  avgNegativeSim: number;
  avgGap: number;
  dims: number;
  results: Array<{
    name: string;
    positiveSim: number;
    negativeSim: number;
    gap: number;
  }>;
}

async function testModel(
  name: string,
  provider: string,
  embedFn: (texts: string[]) => Promise<number[][]>
): Promise<ModelResult> {
  const results: ModelResult["results"] = [];
  let totalPositive = 0;
  let totalNegative = 0;
  let dims = 0;

  for (const tc of testCases) {
    const [queryEmb, posEmb, negEmb] = await embedFn([tc.query, tc.positive, tc.negative]);
    dims = queryEmb.length;

    const positiveSim = cosineSimilarity(queryEmb, posEmb);
    const negativeSim = cosineSimilarity(queryEmb, negEmb);

    results.push({
      name: tc.name,
      positiveSim: Math.round(positiveSim * 1000) / 1000,
      negativeSim: Math.round(negativeSim * 1000) / 1000,
      gap: Math.round((positiveSim - negativeSim) * 1000) / 1000,
    });

    totalPositive += positiveSim;
    totalNegative += negativeSim;
  }

  return {
    model: name,
    provider,
    avgPositiveSim: Math.round((totalPositive / testCases.length) * 1000) / 1000,
    avgNegativeSim: Math.round((totalNegative / testCases.length) * 1000) / 1000,
    avgGap: Math.round(((totalPositive - totalNegative) / testCases.length) * 1000) / 1000,
    dims,
    results,
  };
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Embedding Quality Test                                        ║");
  console.log("║  Higher gap = better discrimination                            ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  const models: ModelResult[] = [];

  // Test Ollama models
  const ollamaModels = [
    "granite-embedding:278m",
    "granite-embedding:30m",
    "all-minilm",
    "nomic-embed-text",
    "snowflake-arctic-embed2",
  ];

  for (const model of ollamaModels) {
    console.log(`Testing ${model}...`);
    try {
      const result = await testModel(model, "ollama", (texts) => embedOllama(model, texts));
      models.push(result);
      console.log(`  ✓ Gap: ${result.avgGap} (pos: ${result.avgPositiveSim}, neg: ${result.avgNegativeSim})`);
    } catch (e: any) {
      console.log(`  ✗ ${e.message}`);
    }
  }

  // Test TEI
  console.log("Testing BGE-M3 (TEI)...");
  try {
    const result = await testModel("BGE-M3", "tei", embedTEI);
    models.push(result);
    console.log(`  ✓ Gap: ${result.avgGap} (pos: ${result.avgPositiveSim}, neg: ${result.avgNegativeSim})`);
  } catch (e: any) {
    console.log(`  ✗ ${e.message}`);
  }

  // Summary
  console.log("\n" + "═".repeat(70));
  console.log("QUALITY RANKING (by discrimination gap)");
  console.log("═".repeat(70) + "\n");

  models.sort((a, b) => b.avgGap - a.avgGap);

  console.log("┌────────────────────────────────────────────────────────────────────┐");
  console.log("│ Rank │ Model                    │ Dims │ Pos Sim │ Neg Sim │  Gap  │");
  console.log("├────────────────────────────────────────────────────────────────────┤");

  let rank = 1;
  for (const m of models) {
    const name = m.model.padEnd(24);
    const dims = String(m.dims).padStart(4);
    const pos = m.avgPositiveSim.toFixed(3).padStart(7);
    const neg = m.avgNegativeSim.toFixed(3).padStart(7);
    const gap = m.avgGap.toFixed(3).padStart(6);
    console.log(`│  ${rank}   │ ${name} │ ${dims} │ ${pos} │ ${neg} │ ${gap} │`);
    rank++;
  }

  console.log("└────────────────────────────────────────────────────────────────────┘");

  // Detailed results for top model
  if (models.length > 0) {
    const best = models[0];
    console.log(`\nDetailed results for ${best.model}:\n`);
    for (const r of best.results) {
      console.log(`  ${r.name}: pos=${r.positiveSim}, neg=${r.negativeSim}, gap=${r.gap}`);
    }
  }
}

main().catch(console.error);

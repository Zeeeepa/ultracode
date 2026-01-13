/**
 * Test OpenVINO Embedding Provider
 */
import { OpenVINOProvider } from "../src/semantic/providers/openvino-provider.js";

async function main() {
  console.log("=== OpenVINO Embedding Test ===\n");

  const provider = new OpenVINOProvider({
    model: "all-MiniLM-L6-v2",
    device: "CPU",
    logger: {
      info: (msg, data) => console.log(`[INFO] ${msg}`, data || ""),
      debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ""),
      warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ""),
      error: (msg, data, _, e) => console.error(`[ERROR] ${msg}`, data, e?.message || ""),
    },
  });

  console.log("Initializing provider...\n");
  await provider.initialize();

  // Test single embedding
  console.log("\n--- Single Embedding Test ---");
  const text1 = "function calculateSum(a, b) { return a + b; }";
  const t0 = Date.now();
  const emb1 = await provider.embed(text1);
  const t1 = Date.now();
  console.log(`Text: "${text1.slice(0, 50)}..."`);
  console.log(`Dimension: ${emb1.length}`);
  console.log(`Time: ${t1 - t0}ms`);
  console.log(
    `First 5 values: [${Array.from(emb1.slice(0, 5))
      .map((v) => v.toFixed(4))
      .join(", ")}]`,
  );

  // Test batch embedding
  console.log("\n--- Batch Embedding Test (10 texts) ---");
  const texts = [
    "class UserService { async getUser(id) { return db.find(id); } }",
    "interface ILogger { log(message: string): void; }",
    "const result = await fetch('/api/users');",
    "function validateEmail(email) { return email.includes('@'); }",
    "export default class AuthController extends BaseController {}",
    "SELECT * FROM users WHERE id = ?",
    "npm install express mongoose dotenv",
    "git commit -m 'fix: resolve memory leak'",
    "docker-compose up -d --build",
    "kubectl apply -f deployment.yaml",
  ];

  const t2 = Date.now();
  const embeddings = await provider.embedBatch(texts);
  const t3 = Date.now();

  console.log(`Batch size: ${texts.length}`);
  console.log(`Total time: ${t3 - t2}ms`);
  console.log(`Per text: ${((t3 - t2) / texts.length).toFixed(2)}ms`);
  console.log(`All dimensions correct: ${embeddings.every((e) => e.length === 384)}`);

  // Test similarity
  console.log("\n--- Similarity Test ---");
  const codeA = "function add(x, y) { return x + y; }";
  const codeB = "const sum = (a, b) => a + b;";
  const codeC = "SELECT name FROM employees WHERE dept = 'IT'";

  const [embA, embB, embC] = await provider.embedBatch([codeA, codeB, codeC]);

  const cosineSim = (a: Float32Array, b: Float32Array) => {
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  console.log(`"${codeA}" vs "${codeB}"`);
  console.log(`  Similarity: ${(cosineSim(embA, embB) * 100).toFixed(1)}%`);
  console.log(`"${codeA}" vs "${codeC}"`);
  console.log(`  Similarity: ${(cosineSim(embA, embC) * 100).toFixed(1)}%`);

  // Test larger batch
  console.log("\n--- Large Batch Test (50 texts) ---");
  const largeTexts = Array(50)
    .fill(0)
    .map((_, i) => `function test${i}() { return ${i}; }`);
  const t4 = Date.now();
  const largeEmbeddings = await provider.embedBatch(largeTexts);
  const t5 = Date.now();

  console.log(`Batch size: ${largeTexts.length}`);
  console.log(`Total time: ${t5 - t4}ms`);
  console.log(`Per text: ${((t5 - t4) / largeTexts.length).toFixed(2)}ms`);

  await provider.close();
  console.log("\n=== Test Complete ===");
}

main().catch(console.error);

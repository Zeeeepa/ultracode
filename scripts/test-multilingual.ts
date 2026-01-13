/**
 * Test Multilingual OpenVINO Embedding
 */
import { OpenVINOProvider } from "../src/semantic/providers/openvino-provider.js";

async function main() {
  console.log("=== Multilingual E5 Embedding Test ===\n");

  const provider = new OpenVINOProvider({
    model: "multilingual-e5-small",
    device: "CPU",
    logger: {
      info: (msg, data) => console.log(`[INFO] ${msg}`, JSON.stringify(data) || ""),
      debug: () => {},
      warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ""),
      error: (msg, data, _, e) => console.error(`[ERROR] ${msg}`, data, e?.message || ""),
    },
  });

  console.log("Initializing multilingual model (will download ~118MB on first run)...\n");
  await provider.initialize();

  // Test multilingual texts
  const texts = [
    // English
    "function calculateSum(a, b) { return a + b; }",
    // Russian
    "функция вычисления суммы двух чисел",
    // Chinese
    "计算两个数字之和的函数",
    // Japanese
    "二つの数の合計を計算する関数",
    // German
    "Funktion zur Berechnung der Summe zweier Zahlen",
    // SQL (universal)
    "SELECT * FROM users WHERE active = true",
  ];

  console.log("--- Embedding multilingual texts ---\n");

  const embeddings = await provider.embedBatch(texts);

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

  // Print similarities
  const labels = ["EN code", "RU desc", "ZH desc", "JA desc", "DE desc", "SQL"];

  console.log("Similarity matrix (%):\n");
  console.log("        " + labels.map((l) => l.padStart(8)).join(""));

  for (let i = 0; i < texts.length; i++) {
    const row = labels
      .map((_, j) => {
        const sim = cosineSim(embeddings[i], embeddings[j]) * 100;
        return sim.toFixed(1).padStart(8);
      })
      .join("");
    console.log(`${labels[i].padEnd(8)}${row}`);
  }

  console.log("\n--- Key observations ---");
  console.log(`EN code vs RU desc: ${(cosineSim(embeddings[0], embeddings[1]) * 100).toFixed(1)}%`);
  console.log(`EN code vs ZH desc: ${(cosineSim(embeddings[0], embeddings[2]) * 100).toFixed(1)}%`);
  console.log(`RU desc vs ZH desc: ${(cosineSim(embeddings[1], embeddings[2]) * 100).toFixed(1)}%`);
  console.log(`EN code vs SQL:     ${(cosineSim(embeddings[0], embeddings[5]) * 100).toFixed(1)}%`);

  await provider.close();
  console.log("\n=== Test Complete ===");
}

main().catch(console.error);

/**
 * Test: Do we NEED multilingual model for code search?
 *
 * Compares English-only MiniLM vs Multilingual E5
 * on mixed language queries (Russian comments, English code)
 */
import { OpenVINOProvider } from "../src/semantic/providers/openvino-provider.js";

async function main() {
  console.log("=== Multilingual Model Necessity Test ===\n");

  // Initialize both models
  const englishModel = new OpenVINOProvider({
    model: "all-MiniLM-L6-v2",
    device: "CPU",
    logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
  });

  const multiModel = new OpenVINOProvider({
    model: "multilingual-e5-small",
    device: "CPU",
    logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
  });

  console.log("Initializing models...");
  await englishModel.initialize();
  await multiModel.initialize();
  console.log("Models ready.\n");

  // Simulated code with Russian JSDoc comments
  const codeWithRussianComments = [
    `/**
 * Сервис для работы с пользователями
 * Отвечает за аутентификацию и авторизацию
 */
class UserService {
  async authenticate(email, password) {
    return this.db.verify(email, password);
  }
}`,
    `/**
 * Вычисление налога на добавленную стоимость
 * @param amount Сумма без НДС
 * @returns Сумма с НДС (20%)
 */
function calculateVAT(amount) {
  return amount * 1.2;
}`,
    `// Проверка валидности email адреса
function validateEmail(email) {
  return /^[^@]+@[^@]+\\.[^@]+$/.test(email);
}`,
    `/**
 * Обработчик HTTP запросов
 * Принимает и обрабатывает REST API вызовы
 */
class HttpController {
  async handleRequest(req, res) {
    return res.json({ status: 'ok' });
  }
}`,
  ];

  // Test queries in different languages
  const queries = [
    // Russian queries (typical for Russian developers)
    "сервис аутентификации пользователей",
    "вычисление налога НДС",
    "валидация email",
    "обработка HTTP запросов",
    // English queries (code keywords)
    "user authentication service",
    "calculate VAT tax",
    "email validation",
    "HTTP request handler",
  ];

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

  // Generate embeddings for code
  const englishCodeEmbs = await englishModel.embedBatch(codeWithRussianComments);
  const multiCodeEmbs = await multiModel.embedBatch(codeWithRussianComments);

  console.log("--- Query Results ---\n");
  console.log("Query".padEnd(40) + "Expected  MiniLM  Multi-E5  Winner");
  console.log("-".repeat(75));

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const expectedIdx = i % 4; // First 4 queries match first 4 code snippets

    const [englishQueryEmb] = await englishModel.embedBatch([query]);
    const [multiQueryEmb] = await multiModel.embedBatch([query]);

    // Find best match for each model
    let bestEnglish = { idx: 0, sim: -1 };
    let bestMulti = { idx: 0, sim: -1 };

    for (let j = 0; j < codeWithRussianComments.length; j++) {
      const engSim = cosineSim(englishQueryEmb, englishCodeEmbs[j]);
      const multiSim = cosineSim(multiQueryEmb, multiCodeEmbs[j]);

      if (engSim > bestEnglish.sim) bestEnglish = { idx: j, sim: engSim };
      if (multiSim > bestMulti.sim) bestMulti = { idx: j, sim: multiSim };
    }

    const engCorrect = bestEnglish.idx === expectedIdx;
    const multiCorrect = bestMulti.idx === expectedIdx;

    const winner =
      engCorrect && !multiCorrect
        ? "MiniLM"
        : !engCorrect && multiCorrect
          ? "Multi"
          : engCorrect && multiCorrect
            ? "TIE"
            : "BOTH WRONG";

    const engMark = engCorrect ? "✓" : "✗";
    const multiMark = multiCorrect ? "✓" : "✗";

    console.log(
      query.slice(0, 38).padEnd(40) +
        `${expectedIdx}`.padEnd(10) +
        `${engMark} (${(bestEnglish.sim * 100).toFixed(0)}%)`.padEnd(8) +
        `${multiMark} (${(bestMulti.sim * 100).toFixed(0)}%)`.padEnd(10) +
        winner,
    );
  }

  await englishModel.close();
  await multiModel.close();

  console.log("\n=== Conclusion ===");
  console.log("If MiniLM wins most: No need for multilingual model");
  console.log("If Multi-E5 wins most: Multilingual model recommended");
}

main().catch(console.error);

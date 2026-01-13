/**
 * Comprehensive Benchmark: Multilingual Embedding Providers
 *
 * Compares:
 * - OpenVINO (CPU INT8)
 * - Ollama (GPU)
 * - TEI (GPU)
 *
 * Metrics:
 * - Batch performance (100, 200 texts)
 * - Per-text latency
 * - Context window (8K vs 512 tokens)
 */

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const TEI_ENDPOINT = "http://127.0.0.1:8081"; // multilingual-e5-large

interface BenchmarkResult {
  provider: string;
  model: string;
  contextTokens: number;
  dimensions: number;
  batchSize: number;
  totalTimeMs: number;
  perTextMs: number;
  tokensPerSec: number;
  memoryMB?: number;
}

// Generate test texts of varying lengths
function generateTestTexts(count: number, avgTokens: number): string[] {
  const templates = [
    // Code snippets (English)
    `/**
 * Service for user authentication and authorization
 * Handles login, logout, and session management
 */
class UserAuthService {
  private db: Database;
  private cache: RedisCache;

  async authenticate(email: string, password: string): Promise<User | null> {
    const user = await this.db.users.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return null;
    }
    return user;
  }
}`,
    // Code with Russian comments
    `/**
 * Сервис для работы с заказами
 * Обрабатывает создание, обновление и отмену заказов
 * @module OrderService
 */
export class OrderService {
  // Создание нового заказа
  async createOrder(items: CartItem[], userId: string): Promise<Order> {
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return this.db.orders.create({ userId, items, total, status: 'pending' });
  }
}`,
    // SQL queries
    `-- Получение статистики продаж по категориям
-- за последний квартал с группировкой по месяцам
SELECT
  c.name AS category_name,
  DATE_TRUNC('month', o.created_at) AS month,
  COUNT(DISTINCT o.id) AS order_count,
  SUM(oi.quantity * oi.price) AS total_revenue
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
JOIN categories c ON p.category_id = c.id
WHERE o.created_at >= NOW() - INTERVAL '3 months'
GROUP BY c.name, DATE_TRUNC('month', o.created_at)
ORDER BY month DESC, total_revenue DESC;`,
    // TypeScript interface
    `/**
 * Интерфейс конфигурации приложения
 * Содержит все настройки для production и development окружений
 */
interface AppConfig {
  server: {
    host: string;
    port: number;
    ssl: boolean;
  };
  database: {
    url: string;
    poolSize: number;
    timeout: number;
  };
  cache: {
    provider: 'redis' | 'memcached';
    ttl: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
  };
}`,
    // React component
    `/**
 * Компонент корзины покупок
 * Отображает список товаров и общую сумму
 */
export function ShoppingCart({ items, onRemove, onCheckout }: ShoppingCartProps) {
  const total = useMemo(() =>
    items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );

  return (
    <div className="shopping-cart">
      <h2>Корзина ({items.length} товаров)</h2>
      {items.map(item => (
        <CartItem key={item.id} item={item} onRemove={onRemove} />
      ))}
      <div className="total">Итого: {formatPrice(total)}</div>
      <Button onClick={onCheckout}>Оформить заказ</Button>
    </div>
  );
}`,
  ];

  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    texts.push(templates[i % templates.length]);
  }
  return texts;
}

async function benchmarkOllama(model: string, texts: string[]): Promise<BenchmarkResult | null> {
  try {
    // Check if model exists
    const modelsRes = await fetch(`${OLLAMA_ENDPOINT}/api/tags`);
    const models = await modelsRes.json();
    const hasModel = models.models?.some((m: any) => m.name.includes(model.split(":")[0]));

    if (!hasModel) {
      console.log(`  [SKIP] Ollama model ${model} not installed`);
      return null;
    }

    const batchSize = texts.length;
    const t0 = Date.now();

    // Ollama doesn't support native batch - process with parallelism (4 concurrent)
    const CONCURRENCY = 4;
    const embeddings: number[][] = new Array(texts.length);

    const processText = async (text: string, idx: number) => {
      const res = await fetch(`${OLLAMA_ENDPOINT}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: text }),
      });
      const data = await res.json();
      if (data.embeddings?.[0]) {
        embeddings[idx] = data.embeddings[0];
      }
    };

    // Process in batches with concurrency limit
    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const batch = texts.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((text, j) => processText(text, i + j)));
    }

    const totalTimeMs = Date.now() - t0;

    return {
      provider: "Ollama (GPU)",
      model,
      contextTokens: model.includes("arctic") ? 8192 : 512,
      dimensions: embeddings[0]?.length || 0,
      batchSize,
      totalTimeMs,
      perTextMs: totalTimeMs / batchSize,
      tokensPerSec: Math.round((batchSize * 100) / (totalTimeMs / 1000)), // ~100 tokens per text avg
    };
  } catch (e: any) {
    console.log(`  [ERROR] Ollama: ${e.message}`);
    return null;
  }
}

async function benchmarkTEI(endpoint: string, texts: string[]): Promise<BenchmarkResult | null> {
  try {
    // Check health
    const healthRes = await fetch(`${endpoint}/health`);
    if (!healthRes.ok) {
      console.log(`  [SKIP] TEI not healthy`);
      return null;
    }

    // Get model info
    const infoRes = await fetch(`${endpoint}/info`);
    const info = await infoRes.json();

    const batchSize = texts.length;
    const t0 = Date.now();

    // TEI supports native batch - process in chunks of 32 (max_client_batch_size)
    const CHUNK_SIZE = 32;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);
      const res = await fetch(`${endpoint}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: chunk, truncate: true }),
      });

      if (!res.ok) {
        console.log(`  [ERROR] TEI: ${res.status} ${res.statusText}`);
        return null;
      }

      const embeddings = await res.json();
      allEmbeddings.push(...embeddings);
    }

    const totalTimeMs = Date.now() - t0;
    const embeddings = allEmbeddings;

    return {
      provider: "TEI (GPU)",
      model: info.model_id || "multilingual-e5-large",
      contextTokens: info.max_input_length || 512,
      dimensions: embeddings[0]?.length || 0,
      batchSize,
      totalTimeMs,
      perTextMs: totalTimeMs / batchSize,
      tokensPerSec: Math.round((batchSize * 100) / (totalTimeMs / 1000)),
    };
  } catch (e: any) {
    console.log(`  [ERROR] TEI: ${e.message}`);
    return null;
  }
}

async function benchmarkOpenVINO(model: string, texts: string[]): Promise<BenchmarkResult | null> {
  try {
    const { OpenVINOProvider } = await import("../src/semantic/providers/openvino-provider.js");

    const provider = new OpenVINOProvider({
      model,
      device: "CPU",
      logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
    });

    await provider.initialize();

    const batchSize = texts.length;
    const t0 = Date.now();

    const embeddings = await provider.embedBatch(texts);
    const totalTimeMs = Date.now() - t0;

    const dim = embeddings[0]?.length || 384;
    await provider.close();

    return {
      provider: "OpenVINO (CPU)",
      model,
      contextTokens: model.includes("e5") ? 512 : 256,
      dimensions: dim,
      batchSize,
      totalTimeMs,
      perTextMs: totalTimeMs / batchSize,
      tokensPerSec: Math.round((batchSize * 100) / (totalTimeMs / 1000)),
    };
  } catch (e: any) {
    console.log(`  [ERROR] OpenVINO: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Multilingual Embedding Providers Benchmark                    ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  const results: BenchmarkResult[] = [];
  const batchSizes = [10, 32, 64];

  // Warmup
  console.log("Warming up providers...\n");

  for (const size of batchSizes) {
    console.log(`\n━━━ Batch Size: ${size} texts ━━━\n`);

    const texts = generateTestTexts(size, 100);

    // OpenVINO multilingual
    console.log("Testing OpenVINO (multilingual-e5-small)...");
    const ovResult = await benchmarkOpenVINO("multilingual-e5-small", texts);
    if (ovResult) results.push(ovResult);

    // Ollama multilingual
    console.log("Testing Ollama (snowflake-arctic-embed2)...");
    const ollamaResult = await benchmarkOllama("snowflake-arctic-embed2", texts);
    if (ollamaResult) results.push(ollamaResult);

    // TEI multilingual
    console.log("Testing TEI (multilingual-e5-large)...");
    const teiResult = await benchmarkTEI(TEI_ENDPOINT, texts);
    if (teiResult) results.push(teiResult);
  }

  // Print results
  console.log(
    "\n\n╔════════════════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                              BENCHMARK RESULTS                                  ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════════════════╝\n",
  );

  // Group by batch size
  const grouped = new Map<number, BenchmarkResult[]>();
  for (const r of results) {
    if (!grouped.has(r.batchSize)) grouped.set(r.batchSize, []);
    grouped.get(r.batchSize)!.push(r);
  }

  for (const [batchSize, batchResults] of grouped) {
    console.log(`\n┌─ Batch: ${batchSize} texts ${"─".repeat(60)}`);
    console.log("│");
    console.log("│  Provider          Model                      Total    Per-text  Context");
    console.log("│  ────────────────  ─────────────────────────  ───────  ────────  ───────");

    // Sort by per-text time
    batchResults.sort((a, b) => a.perTextMs - b.perTextMs);

    for (const r of batchResults) {
      const provider = r.provider.padEnd(16);
      const model = r.model.slice(0, 25).padEnd(25);
      const total = `${r.totalTimeMs}ms`.padStart(7);
      const perText = `${r.perTextMs.toFixed(1)}ms`.padStart(8);
      const context = `${r.contextTokens}`.padStart(6);
      console.log(`│  ${provider}  ${model}  ${total}  ${perText}  ${context}`);
    }
    console.log("│");
    console.log("└" + "─".repeat(75));
  }

  // Summary recommendations
  console.log("\n\n═══════════════════════════════════════════════════════════════");
  console.log("                        RECOMMENDATIONS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Find best for each category
  const batch100 = results.filter((r) => r.batchSize === 100);
  const batch200 = results.filter((r) => r.batchSize === 200);

  if (batch100.length > 0) {
    const fastest100 = batch100.reduce((a, b) => (a.perTextMs < b.perTextMs ? a : b));
    const best8k = batch100
      .filter((r) => r.contextTokens >= 8000)
      .sort((a, b) => a.perTextMs - b.perTextMs)[0];

    console.log(`🏆 Fastest (batch 100):     ${fastest100.provider} - ${fastest100.model}`);
    console.log(
      `   ${fastest100.perTextMs.toFixed(1)}ms/text, ${fastest100.contextTokens} tokens context\n`,
    );

    if (best8k) {
      console.log(`📄 Best 8K context:         ${best8k.provider} - ${best8k.model}`);
      console.log(
        `   ${best8k.perTextMs.toFixed(1)}ms/text, ${best8k.contextTokens} tokens context\n`,
      );
    }
  }

  console.log("\n📋 Context Token Comparison:");
  console.log("   512 tokens  ≈ ~100 lines of code (short methods)");
  console.log("   8192 tokens ≈ ~1500 lines of code (full classes/files)");
  console.log("");
  console.log("💡 Recommendation:");
  console.log("   - Development (fast indexing): OpenVINO CPU with 512 tok model");
  console.log("   - Production (large files): TEI GPU with 8K model if available");
  console.log("   - Mixed workload: Ollama with snowflake-arctic-embed2 (8K, universal GPU)");
}

main().catch(console.error);

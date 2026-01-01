#!/usr/bin/env bun
/**
 * TEI Batch Size Benchmark
 * Tests different batch sizes to find optimal throughput
 */

const TEI = process.env.TEI_ENDPOINT || "http://127.0.0.1:8081";

const testCode = `
export class TestService {
  private readonly cache: Map<string, unknown> = new Map();

  async process(data: string[]): Promise<void> {
    for (const item of data) {
      if (this.cache.has(item)) continue;
      const result = await this.transform(item);
      this.cache.set(item, result);
    }
  }

  private async transform(input: string): Promise<string> {
    return input.toUpperCase();
  }
}
`;

const largeCode = `
export class SemanticSearchService {
  private readonly vectorStore: VectorStore;
  private readonly embeddings: EmbeddingProvider;
  private readonly logger: Logger;

  constructor(vectorStore: VectorStore, embeddings: EmbeddingProvider, logger: Logger) {
    this.vectorStore = vectorStore;
    this.embeddings = embeddings;
    this.logger = logger;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7, filters = {} } = options;

    this.logger.debug('Starting semantic search', { query, limit, threshold });

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.embed(query);

      // Search vector store
      const results = await this.vectorStore.search(queryEmbedding, {
        limit: limit * 2, // Over-fetch for filtering
        threshold,
      });

      // Apply filters
      const filtered = results.filter(result => {
        for (const [key, value] of Object.entries(filters)) {
          if (result.metadata?.[key] !== value) return false;
        }
        return true;
      });

      this.logger.info('Search completed', {
        query,
        totalResults: results.length,
        filteredResults: filtered.length
      });

      return filtered.slice(0, limit);
    } catch (error) {
      this.logger.error('Search failed', { query, error });
      throw error;
    }
  }

  async indexDocument(doc: Document): Promise<void> {
    const embedding = await this.embeddings.embed(doc.content);
    await this.vectorStore.insert(doc.id, embedding, doc.metadata);
  }

  async batchIndex(docs: Document[]): Promise<BatchResult> {
    const results: BatchResult = { success: 0, failed: 0, errors: [] };

    // Process in batches of 32
    for (let i = 0; i < docs.length; i += 32) {
      const batch = docs.slice(i, i + 32);
      const contents = batch.map(d => d.content);

      try {
        const embeddings = await this.embeddings.embedBatch(contents);

        for (let j = 0; j < batch.length; j++) {
          await this.vectorStore.insert(batch[j].id, embeddings[j], batch[j].metadata);
          results.success++;
        }
      } catch (error) {
        results.failed += batch.length;
        results.errors.push({ batch: i, error: String(error) });
      }
    }

    return results;
  }
}

interface SearchOptions {
  limit?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
}

interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface BatchResult {
  success: number;
  failed: number;
  errors: Array<{ batch: number; error: string }>;
}
`;

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  TEI Batch Size Benchmark                                      ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Check TEI info
  try {
    const info = await fetch(`${TEI}/info`).then(r => r.json());
    console.log(`TEI Model: ${info.model_id}`);
    console.log(`Max Input Length: ${info.max_input_length}`);
    console.log(`Max Batch Tokens: ${info.max_batch_tokens}`);
    console.log(`Max Client Batch Size: ${info.max_client_batch_size}`);
    console.log(`Version: ${info.version}\n`);
  } catch (e) {
    console.error(`Failed to connect to TEI at ${TEI}`);
    process.exit(1);
  }

  // Warmup
  console.log("Warming up...");
  await fetch(`${TEI}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: ["warmup"], truncate: true }),
  });

  // Test with small code
  console.log("\n=== Small Code (~150 tokens) ===\n");

  for (const batchSize of [1, 8, 16, 32, 64, 128, 256, 500]) {
    const inputs = Array(batchSize).fill(testCode);
    const start = Date.now();

    try {
      const res = await fetch(`${TEI}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, truncate: true }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.log(`Batch ${String(batchSize).padStart(3)}: ERROR ${res.status} - ${text.slice(0, 100)}`);
        continue;
      }

      const embeddings = await res.json();
      const elapsed = Date.now() - start;
      const perItem = (elapsed / batchSize).toFixed(2);
      const throughput = Math.round(batchSize / (elapsed / 1000));

      console.log(`Batch ${String(batchSize).padStart(3)}: ${String(elapsed).padStart(5)}ms total, ${perItem.padStart(6)}ms/item, ${String(throughput).padStart(5)} items/s, dims=${embeddings[0]?.length}`);
    } catch (e: any) {
      console.log(`Batch ${String(batchSize).padStart(3)}: ERROR - ${e.message}`);
    }
  }

  // Test with large code
  console.log("\n=== Large Code (~800 tokens) ===\n");

  for (const batchSize of [1, 8, 16, 32, 64]) {
    const inputs = Array(batchSize).fill(largeCode);
    const start = Date.now();

    try {
      const res = await fetch(`${TEI}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, truncate: true }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.log(`Batch ${String(batchSize).padStart(3)}: ERROR ${res.status} - ${text.slice(0, 100)}`);
        continue;
      }

      const embeddings = await res.json();
      const elapsed = Date.now() - start;
      const perItem = (elapsed / batchSize).toFixed(2);
      const throughput = Math.round(batchSize / (elapsed / 1000));

      console.log(`Batch ${String(batchSize).padStart(3)}: ${String(elapsed).padStart(5)}ms total, ${perItem.padStart(6)}ms/item, ${String(throughput).padStart(5)} items/s`);
    } catch (e: any) {
      console.log(`Batch ${String(batchSize).padStart(3)}: ERROR - ${e.message}`);
    }
  }

  // Test concurrent requests
  console.log("\n=== Concurrent Requests (batch=32, small code) ===\n");

  for (const concurrency of [1, 2, 4, 8]) {
    const inputs = Array(32).fill(testCode);
    const start = Date.now();

    const promises = Array(concurrency).fill(null).map(() =>
      fetch(`${TEI}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, truncate: true }),
      }).then(r => r.json())
    );

    await Promise.all(promises);
    const elapsed = Date.now() - start;
    const totalItems = 32 * concurrency;
    const throughput = Math.round(totalItems / (elapsed / 1000));

    console.log(`Concurrency ${concurrency}: ${elapsed}ms for ${totalItems} items, ${throughput} items/s`);
  }
}

main().catch(console.error);

import type { EmbeddingProvider, EmbedOptions, ProviderInfo, ProviderLogger } from "./base.js";

export interface TEIOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  concurrency?: number;
  checkServer?: boolean;
  logger?: ProviderLogger;
}

/**
 * Text Embeddings Inference (TEI) Provider
 *
 * Connects to a local TEI Docker container for embedding generation.
 * TEI is HuggingFace's optimized inference server for embeddings.
 *
 * Setup:
 * docker run -d --name tei-server -p 8080:80 \
 *   --pull always \
 *   ghcr.io/huggingface/text-embeddings-inference:latest \
 *   --model-id ibm-granite/granite-embedding-english-r2
 */
export class TEIProvider implements EmbeddingProvider {
  public info: ProviderInfo;
  private baseUrl: string;
  private timeoutMs: number;
  private concurrency: number;
  private checkServer: boolean;
  private log?: ProviderLogger;

  constructor(opts: TEIOptions) {
    this.log = opts.logger;
    this.baseUrl = opts.baseUrl ?? "http://127.0.0.1:8080";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.concurrency = Math.max(1, opts.concurrency ?? 4);
    this.checkServer = opts.checkServer !== false;

    this.info = {
      name: "tei",
      model: opts.model,
      supportsBatch: true,
    };
  }

  async initialize(): Promise<void> {
    this.log?.info("initialize", {
      model: this.info.model,
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
      concurrency: this.concurrency,
    });

    if (this.checkServer) {
      // Try to start container if it exists but is not running
      await this.ensureContainerRunning();
    }

    // Get model info including max_input_length
    try {
      const infoRes = await fetch(`${this.baseUrl}/info`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (infoRes.ok) {
        const modelInfo = (await infoRes.json()) as { max_input_length?: number; model_id?: string };
        this.info.maxTokens = modelInfo.max_input_length || 512;
        this.log?.debug("TEI model info", { maxTokens: this.info.maxTokens, model: modelInfo.model_id });
      }
    } catch {
      this.info.maxTokens = 512; // Default fallback
    }

    // Warmup call to determine dimension
    try {
      const vec = await this.embed("warmup text");
      this.info.dimension = vec.length;
      this.log?.info("initialized", { dimension: this.info.dimension, maxTokens: this.info.maxTokens });
    } catch (e: any) {
      this.log?.error("warmup failed", { error: e.message }, undefined, e);
      throw new Error(
        `TEI warmup failed: ${e.message}\n` +
          `Make sure TEI Docker container is running:\n` +
          `docker run -d --name tei-server -p 8080:80 \\\n` +
          `  ghcr.io/huggingface/text-embeddings-inference:latest \\\n` +
          `  --model-id ${this.info.model}`,
      );
    }
  }

  /**
   * Ensure TEI Docker container is running, start it if it exists but is stopped
   */
  private async ensureContainerRunning(): Promise<void> {
    try {
      // Check if container is already running
      const healthCheck = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      }).catch(() => null);

      if (healthCheck?.ok) {
        this.log?.debug("TEI container already running");
        return;
      }

      // Container not responding, try to start it
      this.log?.info("TEI container not running, attempting to start...");

      // Check if Docker is available
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execPromise = promisify(exec);

      // Check if container exists
      const { stdout: containerList } = await execPromise(
        'docker ps -a --filter "name=tei-server" --format "{{.Names}}"',
        { windowsHide: true },
      ).catch(() => ({ stdout: "" }));

      if (!containerList.includes("tei-server")) {
        throw new Error("TEI Docker container 'tei-server' not found. Please run setup script first.");
      }

      // Start the container
      await execPromise("docker start tei-server", { windowsHide: true });
      this.log?.info("Started TEI Docker container");

      // Wait for container to be ready (max 30 seconds)
      const maxWaitTime = 30000;
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitTime) {
        const check = await fetch(`${this.baseUrl}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        }).catch(() => null);

        if (check?.ok) {
          this.log?.info("TEI container is ready");
          return;
        }

        // Wait 2 seconds before next check
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      throw new Error("TEI container started but did not become ready within 30 seconds");
    } catch (error: any) {
      this.log?.warn("Failed to auto-start TEI container", { error: error.message });
      throw new Error(`TEI auto-start failed: ${error.message}\nPlease start manually: docker start tei-server`);
    }
  }

  getDimension(): number | undefined {
    return this.info.dimension;
  }

  async embed(text: string, opts?: EmbedOptions): Promise<Float32Array> {
    this.log?.debug("embed()", { len: text?.length }, opts?.requestId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // TEI embed endpoint expects { inputs: string } or { inputs: string[] }
      const res = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: text }),
        signal: opts?.signal ?? controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`TEI HTTP ${res.status}: ${body}`);
      }

      const json: any = await res.json();

      // TEI returns array of embeddings: [[embedding1], [embedding2], ...]
      // For single input, we get [[embedding]]
      let embedding: number[];
      if (Array.isArray(json) && Array.isArray(json[0])) {
        embedding = json[0];
      } else if (Array.isArray(json)) {
        embedding = json;
      } else {
        throw new Error("TEI invalid response format");
      }

      const arr = new Float32Array(embedding);
      this.info.dimension = this.info.dimension ?? arr.length;
      return arr;
    } catch (error: any) {
      this.log?.error("embed failed", { error: error.message }, opts?.requestId, error);

      if (error.message?.includes("ECONNREFUSED")) {
        throw new Error(`TEI server not reachable at ${this.baseUrl}. Is Docker container running?`);
      }

      throw new Error(`TEI embed error: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async embedBatch(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]> {
    this.log?.debug("embedBatch()", { count: texts.length }, opts?.requestId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // TEI supports batch embedding with { inputs: string[] }
      const res = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: texts }),
        signal: opts?.signal ?? controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`TEI HTTP ${res.status}: ${body}`);
      }

      const json: any = await res.json();

      // TEI returns array of embeddings: [[emb1], [emb2], ...]
      if (!Array.isArray(json)) {
        throw new Error("TEI invalid batch response format");
      }

      const embeddings = json.map((emb: number[]) => {
        const arr = new Float32Array(emb);
        this.info.dimension = this.info.dimension ?? arr.length;
        return arr;
      });

      return embeddings;
    } catch (error: any) {
      this.log?.error("embedBatch failed", { error: error.message }, opts?.requestId, error);

      if (error.message?.includes("ECONNREFUSED")) {
        throw new Error(`TEI server not reachable at ${this.baseUrl}. Is Docker container running?`);
      }

      throw new Error(`TEI embedBatch error: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async close(): Promise<void> {}
}

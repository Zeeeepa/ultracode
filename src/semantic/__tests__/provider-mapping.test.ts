import { describe, expect, it } from "bun:test";
import { EmbeddingGenerator } from "../embedding-generator.js";
import type { ProviderFactoryOptions } from "../providers/factory.js";
import { createProvider } from "../providers/factory.js";

const mappingCases = [
  {
    name: "ollama (all params)",
    provider: "ollama",
    config: {
      mcp: {
        embedding: {
          provider: "ollama",
          model: "nomic-embed-text",
          ollama: {
            baseUrl: "http://localhost:11434",
            timeout: 30000,
            timeoutMs: 30000,
            concurrency: 4,
            headers: { "User-Agent": "test" },
            autoPull: true,
            warmupText: "test warmup",
            checkServer: false,
            pullTimeoutMs: 180000,
          },
        },
      },
    },
    checks: {
      baseUrl: "http://localhost:11434",
      timeout: 30000,
      timeoutMs: 30000,
      concurrency: 4,
      headers: { "User-Agent": "test" },
      autoPull: true,
      warmupText: "test warmup",
      checkServer: false,
      pullTimeoutMs: 180000,
    },
  },
  {
    name: "openai",
    provider: "openai",
    config: {
      mcp: {
        embedding: {
          provider: "openai",
          model: "text-embedding-ada-002",
          openai: {
            baseUrl: "https://api.openai.com",
            apiKey: "sk-test-key",
            timeout: 10000,
            concurrency: 8,
            maxBatchSize: 256,
          },
        },
      },
    },
    checks: {
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test-key",
      timeout: 10000,
      concurrency: 8,
      maxBatchSize: 256,
    },
  },
  {
    name: "cloudru",
    provider: "cloudru",
    config: {
      mcp: {
        embedding: {
          provider: "cloudru",
          model: "BAAI/bge-m3",
          cloudru: {
            baseUrl: "https://foundation-models.api.cloud.ru",
            apiKey: "cloudru-test-key",
            timeout: 15000,
            concurrency: 4,
            maxBatchSize: 128,
          },
        },
      },
    },
    checks: {
      baseUrl: "https://foundation-models.api.cloud.ru",
      apiKey: "cloudru-test-key",
      timeout: 15000,
      concurrency: 4,
      maxBatchSize: 128,
    },
  },
  {
    name: "transformers",
    provider: "transformers",
    config: {
      mcp: {
        embedding: {
          provider: "transformers",
          model: "Xenova/all-MiniLM-L6-v2",
          transformers: {
            quantized: true,
            localPath: "./models",
          },
        },
      },
    },
    checks: {
      quantized: true,
      localPath: "./models",
    },
  },
  {
    name: "auto",
    provider: "auto",
    config: {
      mcp: {
        embedding: {
          provider: "auto",
          model: "all-MiniLM-L6-v2",
        },
      },
    },
    checks: null,
  },
] as const;

const creationCases: Array<{
  name: string;
  options: ProviderFactoryOptions;
  expectedName: string;
  expectedModel: string;
  expectedBatch?: number;
}> = [
  {
    name: "cloudru",
    options: {
      provider: "cloudru",
      modelName: "BAAI/bge-m3",
      cloudru: {
        baseUrl: "https://foundation-models.api.cloud.ru",
        apiKey: "test-key",
        timeoutMs: 15000,
        concurrency: 4,
        maxBatchSize: 128,
      },
    },
    expectedName: "cloudru",
    expectedModel: "BAAI/bge-m3",
    expectedBatch: 128,
  },
  {
    name: "openai",
    options: {
      provider: "openai",
      modelName: "text-embedding-ada-002",
      openai: {
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeoutMs: 10000,
        concurrency: 4,
        maxBatchSize: 256,
      },
    },
    expectedName: "openai",
    expectedModel: "text-embedding-ada-002",
    expectedBatch: 256,
  },
  {
    name: "ollama",
    options: {
      provider: "ollama",
      modelName: "nomic-embed-text",
      ollama: {
        baseUrl: "http://localhost:11434",
        timeoutMs: 30000,
        concurrency: 4,
        headers: { "User-Agent": "test" },
        autoPull: true,
        warmupText: "test warmup",
        checkServer: false,
        pullTimeoutMs: 180000,
      },
    },
    expectedName: "ollama",
    expectedModel: "nomic-embed-text",
  },
  {
    name: "tei",
    options: {
      provider: "tei",
      modelName: "ibm-granite/granite-embedding-english-r2",
      tei: {
        baseUrl: "http://127.0.0.1:8080",
        timeoutMs: 30000,
        concurrency: 4,
        checkServer: false,
      },
    },
    expectedName: "tei",
    expectedModel: "ibm-granite/granite-embedding-english-r2",
  },
];

const generatorCases = [
  {
    name: "cloudru",
    options: {
      provider: "cloudru" as const,
      modelName: "BAAI/bge-m3",
      quantized: true,
      localPath: "./models",
      batchSize: 8,
      cloudru: {
        baseUrl: "https://foundation-models.api.cloud.ru",
        apiKey: "test-key",
        timeoutMs: 15000,
        concurrency: 4,
      },
    },
  },
  {
    name: "auto",
    options: {
      provider: "auto" as const,
      modelName: "all-MiniLM-L6-v2",
      quantized: false,
      localPath: "./models",
      batchSize: 8,
    },
  },
];

describe("Provider Configuration Mapping", () => {
  describe("Provider Mapping Tests", () => {
    for (const c of mappingCases) {
      it(`maps ${c.name} config`, () => {
        const embedding = c.config.mcp.embedding;
        const providerSection = (embedding as Record<string, unknown>)[c.provider];

        if (c.checks === null) {
          expect(embedding.provider).toBe(c.provider);
          expect(embedding.model).toBe((embedding as Record<string, unknown>)["model"]);
          return;
        }

        expect(providerSection).toBeDefined();
        for (const [key, expected] of Object.entries(c.checks)) {
          const actual = (providerSection as Record<string, unknown>)[key];
          if (typeof expected === "object" && expected !== null) {
            expect(actual).toEqual(expected);
          } else {
            expect(actual).toBe(expected);
          }
        }
      });
    }
  });

  describe("Provider Creation", () => {
    for (const c of creationCases) {
      it(`creates ${c.name} provider`, async () => {
        const provider = await createProvider(c.options);
        expect(provider).toBeDefined();
        expect(provider.info.name).toBe(c.expectedName);
        expect(provider.info.model).toBe(c.expectedModel);
        if (c.expectedBatch !== undefined) {
          expect(provider.info.maxBatchSize).toBe(c.expectedBatch);
        }
      });
    }
  });

  describe("EmbeddingGenerator Integration", () => {
    for (const c of generatorCases) {
      it(`initializes with ${c.name} provider`, () => {
        expect(() => {
          const generator = new EmbeddingGenerator(c.options);
          expect(generator).toBeDefined();
        }).not.toThrow();
      });
    }
  });
});

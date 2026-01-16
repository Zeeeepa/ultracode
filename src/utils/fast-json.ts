/**
 * Fast JSON stringify utilities using fast-json-stringify
 * 2-5x faster than JSON.stringify for known schemas
 */

import fastJson, { type Schema } from "fast-json-stringify";

// ============================================================================
// Ollama Provider Schemas
// ============================================================================

const ollamaEmbeddingSchema: Schema = {
  type: "object",
  properties: {
    model: { type: "string" },
    prompt: { type: "string" },
  },
  required: ["model", "prompt"],
};

const ollamaPullSchema: Schema = {
  type: "object",
  properties: {
    name: { type: "string" },
  },
  required: ["name"],
};

// ============================================================================
// TEI Provider Schemas
// ============================================================================

const teiSingleSchema: Schema = {
  type: "object",
  properties: {
    inputs: { type: "string" },
  },
  required: ["inputs"],
};

const teiBatchSchema: Schema = {
  type: "object",
  properties: {
    inputs: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["inputs"],
};

const teiRerankSchema: Schema = {
  type: "object",
  properties: {
    query: { type: "string" },
    texts: {
      type: "array",
      items: { type: "string" },
    },
    truncate: { type: "boolean" },
  },
  required: ["query", "texts"],
};

// ============================================================================
// vLLM/OpenAI-compatible Provider Schemas
// ============================================================================

const openaiEmbeddingSchema: Schema = {
  type: "object",
  properties: {
    model: { type: "string" },
    input: {
      anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    },
    encoding_format: { type: "string" },
  },
  required: ["input"],
};

const vllmEmbeddingSchema: Schema = {
  type: "object",
  properties: {
    input: {
      anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    },
    model: { type: "string" },
  },
  required: ["input"],
};

// ============================================================================
// vLLM Rerank/Score Schemas
// ============================================================================

const vllmRerankSchema: Schema = {
  type: "object",
  properties: {
    model: { type: "string" },
    query: { type: "string" },
    documents: {
      type: "array",
      items: { type: "string" },
    },
    top_n: { type: "integer" },
  },
  required: ["model", "query", "documents"],
};

const vllmScoreSchema: Schema = {
  type: "object",
  properties: {
    model: { type: "string" },
    text_1: { type: "string" },
    text_2: {
      anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    },
  },
  required: ["model", "text_1", "text_2"],
};

// ============================================================================
// llama.cpp Provider Schemas
// ============================================================================

const llamacppEmbeddingSchema: Schema = {
  type: "object",
  properties: {
    content: { type: "string" },
  },
  required: ["content"],
};

const llamacppBatchSchema: Schema = {
  type: "object",
  properties: {
    content: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["content"],
};

// ============================================================================
// OVMS Provider Schemas (v3 REST API)
// ============================================================================

const ovmsInferSchema: Schema = {
  type: "object",
  properties: {
    inputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          shape: {
            type: "array",
            items: { type: "integer" },
          },
          datatype: { type: "string" },
          data: {
            type: "array",
            items: {
              anyOf: [{ type: "integer" }, { type: "array", items: { type: "integer" } }],
            },
          },
        },
      },
    },
  },
  required: ["inputs"],
};

// ============================================================================
// CloudRU Provider Schemas
// ============================================================================

const cloudruEmbeddingSchema: Schema = {
  type: "object",
  properties: {
    model: { type: "string" },
    input: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["model", "input"],
};

// ============================================================================
// Generic Schemas
// ============================================================================

const stringArraySchema: Schema = {
  type: "array",
  items: { type: "string" },
};

const numberArraySchema: Schema = {
  type: "array",
  items: { type: "number" },
};

// ============================================================================
// Compiled Stringifiers
// ============================================================================

export const stringify = {
  // Ollama
  ollamaEmbedding: fastJson(ollamaEmbeddingSchema),
  ollamaPull: fastJson(ollamaPullSchema),

  // TEI
  teiSingle: fastJson(teiSingleSchema),
  teiBatch: fastJson(teiBatchSchema),
  teiRerank: fastJson(teiRerankSchema),

  // OpenAI/vLLM
  openaiEmbedding: fastJson(openaiEmbeddingSchema),
  vllmEmbedding: fastJson(vllmEmbeddingSchema),
  vllmRerank: fastJson(vllmRerankSchema),
  vllmScore: fastJson(vllmScoreSchema),

  // llama.cpp
  llamacppEmbedding: fastJson(llamacppEmbeddingSchema),
  llamacppBatch: fastJson(llamacppBatchSchema),

  // OVMS
  ovmsInfer: fastJson(ovmsInferSchema),

  // CloudRU
  cloudruEmbedding: fastJson(cloudruEmbeddingSchema),

  // Generic
  stringArray: fastJson(stringArraySchema),
  numberArray: fastJson(numberArraySchema),
};

// ============================================================================
// Type definitions for the schemas
// ============================================================================

export interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

export interface OllamaPullRequest {
  name: string;
}

export interface TeiSingleRequest {
  inputs: string;
}

export interface TeiBatchRequest {
  inputs: string[];
}

export interface TeiRerankRequest {
  query: string;
  texts: string[];
  truncate?: boolean;
}

export interface OpenAIEmbeddingRequest {
  model?: string;
  input: string | string[];
  encoding_format?: string;
}

export interface VllmEmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface VllmRerankRequest {
  model: string;
  query: string;
  documents: string[];
  top_n?: number;
}

export interface VllmScoreRequest {
  model: string;
  text_1: string;
  text_2: string | string[];
}

export interface LlamacppEmbeddingRequest {
  content: string;
}

export interface LlamacppBatchRequest {
  content: string[];
}

export interface OvmsInput {
  name: string;
  shape: number[];
  datatype: string;
  data: (number | number[])[];
}

export interface OvmsInferRequest {
  inputs: OvmsInput[];
}

export interface CloudruEmbeddingRequest {
  model: string;
  input: string[];
}

export default stringify;

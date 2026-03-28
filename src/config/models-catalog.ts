/**
 * Embedding Models Catalog — shared with ultracode.zig
 *
 * Parses models.json (synced from Zig project) and provides
 * typed access to available embedding models with CDN URLs.
 *
 * models.json contains 10 models: Arctic XS, E5 Small/Base,
 * MiniLM, Nomic, MxbAI, GTE ModernBERT, etc.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// =============================================================================
// Types
// =============================================================================

export interface EmbeddingModel {
  id: string;
  name: string;
  hfRepo: string;
  onnxFile: string;
  tokenizerFile: string;
  dimension: number;
  maxTokens: number;
  sizeMb: number;
  lang: "en" | "multi";
  note: string;
  mtebScore: number | undefined;
  disabled?: boolean;
  disabledReason: string | undefined;
  cdn: Record<string, string>;
}

export interface ModelsCatalog {
  active: string;
  cdnBase: string;
  models: EmbeddingModel[];
}

// =============================================================================
// Catalog Loading
// =============================================================================

let _cached: ModelsCatalog | null = null;

/**
 * Load the models catalog from models.json.
 * Cached after first load.
 */
export function loadModelsCatalog(): ModelsCatalog {
  if (_cached) return _cached;

  try {
    // Try loading from config directory (installed package)
    const configDir = dirname(fileURLToPath(import.meta.url));
    const jsonPath = join(configDir, "models.json");
    const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
    _cached = parseCatalog(raw);
    return _cached;
  } catch {
    // Fallback: return minimal catalog with default model
    _cached = {
      active: "multilingual-e5-small",
      cdnBase: "",
      models: [{
        id: "multilingual-e5-small",
        name: "E5 Small",
        hfRepo: "intfloat/multilingual-e5-small",
        onnxFile: "onnx/model.onnx",
        tokenizerFile: "tokenizer.json",
        dimension: 384,
        maxTokens: 512,
        sizeMb: 118,
        lang: "multi",
        note: "Fast, 94 languages",
        mtebScore: undefined,
        disabledReason: undefined,
        cdn: {},
      }],
    };
    return _cached;
  }
}

function parseCatalog(raw: Record<string, unknown>): ModelsCatalog {
  const models: EmbeddingModel[] = [];
  const rawModels = (raw["models"] as Array<Record<string, unknown>>) ?? [];

  for (const m of rawModels) {
    models.push({
      id: String(m["id"] ?? ""),
      name: String(m["name"] ?? ""),
      hfRepo: String(m["hf_repo"] ?? ""),
      onnxFile: String(m["onnx_file"] ?? ""),
      tokenizerFile: String(m["tokenizer_file"] ?? ""),
      dimension: Number(m["dimension"] ?? 384),
      maxTokens: Number(m["max_tokens"] ?? 512),
      sizeMb: Number(m["size_mb"] ?? 0),
      lang: String(m["lang"] ?? "en") as "en" | "multi",
      note: String(m["note"] ?? ""),
      mtebScore: m["mteb_score"] != null ? Number(m["mteb_score"]) : undefined,
      disabled: m["disabled"] === true,
      disabledReason: m["disabled_reason"] ? String(m["disabled_reason"]) : undefined,
      cdn: (m["cdn"] as Record<string, string>) ?? {},
    });
  }

  return {
    active: String(raw["active"] ?? "multilingual-e5-small"),
    cdnBase: String(raw["cdn_base"] ?? ""),
    models,
  };
}

// =============================================================================
// Query Helpers
// =============================================================================

/** Get the active model */
export function getActiveModel(): EmbeddingModel | null {
  const catalog = loadModelsCatalog();
  return catalog.models.find((m) => m.id === catalog.active && !m.disabled) ?? null;
}

/** Get model by ID */
export function getModelById(id: string): EmbeddingModel | null {
  const catalog = loadModelsCatalog();
  return catalog.models.find((m) => m.id === id) ?? null;
}

/** Get all available (non-disabled) models */
export function getAvailableModels(): EmbeddingModel[] {
  const catalog = loadModelsCatalog();
  return catalog.models.filter((m) => !m.disabled);
}

/** Get CDN URL for a model artifact */
export function getCdnUrl(modelId: string, artifact: string): string | null {
  const catalog = loadModelsCatalog();
  const model = catalog.models.find((m) => m.id === modelId);
  if (!model) return null;
  const path = model.cdn[artifact];
  if (!path) return null;
  return catalog.cdnBase + path;
}

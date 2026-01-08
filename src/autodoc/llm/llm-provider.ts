/**
 * LLM Provider Abstraction for AutoDoc
 *
 * Supports multiple backends:
 * - Ollama (local, recommended)
 * - TGI (Text Generation Inference)
 * - OpenAI API compatible endpoints
 */

export interface LLMConfig {
  provider: "ollama" | "tgi" | "openai" | "docker-model-runner" | "llamacpp";
  baseUrl: string;
  model: string;
  apiKey?: string | undefined;
  maxTokens?: number | undefined;
  temperature?: number;
  /** For llamacpp: GPU layers. 0=CPU, 99=full GPU. Auto-detected from VRAM if not set. */
  nGpuLayers?: number;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  readonly isAvailable: boolean;

  generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse>;
  checkHealth(): Promise<boolean>;
  listModels(): Promise<string[]>;
}

export interface GenerateOptions {
  maxTokens?: number | undefined;
  temperature?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

const DEFAULT_TIMEOUT = 120000; // 120s for generation (larger models need more time)

// Preferred LLM models for code documentation (best first)
const PREFERRED_LLM_MODELS = [
  "devstral-small", // 24B, excels at codebase exploration & multi-file editing
  "qwen3-coder:30b", // MoE, 262K context, best quality
  "qwen3-coder:8b", // Dense, 262K context
  "qwen2.5-coder:14b", // 128K context, excellent
  "qwen2.5-coder:7b", // 128K context, good
  "yi-coder:9b", // 128K context
  "codestral", // Mamba, 256K context
  "deepseek-r1:7b", // Reasoning model
  "deepseek-coder:6.7b", // Legacy, 16K context
  "codellama:7b", // Fallback
  "mistral:7b", // General purpose
];

/**
 * Ollama Provider
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private _isAvailable = false;
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl?: string | undefined; model?: string }) {
    this.baseUrl = config.baseUrl || "http://localhost:11434";
    this.model = config.model || ""; // Will be auto-selected in checkHealth
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  get selectedModel(): string {
    return this.model;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this._isAvailable = false;
        return false;
      }

      // Auto-select best available model if not specified
      if (!this.model) {
        const models = await this.listModels();
        this.model = this.selectBestModel(models);
      }

      this._isAvailable = !!this.model;
      return this._isAvailable;
    } catch {
      this._isAvailable = false;
      return false;
    }
  }

  private selectBestModel(availableModels: string[]): string {
    // Normalize model names (remove :latest suffix for comparison)
    const normalize = (m: string) => m.replace(/:latest$/, "");
    const available = new Set(availableModels.map(normalize));

    // Find first preferred model that's available
    for (const preferred of PREFERRED_LLM_MODELS) {
      if (available.has(preferred) || available.has(normalize(preferred))) {
        // Return the actual model name from availableModels
        const match = availableModels.find((m) => normalize(m) === preferred || normalize(m) === normalize(preferred));
        return match || preferred;
      }
    }

    // Fallback: find any coder/code model
    const coderModel = availableModels.find((m) => m.includes("coder") || m.includes("code"));
    if (coderModel) return coderModel;

    // Last resort: first non-embedding model
    const llmModel = availableModels.find((m) => !m.includes("embed") && !m.includes("minilm") && !m.includes("nomic"));
    return llmModel || "";
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = (await response.json()) as { models?: { name: string }[] };
      return (data.models || []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
        stream: false,
        options: {
          num_predict: options?.maxTokens || 2048,
          temperature: options?.temperature || 0.3,
          stop: options?.stopSequences,
        },
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      response?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      text: data.response || "",
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
      },
    };
  }
}

/**
 * TGI (Text Generation Inference) Provider
 */
export class TGIProvider implements LLMProvider {
  readonly name = "tgi";
  private _isAvailable = false;
  private baseUrl: string;

  constructor(config: { baseUrl?: string }) {
    this.baseUrl = config.baseUrl || "http://localhost:8081";
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      this._isAvailable = response.ok;
      return this._isAvailable;
    } catch {
      this._isAvailable = false;
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/info`);
      if (!response.ok) return [];
      const data = (await response.json()) as { model_id?: string };
      return data.model_id ? [data.model_id] : [];
    } catch {
      return [];
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const fullPrompt = options?.systemPrompt
      ? `<|system|>\n${options.systemPrompt}<|end|>\n<|user|>\n${prompt}<|end|>\n<|assistant|>\n`
      : prompt;

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: options?.maxTokens || 2048,
          temperature: options?.temperature || 0.3,
          stop: options?.stopSequences,
          do_sample: true,
        },
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`TGI error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { generated_text?: string };
    return {
      text: data.generated_text || "",
    };
  }
}

/**
 * OpenAI-compatible Provider (works with vLLM, LocalAI, etc.)
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private _isAvailable = false;
  private baseUrl: string;
  private model: string;
  private apiKey: string;

  constructor(config: { baseUrl?: string | undefined; model?: string | undefined; apiKey?: string }) {
    this.baseUrl = config.baseUrl || "http://localhost:8000/v1";
    this.model = config.model || "gpt-3.5-turbo";
    this.apiKey = config.apiKey || "not-needed";
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      this._isAvailable = response.ok;
      return this._isAvailable;
    } catch {
      this._isAvailable = false;
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { data?: { id: string }[] };
      return (data.data || []).map((m) => m.id);
    } catch {
      return [];
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const messages: { role: string; content: string }[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.3,
        stop: options?.stopSequences,
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: data.choices?.[0]?.message?.content || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }
}

// Docker Model Runner recommended models for autodoc
const DMR_PREFERRED_MODELS = [
  // Quality (best reasoning)
  "ai/qwen2.5", // Best multilingual, RU/EN
  "ai/deepseek-r1-distill-llama", // Best reasoning
  // Fast (smaller, quicker response)
  "ai/phi4", // Compact, fast
  "ai/llama3.2", // Fast, good quality
];

/**
 * Docker Model Runner Provider (Docker Desktop 4.40+)
 * Uses OpenAI-compatible API via docker model CLI
 */
export class DockerModelRunnerProvider implements LLMProvider {
  readonly name = "docker-model-runner";
  private _isAvailable = false;
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl?: string | undefined; model?: string }) {
    // Docker Model Runner API endpoint (from host)
    this.baseUrl = config.baseUrl || "http://localhost:12434/engines/llama.cpp/v1";
    this.model = config.model || "";
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  get selectedModel(): string {
    return this.model;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this._isAvailable = false;
        return false;
      }

      // Auto-select best available model if not specified
      if (!this.model) {
        const models = await this.listModels();
        this.model = this.selectBestModel(models);
      }

      this._isAvailable = !!this.model;
      return this._isAvailable;
    } catch {
      this._isAvailable = false;
      return false;
    }
  }

  private selectBestModel(availableModels: string[]): string {
    // Find first preferred model that's available
    for (const preferred of DMR_PREFERRED_MODELS) {
      if (availableModels.includes(preferred)) {
        return preferred;
      }
    }

    // Fallback: first available model
    return availableModels[0] || "";
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`);
      if (!response.ok) return [];
      const data = (await response.json()) as { data?: { id: string }[] };
      return (data.data || []).map((m) => m.id);
    } catch {
      return [];
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const messages: { role: string; content: string }[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.3,
        stop: options?.stopSequences,
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Docker Model Runner error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: data.choices?.[0]?.message?.content || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }
}

/**
 * llama.cpp LLM Provider (Native GGUF)
 * Uses OpenAI-compatible API (/v1/chat/completions)
 *
 * Priority: Embedding gets GPU, LLM runs on CPU (nGpuLayers: 0)
 */
export class LlamaCppLLMProvider implements LLMProvider {
  readonly name = "llamacpp";
  private _isAvailable = false;
  private baseUrl: string;
  private model: string;
  private nGpuLayers: number | undefined;
  private autoStartAttempted = false;
  private autoStartEnabled: boolean;

  constructor(config: { baseUrl?: string | undefined; model?: string; nGpuLayers?: number; autoStart?: boolean }) {
    // llama.cpp LLM port (separate from embedding port 8085)
    this.baseUrl = config.baseUrl || "http://127.0.0.1:8086";
    this.model = config.model || "gguf";
    // undefined = auto-detect from VRAM at runtime
    // 0 = CPU-only, 99 = full GPU
    this.nGpuLayers = config.nGpuLayers;
    // autoStart: true = start llama-server if not running (for explicitly selected provider)
    // autoStart: false = only check if running, don't start (for fallback providers)
    this.autoStartEnabled = config.autoStart !== false;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  get selectedModel(): string {
    return this.model;
  }

  /**
   * Find LLM GGUF model path
   */
  private findLLMModelPath(): string | null {
    try {
      const { existsSync, readdirSync } = require("node:fs");
      const { join } = require("node:path");
      const dataDir = process.env["LOCALAPPDATA"]
        ? join(process.env["LOCALAPPDATA"], "UltraScriptTools")
        : join(require("node:os").homedir(), ".ultrascript-tools");

      // Search for LLM GGUF models (not embedding models)
      const searchDirs = [join(dataDir, "hf-cache"), join(dataDir, "llamacpp", "models"), join(dataDir, "models")];

      const llmPatterns = ["qwen", "deepseek", "codestral", "mistral", "llama", "phi"];
      const embeddingPatterns = ["e5", "minilm", "bge", "nomic", "embed"];

      for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        try {
          const files = readdirSync(dir) as string[];
          for (const file of files) {
            if (!file.endsWith(".gguf")) continue;
            const lower = file.toLowerCase();
            // Skip embedding models
            if (embeddingPatterns.some((p) => lower.includes(p))) continue;
            // Prefer LLM models
            if (llmPatterns.some((p) => lower.includes(p))) {
              return join(dir, file);
            }
          }
          // Fallback: any non-embedding GGUF
          for (const file of files) {
            if (!file.endsWith(".gguf")) continue;
            const lower = file.toLowerCase();
            if (!embeddingPatterns.some((p) => lower.includes(p))) {
              return join(dir, file);
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  async checkHealth(): Promise<boolean> {
    // Try existing server first
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        this._isAvailable = true;
        return true;
      }
    } catch {
      // Server not running
    }

    // Auto-start if not attempted yet AND autoStart is enabled
    // autoStart is disabled for fallback providers to prevent unwanted server starts
    if (!this.autoStartAttempted && this.autoStartEnabled) {
      this.autoStartAttempted = true;
      const modelPath = this.findLLMModelPath();

      if (modelPath) {
        try {
          // Auto-detect VRAM if nGpuLayers not configured
          let gpuLayers = this.nGpuLayers;
          if (gpuLayers === undefined) {
            const vram = await detectVRAM();
            gpuLayers = calculateLLMGpuLayers(vram);
          }

          // Dynamic import to avoid circular dependencies
          const { llamacppLLMManager, LLAMACPP_LLM_PORT } = await import("../../semantic/llamacpp-server-manager.js");

          const started = await llamacppLLMManager.ensureRunning({
            modelPath,
            mode: "llm",
            port: LLAMACPP_LLM_PORT,
            contextSize: 8192,
            nGpuLayers: gpuLayers,
          });

          if (started) {
            this._isAvailable = true;
            return true;
          }
        } catch {
          // Auto-start failed
        }
      }
    }

    this._isAvailable = false;
    return false;
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) return [this.model];
      const data = (await response.json()) as { data?: { id: string }[] };
      return (data.data || []).map((m) => m.id);
    } catch {
      return [this.model];
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const messages: { role: string; content: string }[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.3,
        stop: options?.stopSequences,
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`llama.cpp error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: data.choices?.[0]?.message?.content || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }
}

/**
 * Detect available VRAM in MB
 * Returns 0 if detection fails or no GPU
 */
async function detectVRAM(): Promise<number> {
  try {
    const { execSync } = require("node:child_process");

    // Try nvidia-smi first (NVIDIA GPUs)
    try {
      const output = execSync("nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits", {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
      }).trim();
      const vramMB = parseInt(output.split("\n")[0], 10);
      if (vramMB > 0) return vramMB;
    } catch {
      // nvidia-smi not available
    }

    // Try rocm-smi for AMD GPUs
    try {
      const output = execSync("rocm-smi --showmeminfo vram --csv", {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
      }).trim();
      // Parse AMD output (format varies)
      const match = output.match(/(\d+)\s*MB/i);
      if (match) return parseInt(match[1], 10);
    } catch {
      // rocm-smi not available
    }
  } catch {
    // Detection failed
  }
  return 0;
}

/**
 * Calculate optimal nGpuLayers for LLM based on available VRAM
 *
 * Memory estimates (approximate):
 * - Embedding model (e5-base Q8 GGUF): ~1-2GB VRAM
 * - LLM 7B Q4: ~4-5GB VRAM
 * - LLM 7B Q8: ~7-8GB VRAM
 * - LLM 14B Q4: ~8-9GB VRAM
 *
 * Strategy (after reserving ~2GB for embedding):
 * - VRAM >= 16GB: Both full GPU (99 layers) - can run 14B+ models
 * - VRAM >= 10GB: Both on GPU (99 layers) - 7B models comfortably
 * - VRAM >= 8GB: Both on GPU (99 layers) - 7B Q4 fits
 * - VRAM >= 6GB: LLM partial GPU (30 layers)
 * - VRAM < 6GB: LLM on CPU (0 layers)
 */
function calculateLLMGpuLayers(vramMB: number): number {
  if (vramMB >= 8000) return 99; // Full GPU: embedding (~2GB) + LLM 7B Q4 (~5GB) = ~7GB
  if (vramMB >= 6000) return 30; // Partial GPU for LLM
  return 0; // CPU-only for LLM (embedding still uses GPU)
}

/**
 * Load LLM config from semantic-config.json
 */
async function loadLLMConfig(): Promise<{
  provider?: string;
  model?: string | undefined;
  endpoint?: string;
  nGpuLayers?: number;
} | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");

    // Check standard config locations
    const configPaths = [
      join(process.env["LOCALAPPDATA"] || "", "UltraScriptTools", "config", "semantic-config.json"),
      join(homedir(), ".ultrascript-tools", "config", "semantic-config.json"),
    ].filter((p) => p && !p.startsWith(join(""))); // Filter out empty paths

    for (const configPath of configPaths) {
      try {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.llm) {
          return {
            // Support both "provider" and "platform" field names
            provider: config.llm.provider || config.llm.platform,
            model: config.llm.model,
            endpoint: config.llm.endpoint,
            nGpuLayers: config.llm.nGpuLayers, // For high-VRAM systems
          };
        }
      } catch {
        // Config file doesn't exist, try next
      }
    }
  } catch {
    // fs/promises not available or other error
  }
  return null;
}

/**
 * Auto-detect available LLM providers
 */
export async function detectLLMProviders(): Promise<{
  available: LLMProvider[];
  recommended: LLMProvider | null;
}> {
  // Try to load config first
  const savedConfig = await loadLLMConfig();

  const providers: LLMProvider[] = [];

  // If config specifies a provider, create it first with configured model
  if (savedConfig?.provider === "ollama") {
    providers.push(
      new OllamaProvider({
        baseUrl: savedConfig.endpoint,
        model: savedConfig.model,
      }),
    );
  } else if (savedConfig?.provider === "tgi") {
    providers.push(new TGIProvider({ baseUrl: savedConfig.endpoint }));
  } else if (savedConfig?.provider === "openai") {
    providers.push(
      new OpenAIProvider({
        baseUrl: savedConfig.endpoint,
        model: savedConfig.model,
      }),
    );
  } else if (savedConfig?.provider === "docker-model-runner") {
    providers.push(
      new DockerModelRunnerProvider({
        baseUrl: savedConfig.endpoint,
        model: savedConfig.model,
      }),
    );
  } else if (savedConfig?.provider === "llamacpp") {
    // Use configured nGpuLayers, or auto-detect from VRAM
    let nGpuLayers = savedConfig.nGpuLayers;
    if (nGpuLayers === undefined) {
      const vram = await detectVRAM();
      nGpuLayers = calculateLLMGpuLayers(vram);
    }
    providers.push(
      new LlamaCppLLMProvider({
        baseUrl: savedConfig.endpoint,
        model: savedConfig.model,
        nGpuLayers,
      }),
    );
  }

  // Add default providers if not already added
  // Docker Model Runner first (simplest if available)
  if (!providers.some((p) => p.name === "docker-model-runner")) {
    providers.push(new DockerModelRunnerProvider({}));
  }
  if (!providers.some((p) => p.name === "ollama")) {
    providers.push(new OllamaProvider({}));
  }
  if (!providers.some((p) => p.name === "llamacpp")) {
    // Auto-detect VRAM for default LlamaCpp provider
    // autoStart: false - don't auto-start server for fallback provider
    const vram = await detectVRAM();
    const nGpuLayers = calculateLLMGpuLayers(vram);
    providers.push(new LlamaCppLLMProvider({ nGpuLayers, autoStart: false }));
  }
  if (!providers.some((p) => p.name === "tgi")) {
    providers.push(new TGIProvider({}));
  }
  if (!providers.some((p) => p.name === "openai")) {
    providers.push(new OpenAIProvider({}));
  }

  const available: LLMProvider[] = [];

  await Promise.all(
    providers.map(async (provider) => {
      const ok = await provider.checkHealth();
      if (ok) available.push(provider);
    }),
  );

  // Prefer configured provider > Docker Model Runner > Ollama > TGI > OpenAI
  let recommended: LLMProvider | null = null;
  if (savedConfig?.provider) {
    recommended = available.find((p) => p.name === savedConfig.provider) || null;
  }
  if (!recommended) {
    recommended =
      available.find((p) => p.name === "docker-model-runner") ||
      available.find((p) => p.name === "ollama") ||
      available.find((p) => p.name === "tgi") ||
      available.find((p) => p.name === "openai") ||
      null;
  }

  return { available, recommended };
}

/**
 * Create LLM provider from config
 */
export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider({ baseUrl: config.baseUrl, model: config.model });
    case "tgi":
      return new TGIProvider({ baseUrl: config.baseUrl });
    case "openai":
      return new OpenAIProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
      });
    case "docker-model-runner":
      return new DockerModelRunnerProvider({
        baseUrl: config.baseUrl,
        model: config.model,
      });
    case "llamacpp":
      return new LlamaCppLLMProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        nGpuLayers: config.nGpuLayers, // Auto-detected if not set
      });
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

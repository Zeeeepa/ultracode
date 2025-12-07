/**
 * LLM Provider Abstraction for AutoDoc
 *
 * Supports multiple backends:
 * - Ollama (local, recommended)
 * - TGI (Text Generation Inference)
 * - OpenAI API compatible endpoints
 */

export interface LLMConfig {
  provider: "ollama" | "tgi" | "openai";
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
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
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

const DEFAULT_TIMEOUT = 120000; // 120s for generation (larger models need more time)

// Preferred LLM models for code documentation (best first)
const PREFERRED_LLM_MODELS = [
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

  constructor(config: { baseUrl?: string; model?: string }) {
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

  constructor(config: { baseUrl?: string; model?: string; apiKey?: string }) {
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

/**
 * Load LLM config from semantic-config.json
 */
async function loadLLMConfig(): Promise<{ provider?: string; model?: string; endpoint?: string } | null> {
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const { homedir } = await import("os");

    // Check standard config locations
    const configPaths = [
      join(process.env.LOCALAPPDATA || "", "UltraScriptTools", "config", "semantic-config.json"),
      join(homedir(), ".ultrascript-tools", "config", "semantic-config.json"),
    ].filter((p) => p && !p.startsWith(join(""))); // Filter out empty paths

    for (const configPath of configPaths) {
      try {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.llm) {
          return {
            provider: config.llm.provider,
            model: config.llm.model,
            endpoint: config.llm.endpoint,
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
  }

  // Add default providers if not already added
  if (!providers.some((p) => p.name === "ollama")) {
    providers.push(new OllamaProvider({}));
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

  // Prefer configured provider > Ollama > TGI > OpenAI
  let recommended: LLMProvider | null = null;
  if (savedConfig?.provider) {
    recommended = available.find((p) => p.name === savedConfig.provider) || null;
  }
  if (!recommended) {
    recommended =
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
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

export type ProviderKind = "memory" | "ollama" | "openai" | "cloudru" | "huggingface" | "tei" | "openvino" | "auto";

export interface ProviderInfo {
  name: ProviderKind | string;
  model: string;
  dimension?: number;
  supportsBatch: boolean;
  maxBatchSize?: number;
  /** Maximum context tokens (512, 8192, etc.) */
  maxTokens?: number;
}

export interface EmbedOptions {
  signal?: AbortSignal;
  requestId?: string;
}

export interface ProviderLogger {
  debug(msg: string, data?: any, requestId?: string): void;
  info(msg: string, data?: any, requestId?: string): void;
  warn(msg: string, data?: any, requestId?: string): void;
  error(msg: string, data?: any, requestId?: string, err?: Error): void;
}

export interface EmbeddingProvider {
  info: ProviderInfo;
  initialize(): Promise<void>;
  getDimension(): number | undefined;
  embed(text: string, opts?: EmbedOptions): Promise<Float32Array>;
  embedBatch?(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]>;
  close?(): Promise<void>;
}

declare module "@xenova/transformers" {
  /**
   * Progress callback for model loading
   */
  export interface ProgressInfo {
    status?: string;
    progress?: number;
    file?: string;
    loaded?: number;
    total?: number;
  }

  /**
   * Pipeline result for feature extraction
   */
  export interface PipelineResult {
    data?: Float32Array;
    [key: string]: unknown;
  }

  /**
   * Pipeline function returned by pipeline()
   */
  export interface Pipeline {
    (
      text: string | string[],
      options?: {
        pooling?: string;
        normalize?: boolean;
        [key: string]: unknown;
      },
    ): Promise<PipelineResult>;
    dispose?: () => void;
  }

  /**
   * Create a pipeline for a specific task
   */
  export function pipeline(
    task: string,
    model: string,
    options?: {
      quantized?: boolean;
      progress_callback?: (progress: ProgressInfo) => void;
      local_files_only?: boolean;
      [key: string]: unknown;
    },
  ): Promise<Pipeline>;
}

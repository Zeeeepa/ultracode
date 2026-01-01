/**
 * faiss-napi type declarations
 *
 * faiss-napi provides NAPI bindings for Faiss that work under both Node.js and Bun.
 * This declaration allows TypeScript to understand the module.
 */

declare module "faiss-napi" {
  interface SearchResult {
    distances: number[];
    labels: number[];
  }

  /** Base interface for all Faiss index types */
  interface FaissIndex {
    add(vectors: number[]): void;
    search(vectors: number[], k: number, nQueries?: number): SearchResult;
    train?(vectors: number[]): void;
    write(path: string): void;
    toBuffer(): Buffer;
    ntotal: number;
  }

  export class IndexFlatL2 implements FaissIndex {
    constructor(dimensions: number);
    add(vectors: number[]): void;
    search(vectors: number[], k: number, nQueries?: number): SearchResult;
    train?(vectors: number[]): void;
    write(path: string): void;
    toBuffer(): Buffer;
    ntotal: number;
    static fromBuffer(buffer: Buffer): IndexFlatL2;
  }

  export class IndexFlatIP implements FaissIndex {
    constructor(dimensions: number);
    add(vectors: number[]): void;
    search(vectors: number[], k: number, nQueries?: number): SearchResult;
    train?(vectors: number[]): void;
    write(path: string): void;
    toBuffer(): Buffer;
    ntotal: number;
    static fromBuffer(buffer: Buffer): IndexFlatIP;
  }

  export class IndexHNSW implements FaissIndex {
    constructor(dimensions: number, M?: number);
    add(vectors: number[]): void;
    search(vectors: number[], k: number, nQueries?: number): SearchResult;
    train?(vectors: number[]): void;
    write(path: string): void;
    toBuffer(): Buffer;
    ntotal: number;
    static fromBuffer(buffer: Buffer): IndexHNSW;
  }

  export namespace Index {
    function fromFactory(dimensions: number, factoryString: string, metricType?: string): FaissIndex;
    function fromBuffer(buffer: Buffer): FaissIndex;
    function read(path: string): FaissIndex;
  }
}

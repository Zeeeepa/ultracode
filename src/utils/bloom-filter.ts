/**
 * Simple Bloom Filter implementation inspired by Angular Ivy
 * Uses configurable bits for O(1) membership testing
 *
 * False positive rate: approximately (1 - e^(-k*n/m))^k
 * where k = hashCount, n = items, m = size (bits)
 *
 * With defaults (256 bits, 3 hashes):
 * - 50 items: ~5% false positive rate
 * - 100 items: ~18% false positive rate
 */
export class BloomFilter {
  private bits: Uint32Array;
  private readonly size: number;
  private readonly hashCount: number;

  constructor(size = 256, hashCount = 3) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint32Array(Math.ceil(size / 32));
  }

  /**
   * Add an item to the filter
   */
  add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const bit = this.hash(item, i) % this.size;
      const index = Math.floor(bit / 32);
      this.bits[index] = (this.bits[index] ?? 0) | (1 << (bit % 32));
    }
  }

  /**
   * Check if item might be in the filter
   * Returns false = definitely not in set
   * Returns true = might be in set (possible false positive)
   */
  mightContain(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const bit = this.hash(item, i) % this.size;
      const index = Math.floor(bit / 32);
      if (!((this.bits[index] ?? 0) & (1 << (bit % 32)))) {
        return false; // Definitely not in set
      }
    }
    return true; // Might be in set
  }

  /**
   * Clear all bits (reset filter)
   */
  clear(): void {
    this.bits.fill(0);
  }

  /**
   * Check if filter is empty (no items added)
   */
  isEmpty(): boolean {
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i] !== 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * FNV-1a hash with seed for different hash functions
   * Fast, good distribution, no external dependencies
   */
  private hash(str: string, seed: number): number {
    let hash = 2166136261 ^ seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash >>> 0;
  }
}

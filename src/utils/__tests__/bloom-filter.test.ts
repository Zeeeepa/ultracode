import { describe, expect, it } from "bun:test";
import { BloomFilter } from "../bloom-filter.js";

describe("BloomFilter", () => {
  describe("basic operations", () => {
    it("should return false for items never added", () => {
      const bloom = new BloomFilter();
      expect(bloom.mightContain("never-added")).toBe(false);
      expect(bloom.mightContain("also-not-added")).toBe(false);
      expect(bloom.mightContain("")).toBe(false);
    });

    it("should return true for added items", () => {
      const bloom = new BloomFilter();
      bloom.add("test-item");
      expect(bloom.mightContain("test-item")).toBe(true);
    });

    it("should handle multiple items", () => {
      const bloom = new BloomFilter();
      bloom.add("item-1");
      bloom.add("item-2");
      bloom.add("item-3");

      expect(bloom.mightContain("item-1")).toBe(true);
      expect(bloom.mightContain("item-2")).toBe(true);
      expect(bloom.mightContain("item-3")).toBe(true);
      expect(bloom.mightContain("item-4")).toBe(false);
    });

    it("should handle entity IDs (typical use case)", () => {
      const bloom = new BloomFilter(512);
      const ids = ["abc123def456", "entity_file_function_42", "src/utils/bloom.ts:class:BloomFilter:1"];

      for (const id of ids) {
        bloom.add(id);
      }

      for (const id of ids) {
        expect(bloom.mightContain(id)).toBe(true);
      }

      expect(bloom.mightContain("not-an-id")).toBe(false);
    });
  });

  describe("isEmpty", () => {
    it("should return true for new filter", () => {
      const bloom = new BloomFilter();
      expect(bloom.isEmpty()).toBe(true);
    });

    it("should return false after adding item", () => {
      const bloom = new BloomFilter();
      bloom.add("item");
      expect(bloom.isEmpty()).toBe(false);
    });

    it("should return true after clear", () => {
      const bloom = new BloomFilter();
      bloom.add("item");
      bloom.clear();
      expect(bloom.isEmpty()).toBe(true);
    });
  });

  describe("clear", () => {
    it("should reset filter state", () => {
      const bloom = new BloomFilter();
      bloom.add("test-item");
      expect(bloom.mightContain("test-item")).toBe(true);

      bloom.clear();
      expect(bloom.mightContain("test-item")).toBe(false);
      expect(bloom.isEmpty()).toBe(true);
    });
  });

  describe("false positive rate", () => {
    it("should have acceptable false positive rate with 50 items in 512-bit filter", () => {
      const bloom = new BloomFilter(512);
      const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);
      for (const item of items) {
        bloom.add(item);
      }

      let falsePositives = 0;
      const testCount = 1000;
      for (let i = 0; i < testCount; i++) {
        if (bloom.mightContain(`not-added-${i}`)) {
          falsePositives++;
        }
      }

      // With 50 items in 512-bit filter with 3 hashes: ~2-5% FP rate expected
      const fpRate = falsePositives / testCount;
      expect(fpRate).toBeLessThan(0.15); // Allow up to 15%
    });

    it("should have lower false positive rate with larger filter", () => {
      const smallBloom = new BloomFilter(256);
      const largeBloom = new BloomFilter(1024);

      const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);
      for (const item of items) {
        smallBloom.add(item);
        largeBloom.add(item);
      }

      let smallFP = 0;
      let largeFP = 0;
      const testCount = 1000;

      for (let i = 0; i < testCount; i++) {
        const testItem = `definitely-not-added-${i}`;
        if (smallBloom.mightContain(testItem)) smallFP++;
        if (largeBloom.mightContain(testItem)) largeFP++;
      }

      // Larger filter should have fewer false positives
      expect(largeFP).toBeLessThanOrEqual(smallFP);
    });

    it("should never have false negatives", () => {
      const bloom = new BloomFilter(128);
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);

      for (const item of items) {
        bloom.add(item);
      }

      // All added items must be found (no false negatives allowed)
      for (const item of items) {
        expect(bloom.mightContain(item)).toBe(true);
      }
    });
  });

  describe("different configurations", () => {
    it("should work with small filter size", () => {
      const bloom = new BloomFilter(32, 2);
      bloom.add("test");
      expect(bloom.mightContain("test")).toBe(true);
    });

    it("should work with large filter size", () => {
      const bloom = new BloomFilter(4096, 5);
      bloom.add("test");
      expect(bloom.mightContain("test")).toBe(true);
      expect(bloom.mightContain("not-test")).toBe(false);
    });

    it("should work with single hash function", () => {
      const bloom = new BloomFilter(256, 1);
      bloom.add("test");
      expect(bloom.mightContain("test")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty strings", () => {
      const bloom = new BloomFilter();
      bloom.add("");
      expect(bloom.mightContain("")).toBe(true);
    });

    it("should handle unicode strings", () => {
      const bloom = new BloomFilter();
      bloom.add("тест");
      bloom.add("测试");
      bloom.add("🎉");

      expect(bloom.mightContain("тест")).toBe(true);
      expect(bloom.mightContain("测试")).toBe(true);
      expect(bloom.mightContain("🎉")).toBe(true);
    });

    it("should handle very long strings", () => {
      const bloom = new BloomFilter();
      const longString = "a".repeat(10000);
      bloom.add(longString);
      expect(bloom.mightContain(longString)).toBe(true);
    });

    it("should distinguish similar strings", () => {
      const bloom = new BloomFilter(512);
      bloom.add("item-1");

      // These might have false positives, but shouldn't all be positive
      const similar = ["item-2", "item-10", "item-11", "items-1", "1-item"];
      let foundCount = 0;
      for (const s of similar) {
        if (bloom.mightContain(s)) foundCount++;
      }

      // With a 512-bit filter and only 1 item, very unlikely to have FP for all
      expect(foundCount).toBeLessThan(similar.length);
    });
  });
});

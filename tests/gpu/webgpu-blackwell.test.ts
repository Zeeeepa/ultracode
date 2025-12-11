/**
 * WebGPU/Blackwell Compatibility Tests
 *
 * These tests verify that:
 * 1. Blackwell GPUs (CC 12.x) are correctly detected as unsafe for WebGPU
 * 2. Environment variables correctly override behavior
 * 3. WebGPU detection is skipped on unsafe architectures
 *
 * IMPORTANT: These tests do NOT actually load WebGPU/Dawn to avoid crashes.
 * They test the safety detection logic only.
 *
 * To test actual WebGPU loading on a safe GPU:
 *   WEBGPU_FORCE_ENABLE=1 bun test tests/gpu/webgpu-blackwell.test.ts
 *
 * To test on Blackwell without WebGPU:
 *   bun test tests/gpu/webgpu-blackwell.test.ts
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  GPUDetector,
  WEBGPU_UNSAFE_MIN_CC,
  WEBGPU_UNSTABLE_ARCHITECTURES,
} from "../../src/gpu/detection/gpu-detector.js";

describe("GPUDetector - Blackwell Safety", () => {
  beforeEach(() => {
    // Clear cache before each test
    GPUDetector.clearCache();
    // Save original env
    delete process.env.WEBGPU_FORCE_ENABLE;
    delete process.env.WEBGPU_FORCE_DISABLE;
  });

  afterEach(() => {
    GPUDetector.clearCache();
  });

  describe("isWebGPUSafe", () => {
    test("should mark CC 12.0+ as unsafe (Blackwell)", () => {
      const result = GPUDetector.isWebGPUSafe({
        computeCapability: 12.0,
        model: "NVIDIA GeForce RTX 5090",
      });

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("Blackwell");
      expect(result.reason).toContain("CC 12");
    });

    test("should mark CC 12.1 as unsafe", () => {
      const result = GPUDetector.isWebGPUSafe({
        computeCapability: 12.1,
        model: "NVIDIA GeForce RTX 5060 Laptop GPU",
      });

      expect(result.safe).toBe(false);
    });

    test("should mark CC 11.0 as safe (Ada Lovelace)", () => {
      const result = GPUDetector.isWebGPUSafe({
        computeCapability: 8.9,
        model: "NVIDIA GeForce RTX 4090",
      });

      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("should mark CC 8.6 as safe (Ampere)", () => {
      const result = GPUDetector.isWebGPUSafe({
        computeCapability: 8.6,
        model: "NVIDIA GeForce RTX 3080",
      });

      expect(result.safe).toBe(true);
    });

    test("should detect unsafe by model name pattern", () => {
      const result = GPUDetector.isWebGPUSafe({
        model: "NVIDIA RTX 5080",
      });

      expect(result.safe).toBe(false);
      expect(result.reason).toContain("rtx 50");
    });

    test("should handle unknown GPU as safe", () => {
      const result = GPUDetector.isWebGPUSafe({
        model: "Unknown GPU",
      });

      expect(result.safe).toBe(true);
    });

    test("should handle empty info as safe", () => {
      const result = GPUDetector.isWebGPUSafe({});
      expect(result.safe).toBe(true);
    });
  });

  describe("Constants", () => {
    test("WEBGPU_UNSAFE_MIN_CC should be 12.0", () => {
      expect(WEBGPU_UNSAFE_MIN_CC).toBe(12.0);
    });

    test("WEBGPU_UNSTABLE_ARCHITECTURES should include blackwell patterns", () => {
      expect(WEBGPU_UNSTABLE_ARCHITECTURES).toContain("blackwell");
      expect(WEBGPU_UNSTABLE_ARCHITECTURES).toContain("rtx 50");
    });
  });

  describe("testWebGPUCompatibility", () => {
    test("should return compatibility info without crashing", async () => {
      const result = await GPUDetector.testWebGPUCompatibility();

      expect(result).toHaveProperty("cudaDetected");
      expect(result).toHaveProperty("computeCapability");
      expect(result).toHaveProperty("model");
      expect(result).toHaveProperty("webgpuSafe");
      expect(result).toHaveProperty("skipReason");
      expect(result).toHaveProperty("envOverride");
    });

    test("should detect env override WEBGPU_FORCE_ENABLE", async () => {
      process.env.WEBGPU_FORCE_ENABLE = "1";
      const result = await GPUDetector.testWebGPUCompatibility();
      expect(result.envOverride).toBe("force_enable");
    });

    test("should detect env override WEBGPU_FORCE_DISABLE", async () => {
      process.env.WEBGPU_FORCE_DISABLE = "1";
      const result = await GPUDetector.testWebGPUCompatibility();
      expect(result.envOverride).toBe("force_disable");
    });
  });

  describe("detect() with environment variables", () => {
    test("should skip WebGPU when WEBGPU_FORCE_DISABLE=1", async () => {
      process.env.WEBGPU_FORCE_DISABLE = "1";

      const info = await GPUDetector.detect();

      expect(info.webgpuSkipped).toBe(true);
      expect(info.webgpuSkipReason).toContain("WEBGPU_FORCE_DISABLE");
      expect(info.webgpuAvailable).toBe(false);
    });
  });

  describe("Cache management", () => {
    test("clearCache should reset cached info", async () => {
      // First detection
      await GPUDetector.detect();
      expect(GPUDetector.getCachedInfo()).not.toBeNull();

      // Clear
      GPUDetector.clearCache();
      expect(GPUDetector.getCachedInfo()).toBeNull();
    });

    test("detect should use cache on second call", async () => {
      const first = await GPUDetector.detect();
      const second = await GPUDetector.detect();

      // Should be same object reference (from cache)
      expect(first).toBe(second);
    });
  });
});

describe("GPUDetector - Live System Test", () => {
  /**
   * This test runs actual detection on the current system.
   * It should NOT crash even on Blackwell GPUs.
   */
  test("should detect GPU without crashing", async () => {
    GPUDetector.clearCache();

    const info = await GPUDetector.detect();

    console.log("\n=== Live GPU Detection Result ===");
    console.log(JSON.stringify(info, null, 2));

    // Basic structure checks
    expect(info).toHaveProperty("vendor");
    expect(info).toHaveProperty("model");
    expect(info).toHaveProperty("cudaAvailable");
    expect(info).toHaveProperty("webgpuAvailable");

    // If Blackwell detected, WebGPU should be skipped
    if (info.computeCapability && info.computeCapability >= WEBGPU_UNSAFE_MIN_CC) {
      expect(info.webgpuSkipped).toBe(true);
      expect(info.webgpuAvailable).toBe(false);
      console.log("\n[TEST] Blackwell GPU detected - WebGPU correctly skipped");
    }
  });
});

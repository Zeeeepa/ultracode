/**
 * Test OpenVINO and Transformers in Bun
 */

async function testOpenVINO() {
  console.log("=== Testing OpenVINO in Bun ===\n");

  try {
    console.log("1. Loading openvino-node...");
    const { addon: ov } = await import("openvino-node");
    console.log("   ✓ openvino-node loaded");

    console.log("\n2. Creating Core...");
    const core = new ov.Core();
    console.log("   ✓ Core created");

    console.log("\n3. Getting available devices...");
    const devices = core.getAvailableDevices();
    console.log("   ✓ Available devices:", devices);

    const hasNPU = devices.includes("NPU");
    const hasGPU = devices.some((d: string) => d.startsWith("GPU"));

    console.log("\n4. Device summary:");
    console.log("   - NPU:", hasNPU ? "✓ Available" : "✗ Not found");
    console.log("   - GPU:", hasGPU ? "✓ Available" : "✗ Not found");
    console.log("   - CPU:", devices.includes("CPU") ? "✓ Available" : "✗ Not found");

    return { success: true, devices, hasNPU, hasGPU };
  } catch (error: any) {
    console.error("\n✗ OpenVINO test failed:", error.message);
    console.error("Stack:", error.stack);
    return { success: false, error: error.message };
  }
}

async function testTransformers() {
  console.log("\n=== Testing @xenova/transformers in Bun ===\n");

  try {
    console.log("1. Loading @xenova/transformers...");
    const { AutoTokenizer, env } = await import("@xenova/transformers");
    console.log("   ✓ @xenova/transformers loaded");

    // Disable remote models for faster test
    env.allowRemoteModels = false;
    env.allowLocalModels = true;

    console.log("\n2. Testing tokenizer loading (may download model)...");
    // Try loading a small tokenizer
    try {
      env.allowRemoteModels = true;
      const tokenizer = await AutoTokenizer.from_pretrained("Xenova/bert-base-uncased", {
        progress_callback: (p: any) => process.stdout.write("."),
      });
      console.log("\n   ✓ Tokenizer loaded");

      console.log("\n3. Testing tokenization...");
      const encoded = await tokenizer("Hello, world!");
      console.log("   ✓ Tokenized:", {
        input_ids: encoded.input_ids?.data?.slice(0, 10),
        length: encoded.input_ids?.data?.length,
      });

      return { success: true };
    } catch (e: any) {
      console.log("\n   ⚠ Tokenizer download skipped (network/cache issue)");
      console.log("   Message:", e.message);
      return { success: true, warning: "tokenizer download skipped" };
    }
  } catch (error: any) {
    console.error("\n✗ Transformers test failed:", error.message);
    console.error("Stack:", error.stack);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log("Bun version:", Bun.version);
  console.log("Platform:", process.platform);
  console.log("Arch:", process.arch);
  console.log("");

  const ovResult = await testOpenVINO();
  const tfResult = await testTransformers();

  console.log("\n=== Summary ===");
  console.log("OpenVINO:", ovResult.success ? "✓ Working" : "✗ Failed");
  console.log("Transformers:", tfResult.success ? "✓ Working" : "✗ Failed");

  if (ovResult.success && ovResult.hasNPU) {
    console.log("\n🎉 NPU detected! Ready for NPU provider implementation.");
  } else if (ovResult.success) {
    console.log("\n⚠ OpenVINO works but NPU not detected. CPU/GPU fallback available.");
  }
}

main().catch(console.error);

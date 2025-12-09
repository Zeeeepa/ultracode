/**
 * Simplified NPU inference test with better diagnostics
 */

async function main() {
  console.log("=== Simple NPU Test ===\n");

  // 1. Load OpenVINO
  console.log("1. Loading OpenVINO...");
  const { addon: ov } = await import("openvino-node");
  const core = new ov.Core();
  console.log("   Available devices:", core.getAvailableDevices());

  // 2. Check model
  const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";
  console.log("\n2. Reading model:", modelPath);

  const model = await core.readModel(modelPath);
  console.log("   ✓ Model loaded");

  // 3. Inspect model shapes
  console.log("\n3. Model inputs:");
  for (const input of model.inputs) {
    console.log(`   - ${input.anyName}: shape=${JSON.stringify(input.shape)}, type=${input.elementType}`);
  }

  console.log("\n   Model outputs:");
  for (const output of model.outputs) {
    console.log(`   - ${output.anyName}: shape=${JSON.stringify(output.shape)}, type=${output.elementType}`);
  }

  // 4. Check for dynamic shapes
  const hasDynamicShapes = model.inputs.some((i: any) => i.shape.includes(-1));
  console.log("\n4. Dynamic shapes:", hasDynamicShapes ? "YES (need reshape for NPU)" : "NO");

  // 5. Try CPU first (always works)
  console.log("\n5. Testing CPU compilation...");
  const cpuStart = Date.now();
  const cpuModel = await core.compileModel(model, "CPU");
  console.log(`   ✓ CPU compiled in ${Date.now() - cpuStart}ms`);

  // 6. Quick CPU inference test
  console.log("\n6. Testing CPU inference...");
  const inferRequest = cpuModel.createInferRequest();

  // Create dummy input (static shape for test)
  const seqLen = 16;
  const inputIds = new BigInt64Array(seqLen).fill(101n); // [CLS] token
  const attentionMask = new BigInt64Array(seqLen).fill(1n);
  const tokenTypeIds = new BigInt64Array(seqLen).fill(0n);

  const inputIdsTensor = new ov.Tensor(ov.element.i64, [1, seqLen], inputIds);
  const attentionMaskTensor = new ov.Tensor(ov.element.i64, [1, seqLen], attentionMask);
  const tokenTypeIdsTensor = new ov.Tensor(ov.element.i64, [1, seqLen], tokenTypeIds);

  inferRequest.setInputTensor("input_ids", inputIdsTensor);
  inferRequest.setInputTensor("attention_mask", attentionMaskTensor);
  inferRequest.setInputTensor("token_type_ids", tokenTypeIdsTensor);

  const inferStart = Date.now();
  inferRequest.infer();
  console.log(`   ✓ CPU inference in ${Date.now() - inferStart}ms`);

  const output = inferRequest.getOutputTensor();
  console.log(`   Output shape: ${JSON.stringify(output.shape)}`);

  // 7. Try NPU with reshape
  if (core.getAvailableDevices().includes("NPU")) {
    console.log("\n7. Testing NPU...");

    // Re-read model for NPU (fresh copy)
    const npuModel = await core.readModel(modelPath);

    // Reshape to static for NPU
    const staticSeqLen = 128;
    console.log(`   Reshaping to static shape [1, ${staticSeqLen}]...`);

    try {
      npuModel.reshape({
        input_ids: [1, staticSeqLen],
        attention_mask: [1, staticSeqLen],
        token_type_ids: [1, staticSeqLen],
      });
      console.log("   ✓ Model reshaped");

      console.log("   Compiling for NPU (may take a while)...");
      const npuStart = Date.now();

      // Set timeout for NPU compilation
      const compilePromise = core.compileModel(npuModel, "NPU");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("NPU compilation timeout (60s)")), 60000)
      );

      try {
        const compiledNpu = await Promise.race([compilePromise, timeoutPromise]) as any;
        console.log(`   ✓ NPU compiled in ${Date.now() - npuStart}ms`);

        // Test NPU inference
        const npuInferRequest = compiledNpu.createInferRequest();
        const npuInputIds = new BigInt64Array(staticSeqLen).fill(101n);
        const npuAttentionMask = new BigInt64Array(staticSeqLen).fill(1n);
        const npuTokenTypeIds = new BigInt64Array(staticSeqLen).fill(0n);

        npuInferRequest.setInputTensor("input_ids", new ov.Tensor(ov.element.i64, [1, staticSeqLen], npuInputIds));
        npuInferRequest.setInputTensor("attention_mask", new ov.Tensor(ov.element.i64, [1, staticSeqLen], npuAttentionMask));
        npuInferRequest.setInputTensor("token_type_ids", new ov.Tensor(ov.element.i64, [1, staticSeqLen], npuTokenTypeIds));

        const npuInferStart = Date.now();
        npuInferRequest.infer();
        console.log(`   ✓ NPU inference in ${Date.now() - npuInferStart}ms`);

        const npuOutput = npuInferRequest.getOutputTensor();
        console.log(`   Output shape: ${JSON.stringify(npuOutput.shape)}`);

      } catch (e: any) {
        console.log(`   ✗ NPU compilation failed: ${e.message}`);
      }
    } catch (e: any) {
      console.log(`   ✗ Reshape failed: ${e.message}`);
    }
  }

  console.log("\n=== Test Complete ===");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});

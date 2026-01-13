/**
 * Minimal NPU test - corrected API usage
 */

const { addon: ov } = await import("openvino-node");

console.log("Step 1: Create core");
const core = new ov.Core();
console.log("Devices:", core.getAvailableDevices());

console.log("\nStep 2: Read model");
const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";
const model = await core.readModel(modelPath);
console.log("Model loaded");

console.log("\nStep 3: Get model info");
console.log("Inputs:");
for (let i = 0; i < model.inputs.length; i++) {
  const input = model.inputs[i];
  console.log(`  [${i}] ${input.anyName}: shape=${JSON.stringify(input.shape)}`);
}
console.log("Outputs:");
for (let i = 0; i < model.outputs.length; i++) {
  const output = model.outputs[i];
  console.log(`  [${i}] ${output.anyName}: shape=${JSON.stringify(output.shape)}`);
}

console.log("\nStep 4: Compile for CPU");
const cpuModel = await core.compileModel(model, "CPU");
console.log("CPU model compiled");

console.log("\nStep 5: Create infer request");
const inferRequest = cpuModel.createInferRequest();
console.log("Infer request created");

// Minimal inference with correct API
console.log("\nStep 6: Create tensors");
const seqLen = 8;

// Create typed arrays
const inputIds = new BigInt64Array(seqLen).fill(101n);
const attMask = new BigInt64Array(seqLen).fill(1n);
const tokType = new BigInt64Array(seqLen).fill(0n);

// Create OpenVINO Tensors
const inputIdsTensor = new ov.Tensor(ov.element.i64, [1, seqLen], inputIds);
const attMaskTensor = new ov.Tensor(ov.element.i64, [1, seqLen], attMask);
const tokTypeTensor = new ov.Tensor(ov.element.i64, [1, seqLen], tokType);
console.log("Tensors created");

// Try different API approaches
console.log("\nStep 7: Set tensors (trying index-based)");
try {
  // Method 1: setTensor by index
  inferRequest.setTensor(cpuModel.inputs[0], inputIdsTensor);
  inferRequest.setTensor(cpuModel.inputs[1], attMaskTensor);
  inferRequest.setTensor(cpuModel.inputs[2], tokTypeTensor);
  console.log("Tensors set via setTensor(output, tensor)");
} catch (e1: any) {
  console.log("Method 1 failed:", e1.message);

  try {
    // Method 2: setInputTensor by index
    inferRequest.setInputTensor(0, inputIdsTensor);
    inferRequest.setInputTensor(1, attMaskTensor);
    inferRequest.setInputTensor(2, tokTypeTensor);
    console.log("Tensors set via setInputTensor(index, tensor)");
  } catch (e2: any) {
    console.log("Method 2 failed:", e2.message);
    throw e2;
  }
}

console.log("\nStep 8: Infer");
const t0 = Date.now();
inferRequest.infer();
console.log(`Inference done in ${Date.now() - t0}ms!`);

console.log("\nStep 9: Get output");
const output = inferRequest.getOutputTensor(0);
console.log("Output shape:", output.shape);
const data = new Float32Array(output.data);
console.log("Output dim:", data.length);
console.log("First 5 values:", Array.from(data.slice(0, 5)));

console.log("\n=== CPU Test Success! ===");

// Now try NPU
console.log("\n\n=== Testing NPU ===");
if (core.getAvailableDevices().includes("NPU")) {
  console.log("\nReshaping model for NPU (static shapes required)...");
  const npuModel = await core.readModel(modelPath);

  const staticLen = 64;
  try {
    npuModel.reshape({
      input_ids: [1, staticLen],
      attention_mask: [1, staticLen],
      token_type_ids: [1, staticLen],
    });
    console.log(`Reshaped to [1, ${staticLen}]`);

    console.log("Compiling for NPU...");
    const t1 = Date.now();
    const npuCompiled = await core.compileModel(npuModel, "NPU");
    console.log(`NPU compiled in ${Date.now() - t1}ms`);

    const npuInfer = npuCompiled.createInferRequest();

    // Create static-sized inputs
    const npuInputIds = new BigInt64Array(staticLen).fill(101n);
    const npuAttMask = new BigInt64Array(staticLen);
    npuAttMask.fill(1n, 0, seqLen);
    npuAttMask.fill(0n, seqLen);
    const npuTokType = new BigInt64Array(staticLen).fill(0n);

    npuInfer.setTensor(
      npuCompiled.inputs[0],
      new ov.Tensor(ov.element.i64, [1, staticLen], npuInputIds),
    );
    npuInfer.setTensor(
      npuCompiled.inputs[1],
      new ov.Tensor(ov.element.i64, [1, staticLen], npuAttMask),
    );
    npuInfer.setTensor(
      npuCompiled.inputs[2],
      new ov.Tensor(ov.element.i64, [1, staticLen], npuTokType),
    );

    console.log("Running NPU inference...");
    const t2 = Date.now();
    npuInfer.infer();
    console.log(`NPU inference done in ${Date.now() - t2}ms!`);

    const npuOut = npuInfer.getOutputTensor(0);
    console.log("NPU output shape:", npuOut.shape);

    console.log("\n=== NPU Test Success! ===");
  } catch (e: any) {
    console.log("NPU test failed:", e.message);
  }
} else {
  console.log("NPU not available");
}

console.log("\n=== All Tests Done ===");

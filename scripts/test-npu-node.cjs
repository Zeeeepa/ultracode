/**
 * NPU test with Node.js (CommonJS)
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== NPU Test (Node.js) ===\n");

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
    console.log(`  [${i}] ${input.anyName}: shape=[${input.shape}]`);
  }
  console.log("Outputs:");
  for (let i = 0; i < model.outputs.length; i++) {
    const output = model.outputs[i];
    console.log(`  [${i}] ${output.anyName}: shape=[${output.shape}]`);
  }

  console.log("\nStep 4: Compile for CPU");
  const cpuModel = await core.compileModel(model, "CPU");
  console.log("CPU model compiled");

  console.log("\nStep 5: Create infer request");
  const inferRequest = cpuModel.createInferRequest();

  const seqLen = 8;
  const inputIds = new BigInt64Array(seqLen).fill(101n);
  const attMask = new BigInt64Array(seqLen).fill(1n);
  const tokType = new BigInt64Array(seqLen).fill(0n);

  console.log("\nStep 6: Set tensors");
  inferRequest.setTensor(cpuModel.inputs[0], new ov.Tensor(ov.element.i64, [1, seqLen], inputIds));
  inferRequest.setTensor(cpuModel.inputs[1], new ov.Tensor(ov.element.i64, [1, seqLen], attMask));
  inferRequest.setTensor(cpuModel.inputs[2], new ov.Tensor(ov.element.i64, [1, seqLen], tokType));
  console.log("Tensors set");

  console.log("\nStep 7: Infer on CPU");
  const t0 = Date.now();
  inferRequest.infer();
  console.log(`CPU inference: ${Date.now() - t0}ms`);

  const output = inferRequest.getOutputTensor(0);
  console.log("Output shape:", output.shape);
  const data = new Float32Array(output.data);
  console.log("Total values:", data.length);
  console.log("Hidden dim:", data.length / seqLen);

  // NPU Test
  console.log("\n\n=== NPU Test ===");

  if (!core.getAvailableDevices().includes("NPU")) {
    console.log("NPU not available");
    return;
  }

  console.log("Reshaping for NPU...");
  const npuModel = await core.readModel(modelPath);
  const staticLen = 64;

  try {
    npuModel.reshape({
      input_ids: [1, staticLen],
      attention_mask: [1, staticLen],
      token_type_ids: [1, staticLen],
    });
    console.log(`Reshaped to [1, ${staticLen}]`);
  } catch (e) {
    console.log("Reshape error:", e.message);
    return;
  }

  console.log("Compiling for NPU (may take time)...");
  const t1 = Date.now();
  let npuCompiled;
  try {
    npuCompiled = await core.compileModel(npuModel, "NPU");
    console.log(`NPU compiled in ${Date.now() - t1}ms`);
  } catch (e) {
    console.log("NPU compile error:", e.message);
    console.log("Trying GPU.0 as fallback...");
    try {
      npuCompiled = await core.compileModel(npuModel, "GPU.0");
      console.log(`GPU compiled in ${Date.now() - t1}ms`);
    } catch (e2) {
      console.log("GPU compile error:", e2.message);
      return;
    }
  }

  const npuInfer = npuCompiled.createInferRequest();

  const npuInputIds = new BigInt64Array(staticLen).fill(101n);
  const npuAttMask = new BigInt64Array(staticLen);
  npuAttMask.fill(1n, 0, seqLen);
  npuAttMask.fill(0n, seqLen);
  const npuTokType = new BigInt64Array(staticLen).fill(0n);

  npuInfer.setTensor(npuCompiled.inputs[0], new ov.Tensor(ov.element.i64, [1, staticLen], npuInputIds));
  npuInfer.setTensor(npuCompiled.inputs[1], new ov.Tensor(ov.element.i64, [1, staticLen], npuAttMask));
  npuInfer.setTensor(npuCompiled.inputs[2], new ov.Tensor(ov.element.i64, [1, staticLen], npuTokType));

  console.log("Running NPU inference...");
  const t2 = Date.now();
  npuInfer.infer();
  console.log(`NPU inference: ${Date.now() - t2}ms`);

  const npuOut = npuInfer.getOutputTensor(0);
  console.log("NPU output shape:", npuOut.shape);

  // Benchmark
  console.log("\n=== Benchmark (10 iterations) ===");

  console.log("CPU:");
  const cpuTimes = [];
  for (let i = 0; i < 10; i++) {
    const st = Date.now();
    inferRequest.infer();
    cpuTimes.push(Date.now() - st);
  }
  console.log(`  Avg: ${(cpuTimes.reduce((a, b) => a + b) / cpuTimes.length).toFixed(1)}ms`);

  console.log("NPU:");
  const npuTimes = [];
  for (let i = 0; i < 10; i++) {
    const st = Date.now();
    npuInfer.infer();
    npuTimes.push(Date.now() - st);
  }
  console.log(`  Avg: ${(npuTimes.reduce((a, b) => a + b) / npuTimes.length).toFixed(1)}ms`);

  console.log("\n=== All Tests Complete! ===");
}

main().catch(console.error);

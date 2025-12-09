/**
 * Simplest inference test - use setInputTensor with index
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== Simplest Inference ===\n");

  const core = new ov.Core();
  console.log("Devices:", core.getAvailableDevices());

  const model = await core.readModel("D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx");
  console.log("Model loaded");

  const compiled = await core.compileModel(model, "CPU");
  console.log("Compiled");

  const infer = compiled.createInferRequest();
  console.log("InferRequest created");

  // Create tensors (model expects i64)
  const seqLen = 8;
  const inputIds = new BigInt64Array([101n, 7592n, 1010n, 2088n, 102n, 0n, 0n, 0n]);
  const attMask = new BigInt64Array([1n, 1n, 1n, 1n, 1n, 0n, 0n, 0n]);
  const tokType = new BigInt64Array(seqLen).fill(0n);

  const t0 = new ov.Tensor("i64", [1, seqLen], inputIds);
  const t1 = new ov.Tensor("i64", [1, seqLen], attMask);
  const t2 = new ov.Tensor("i64", [1, seqLen], tokType);
  console.log("Tensors created");

  // Try setInputTensor by index
  console.log("Setting input tensors by index...");
  try {
    infer.setInputTensor(0, t0);
    console.log("  Input 0 set");
    infer.setInputTensor(1, t1);
    console.log("  Input 1 set");
    infer.setInputTensor(2, t2);
    console.log("  Input 2 set");
  } catch (e) {
    console.log("setInputTensor failed:", e.message);

    // Alternative: try without index
    console.log("\nTrying single setInputTensor...");
    try {
      infer.setInputTensor(t0);
      console.log("  Single input set");
    } catch (e2) {
      console.log("Single setInputTensor failed:", e2.message);
    }
  }

  // Run inference
  console.log("\nRunning inference...");
  const st = Date.now();
  infer.infer();
  console.log(`Inference done in ${Date.now() - st}ms`);

  // Get output
  console.log("\nGetting output...");
  const out = infer.getOutputTensor(0);
  console.log("Output tensor obtained");

  const data = new Float32Array(out.data);
  console.log("Output size:", data.length);
  console.log("First 5 values:", Array.from(data.slice(0, 5)).map(v => v.toFixed(4)));

  // Benchmark
  console.log("\nBenchmark (10 iterations):");
  const times = [];
  for (let i = 0; i < 10; i++) {
    const t = Date.now();
    infer.infer();
    times.push(Date.now() - t);
  }
  console.log(`  Avg: ${(times.reduce((a,b) => a+b) / times.length).toFixed(1)}ms`);

  console.log("\n=== Success! ===");
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});

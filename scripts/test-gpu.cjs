/**
 * GPU test (NPU fallback)
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== GPU vs CPU Test ===\n");

  const core = new ov.Core();
  console.log("Devices:", core.getAvailableDevices());

  const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";
  const SEQ_LEN = 64;

  const inputIds = new BigInt64Array(SEQ_LEN);
  inputIds.set([101n, 7592n, 1010n, 2088n, 999n, 2023n, 2003n, 1037n, 3231n, 102n]);
  const attMask = new BigInt64Array(SEQ_LEN);
  attMask.fill(1n, 0, 10);
  const tokType = new BigInt64Array(SEQ_LEN).fill(0n);

  // === CPU ===
  console.log("--- CPU ---");
  const cpuModel = await core.readModel(modelPath);
  const cpuCompiled = await core.compileModel(cpuModel, "CPU");
  const cpuInfer = cpuCompiled.createInferRequest();
  cpuInfer.setInputTensor(0, new ov.Tensor("i64", [1, SEQ_LEN], inputIds));
  cpuInfer.setInputTensor(1, new ov.Tensor("i64", [1, SEQ_LEN], attMask));
  cpuInfer.setInputTensor(2, new ov.Tensor("i64", [1, SEQ_LEN], tokType));

  cpuInfer.infer();
  const cpuTimes = [];
  for (let i = 0; i < 50; i++) {
    const t = Date.now();
    cpuInfer.infer();
    cpuTimes.push(Date.now() - t);
  }
  console.log(`CPU: Avg ${(cpuTimes.reduce((a,b) => a+b) / 50).toFixed(2)}ms`);

  // === GPU.0 ===
  console.log("\n--- GPU.0 ---");
  const gpuModel = await core.readModel(modelPath);
  let t0 = Date.now();
  const gpuCompiled = await core.compileModel(gpuModel, "GPU.0");
  console.log(`GPU.0 compiled in ${Date.now() - t0}ms`);

  const gpuInfer = gpuCompiled.createInferRequest();
  gpuInfer.setInputTensor(0, new ov.Tensor("i64", [1, SEQ_LEN], inputIds));
  gpuInfer.setInputTensor(1, new ov.Tensor("i64", [1, SEQ_LEN], attMask));
  gpuInfer.setInputTensor(2, new ov.Tensor("i64", [1, SEQ_LEN], tokType));

  gpuInfer.infer();
  const gpuTimes = [];
  for (let i = 0; i < 50; i++) {
    const t = Date.now();
    gpuInfer.infer();
    gpuTimes.push(Date.now() - t);
  }
  console.log(`GPU.0: Avg ${(gpuTimes.reduce((a,b) => a+b) / 50).toFixed(2)}ms`);

  // === GPU.1 ===
  console.log("\n--- GPU.1 ---");
  const gpu1Model = await core.readModel(modelPath);
  t0 = Date.now();
  const gpu1Compiled = await core.compileModel(gpu1Model, "GPU.1");
  console.log(`GPU.1 compiled in ${Date.now() - t0}ms`);

  const gpu1Infer = gpu1Compiled.createInferRequest();
  gpu1Infer.setInputTensor(0, new ov.Tensor("i64", [1, SEQ_LEN], inputIds));
  gpu1Infer.setInputTensor(1, new ov.Tensor("i64", [1, SEQ_LEN], attMask));
  gpu1Infer.setInputTensor(2, new ov.Tensor("i64", [1, SEQ_LEN], tokType));

  gpu1Infer.infer();
  const gpu1Times = [];
  for (let i = 0; i < 50; i++) {
    const t = Date.now();
    gpu1Infer.infer();
    gpu1Times.push(Date.now() - t);
  }
  console.log(`GPU.1: Avg ${(gpu1Times.reduce((a,b) => a+b) / 50).toFixed(2)}ms`);

  // Summary
  const cpuAvg = cpuTimes.reduce((a,b) => a+b) / 50;
  const gpuAvg = gpuTimes.reduce((a,b) => a+b) / 50;
  const gpu1Avg = gpu1Times.reduce((a,b) => a+b) / 50;

  console.log("\n=== Summary ===");
  console.log(`CPU:   ${cpuAvg.toFixed(2)}ms`);
  console.log(`GPU.0: ${gpuAvg.toFixed(2)}ms (${(cpuAvg/gpuAvg).toFixed(2)}x)`);
  console.log(`GPU.1: ${gpu1Avg.toFixed(2)}ms (${(cpuAvg/gpu1Avg).toFixed(2)}x)`);

  console.log("\n=== Done! ===");
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});

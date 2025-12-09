/**
 * Simplest possible NPU test
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== Simplest NPU Test ===\n");

  const core = new ov.Core();
  console.log("Devices:", core.getAvailableDevices());

  const modelPath = "D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx";
  console.log("\nReading model...");
  const model = await core.readModel(modelPath);
  console.log("Model loaded");

  // Skip inspecting model.inputs - go straight to compile
  console.log("\nCompiling for CPU...");
  const cpuModel = await core.compileModel(model, "CPU");
  console.log("CPU compiled!");

  // Get compiled model inputs instead
  console.log("\nCompiled model inputs:", cpuModel.inputs.length);

  const inferRequest = cpuModel.createInferRequest();
  console.log("InferRequest created");

  // Try to get input tensor info from compiled model
  const input0 = cpuModel.inputs[0];
  console.log("Input 0 name:", input0?.anyName);

  console.log("\n=== Success! ===");
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});

/**
 * Test OpenVINO Tensor API variations
 */

const { addon: ov } = require("openvino-node");

async function main() {
  console.log("=== Tensor API Test ===\n");

  // Check available APIs
  console.log("ov.element:", ov.element);
  console.log("ov.Tensor:", typeof ov.Tensor);

  // Create a simple tensor
  console.log("\nCreating tensor...");
  const data = new Float32Array([1, 2, 3, 4, 5, 6]);
  const tensor = new ov.Tensor(ov.element.f32, [2, 3], data);
  console.log("Tensor created");
  console.log("Tensor shape:", tensor.shape);
  console.log("Tensor data:", tensor.data);

  // Try BigInt64Array
  console.log("\nCreating i64 tensor...");
  const i64data = new BigInt64Array([1n, 2n, 3n, 4n]);

  // Check if i64 exists
  console.log("ov.element.i64:", ov.element.i64);

  try {
    const i64tensor = new ov.Tensor(ov.element.i64, [1, 4], i64data);
    console.log("i64 tensor created:", i64tensor.shape);
  } catch (e) {
    console.log("i64 tensor failed:", e.message);
  }

  // Try i32 instead
  console.log("\nCreating i32 tensor...");
  const i32data = new Int32Array([1, 2, 3, 4]);
  try {
    const i32tensor = new ov.Tensor(ov.element.i32, [1, 4], i32data);
    console.log("i32 tensor created:", i32tensor.shape);
  } catch (e) {
    console.log("i32 tensor failed:", e.message);
  }

  // Load model and check expected input types
  console.log("\n--- Model Input Types ---");
  const core = new ov.Core();
  const model = await core.readModel("D:\\github\\ultrascript-tools-mcp\\models\\all-MiniLM-L6-v2\\model.onnx");
  const compiled = await core.compileModel(model, "CPU");

  for (let i = 0; i < compiled.inputs.length; i++) {
    const input = compiled.inputs[i];
    console.log(`Input ${i}: ${input.anyName}, element type: ${input.elementType}, shape: ${input.shape}`);
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);

/**
 * Test if WebAssembly SIMD is available and faster
 */

// Check SIMD support
const wasmSimdSupported = (() => {
  try {
    // SIMD detection via feature test
    return WebAssembly.validate(new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
      0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
      0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b
    ]));
  } catch {
    return false;
  }
})();

console.log("WebAssembly SIMD supported:", wasmSimdSupported);

// Create WASM module with SIMD dot product
const wasmCode = `
(module
  (memory (export "memory") 1)

  ;; Dot product using SIMD (v128)
  ;; Parameters: a_ptr, b_ptr, length
  (func (export "dot_simd") (param $a i32) (param $b i32) (param $len i32) (result f32)
    (local $sum v128)
    (local $i i32)
    (local $len4 i32)
    (local $result f32)

    ;; len4 = len - (len % 4)
    (local.set $len4 (i32.and (local.get $len) (i32.const -4)))

    ;; Initialize sum to zero
    (local.set $sum (f32x4.splat (f32.const 0)))

    ;; SIMD loop: process 4 floats at a time
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $len4)))

        ;; sum += a[i:i+4] * b[i:i+4]
        (local.set $sum
          (f32x4.add
            (local.get $sum)
            (f32x4.mul
              (v128.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2))))
              (v128.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2))))
            )
          )
        )

        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )

    ;; Horizontal sum of SIMD register
    (local.set $result
      (f32.add
        (f32.add
          (f32x4.extract_lane 0 (local.get $sum))
          (f32x4.extract_lane 1 (local.get $sum))
        )
        (f32.add
          (f32x4.extract_lane 2 (local.get $sum))
          (f32x4.extract_lane 3 (local.get $sum))
        )
      )
    )

    ;; Handle remaining elements (scalar)
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $len)))

        (local.set $result
          (f32.add
            (local.get $result)
            (f32.mul
              (f32.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2))))
              (f32.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2))))
            )
          )
        )

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )

    (local.get $result)
  )

  ;; Scalar dot product for comparison
  (func (export "dot_scalar") (param $a i32) (param $b i32) (param $len i32) (result f32)
    (local $sum f32)
    (local $i i32)

    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $len)))

        (local.set $sum
          (f32.add
            (local.get $sum)
            (f32.mul
              (f32.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2))))
              (f32.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2))))
            )
          )
        )

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )

    (local.get $sum)
  )
)
`;

async function main() {
  if (!wasmSimdSupported) {
    console.log("SIMD not supported, skipping WASM test");
    return;
  }

  // Compile WASM
  const wasmModule = await WebAssembly.compile(
    await (await fetch("data:application/wasm;base64," +
      Buffer.from(new TextEncoder().encode(wasmCode)).toString("base64")
    )).arrayBuffer()
  ).catch(() => null);

  // Try using wat2wasm if available
  if (!wasmModule) {
    console.log("Direct WASM compilation not available, using precompiled test...");

    // Simple test without actual WASM
    const dim = 384;
    const iterations = 100000;

    function jsLoop(a: Float32Array, b: Float32Array): number {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
      return sum;
    }

    function jsUnroll4(a: Float32Array, b: Float32Array): number {
      let sum = 0;
      const len4 = a.length - (a.length % 4);
      for (let i = 0; i < len4; i += 4) {
        sum += a[i]! * b[i]! + a[i+1]! * b[i+1]! + a[i+2]! * b[i+2]! + a[i+3]! * b[i+3]!;
      }
      for (let i = len4; i < a.length; i++) sum += a[i]! * b[i]!;
      return sum;
    }

    const a = new Float32Array(dim).map(() => Math.random());
    const b = new Float32Array(dim).map(() => Math.random());

    // Warmup
    for (let i = 0; i < 1000; i++) { jsLoop(a, b); jsUnroll4(a, b); }

    const t1 = performance.now();
    for (let i = 0; i < iterations; i++) jsLoop(a, b);
    const loopTime = performance.now() - t1;

    const t2 = performance.now();
    for (let i = 0; i < iterations; i++) jsUnroll4(a, b);
    const unrollTime = performance.now() - t2;

    console.log(`\nJS Loop:    ${loopTime.toFixed(1)}ms`);
    console.log(`JS Unroll4: ${unrollTime.toFixed(1)}ms (${(loopTime/unrollTime).toFixed(2)}x)`);
    console.log(`\nNote: For true WASM SIMD benchmark, need wat2wasm or precompiled .wasm`);
    return;
  }
}

main().catch(console.error);

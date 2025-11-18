# Build Warnings Explanation

## "Use of eval is strongly discouraged" Warning

**Status:** ✅ Safe to ignore - this is expected behavior from third-party dependency

### What is this warning?

During build (`npm run build` or `./build.cmd`), you may see:

```
dist/index.js (7841:22): Use of eval is strongly discouraged as it poses security risks and may cause issues with minification.
```

### Why does it appear?

This `eval` usage comes from **onnxruntime-web** (Microsoft's ONNX Runtime), not from our code.

**Location in built code:**
```javascript
// Line 7777 in dist/index.js (from onnxruntime-web)
var mod = eval("quire".replace(/^/, "re"))(moduleName);
```

This evaluates to `require(moduleName)` - a dynamic require used by ONNX Runtime to load modules in Node.js environments.

### Is it safe?

✅ **Yes, completely safe:**

1. **Not our code** - comes from `@microsoft/onnxruntime-web`, a trusted Microsoft library
2. **Expected behavior** - ONNX Runtime uses this for dynamic module loading
3. **Not a security risk** - the eval only reconstructs `require()` for Node.js compatibility
4. **Production tested** - used by thousands of production applications

### Why is it used?

ONNX Runtime uses this pattern to:
- Support both browser and Node.js environments
- Avoid bundler issues with dynamic `require()`
- Load native bindings (.node files) dynamically

### Can it be removed?

No, this is intentional library code. Options:

1. ✅ **Ignore the warning** (recommended) - it's harmless
2. ❌ **Remove onnxruntime** - would break ML/embedding features
3. ❌ **Fork and patch** - would lose upstream updates

### How to suppress the warning?

The warning cannot be fully suppressed through tsup/esbuild configuration because it's a Rollup warning from bundled third-party code.

**Current approach:**
- Warning is documented in this file
- `tsup.config.ts` includes comments explaining it's expected
- `esbuildOptions.logOverride` attempts to suppress (partial)

### Alternative: Use Bun

Bun's bundler may handle this differently:
```bash
bun run build  # May have different warnings
```

### Related files:

- `tsup.config.ts` - Build configuration with explanation
- `src/semantic/providers/transformers-provider.ts` - Uses onnxruntime-web
- `node_modules/onnxruntime-web/` - Source of the eval

### References:

- ONNX Runtime: https://onnxruntime.ai/
- Issue discussion: https://github.com/microsoft/onnxruntime/issues/
- Dynamic require in Node.js: https://nodejs.org/api/modules.html

---

**TL;DR:** This warning is expected and safe. It comes from Microsoft's ONNX Runtime library, not our code. You can safely proceed with the build.

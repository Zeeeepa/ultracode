# CUDA Module

## Title and Overview

The CUDA module provides interfaces and types for working with GPU computations through CUDA-compatible libraries. It contains type definitions for GPU resource management, computation execution, and interaction with the CUDA driver. Intended for use in projects requiring high-performance computations on graphics processors.

## Files

| File             | Description                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `index.d.ts`     | Main type definition file for the CUDA module, containing interfaces and types |

## Exports

No public exports. The module is intended for internal use and provides only types for compilation.

## Usage

The module is used in projects that require typing for CUDA functions:

```typescript
// Usage example in code
import { CudaContext, CudaDevice } from 'cuda-module';

// Using types for working with GPU resources
const context: CudaContext = new CudaContext();
const device: CudaDevice = context.getDevice(0);
```

> Note: the module is internal and is not intended for direct import in user code.

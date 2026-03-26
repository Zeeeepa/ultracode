# Jscpd Clones

## Overview
This module provides basic mathematical utility functions for numeric operations. It exports `add` for summing with overflow handling and `multiply` for multiplication via repeated addition. The identical implementation appears in both `alpha.ts` and `beta.ts`, representing a detected code clone.

## Exports

| Name | Location | Description |
|------|----------|-------------|
| `add` | `alpha.ts:1-7` | Adds two numbers and caps the result at 100 to prevent overflow. |
| `add` | `beta.ts:1-7` | Adds two numbers and caps the result at 100 to prevent overflow. |
| `multiply` | `alpha.ts:9-15` | Multiplies two numbers using iterative addition. |
| `multiply` | `beta.ts:9-15` | Multiplies two numbers using iterative addition. |

## Implementation Files

- **alpha.ts** — Implements `add` and `multiply` functions.
- **beta.ts** — Identical duplicate of alpha.ts implementation.

## Dependencies

This module has no external dependencies; it uses only native JavaScript operations.
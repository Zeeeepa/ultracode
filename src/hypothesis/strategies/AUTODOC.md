# Strategies

Four-tier runtime relationship detection strategy implementations for hypothesis inference engine.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `generate` | function | Matches decorator patterns and register/dispatch calls in same directory | [→ callback-arg.ts:21-68] |
| `generate` | function | Matches decorator patterns and register/dispatch calls in same directory | [→ interface-narrow.ts:20-78] |
| `generate` | function | Matches decorator patterns and register/dispatch calls in same directory | [→ string-key.ts:16-18] |
| `generateForPair` | function | Performs bidirectional BFS gap detection with proximity heuristics for pair | [→ proximity-bridge.ts:28-110] |

## Files

- **callback-arg.ts** — Detects callback patterns in setTimeout, promise.then, array.map calls
- **interface-narrow.ts** — Narrows interface methods to concrete implementations with confidence scoring
- **proximity-bridge.ts** — On-demand bidirectional BFS proximity bridging for disconnected entities
- **string-key.ts** — Detects decorator patterns and register/dispatch event relationships

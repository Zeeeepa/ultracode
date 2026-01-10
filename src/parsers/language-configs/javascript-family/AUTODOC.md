# Javascript Family

*Last updated: 2026-01-10*

Конфигурации парсера для JavaScript-семейства языков программирования.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `JAVASCRIPT_CONFIG` | const | Объект конфигурации парсера с расширениями и типами узлов JavaScript. | [→ javascript.ts:8-53] |
| `JSX_CONFIG` | const | Объект конфигурации для JSX с поддержкой элементов и выражений. | [→ jsx.ts:9-18] |
| `TSX_CONFIG` | const | Объект конфигурации для TSX с типизацией и JSX синтаксисом. | [→ tsx.ts:9-18] |
| `TYPESCRIPT_CONFIG` | const | Полная конфигурация TypeScript с интерфейсами, типами, модификаторами. | [→ typescript.ts:8-65] |

## Files

- **index.ts** — Реэкспортирует конфигурации всех поддерживаемых JavaScript-подобных языков.
- **javascript.ts** — Определяет конфигурацию парсера для обычного JavaScript кода.
- **jsx.ts** — Расширяет JavaScript конфигурацию поддержкой JSX синтаксиса и элементов.
- **tsx.ts** — Расширяет TypeScript конфигурацию поддержкой TSX синтаксиса элементов.
- **typescript.ts** — Определяет полную конфигурацию для TypeScript с типами и интерфейсами.

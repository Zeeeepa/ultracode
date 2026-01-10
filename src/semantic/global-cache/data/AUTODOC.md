# Data

*Last updated: 2026-01-10*

Модуль глобального кэша содержит встроенные функции и паттерны фреймворков для всех языков программирования.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `REACT_PATTERNS` | const | Массив паттернов React с хуками, компонентами и JSX. | [→ frameworks.ts:10-12] |
| `ANGULAR_PATTERNS` | const | Массив паттернов Angular с декораторами и RxJS операторами. | [→ frameworks.ts:60-62] |
| `VUE_PATTERNS` | const | Массив паттернов Vue с реактивностью и композицией. | [→ frameworks.ts:127-129] |
| `EXPRESS_PATTERNS` | const | Массив паттернов Express с маршрутами и промежуточным слоем. | [→ frameworks.ts:169-171] |
| `NESTJS_PATTERNS` | const | Массив паттернов NestJS с декораторами и инъекцией. | [→ frameworks.ts:201-203] |
| `GO_BUILTINS` | const | Массив встроенных функций Go и импортов стандартной библиотеки. | [→ go-rust.ts:10-12] |
| `RUST_BUILTINS` | const | Массив встроенных типов Rust и методов обработки ошибок. | [→ go-rust.ts:52-54] |
| `getAllGlobalEntries` | function | Функция для получения всех записей глобального кэша. | [→ index.ts:29-44] |
| `JAVA_BUILTINS` | const | Массив встроенных классов Java и потоков обработки. | [→ java-kotlin.ts:10-12] |
| `KOTLIN_BUILTINS` | const | Массив функций области видимости Kotlin и корутин. | [→ java-kotlin.ts:74-76] |
| `JAVASCRIPT_BUILTINS` | const | Массив встроенных методов массивов, объектов и строк. | [→ javascript.ts:10-12] |
| `TYPESCRIPT_BUILTINS` | const | Массив утилит типов TypeScript и специальных конструкций. | [→ javascript.ts:122-124] |
| `PYTHON_BUILTINS` | const | Массив встроенных функций Python и типизации модулей. | [→ python.ts:10-12] |

## Files

- **frameworks.ts** — Паттерны React, Angular, Vue, Express и NestJS с хуками и декораторами.
- **go-rust.ts** — Встроенные функции Go и Rust с типами и методами.
- **index.ts** — Переэкспортирует все записи кэша и функцию их сбора.
- **java-kotlin.ts** — Встроенные классы Java и конструкции Kotlin с корутинами.
- **javascript.ts** — Встроенные объекты JavaScript и утилиты TypeScript.
- **python.ts** — Встроенные функции Python и импорты стандартной библиотеки.

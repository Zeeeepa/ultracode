# Framework

*Last updated: 2026-01-18*

Модуль для извлечения информации о фреймворках Java (JPA, Lombok, Spring) из исходного кода с поддержкой обнаружения и анализа аннотаций.

## Exports

| Name | Type | Location |
|------|------|----------|
| `detectJpaFramework` | function | [→ jpa-extractor.ts:63-74] |
| `detectLombokFramework` | function | [→ lombok-extractor.ts:69-77] |
| `detectSpringFramework` | function | [→ spring-extractor.ts:65-74] |
| `enrichEntityWithJpa` | function | [→ jpa-extractor.ts:200-206] |
| `enrichEntityWithLombok` | function | [→ lombok-extractor.ts:294-299] |
| `enrichEntityWithSpring` | function | [→ spring-extractor.ts:197-203] |
| `extractCustomQueries` | function | [→ jpa-extractor.ts:303-309] |
| `extractEndpoints` | function | [→ spring-extractor.ts:251-259] |
| `extractJpaInfo` | function | [→ jpa-extractor.ts:97-103] |
| `extractLombokInfo` | function | [→ lombok-extractor.ts:100-144] |
| `extractRepositoryEntityType` | function | [→ jpa-extractor.ts:286-298] |
| `extractSpringInfo` | function | [→ spring-extractor.ts:97-103] |
| `getJpaConfidence` | function | [→ jpa-extractor.ts:79-88] |
| `getLoggerType` | function | [→ lombok-extractor.ts:352-356] |
| `getLombokConfidence` | function | [→ lombok-extractor.ts:82-91] |
| `getSpringConfidence` | function | [→ spring-extractor.ts:79-88] |
| `hasLombokLogging` | function | [→ lombok-extractor.ts:337-343] |
| `inferGeneratedMethods` | function | [→ lombok-extractor.ts:153-285] |
| `isJpaRepository` | function | [→ jpa-extractor.ts:252-281] |

## Files

- `jpa-extractor.ts`
- `lombok-extractor.ts`
- `spring-extractor.ts`


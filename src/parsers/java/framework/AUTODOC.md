# Framework

*Last updated: 2026-01-18*

Модуль для извлечения информации о фреймворках Java (JPA, Lombok, Spring) из исходного кода с поддержкой обнаружения и анализа аннотаций.

## Exports

| Name | Type | Location |
|------|------|----------|
| `detectJpaFramework` | function | [→ jpa-extractor.ts:59-70] |
| `detectLombokFramework` | function | [→ lombok-extractor.ts:63-71] |
| `detectSpringFramework` | function | [→ spring-extractor.ts:59-68] |
| `enrichEntityWithJpa` | function | [→ jpa-extractor.ts:197-203] |
| `enrichEntityWithLombok` | function | [→ lombok-extractor.ts:285-288] |
| `enrichEntityWithSpring` | function | [→ spring-extractor.ts:192-198] |
| `extractCustomQueries` | function | [→ jpa-extractor.ts:292-296] |
| `extractEndpoints` | function | [→ spring-extractor.ts:247-255] |
| `extractJpaInfo` | function | [→ jpa-extractor.ts:93-99] |
| `extractLombokInfo` | function | [→ lombok-extractor.ts:94-138] |
| `extractRepositoryEntityType` | function | [→ jpa-extractor.ts:275-287] |
| `extractSpringInfo` | function | [→ spring-extractor.ts:91-97] |
| `getJpaConfidence` | function | [→ jpa-extractor.ts:75-84] |
| `getLoggerType` | function | [→ lombok-extractor.ts:339-343] |
| `getLombokConfidence` | function | [→ lombok-extractor.ts:76-85] |
| `getSpringConfidence` | function | [→ spring-extractor.ts:73-82] |
| `hasLombokLogging` | function | [→ lombok-extractor.ts:326-330] |
| `inferGeneratedMethods` | function | [→ lombok-extractor.ts:147-276] |
| `isJpaRepository` | function | [→ jpa-extractor.ts:246-270] |

## Files

- `jpa-extractor.ts`
- `lombok-extractor.ts`
- `spring-extractor.ts`


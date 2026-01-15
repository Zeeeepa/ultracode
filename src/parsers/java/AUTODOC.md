# Java

*Last updated: 2026-01-15*

Модуль для извлечения метаданных из Java AST с помощью ANTLR парсера.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `getLocation` | function | Извлекает информацию о положении AST узла в исходном коде | [→ extraction-helpers.ts:22-28] |
| `extractClassModifiers` | function | Получает модификаторы из объявления класса | [→ extraction-helpers.ts:65-69] |
| `extractInterfaceModifiers` | function | Получает модификаторы из объявления интерфейса | [→ extraction-helpers.ts:74-76] |
| `extractMethodModifiers` | function | Получает модификаторы из объявления метода | [→ extraction-helpers.ts:74-76] |
| `extractInterfaceMethodModifiers` | function | Получает модификаторы из метода интерфейса | [→ extraction-helpers.ts:74-76] |
| `extractFieldModifiers` | function | Получает модификаторы из объявления поля класса | [→ extraction-helpers.ts:88-91] |
| `extractConstructorModifiers` | function | Получает модификаторы из конструктора класса | [→ extraction-helpers.ts:96-100] |
| `extractConstantModifiers` | function | Получает модификаторы из константного поля | [→ extraction-helpers.ts:109-125] |
| `extractAnnotations` | function | Извлекает аннотации из модификаторов класса или перечисления | [→ extraction-helpers.ts:117-154] |
| `extractAnnotationsFromInterfaceModifiers` | function | Извлекает аннотации из модификаторов интерфейса | [→ extraction-helpers.ts:158-160] |
| `extractAnnotationsFromMethodModifiers` | function | Извлекает аннотации из модификаторов метода | [→ extraction-helpers.ts:165-167] |
| `extractAnnotationsFromFieldModifiers` | function | Извлекает аннотации из модификаторов поля класса | [→ extraction-helpers.ts:165-167] |
| `extractClassInheritance` | function | Получает информацию о наследовании класса | [→ extraction-helpers.ts:179-181] |
| `extractInterfaceInheritance` | function | Получает информацию о наследовании интерфейса | [→ extraction-helpers.ts:204-241] |
| `extractMethodParameters` | function | Извлекает параметры из объявления метода | [→ extraction-helpers.ts:238-276] |
| `extractConstructorParameters` | function | Извлекает параметры из объявления конструктора | [→ extraction-helpers.ts:275-281] |
| `extractCalls` | function | Получает информацию о вызовах методов в коде | [→ extraction-helpers.ts:340-351] |
| `ParserContext` | interface | Контекст передаваемый через функции парсинга Java кода | [→ types.ts:17-24] |
| `LocationInfo` | type | Информация о положении узла AST в исходном файле | [→ types.ts:33-36] |
| `AnnotationInfo` | interface | Данные об аннотации извлеченной из модификаторов узла | [→ types.ts:45-48] |
| `InheritanceInfo` | interface | Информация о базовых классах и реализуемых интерфейсах | [→ types.ts:53-56] |
| `ParameterInfo` | interface | Данные о параметре метода или конструктора класса | [→ types.ts:61-65] |

## Files

- **extraction-helpers.ts** — Вспомогательные функции для извлечения модификаторов, аннотаций и параметров из Java AST узлов
- **index.ts** — Переэкспорт всех модулей парсера Java для удобного импорта
- **types.ts** — Типы данных для контекста парсера и информации о местоположении

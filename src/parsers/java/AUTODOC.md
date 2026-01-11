# Java

*Last updated: 2026-01-11*

Модуль для извлечения метаданных из Java AST с помощью ANTLR парсера.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `getLocation` | function | Извлекает информацию о положении AST узла в исходном коде | [→ extraction-helpers.ts:22-38] |
| `extractClassModifiers` | function | Получает модификаторы из объявления класса | [→ extraction-helpers.ts:64-66] |
| `extractInterfaceModifiers` | function | Получает модификаторы из объявления интерфейса | [→ extraction-helpers.ts:71-73] |
| `extractMethodModifiers` | function | Получает модификаторы из объявления метода | [→ extraction-helpers.ts:78-80] |
| `extractInterfaceMethodModifiers` | function | Получает модификаторы из метода интерфейса | [→ extraction-helpers.ts:78-80] |
| `extractFieldModifiers` | function | Получает модификаторы из объявления поля класса | [→ extraction-helpers.ts:92-94] |
| `extractConstructorModifiers` | function | Получает модификаторы из конструктора класса | [→ extraction-helpers.ts:99-101] |
| `extractConstantModifiers` | function | Получает модификаторы из константного поля | [→ extraction-helpers.ts:106-108] |
| `extractAnnotations` | function | Извлекает аннотации из модификаторов класса или перечисления | [→ extraction-helpers.ts:117-154] |
| `extractAnnotationsFromInterfaceModifiers` | function | Извлекает аннотации из модификаторов интерфейса | [→ extraction-helpers.ts:157-161] |
| `extractAnnotationsFromMethodModifiers` | function | Извлекает аннотации из модификаторов метода | [→ extraction-helpers.ts:166-168] |
| `extractAnnotationsFromFieldModifiers` | function | Извлекает аннотации из модификаторов поля класса | [→ extraction-helpers.ts:173-175] |
| `extractClassInheritance` | function | Получает информацию о наследовании класса | [→ extraction-helpers.ts:184-208] |
| `extractInterfaceInheritance` | function | Получает информацию о наследовании интерфейса | [→ extraction-helpers.ts:211-215] |
| `extractMethodParameters` | function | Извлекает параметры из объявления метода | [→ extraction-helpers.ts:238-276] |
| `extractConstructorParameters` | function | Извлекает параметры из объявления конструктора | [→ extraction-helpers.ts:282-302] |
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

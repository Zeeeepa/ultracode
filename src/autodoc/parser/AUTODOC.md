# Parser Module Documentation

## Title and Overview

Модуль `parser` предназначен для разбора и обработки Markdown-документации и кода. Он предоставляет функции для извлечения ссылок, генерации ссылок на сущности и секции, а также валидации и обновления номеров строк в комментариях. Модуль используется для автоматической генерации документации и анализа структуры кода.

## Files

| File | Description |
|------|-------------|
| `index.ts` | Основной модуль, экспортирующий все функции парсера для внешнего использования |
| `link-extractor.ts` | Модуль для извлечения ссылок из комментариев и Markdown-документации |
| `md-parser.ts` | Парсер Markdown-документации, отвечающий за разбор структуры и извлечение секций |

## Exports

### `extractCommentRefs`
Извлекает ссылки на сущности из комментариев в коде.

### `extractReferences`
Извлекает все ссылки из Markdown-документации.

### `generateCodeRef`
Генерирует ссылку на код с указанием файла и строки.

### `generateDocRef`
Генерирует ссылку на документацию с указанием заголовка и раздела.

### `generateEntityRef`
Генерирует ссылку на сущность (класс, функцию, переменную).

### `generateFlowComment`
Генерирует комментарий с ссылкой на поток данных.

### `generateSeeDocComment`
Генерирует комментарий с ссылкой на документацию.

### `generateSeeEntityComment`
Генерирует комментарий с ссылкой на сущность.

### `updateLineNumbers`
Обновляет номера строк в комментариях при изменении кода.

### `validateReference`
Проверяет корректность ссылки на сущность или документацию.

### `extractTitle`
Извлекает заголовок из Markdown-документации.

### `findSectionById`
Находит секцию по её идентификатору.

### `findSectionByTitle`
Находит секцию по её заголовку.

### `flattenSections`
Преобразует вложенные секции в плоский список.

### `generateMarkdown`
Генерирует Markdown-документацию на основе структуры данных.

## Usage

```typescript
import { extractReferences, generateDocRef } from './parser';

const references = extractReferences(markdownContent);
const docRef = generateDocRef('api', 'user-management');
```
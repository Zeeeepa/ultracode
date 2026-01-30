# Nlp

Модуль обработки естественного языка для семантического поиска с расширением запросов

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `CooccurrenceIndex` | class | Класс для построения и запроса индекса совместного появления | [→ cooccurrence-index.ts:33-253] |
| `CooccurrenceIndexConfig` | interface | Параметры конфигурации индекса совместного появления терминов | [→ cooccurrence-index.ts:20-27] |
| `countTokens` | function | Функция для подсчёта частоты каждого токена в тексте | [→ tokenizer.ts:349-353] |
| `createPrfOnlyExpander` | function | Фабрика для создания расширителя с использованием только PRF | [→ query-expander.ts:222-227] |
| `ExpandedQuery` | interface | Результат расширения запроса с метаданными и весами | [→ query-expander.ts:37-50] |
| `extractNgrams` | function | Функция для извлечения последовательностей слов из текста | [→ tokenizer.ts:365-373] |
| `extractTopTerms` | function | Функция для извлечения главных терминов из документов | [→ tfidf.ts:192-198] |
| `QueryExpander` | class | Класс для расширения запросов с использованием совместного появления | [→ query-expander.ts:56-208] |
| `QueryExpansionConfig` | interface | Параметры конфигурации расширения поисковых запросов | [→ query-expander.ts:20-35] |
| `STOP_WORDS` | const | Множество стоп-слов на английском и русском языках | [→ tokenizer.ts:247-268] |
| `TermScore` | interface | Оценка термина с частотой и обратной частотой документов | [→ tfidf.ts:18-23] |
| `TfIdfExtractor` | class | Класс для извлечения главных терминов с TF-IDF оценками | [→ tfidf.ts:40-189] |
| `TfIdfOptions` | interface | Параметры конфигурации для извлечения TF-IDF оценок | [→ tfidf.ts:25-34] |
| `tokenize` | function | Функция для разделения текста на токены с фильтрацией | [→ tokenizer.ts:293-333] |
| `tokenizeUnique` | function | Функция для получения уникальных токенов из текста | [→ tokenizer.ts:339-341] |

## Files

- **cooccurrence-index.ts** — Индекс совместного появления терминов для расширения запросов
- **index.ts** — Главный файл экспорта всех компонентов модуля
- **query-expander.ts** — Автоматическое расширение поисковых запросов с использованием совместного появления
- **tfidf.ts** — Извлечение TF-IDF оценок для псевдо-релевантной обратной связи
- **tokenizer.ts** — Легкая токенизация текста с фильтрацией стоп-слов

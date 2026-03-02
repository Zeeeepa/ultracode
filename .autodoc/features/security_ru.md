# Анализ безопасности

## taint_analysis

Межпроцедурный taint-анализ для отслеживания ненадёжных данных от источников до приёмников и обнаружения отсутствующей санитизации.

### Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `projectPath` | string | текущий проект | Путь к директории проекта |
| `category` | enum | `"all"` | `sql_injection`, `xss`, `command_injection`, `path_traversal`, `ssrf`, `prototype_pollution` или `all` |
| `maxDepth` | number | `15` | Максимальная глубина трассировки путей |
| `includeTests` | boolean | `false` | Включать тестовые файлы в анализ |
| `offset` | number | `0` | Количество уязвимостей для пропуска (пагинация) |
| `limit` | number | `20` | Максимум уязвимостей в ответе (макс. 200) |

### Возвращает

| Поле | Описание |
|------|----------|
| `summary` | Краткая строка: всего потоков, critical/high, несанитизированных |
| `pagination` | Метаданные пагинации: `offset`, `limit`, `total`, `hasMore`, `nextOffset` |
| `stats` | Счётчики: sources, sinks, sanitizers, всего уязвимостей, разбивка по категориям |
| `formatted` | Текстовый отчёт для текущей страницы уязвимостей |

### Пагинация

Результаты пагинируются по умолчанию (20 на страницу). Используйте `offset` и `limit` для навигации:

```ts
// Первая страница (по умолчанию)
taint_analysis({ category: "all" })
// → pagination: { offset: 0, limit: 20, total: 85, hasMore: true, nextOffset: 20 }

// Следующая страница
taint_analysis({ category: "all", offset: 20, limit: 20 })

// Маленькие страницы для быстрых ответов
taint_analysis({ category: "sql_injection", offset: 0, limit: 5 })
```

### Примеры

```ts
// Полное сканирование безопасности
taint_analysis({ category: "all" })

// Только SQL-инъекции
taint_analysis({ category: "sql_injection" })

// Включая тестовые файлы
taint_analysis({ category: "xss", includeTests: true })

// С пагинацией
taint_analysis({ category: "all", offset: 0, limit: 10 })
```

### Как это работает

1. **Фаза обнаружения**: Сканирует все entity на паттерны source/sink/sanitizer с помощью каталогов регулярных выражений
2. **Поиск путей**: Для каждой пары (source, sink) с совпадающей категорией уязвимости использует поиск путей в графе
3. **Проверка санитизации**: Проверяет наличие санитайзера на пути, защищающего от соответствующей категории
4. **Расчёт критичности**: На основе категории (sql_injection=critical, xss=high и т.д.), длины пути и статуса санитизации
5. **Оценка уверенности**: На основе длины пути и статуса санитизации

### Поддерживаемые категории

| Категория | Источники | Приёмники | Пример |
|-----------|-----------|-----------|--------|
| `sql_injection` | req.body, req.query | db.query, knex.raw | Пользовательский ввод -> сырой SQL-запрос |
| `xss` | req.body, location.hash | innerHTML, document.write | Пользовательский ввод -> вставка в DOM |
| `command_injection` | req.body, process.env | exec, spawn | Пользовательский ввод -> shell-команда |
| `path_traversal` | req.params | fs.writeFile, path.join | Пользовательский ввод -> путь к файлу |
| `ssrf` | req.body | fetch, http.request | Пользовательский ввод -> исходящий URL |
| `prototype_pollution` | req.body | Object.assign, spread | Пользовательский ввод -> слияние объектов |

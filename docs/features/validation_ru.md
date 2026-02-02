# Валидация кода

🌐 **Language**: [EN](./validation.md) | [RU]

---

Инструменты для проверки качества кода с использованием линтеров.

---

## validate_file

Валидация одного файла с использованием соответствующего линтера (oxlint для JS/TS, Pylint для Python).

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | да | Путь к файлу |
| `fix` | boolean | нет | Автоматически исправить проблемы |
| `rules` | string[] | нет | Конкретные правила для проверки |

### Возвращает

```typescript
{
  filePath: string;
  valid: boolean;
  issues: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    line: number;
    column: number;
    rule: string;
    fixable: boolean;
  }>;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    fixableCount: number;
  };
  fixed?: boolean;
}
```

### Поддерживаемые языки

| Расширение | Линтер |
|------------|--------|
| `.ts`, `.tsx`, `.js`, `.jsx` | oxlint |
| `.py` | Pylint |
| `.go` | golint |
| `.rs` | clippy |

### Примеры

**Проверка:**
```
validate_file({
  filePath: "src/utils/validators.ts"
})
```

**Проверка с исправлением:**
```
validate_file({
  filePath: "src/utils/validators.ts",
  fix: true
})
```

---

## validate_directory

Пакетная валидация всех файлов в директории с параллельной обработкой.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `directory` | string | да | Путь к директории |
| `recursive` | boolean | нет | Рекурсивно обходить поддиректории (по умолчанию true) |
| `filePattern` | string | нет | Glob-паттерн для файлов |
| `excludePatterns` | string[] | нет | Паттерны исключения |
| `fix` | boolean | нет | Автоматически исправить проблемы |
| `concurrency` | number | нет | Параллельность обработки |

### Возвращает

```typescript
{
  directory: string;
  filesChecked: number;
  filesWithIssues: number;
  results: Array<{
    filePath: string;
    valid: boolean;
    errors: number;
    warnings: number;
  }>;
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalInfos: number;
    passRate: number;           // Процент файлов без ошибок
  };
  fixed?: number;
}
```

### Примеры

**Проверка директории:**
```
validate_directory({
  directory: "src/",
  excludePatterns: ["**/*.test.ts", "**/*.spec.ts"]
})
```

**Проверка с исправлением:**
```
validate_directory({
  directory: "src/components/",
  fix: true,
  concurrency: 4
})
```

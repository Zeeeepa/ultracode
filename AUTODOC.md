# ultrascript-tools-mcp

## Описание модуля

Модуль `ultrascript-tools-mcp` предоставляет конфигурацию для сборки TypeScript-проекта с использованием `tsup`. Этот модуль отвечает за настройку процесса транспиляции и сборки кода, включая поддержку различных форматов выходных файлов и оптимизацию для использования в различных средах выполнения.

## Файлы

- `oxlint.config.ts`
- `tsup.config.ts`

## Экспорты



## Использование

Данный модуль используется как часть конфигурации сборки проекта и не требует прямого импорта в коде приложения. Для использования необходимо включить его в конфигурацию сборки `tsup`:

```ts
// Пример использования в tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  splitting: false,
  sourcemap: true,
  clean: true,
})
```

## Biome Trust в Bun

Проект использует Biome для форматирования и линтинга кода. Biome имеет postinstall скрипт (проверка платформы), который требует trust в Bun.

**Уже настроено:** Biome добавлен в `trustedDependencies` в package.json.

**Если видите "Blocked 1 postinstall":**
```bash
bun pm trust @biomejs/biome
```

**Примечание:** Biome v2.0 уберет postinstall скрипт, устраняя эту необходимость.
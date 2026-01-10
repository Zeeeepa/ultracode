# Scripting Languages

*Last updated: 2026-01-10*

Модуль конфигураций языков программирования для парсеров кода.

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `BASH_CONFIG` | const | Объект конфигурации для анализа bash-скриптов и функций. | [→ bash.ts:8-51] |
| `BATCH_CONFIG` | const | Объект конфигурации для анализа batch и cmd-команд. | [→ batch.ts:8-52] |
| `POWERSHELL_CONFIG` | const | Объект конфигурации для анализа PowerShell-скриптов. | [→ powershell.ts:8-53] |
| `PYTHON_CONFIG` | const | Объект конфигурации для анализа Python-кода с типами. | [→ python.ts:8-164] |

## Files

- **bash.ts** — Конфигурация bash-скриптов и shell-команд.
- **batch.ts** — Конфигурация batch и cmd файлов Windows.
- **index.ts** — Экспорт всех конфигураций языков программирования.
- **powershell.ts** — Конфигурация PowerShell с поддержкой классов и фильтров.
- **python.ts** — Расширенная конфигурация Python с четырёхслойной архитектурой.

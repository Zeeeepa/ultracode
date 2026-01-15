# Python

*Last updated: 2026-01-15*

Продвинутый анализатор Python кода с четырёхслойной архитектурой

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `Layer1BasicAnalyzer` | class | Класс для анализа функций, классов, импортов, лямбд | [→ layer1-basic.ts:25-520] |
| `Layer2FeatureAnalyzer` | class | Класс для обнаружения магических методов и асинхронности | [→ layer2-features.ts:17-197] |
| `Layer3RelationshipAnalyzer` | class | Класс для анализа наследования и зависимостей между кодом | [→ layer3-relationships.ts:17-213] |
| `Layer4PatternAnalyzer` | class | Класс для распознавания паттернов и циклических зависимостей | [→ layer4-patterns.ts:21-24] |
| `PythonAnalyzer` | class | Основной класс анализатора с четырёхслойной архитектурой | [→ python-analyzer.ts:35-150] |
| `createPythonAnalyzer` | function | Функция создания экземпляра анализатора с конфигурацией | [→ python-analyzer.ts:157-161] |
| `analyzePythonFile` | function | Асинхронная функция анализа файла Python кода | [→ python-analyzer.ts:157-161] |
| `AnalysisContext` | interface | Интерфейс контекста анализа со всеми данными | [→ types.ts:23-32] |
| `PythonAnalysisConfig` | interface | Интерфейс конфигурации анализатора с переключателями слоёв | [→ types.ts:41-51] |
| `DEFAULT_PYTHON_CONFIG` | const | Объект конфигурации по умолчанию для анализатора | [→ types.ts:56-66] |
| `initializeMetrics` | function | Функция инициализации объекта метрик анализа | [→ types.ts:75-113] |

## Files

- **index.ts** — Главный файл модуля с переэкспортами компонентов анализатора
- **layer1-basic.ts** — Улучшенный базовый парсинг функций, классификация методов и типов
- **layer2-features.ts** — Анализ магических методов, свойств, асинхронных паттернов
- **layer3-relationships.ts** — Построение иерархии наследования и зависимостей между модулями
- **layer4-patterns.ts** — Распознавание паттернов контекстных менеджеров и исключений
- **python-analyzer.ts** — Основной класс анализатора с координацией всех слоёв
- **types.ts** — Общие типы и интерфейсы для анализатора

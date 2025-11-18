# Chaos Analysis - State Sprawl Detection

✅ **STATUS: WORKING IMPLEMENTATION**

## Обзор

**Chaos Analysis** - инструмент для обнаружения и анализа проблем с управлением состоянием в TypeScript/JavaScript кодебазах, с акцентом на Angular проекты.

### ✅ Статус реализации

**Полная рабочая версия** - GraphStorage API расширен, Chaos Analysis реализован!

**Новые методы GraphStorage:**
- ✅ `getAllEntities()` - получить все сущности из графа
- ✅ `searchEntities(pattern, types)` - поиск сущностей по паттерну
- ✅ `getRelationships(sourceId)` - получить связи сущности

**Реализовано:**
- ✅ Типы и интерфейсы (`src/types/chaos-analysis.ts`)
- ✅ MCP tool `analyze_state_chaos` зарегистрирован
- ✅ State Pattern Detection (упрощённая версия)
- ✅ Chaos Metrics (базовые метрики)
- ✅ Рефакторинг рекомендации
- ✅ AI-friendly Summary

### Проблема

В процессе разработки часто возникает ситуация "state sprawl" (размазывание состояния):
1. Состояние создаётся в одном месте
2. Передаётся через несколько компонентов
3. Каждый компонент начинает изменять его для себя
4. Появляются локальные копии, проверки, защитный код
5. При перезапуске процесса состояния начинают расходиться
6. **Результат**: хаос, тесно связанные компоненты, сложность поддержки

### Решение

Chaos Analysis автоматически:
- ✅ **Обнаруживает** паттерны работы с состоянием
- ✅ **Трассирует** откуда состояние появляется изначально
- ✅ **Строит граф** распространения состояния через код
- ✅ **Измеряет метрики** связанности, мутаций, защитного кода
- ✅ **Оценивает риск** расхождения состояний
- ✅ **Предлагает стратегию** рефакторинга

## Использование

### MCP Tool: `analyze_state_chaos`

```typescript
{
  "scope": "project",                          // "file" | "module" | "project"
  "stateIdentifiers": ["token", "userId"],     // Конкретные идентификаторы (опционально)
  "autoDetect": true,                          // Автоопределение (опционально)
  "format": "summary",                         // "summary" | "detailed" | "json"
  "maxDepth": 10,                              // Максимальная глубина трассировки
  "excludePatterns": ["**/*.spec.ts"]          // Паттерны исключения
}
```

### Примеры

#### 1. Анализ конкретного состояния

```typescript
// Анализ переменной "token" в проекте
{
  "scope": "project",
  "stateIdentifiers": ["token"],
  "format": "summary"
}
```

**Результат:**
```
## token
Хаос: 72/100 (high)
Файлов: 8, Операций: 23
Стратегия: Service
Усилия: Средняя (5-10 компонентов)

**Проблемные места:**
- auth.service.ts:getUserToken (изменяет состояние, защитный код, глубина 4)
- user-profile.component.ts:loadUser (защитный код, глубина 3)
- api.interceptor.ts:intercept (изменяет состояние, глубина 5)

**Быстрые исправления:**
- Удалить избыточные локальные копии состояния
- Консолидировать изменения состояния в одном месте
```

#### 2. Автоопределение всех проблемных состояний

```typescript
{
  "scope": "module",
  "autoDetect": true,
  "format": "summary"
}
```

Найдёт все переменные с именами вроде:
- `token`, `_token`, `savedToken`
- `userId`, `currentUser`
- `config`, `settings`, `state`
- `isLoading`, `hasAccess`
- и т.д.

#### 3. Детальный отчёт для человека

```typescript
{
  "scope": "project",
  "stateIdentifiers": ["anonymousId"],
  "format": "detailed"
}
```

**Результат:**
```markdown
# Анализ состояния: anonymousId

**Общая оценка:** 65/100
**Риск расхождения:** high

## Метрики
- Связанность: 68/100
- Компонентов затронуто: 12
- Точек изменения: 8
- Файлов с изменениями: 6
- Защитных паттернов: 15

## Рекомендация по рефакторингу
**Стратегия:** Service
**Обоснование:** Средняя связанность компонентов. Angular DI позволит легко внедрить сервис. BehaviorSubject обеспечит реактивность.

**Преимущества:**
- Снижение связанности: 40%
- Меньше точек изменения: -4

**Риски:**
- Изменения распределены по многим файлам - высокий риск регрессии
```

## Архитектура

### Компоненты

```
ChaosAnalyzer (главный оркестратор)
  ├── StateDetector         - обнаружение паттернов состояния
  ├── OriginTracer          - трассировка источников
  ├── FlowMapper            - построение графа распространения
  └── MetricsCalculator     - расчёт метрик хаоса
```

### Фазы анализа

1. **State Pattern Detection**
   - Поиск переменных состояния в Code Graph
   - Классификация операций (read/write/check/store/etc)
   - Детекция Angular паттернов (@Input, BehaviorSubject, etc)

2. **Origin Tracing**
   - Трассировка через импорты
   - Трассировка через DI (Angular services)
   - Построение цепочки зависимостей

3. **Flow Mapping**
   - Построение графа узлов (StateFlowNode)
   - Связывание через edges (data/control/import/injection)
   - Расчёт глубины (BFS от источника)

4. **Chaos Metrics**
   - **Coupling**: связанность компонентов через состояние
   - **Mutation Spread**: сколько мест меняют состояние
   - **Defensive Patterns**: проверки, копии, fallback-ы
   - **Divergence Risk**: риск расхождения (low/medium/high/critical)

5. **Refactoring Plan**
   - Выбор стратегии: Service | Store | Signal | Context
   - Оценка усилий и выгод
   - Идентификация рисков

## Angular-специфичные паттерны

Chaos Analysis распознаёт:

```typescript
// @Input/@Output
@Input() userData: User;
@Output() userChange = new EventEmitter<User>();

// BehaviorSubject
private userSubject = new BehaviorSubject<User>(null);

// Signals (Angular 16+)
userSignal = signal<User>(null);

// Services
@Injectable()
export class AuthService {
  private token: string;
}

// LocalStorage
localStorage.getItem('token');
sessionStorage.setItem('userId', id);

// Defensive patterns
user?.profile?.name ?? 'Guest'
const savedUser = { ...this.user }  // Копирование
```

## Метрики

### Chaos Score (0-100)

Вычисляется на основе:
- **Coupling** (30%): связанность компонентов
- **Mutation Spread** (25%): распределение изменений
- **Defensive Code** (20%): защитные паттерны
- **Divergence Risk** (15%): риск расхождения
- **Complexity** (10%): цикломатическая сложность

### Divergence Risk

- **low** (< 25): состояние управляется централизованно
- **medium** (25-50): есть проблемы, но контролируемые
- **high** (50-75): требуется рефакторинг
- **critical** (> 75): критическая ситуация, высокий риск багов

## Стратегии рефакторинга

### 1. Service (Angular)
```typescript
@Injectable({ providedIn: 'root' })
export class TokenService {
  private token$ = new BehaviorSubject<string | null>(null);

  getToken(): Observable<string | null> {
    return this.token$.asObservable();
  }

  setToken(token: string): void {
    this.token$.next(token);
  }
}
```

**Когда использовать:**
- Средняя связанность (30-70)
- Angular проект
- Нужна реактивность (RxJS)

### 2. Store (NgRx/Redux)
```typescript
// State
interface AppState {
  token: string | null;
}

// Actions
const setToken = createAction('[Auth] Set Token', props<{ token: string }>());

// Reducer
const authReducer = createReducer(
  initialState,
  on(setToken, (state, { token }) => ({ ...state, token }))
);
```

**Когда использовать:**
- Высокая связанность (> 70)
- Много изменений состояния (> 10 мест)
- Большое приложение

### 3. Signal (Angular 16+)
```typescript
export class AppComponent {
  token = signal<string | null>(null);

  updateToken(newToken: string) {
    this.token.set(newToken);
  }
}
```

**Когда использовать:**
- Низкая связанность (< 30)
- Простое состояние
- Angular 16+

### 4. Context (React) / DI Container
```typescript
@Injectable({ providedIn: 'root' })
export class AppContext {
  private state = {
    token: null as string | null,
    user: null as User | null
  };

  get<K extends keyof typeof this.state>(key: K) {
    return this.state[key];
  }

  set<K extends keyof typeof this.state>(key: K, value: typeof this.state[K]) {
    this.state[key] = value;
  }
}
```

**Когда использовать:**
- Много защитного кода
- Нужна типобезопасность
- Централизованный доступ

## Интеграция с другими инструментами

### Code Graph RAG
Chaos Analysis использует Code Graph RAG для:
- Поиска переменных и их использований
- Трассировки импортов и зависимостей
- Построения графа распространения

### Semantic Search
Может использовать embeddings для:
- Группировки связанных состояний
- Поиска похожих паттернов
- Семантического анализа кода

## Ограничения

1. **Зависит от индексации**: требуется проиндексированный Code Graph
2. **Статический анализ**: не анализирует runtime поведение
3. **TypeScript/JavaScript**: оптимизирован для TS/JS и Angular
4. **Эвристики**: использует паттерны и эвристики, может быть неточным

## Roadmap

- [ ] Визуализация графа (Mermaid/GraphViz)
- [ ] Автоматический рефакторинг (генерация кода)
- [ ] Поддержка React/Vue специфичных паттернов
- [ ] Интеграция с ESLint для проверок на CI
- [ ] ML-based улучшение детекции паттернов

## Примеры использования

См. `examples/chaos-analysis-example.ts` для полных примеров.

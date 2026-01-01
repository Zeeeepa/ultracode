# TypeScript Configuration

Оптимизированная конфигурация TypeScript для ESM + Bun/Node runtime.

## Результаты оптимизации

| Метрика | До | После | Изменение |
|---------|-----|-------|-----------|
| Размер dist/ | 192 MB | 95 MB | **-50%** |
| TS ошибки | 884 | 0 | Исправлено |

---

## Опции уменьшения размера кода

### `target: "ESNext"` / `lib: ["ESNext"]`

**Эффект:** Минимум полифиллов и трансформаций.

Код генерируется максимально близко к нативному JS. Не нужны хелперы для:
- Приватных полей (`#field`)
- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- Top-level await

**Требование:** Node 18+ / Bun 1.0+

### `importHelpers: true`

**Эффект:** -20-25% размера бандла.

Вместо дублирования хелперов (`__extends`, `__awaiter`, `__spread`) в каждом файле, они импортируются из `tslib`.

```typescript
// БЕЗ importHelpers (в каждом файле):
var __awaiter = (this && this.__awaiter) || function ...

// С importHelpers:
import { __awaiter } from "tslib";
```

**Требование:** `npm i tslib` / `bun add tslib`

### `removeComments: true`

**Эффект:** -5-10% размера.

Убирает все комментарии из генерируемого JS. JSDoc и обычные комментарии не попадают в dist.

---

## Опции производительности runtime

### `useDefineForClassFields: true`

**Эффект:** Быстрее инициализация классов.

Использует современный синтаксис определения полей класса вместо legacy-паттерна.

```typescript
// legacy (useDefineForClassFields: false)
class Foo {
  constructor() {
    this.x = 1;
  }
}

// modern (useDefineForClassFields: true)
class Foo {
  x = 1;
}
```

V8 лучше оптимизирует современный синтаксис.

### `verbatimModuleSyntax: true`

**Эффект:** Чище импорты, лучше tree-shaking.

Не вставляет обёртки вокруг импортов. Требует явного `import type` для типов:

```typescript
import type { Foo } from "./foo";  // Удаляется при компиляции
import { Bar } from "./bar";        // Остаётся в JS
```

### `isolatedModules: true`

**Эффект:** Улучшает tree-shaking.

Каждый файл компилируется независимо. Запрещает:
- `const enum` (инлайнится в другие файлы)
- `export =` / `import =`
- Re-export типов без `type`

Необходимо для совместимости с esbuild/swc/Bun.

---

## Опции строгости типов

### `strict: true`

Включает все строгие проверки:
- `noImplicitAny`
- `strictNullChecks`
- `strictFunctionTypes`
- `strictBindCallApply`
- `strictPropertyInitialization`
- `noImplicitThis`
- `alwaysStrict`

### `noPropertyAccessFromIndexSignature: true`

**Эффект:** Безопаснее работа с объектами с index signature.

```typescript
interface Dict { [key: string]: string }
const d: Dict = {};

d.foo      // Ошибка: используй d['foo']
d['foo']   // OK
```

Предотвращает опечатки при доступе к динамическим свойствам.

### `noImplicitOverride: true`

**Эффект:** Явный `override` для переопределённых методов.

```typescript
class Base { foo() {} }

class Derived extends Base {
  override foo() {}  // Требуется 'override'
}
```

Ловит ошибки при рефакторинге базового класса.

### `useUnknownInCatchVariables: true`

**Эффект:** `unknown` вместо `any` в catch.

```typescript
try { ... }
catch (e) {
  // e: unknown - нужна проверка типа
  if (e instanceof Error) {
    console.log(e.message);
  }
}
```

### `noUncheckedIndexedAccess: true`

**Эффект:** Массивы и объекты возвращают `T | undefined`.

```typescript
const arr = [1, 2, 3];
const x = arr[0];  // x: number | undefined

if (x !== undefined) {
  console.log(x);  // x: number
}
```

Предотвращает ошибки выхода за границы массива.

### `noUncheckedSideEffectImports: true`

**Эффект:** Проверка существования side-effect импортов.

```typescript
import "./polyfill";  // Ошибка если файл не существует
```

---

## Опции качества кода

### `noUnusedLocals: true` / `noUnusedParameters: true`

Ошибка компиляции при неиспользуемых переменных и параметрах.

### `noImplicitReturns: true`

Все пути функции должны возвращать значение.

### `noFallthroughCasesInSwitch: true`

Требует `break` или `return` в каждом case.

---

## Отложенные опции

### `exactOptionalPropertyTypes: true`

**Статус:** Отключено (304 ошибки, требует рефакторинга)

Различает `prop?: T` и `prop: T | undefined`:

```typescript
interface Foo {
  bar?: string;  // Свойство может отсутствовать
}

const f: Foo = { bar: undefined };  // Ошибка!
const f: Foo = {};                   // OK
```

**Исправление:** Использовать conditional spread:
```typescript
// Было:
{ bar: value || undefined }

// Стало:
{ ...(value && { bar: value }) }
```

---

## Полная конфигурация

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "allowJs": true,

    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "verbatimModuleSyntax": true,

    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,

    "importHelpers": true,
    "removeComments": true,

    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,

    "useDefineForClassFields": true,

    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,

    "isolatedModules": true,

    "types": ["node", "bun"]
  }
}
```

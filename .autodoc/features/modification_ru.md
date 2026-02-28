# Модификация кода

🌐 **Language**: [EN](./modification.md) | [RU]

---

Инструменты для безопасного изменения кода с автоматической валидацией и обновлением графа.

---

## modify_code

Модификация кода сущности по ID. Автоматически создаёт снапшот, валидирует изменения и обновляет эмбеддинги.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | да | ID сущности для модификации |
| `newCode` | string | да | Новый код |
| `preview` | boolean | нет | Режим предпросмотра без применения (по умолчанию true) |
| `createSnapshot` | boolean | нет | Создать снапшот перед изменением |
| `validate` | boolean | нет | Валидировать код после изменения |
| `rollbackOnError` | boolean | нет | Откатить при ошибке валидации |

### Возвращает

```typescript
{
  success: boolean;
  entityId: string;
  filePath: string;
  diff: {
    before: string;
    after: string;
    hunks: Array<{ oldStart: number; newStart: number; lines: string[]; }>;
  };
  validation?: {
    passed: boolean;
    issues: Array<{ severity: string; message: string; line: number; }>;
  };
  snapshotId?: string;
  appliedChanges: boolean;
}
```

### Примеры

**Предпросмотр изменений:**
```
modify_code({
  entityId: "src/utils/format.ts:formatDate",
  newCode: "function formatDate(date: Date): string { return date.toISOString(); }",
  preview: true
})
```

**Применение с валидацией:**
```
modify_code({
  entityId: "src/utils/format.ts:formatDate",
  newCode: "...",
  preview: false,
  validate: true,
  rollbackOnError: true
})
```

**Swagger-предупреждения о контрактах**: При модификации сущностей, связанных со Swagger/OpenAPI, ответ включает `swaggerWarning` и секцию `swaggerImpact` с деталями нарушений контракта. См. [swagger_ru.md](swagger_ru.md).

---

## create_file

Создание нового файла с автоматическим парсингом и добавлением в граф.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | да | Путь к новому файлу |
| `content` | string | да | Содержимое файла |
| `overwrite` | boolean | нет | Перезаписать если существует |

### Возвращает

```typescript
{
  success: boolean;
  filePath: string;
  entitiesCreated: Array<{
    entityId: string;
    name: string;
    type: string;
  }>;
  relationshipsCreated: number;
}
```

### Примеры

```
create_file({
  filePath: "src/utils/validators.ts",
  content: `
export function validateEmail(email: string): boolean {
  return /^[^@]+@[^@]+\\.[^@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\\+?[0-9]{10,14}$/.test(phone);
}
`
})
```

---

## copy_file

Копирование файла или директории с обновлением графа. Поддерживает streaming для больших файлов.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `source` | string | да | Исходный путь |
| `destination` | string | да | Целевой путь |
| `overwrite` | boolean | нет | Перезаписать если существует |

### Возвращает

```typescript
{
  success: boolean;
  source: string;
  destination: string;
  filesCopied: number;
  entitiesCreated: number;
}
```

### Примеры

```
copy_file({
  source: "src/components/Button.tsx",
  destination: "src/components/IconButton.tsx"
})
```

---

## rename_file

Переименование файла с автоматическим обновлением импортов во всём проекте.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `oldPath` | string | да | Текущий путь |
| `newPath` | string | да | Новый путь |
| `updateImports` | boolean | нет | Обновить импорты (по умолчанию true) |

### Возвращает

```typescript
{
  success: boolean;
  oldPath: string;
  newPath: string;
  importsUpdated: Array<{
    filePath: string;
    line: number;
    oldImport: string;
    newImport: string;
  }>;
}
```

### Примеры

```
rename_file({
  oldPath: "src/utils/helpers.ts",
  newPath: "src/utils/string-helpers.ts"
})
```

---

## split_file

Разделение файла на несколько файлов. Полезно для рефакторинга больших файлов.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | да | Путь к файлу |
| `entities` | array | да | Сущности для извлечения |
| `updateImports` | boolean | нет | Обновить импорты |

### Формат entities

```typescript
entities: [
  { entityId: "...", targetFile: "src/utils/validators.ts" },
  { entityId: "...", targetFile: "src/utils/formatters.ts" }
]
```

### Возвращает

```typescript
{
  success: boolean;
  originalFile: string;
  createdFiles: Array<{
    filePath: string;
    entities: string[];
  }>;
  importsUpdated: number;
}
```

### Примеры

```
split_file({
  filePath: "src/utils/index.ts",
  entities: [
    { entityId: "src/utils/index.ts:validateEmail", targetFile: "src/utils/validators.ts" },
    { entityId: "src/utils/index.ts:formatDate", targetFile: "src/utils/formatters.ts" }
  ]
})
```

---

## synthesize_files

Объединение нескольких файлов в один.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `sourceFiles` | string[] | да | Пути к исходным файлам |
| `targetFile` | string | да | Путь к целевому файлу |
| `deleteOriginals` | boolean | нет | Удалить исходные файлы |
| `updateImports` | boolean | нет | Обновить импорты |

### Возвращает

```typescript
{
  success: boolean;
  targetFile: string;
  mergedEntities: number;
  deletedFiles?: string[];
  importsUpdated: number;
}
```

### Примеры

```
synthesize_files({
  sourceFiles: [
    "src/utils/string-validators.ts",
    "src/utils/number-validators.ts"
  ],
  targetFile: "src/utils/validators.ts",
  deleteOriginals: true
})
```

---

## rename_symbol

Переименование символа (переменной, функции, класса) с обновлением всех ссылок.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `entityId` | string | да* | ID сущности |
| `name` | string | да* | Имя символа (если нет ID) |
| `filePath` | string | нет | Путь к файлу (для уточнения name) |
| `newName` | string | да | Новое имя |
| `preview` | boolean | нет | Режим предпросмотра |

*Укажите либо `entityId`, либо `name`

### Возвращает

```typescript
{
  success: boolean;
  oldName: string;
  newName: string;
  referencesUpdated: Array<{
    filePath: string;
    line: number;
    column: number;
  }>;
  totalReferences: number;
}
```

### Примеры

```
rename_symbol({
  entityId: "src/services/auth.ts:AuthService",
  newName: "AuthenticationService",
  preview: true
})
```

---

## add_member

Добавление нового члена (метод, свойство, поле) в класс или интерфейс.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `targetEntityId` | string | да | ID класса/интерфейса |
| `memberCode` | string | да | Код нового члена |
| `position` | string | нет | Позиция: `start`, `end`, `after:memberName`, `before:memberName` |
| `memberType` | string | нет | Тип: `method`, `property`, `field` |

### Возвращает

```typescript
{
  success: boolean;
  targetEntity: string;
  newMember: {
    entityId: string;
    name: string;
    type: string;
  };
  position: number;
}
```

### Примеры

**Добавление метода:**
```
add_member({
  targetEntityId: "src/services/user.ts:UserService",
  memberCode: `
  async deleteUser(id: string): Promise<void> {
    await this.repository.delete(id);
  }
  `,
  position: "after:updateUser"
})
```

**Добавление свойства:**
```
add_member({
  targetEntityId: "src/models/user.ts:User",
  memberCode: "readonly createdAt: Date;",
  memberType: "property",
  position: "end"
})
```

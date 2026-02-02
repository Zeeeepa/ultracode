# Снапшоты и откат

🌐 **Language**: [EN](./snapshots.md) | [RU]

---

Инструменты для создания точек восстановления и безопасного отката изменений.

---

## create_snapshot

Создание снапшота текущего состояния для возможности отката. Использует git stash если доступен, иначе `.backup/` директорию.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `description` | string | нет | Описание снапшота |
| `files` | string[] | нет | Конкретные файлы (по умолчанию все изменённые) |
| `includeUntracked` | boolean | нет | Включать неотслеживаемые файлы |

### Возвращает

```typescript
{
  success: boolean;
  snapshotId: string;
  description: string;
  timestamp: string;
  files: string[];
  method: "git_stash" | "backup_directory";
  size: number;                 // Размер в байтах
}
```

### Примеры

**Снапшот всех изменений:**
```
create_snapshot({
  description: "Перед рефакторингом AuthService"
})
```

**Снапшот конкретных файлов:**
```
create_snapshot({
  description: "Backup utils",
  files: ["src/utils/validators.ts", "src/utils/formatters.ts"]
})
```

---

## undo

Откат к предыдущему снапшоту. Восстанавливает все файлы в состояние снапшота.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `snapshotId` | string | да | ID снапшота для отката |
| `force` | boolean | нет | Принудительный откат даже при конфликтах |

### Возвращает

```typescript
{
  success: boolean;
  snapshotId: string;
  restoredFiles: string[];
  conflicts?: Array<{
    file: string;
    reason: string;
  }>;
}
```

### Примеры

```
undo({ snapshotId: "snap_abc123" })
```

---

## list_snapshots

Список доступных снапшотов с временем создания и описанием.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `limit` | number | нет | Максимум результатов |
| `since` | string | нет | Дата начала (ISO формат) |

### Возвращает

```typescript
{
  snapshots: Array<{
    snapshotId: string;
    description: string;
    timestamp: string;
    files: string[];
    size: number;
    method: "git_stash" | "backup_directory";
  }>;
  totalCount: number;
  totalSize: number;
}
```

### Примеры

```
list_snapshots({ limit: 10 })
```

---

## cleanup_snapshots

Удаление старых снапшотов для освобождения места.

### Параметры

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `keep` | number | нет | Количество последних снапшотов для сохранения |
| `olderThan` | string | нет | Удалить старше указанной даты |
| `dryRun` | boolean | нет | Показать что будет удалено |

### Возвращает

```typescript
{
  success: boolean;
  deletedSnapshots: string[];
  keptSnapshots: string[];
  freedSpace: number;
  dryRun: boolean;
}
```

### Примеры

**Предпросмотр:**
```
cleanup_snapshots({ keep: 5, dryRun: true })
```

**Очистка:**
```
cleanup_snapshots({ olderThan: "2024-01-01" })
```

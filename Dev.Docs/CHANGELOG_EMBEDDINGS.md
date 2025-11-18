# Embeddings Setup - Changelog

## 2025-01-15 - Interactive Setup Scripts

### ✨ Новое

**Интерактивный выбор embedding провайдера:**
- ✅ Добавлены `setup-embeddings-interactive.sh` и `setup-embeddings-interactive.cmd`
- ✅ Пользователь выбирает между TEI, Ollama или Memory provider при установке
- ⚠️  TEI требует RTX 30xx/40xx GPU (CC 8.0+)
- ❌ TEI НЕ РАБОТАЕТ на GTX 16xx/20xx и CPU
- 🏆 Ollama рекомендуется для всех GPU < RTX 30xx и CPU-only систем

### 📝 Изменения

**Обновленная документация:**
- `EMBEDDINGS_SETUP.md` - интерактивный скрипт теперь рекомендуемый способ
- Legacy скрипты `setup-embeddings.sh/cmd` помечены как устаревшие (только Ollama)

### 🎯 Рекомендации

**Новые пользователи:**
```bash
# Unix/macOS
./setup-embeddings-interactive.sh

# Windows
setup-embeddings-interactive.cmd
```

**Существующие пользователи с Ollama:**
- Продолжайте использовать Ollama (все работает отлично на CPU)
- TEI рекомендуется только при наличии NVIDIA GPU:
  ```bash
  ./setup-tei.sh  # или setup-tei.cmd (только для NVIDIA GPU!)
  ```

### 📊 Сравнение провайдеров

| Провайдер | Контекст | Docker | Размер | Рекомендация |
|-----------|----------|--------|--------|--------------|
| **TEI** | **8192 tokens** | ✅ Требуется | ~2 GB | ⚠️ **Только RTX 30xx/40xx** |
| Ollama | 512 tokens | ❌ | ~200 MB | 🏆 **Рекомендуется** (любой GPU/CPU) |
| Memory | N/A | ❌ | 0 MB | 🔙 Fallback |

### ⚙️ Конфигурация

**TEI (по умолчанию в `config/default.yaml`):**
```yaml
mcp:
  embedding:
    provider: "tei"
    model: "ibm-granite/granite-embedding-english-r2"
    enabled: true
```

**Ollama (ручная настройка в `config/development.yaml`):**
```yaml
mcp:
  embedding:
    provider: "ollama"
    model: "granite-embedding"
    enabled: true
```

### 🔗 Ссылки

- [Полная документация](./EMBEDDINGS_SETUP.md)
- [TEI Setup Guide](./EMBEDDINGS_SETUP.md#-tei---локальный-инференс-с-8192-токенами)
- [Troubleshooting](./EMBEDDINGS_SETUP.md#troubleshooting)

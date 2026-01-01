# TEI gRPC Migration Plan

## Status: WAITING

Ожидаем merge PR в TEI для поддержки Blackwell (GTX 50xx).
После этого будет доступен gRPC образ для Blackwell.

**Tracking:**
- Форк: https://hub.docker.com/r/hotchpotch/tei-blackwell-testing
- Upstream TEI: https://github.com/huggingface/text-embeddings-inference

## Почему gRPC?

По данным HuggingFace, gRPC интерфейс **значительно быстрее** HTTP:
- Меньше overhead на сериализацию (protobuf vs JSON)
- Persistent connections с multiplexing
- Streaming support
- Лучшее использование GPU (меньше простоев)

## Текущее состояние

### HTTP Provider (сейчас)
- `src/semantic/providers/tei-provider.ts`
- Pipeline с sliding window (concurrency 16)
- Batch splitting для больших запросов
- ~20% загрузка GPU (недогружен)

### Проблема
Форк `hotchpotch/tei-blackwell-testing` не включает gRPC бинарник.
Официальный TEI gRPC образ не поддерживает Blackwell.

## План миграции

### Phase 1: Подготовка proto (можно сделать сейчас)

1. Скачать TEI proto файл:
   ```
   src/semantic/providers/proto/tei.proto
   ```
   Источник: https://github.com/huggingface/text-embeddings-inference/blob/main/proto/tei.proto

2. Добавить в tsup.config.ts копирование proto

### Phase 2: gRPC клиент

1. Создать `src/semantic/providers/tei-grpc-client.ts`:
   ```typescript
   // Использовать @grpc/grpc-js
   // Реализовать tei.v1.Embed/Embed
   // Реализовать tei.v1.Embed/EmbedStream (для batch)
   ```

2. Обновить `tei-provider.ts`:
   - Добавить опцию `useGrpc: boolean`
   - Автоопределение по наличию gRPC endpoint
   - Fallback на HTTP если gRPC недоступен

### Phase 3: Docker образы

1. Обновить `config/embedding-models.json`:
   ```json
   {
     "image_gpu": "ghcr.io/huggingface/text-embeddings-inference:1.8-grpc",
     "image_gpu_blackwell": "hotchpotch/tei-blackwell-testing:grpc"  // когда появится
   }
   ```

2. Обновить `src/cli/setup/setup-installers.ts`:
   - Порт 80 для gRPC (тот же что HTTP)
   - Или отдельный порт если нужен dual-mode

### Phase 4: Тестирование

1. Benchmark HTTP vs gRPC:
   - Throughput (chunks/sec)
   - Latency (p50, p95, p99)
   - GPU utilization

2. Проверить стабильность при высокой нагрузке

## gRPC Proto Reference

```protobuf
syntax = "proto3";
package tei.v1;

service Embed {
  rpc Embed(EmbedRequest) returns (EmbedResponse);
  rpc EmbedStream(stream EmbedRequest) returns (stream EmbedResponse);
}

message EmbedRequest {
  string inputs = 1;
  bool truncate = 2;
  bool normalize = 3;
}

message EmbedResponse {
  repeated float embeddings = 1;
}
```

## Оценка улучшения

| Метрика | HTTP (сейчас) | gRPC (ожидание) |
|---------|---------------|-----------------|
| GPU Load | ~20% | 60-80% |
| Throughput | ~450 chunks/s | ~1000+ chunks/s |
| Latency | ~10ms | ~3-5ms |

## Временные оптимизации HTTP

Пока ждём gRPC, применены:
- [x] Sliding window pipeline (не ждём весь batch)
- [x] Concurrency 8 → 16
- [x] max_batch_tokens 16K → 32K
- [x] max_client_batch_size 512 → 1024

## Links

- [TEI GitHub](https://github.com/huggingface/text-embeddings-inference)
- [TEI gRPC Docs](https://huggingface.co/docs/text-embeddings-inference/en/quick_tour)
- [Blackwell Fork](https://hub.docker.com/r/hotchpotch/tei-blackwell-testing)

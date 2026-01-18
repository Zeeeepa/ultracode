# Semantic

*Last updated: 2026-01-18*

Модуль для обработки семантических агентов с функциями кэширования, обработки комментариев и встраивания.

## Exports

| Name | Type | Location |
|------|------|----------|
| `AnalyzeHotspotsResult` | interface | [→ vector-index-manager.ts:30-33] |
| `buildEmbeddingGeneratorOptions` | function | [→ provider-config.ts:211-279] |
| `buildEmbeddingText` | function | [→ embedding-processor.ts:104-174] |
| `buildVectorMetadata` | function | [→ embedding-processor.ts:179-236] |
| `buildWarmupText` | function | [→ cache-warmup.ts:41-68] |
| `buildWorkerProviderOptions` | function | [→ provider-config.ts:161-206] |
| `CacheWarmupContext` | interface | [→ cache-warmup.ts:24-32] |
| `CommentProcessorContext` | interface | [→ comment-processor.ts:27-33] |
| `deduplicateAndCheckCaches` | function | [→ embedding-processor.ts:312-395] |
| `DeduplicationResult` | interface | [→ embedding-processor.ts:298-307] |
| `EMBEDDING_EXCLUDE_PATTERNS` | const | [→ embedding-processor.ts:46-82] |
| `EmbeddingProcessorContext` | interface | [→ embedding-processor.ts:59-82] |
| `generateEmbeddings` | function | [→ embedding-processor.ts:404-442] |
| `getBatchSizeFromConfig` | function | [→ provider-config.ts:284-293] |
| `getModelNameFromSemanticConfig` | function | [→ provider-config.ts:142-155] |
| `HotspotItem` | interface | [→ vector-index-manager.ts:16-28] |
| `mapSemanticConfigToProvider` | function | [→ provider-config.ts:112-132] |
| `processPreGeneratedEmbeddings` | function | [→ embedding-processor.ts:245-249] |
| `processStandaloneComments` | function | [→ comment-processor.ts:47-52] |
| `ProviderKind` | type | [→ provider-config.ts:13-23] |
| `shouldExcludeFromEmbedding` | function | [→ embedding-processor.ts:91-99] |
| `VectorIndexManager` | class | [→ vector-index-manager.ts:38-38] |
| `warmupSemanticCache` | function | [→ cache-warmup.ts:77-239] |

## Files

- `cache-warmup.ts`
- `comment-processor.ts`
- `embedding-processor.ts`
- `index.ts`
- `provider-config.ts`
- `vector-index-manager.ts`


# Semantic

*Last updated: 2026-01-10*

Модуль для обработки семантических агентов с функциями кэширования, обработки комментариев и встраивания.

## Exports

| Name | Type | Location |
|------|------|----------|
| `AnalyzeHotspotsResult` | interface | [→ vector-index-manager.ts:29-32] |
| `buildEmbeddingGeneratorOptions` | function | [→ provider-config.ts:115-186] |
| `buildEmbeddingText` | function | [→ embedding-processor.ts:96-165] |
| `buildVectorMetadata` | function | [→ embedding-processor.ts:170-227] |
| `buildWarmupText` | function | [→ cache-warmup.ts:41-61] |
| `buildWorkerProviderOptions` | function | [→ provider-config.ts:67-110] |
| `CacheWarmupContext` | interface | [→ cache-warmup.ts:24-32] |
| `CommentProcessorContext` | interface | [→ comment-processor.ts:25-31] |
| `deduplicateAndCheckCaches` | function | [→ embedding-processor.ts:303-386] |
| `DeduplicationResult` | interface | [→ embedding-processor.ts:289-298] |
| `EMBEDDING_EXCLUDE_PATTERNS` | const | [→ embedding-processor.ts:38-74] |
| `EmbeddingProcessorContext` | interface | [→ embedding-processor.ts:51-74] |
| `generateEmbeddings` | function | [→ embedding-processor.ts:395-433] |
| `getBatchSizeFromConfig` | function | [→ provider-config.ts:191-200] |
| `getModelNameFromSemanticConfig` | function | [→ provider-config.ts:43-62] |
| `HotspotItem` | interface | [→ vector-index-manager.ts:15-27] |
| `mapSemanticConfigToProvider` | function | [→ provider-config.ts:18-38] |
| `processPreGeneratedEmbeddings` | function | [→ embedding-processor.ts:236-240] |
| `processStandaloneComments` | function | [→ comment-processor.ts:45-50] |
| `ProviderKind` | type | [→ provider-config.ts:12] |
| `shouldExcludeFromEmbedding` | function | [→ embedding-processor.ts:83-91] |
| `VectorIndexManager` | class | [→ vector-index-manager.ts:34-204] |
| `warmupSemanticCache` | function | [→ cache-warmup.ts:70-231] |

## Files

- `cache-warmup.ts`
- `comment-processor.ts`
- `embedding-processor.ts`
- `index.ts`
- `provider-config.ts`
- `vector-index-manager.ts`

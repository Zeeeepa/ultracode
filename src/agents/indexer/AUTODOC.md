# Indexer

*Last updated: 2026-01-10*

Модуль индексирования сущностей, отношений и обработки событий Git для анализа кода

## Exports

| Name | Type | Location |
|------|------|----------|
| `buildEntityNameMap` | function | [→ entity-resolution.ts:16-24] |
| `buildRelationships` | function | [→ relationship-builder.ts:16-184] |
| `createExternalPlaceholder` | function | [→ external-placeholder.ts:60-92] |
| `EmbeddingSchedulerContext` | interface | [→ git-event-handlers.ts:132-139] |
| `GitEventContext` | interface | [→ git-event-handlers.ts:17-21] |
| `handleBranchChange` | function | [→ git-event-handlers.ts:103-130] |
| `handleDebouncedEmbeddingGeneration` | function | [→ git-event-handlers.ts:72-98] |
| `handleUncommittedChanges` | function | [→ git-event-handlers.ts:27-64] |
| `initXXHash` | function | [→ stable-id.ts:27-31] |
| `parseExternalId` | function | [→ external-placeholder.ts:19] |
| `processExternalRelationships` | function | [→ external-placeholder.ts:102] |
| `resolveByNameAndLine` | function | [→ entity-resolution.ts:35-52] |
| `runtimeSleep` | function | [→ git-event-handlers.ts:144-150] |
| `scheduleEmbeddingGeneration` | function | [→ git-event-handlers.ts:156-183] |
| `stableEntityId` | function | [→ stable-id.ts:52-61] |
| `stableRelationshipId` | function | [→ stable-id.ts:66-68] |
| `triggerEmbeddingGeneration` | function | [→ git-event-handlers.ts:189-211] |

## Files

- `entity-resolution.ts`
- `external-placeholder.ts`
- `git-event-handlers.ts`
- `index.ts`
- `relationship-builder.ts`
- `stable-id.ts`

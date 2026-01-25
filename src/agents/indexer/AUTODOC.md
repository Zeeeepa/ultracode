# Indexer

*Last updated: 2026-01-25*

Модуль индексирования сущностей, отношений и обработки событий Git для анализа кода

## Exports

| Name | Type | Location |
|------|------|----------|
| `buildEntityNameMap` | function | [→ entity-resolution.ts:16-24] |
| `buildRelationships` | function | [→ relationship-builder.ts:16-184] |
| `createExternalPlaceholder` | function | [→ external-placeholder.ts:60-92] |
| `EmbeddingSchedulerContext` | interface | [→ git-event-handlers.ts:181-188] |
| `GitEventContext` | interface | [→ git-event-handlers.ts:19-23] |
| `handleBranchChange` | function | [→ git-event-handlers.ts:131-179] |
| `handleDebouncedEmbeddingGeneration` | function | [→ git-event-handlers.ts:74-100] |
| `handleUncommittedChanges` | function | [→ git-event-handlers.ts:29-66] |
| `initXXHash` | function | [→ stable-id.ts:27-31] |
| `parseExternalId` | function | [→ external-placeholder.ts:19] |
| `processExternalRelationships` | function | [→ external-placeholder.ts:102] |
| `resolveByNameAndLine` | function | [→ entity-resolution.ts:39-70] |
| `runtimeSleep` | function | [→ git-event-handlers.ts:193-195] |
| `scheduleEmbeddingGeneration` | function | [→ git-event-handlers.ts:201-228] |
| `stableEntityId` | function | [→ stable-id.ts:52-61] |
| `stableRelationshipId` | function | [→ stable-id.ts:66-68] |
| `triggerEmbeddingGeneration` | function | [→ git-event-handlers.ts:234-256] |

## Files

- `entity-resolution.ts`
- `external-placeholder.ts`
- `git-event-handlers.ts`
- `index.ts`
- `relationship-builder.ts`
- `stable-id.ts`


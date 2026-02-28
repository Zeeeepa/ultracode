---
module_name: proto
description: "Core type definitions and utilities for the code-analysis data model"
status: generated
language: typescript
---

# Proto

> Defines the shared data model types (entities, relationships, deltas) and configuration loader used throughout the code analysis system.

## Overview

Serves as the canonical type registry for code entities, their relationships, positional data, and incremental change (delta) structures. Also provides `loadProtoRootSync` for loading the protobuf root configuration.

## Exports

- `loadProtoRootSync`
- `IPosition`
- `ILocation`
- `IParameter`
- `IImportSpecifier`
- `IImportData`
- `IDecorator`
- `IEntityMetadata`
- `IEntity`
- `IRelationshipMetadata`
- `IRelationship`
- `IEntityDelta`
- `IRelationshipDelta`
- `IBranchDelta`
- `IIPCMessage`
- `ISearchResult`
- `IGpuWorkerResponse`
- `IPacketHeader`
- `proto`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Exports all proto types (IEntity, IRelationship, IEntityDelta, etc.) and `loadProtoRootSync` |

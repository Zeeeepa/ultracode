# Proto

## Overview

The Proto module provides the canonical type registry and loader for UltraCode's code-analysis data model. It dynamically loads protocol buffer definitions from `.proto` files and exports TypeScript interfaces for entities, relationships, locations, and incremental synchronization structures. This module serves as the single source of truth for serialization contracts across the codebase, enabling safe inter-process communication (IPC) between analysis workers and delta-based code indexing.

## Entity Listing

### Configuration & Loader

- `loadProtoRootSync` — Synchronously loads all proto files (entity.proto, delta.proto, ipc.proto) and returns the cached protobuf Root instance, blocking on first call; subsequent calls return the cached instance.
- `loadProtoRoot` — Asynchronously loads all proto files and returns the cached protobuf Root instance.
- `proto` — Re-exported protobuf Root object after initialization for message creation and serialization.

### Positional & Location Types

- `IPosition` — Represents a single point in source code with line, column, and absolute index coordinates.
- `ILocation` — Represents a span in source code from start position to end position.

### Code Entity Metadata

- `IParameter` — Describes a function parameter with name and optional type annotation.
- `IImportSpecifier` — Represents a single imported name from an import statement.
- `IImportData` — Contains metadata about imports including specifiers list and source module information.
- `IDecorator` — Represents a decorator or annotation applied to a code entity (e.g., @Override, @Deprecated).
- `IEntityMetadata` — Holds optional metadata about a code entity including decorators, imports, and custom fields.
- `IEntity` — Core representation of a code entity (function, class, variable, etc.) with kind, name, location, and optional metadata.

### Relationships & Dependencies

- `IRelationshipMetadata` — Holds optional metadata about relationships between entities.
- `IRelationship` — Represents a directed relationship between two entities (e.g., calls, inherits, imports) with kind, source entity ID, and target entity ID.

### Incremental Change Structures

- `IEntityDelta` — Encodes an add, update, or delete operation on a single entity for incremental synchronization.
- `IRelationshipDelta` — Encodes an add, update, or delete operation on a single relationship for incremental synchronization.
- `IBranchDelta` — Container for all entity and relationship deltas associated with a branch commit.

### Inter-Process Communication

- `IIPCMessage` — Wraps an IPC request or response payload with an optional ID for request-response pairing.
- `ISearchResult` — Represents a single result from a code search query, containing matched entity and associated metadata.
- `IGpuWorkerResponse` — Response message from a GPU worker containing computed analysis results.
- `IPacketHeader` — Header metadata for data packets including size, type, and sequence identifiers.

## Dependencies

**External:**
- `protobufjs` — Protocol Buffers library for dynamically loading and parsing `.proto` file definitions at runtime.

**Node built-ins:**
- `path` (join, dirname) — File path resolution and directory navigation.
- `url` (fileURLToPath) — ESM-to-filesystem path conversion for `import.meta.url`.

**Proto files (sibling directory):**
- `entity.proto` — Canonical schema for code entities, metadata, and parameters.
- `delta.proto` — Incremental change structure definitions.
- `ipc.proto` — Inter-process communication message schemas.
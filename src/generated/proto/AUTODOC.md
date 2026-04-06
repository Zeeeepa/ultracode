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

### Utility Functions & Accessors

- `getType` — Generic function to retrieve a message type definition by name from the cached protobuf Root instance.
- `getEntityType` — Returns the Entity message type definition from the loaded protobuf schema.
- `getRelationshipType` — Returns the Relationship message type definition from the loaded protobuf schema.
- `getBranchDeltaType` — Returns the BranchDelta message type definition from the loaded protobuf schema.
- `getIPCMessageType` — Returns the IIPCMessage message type definition from the loaded protobuf schema.
- `getGpuWorkerResponseType` — Returns the IGpuWorkerResponse message type definition from the loaded protobuf schema.
- `getPacketHeaderType` — Returns the IPacketHeader message type definition from the loaded protobuf schema.
- `getEntityBatchType` — Returns the EntityBatch message type definition from the loaded protobuf schema.
- `getRelationshipBatchType` — Returns the RelationshipBatch message type definition from the loaded protobuf schema.

### Serialization & Encoding

- `encodeEntity` — Serializes an Entity object to binary protobuf format.
- `decodeEntity` — Deserializes binary protobuf data into an Entity object.
- `encodeEntityBatch` — Serializes an EntityBatch object to binary protobuf format.
- `decodeEntityBatch` — Deserializes binary protobuf data into an EntityBatch object.
- `encodeRelationship` — Serializes a Relationship object to binary protobuf format.
- `decodeRelationship` — Deserializes binary protobuf data into a Relationship object.
- `encodeRelationshipBatch` — Serializes a RelationshipBatch object to binary protobuf format.
- `decodeRelationshipBatch` — Deserializes binary protobuf data into a RelationshipBatch object.
- `encodeBranchDelta` — Serializes a BranchDelta object to binary protobuf format.
- `decodeBranchDelta` — Deserializes binary protobuf data into a BranchDelta object.
- `encodeIPCMessage` — Serializes an IIPCMessage object to binary protobuf format.
- `decodeIPCMessage` — Deserializes binary protobuf data into an IIPCMessage object.
- `encodeGpuWorkerResponse` — Serializes an IGpuWorkerResponse object to binary protobuf format.
- `decodeGpuWorkerResponse` — Deserializes binary protobuf data into an IGpuWorkerResponse object.
- `encodePacketHeader` — Serializes an IPacketHeader object to binary protobuf format.
- `decodePacketHeader` — Deserializes binary protobuf data into an IPacketHeader object.


### Added Entities

- **IPosition** — `index.ts:58-62`
- **ILocation** — `index.ts:64-67`
- **IParameter** — `index.ts:69-74`
- **IImportSpecifier** — `index.ts:76-79`
- **IImportData** — `index.ts:81-86`
- **IDecorator** — `index.ts:88-92`
- **IEntityMetadata** — `index.ts:94-103`
- **IEntity** — `index.ts:105-120`
- **IRelationshipMetadata** — `index.ts:122-127`
- **IRelationship** — `index.ts:129-137`
- **IEntityDelta** — `index.ts:139-143`
- **IRelationshipDelta** — `index.ts:145-149`
- **IBranchDelta** — `index.ts:151-158`
- **IIPCMessage** — `index.ts:160-166`
- **ISearchResult** — `index.ts:168-171`
- **IGpuWorkerResponse** — `index.ts:173-181`
- **IPacketHeader** — `index.ts:183-187`
- **loadProtoRoot** — `index.ts:22-36`
- **loadProtoRootSync** — `index.ts:41-55`
- **getType** — `index.ts:199-202`
- **getEntityType** — `index.ts:204-207`
- **getRelationshipType** — `index.ts:209-212`
- **getBranchDeltaType** — `index.ts:214-217`
- **getIPCMessageType** — `index.ts:219-222`
- **getGpuWorkerResponseType** — `index.ts:224-227`
- **getPacketHeaderType** — `index.ts:229-232`
- **getEntityBatchType** — `index.ts:234-237`
- **getRelationshipBatchType** — `index.ts:239-242`
- **encodeEntity** — `index.ts:249-254`
- **decodeEntity** — `index.ts:256-259`
- **encodeEntityBatch** — `index.ts:262-265`
- **decodeEntityBatch** — `index.ts:267-271`
- **encodeRelationship** — `index.ts:274-279`
- **decodeRelationship** — `index.ts:281-284`
- **encodeRelationshipBatch** — `index.ts:287-290`
- **decodeRelationshipBatch** — `index.ts:292-296`
- **encodeBranchDelta** — `index.ts:299-304`
- **decodeBranchDelta** — `index.ts:306-309`
- **encodeIPCMessage** — `index.ts:312-315`
- **decodeIPCMessage** — `index.ts:317-320`
- **encodeGpuWorkerResponse** — `index.ts:323-326`
- **decodeGpuWorkerResponse** — `index.ts:328-331`
- **encodePacketHeader** — `index.ts:334-337`
- **decodePacketHeader** — `index.ts:339-342`
- **__filename** — `index.ts:10-10`
- **__dirname** — `index.ts:11-11`
- **PROTO_DIR** — `index.ts:14-14`
- **root** — `index.ts:200-200`
- **proto** — `index.ts:247-343`
- **type** — `index.ts:250-250`
- **errMsg** — `index.ts:251-251`
- **type** — `index.ts:257-257`
- **type** — `index.ts:263-263`
- **type** — `index.ts:268-268`
- **decoded** — `index.ts:269-269`
- **type** — `index.ts:275-275`
- **errMsg** — `index.ts:276-276`
- **type** — `index.ts:282-282`
- **type** — `index.ts:288-288`
- **type** — `index.ts:293-293`
- **decoded** — `index.ts:294-294`
- **type** — `index.ts:300-300`
- **errMsg** — `index.ts:301-301`
- **type** — `index.ts:307-307`
- **type** — `index.ts:313-313`
- **type** — `index.ts:318-318`
- **type** — `index.ts:324-324`
- **type** — `index.ts:329-329`
- **type** — `index.ts:335-335`
- **type** — `index.ts:340-340`
- **_root** — `index.ts:17-17`
- **_Entity** — `index.ts:190-190`
- **_Relationship** — `index.ts:191-191`
- **_BranchDelta** — `index.ts:192-192`
- **_IPCMessage** — `index.ts:193-193`
- **_GpuWorkerResponse** — `index.ts:194-194`
- **_PacketHeader** — `index.ts:195-195`
- **_EntityBatch** — `index.ts:196-196`
- **_RelationshipBatch** — `index.ts:197-197`

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
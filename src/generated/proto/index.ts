/**
 * Protocol Buffers loader and serializer
 * Uses dynamic loading to avoid Windows path issues with pbjs
 */

import protobuf from "protobufjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to proto files
const PROTO_DIR = join(__dirname, "../../proto");

// Cached root
let _root: protobuf.Root | null = null;

/**
 * Load all proto files and return the root
 */
export async function loadProtoRoot(): Promise<protobuf.Root> {
  if (_root) return _root;

  _root = new protobuf.Root();
  await _root.load(
    [
      join(PROTO_DIR, "entity.proto"),
      join(PROTO_DIR, "delta.proto"),
      join(PROTO_DIR, "ipc.proto"),
    ],
    { keepCase: true }
  );

  return _root;
}

/**
 * Synchronous load (blocks on first call)
 */
export function loadProtoRootSync(): protobuf.Root {
  if (_root) return _root;

  _root = new protobuf.Root();
  _root.loadSync(
    [
      join(PROTO_DIR, "entity.proto"),
      join(PROTO_DIR, "delta.proto"),
      join(PROTO_DIR, "ipc.proto"),
    ],
    { keepCase: true }
  );

  return _root;
}

// Type definitions for our messages
export interface IPosition {
  line: number;
  column: number;
  index: number;
}

export interface ILocation {
  start: IPosition;
  end: IPosition;
}

export interface IParameter {
  name: string;
  type?: string;
  optional?: boolean;
  default_value?: string;
}

export interface IImportSpecifier {
  local: string;
  imported?: string;
}

export interface IImportData {
  source: string;
  specifiers: IImportSpecifier[];
  is_default?: boolean;
  is_namespace?: boolean;
}

export interface IDecorator {
  name: string;
  arguments?: string[];
  is_builtin?: boolean;
}

export interface IEntityMetadata {
  modifiers?: string[];
  return_type?: string;
  parameters?: IParameter[];
  import_data?: IImportData;
  signature?: string;
  language?: string;
  decorators?: IDecorator[];
  extra?: Record<string, string>;
}

export interface IEntity {
  id: string;
  name: string;
  type: string;
  file_path: string;
  location: ILocation;
  metadata?: IEntityMetadata;
  hash: string;
  created_at: number;
  updated_at: number;
  complexity_score?: number;
  language?: string;
  size_bytes?: number;
  embedding?: Uint8Array;
  embedding_text?: string;
}

export interface IRelationshipMetadata {
  line?: number;
  column?: number;
  context?: string;
  extra?: Record<string, string>;
}

export interface IRelationship {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  metadata?: IRelationshipMetadata;
  weight?: number;
  created_at?: number;
}

export interface IEntityDelta {
  added: Record<string, IEntity>;
  modified: Record<string, IEntity>;
  deleted: string[];
}

export interface IRelationshipDelta {
  added: Record<string, IRelationship>;
  modified: Record<string, IRelationship>;
  deleted: string[];
}

export interface IBranchDelta {
  branch_name: string;
  base_commit_sha: string;
  entity_delta: IEntityDelta;
  relationship_delta: IRelationshipDelta;
  last_modified: number;
  total_changes: number;
}

export interface IIPCMessage {
  type: string;
  id: string;
  payload: Uint8Array;
  timestamp: number;
  error?: string;
}

export interface ISearchResult {
  id: string;
  distance: number;
}

export interface IGpuWorkerResponse {
  success: boolean;
  error?: string;
  type: string;
  embeddings?: number[];
  dimensions?: number;
  results?: ISearchResult[];
  vector_count?: number;
}

export interface IPacketHeader {
  payload_size: number;
  content_type: string;
  message_id?: string;
}

// Message type cache
let _Entity: protobuf.Type | null = null;
let _Relationship: protobuf.Type | null = null;
let _BranchDelta: protobuf.Type | null = null;
let _IPCMessage: protobuf.Type | null = null;
let _GpuWorkerResponse: protobuf.Type | null = null;
let _PacketHeader: protobuf.Type | null = null;
let _EntityBatch: protobuf.Type | null = null;
let _RelationshipBatch: protobuf.Type | null = null;

function getType(name: string): protobuf.Type {
  const root = loadProtoRootSync();
  return root.lookupType(`ultracode.${name}`);
}

function getEntityType(): protobuf.Type {
  if (!_Entity) _Entity = getType("Entity");
  return _Entity;
}

function getRelationshipType(): protobuf.Type {
  if (!_Relationship) _Relationship = getType("Relationship");
  return _Relationship;
}

function getBranchDeltaType(): protobuf.Type {
  if (!_BranchDelta) _BranchDelta = getType("BranchDelta");
  return _BranchDelta;
}

function getIPCMessageType(): protobuf.Type {
  if (!_IPCMessage) _IPCMessage = getType("IPCMessage");
  return _IPCMessage;
}

function getGpuWorkerResponseType(): protobuf.Type {
  if (!_GpuWorkerResponse) _GpuWorkerResponse = getType("GpuWorkerResponse");
  return _GpuWorkerResponse;
}

function getPacketHeaderType(): protobuf.Type {
  if (!_PacketHeader) _PacketHeader = getType("PacketHeader");
  return _PacketHeader;
}

function getEntityBatchType(): protobuf.Type {
  if (!_EntityBatch) _EntityBatch = getType("EntityBatch");
  return _EntityBatch;
}

function getRelationshipBatchType(): protobuf.Type {
  if (!_RelationshipBatch) _RelationshipBatch = getType("RelationshipBatch");
  return _RelationshipBatch;
}

/**
 * Protobuf serializer/deserializer
 */
export const proto = {
  // Entity
  encodeEntity(entity: IEntity): Uint8Array {
    const type = getEntityType();
    const errMsg = type.verify(entity);
    if (errMsg) throw new Error(`Entity verification failed: ${errMsg}`);
    return type.encode(type.create(entity)).finish();
  },

  decodeEntity(buffer: Uint8Array): IEntity {
    const type = getEntityType();
    return type.decode(buffer) as unknown as IEntity;
  },

  // Entity batch
  encodeEntityBatch(entities: IEntity[]): Uint8Array {
    const type = getEntityBatchType();
    return type.encode(type.create({ entities })).finish();
  },

  decodeEntityBatch(buffer: Uint8Array): IEntity[] {
    const type = getEntityBatchType();
    const decoded = type.decode(buffer) as unknown as { entities: IEntity[] };
    return decoded.entities || [];
  },

  // Relationship
  encodeRelationship(relationship: IRelationship): Uint8Array {
    const type = getRelationshipType();
    const errMsg = type.verify(relationship);
    if (errMsg) throw new Error(`Relationship verification failed: ${errMsg}`);
    return type.encode(type.create(relationship)).finish();
  },

  decodeRelationship(buffer: Uint8Array): IRelationship {
    const type = getRelationshipType();
    return type.decode(buffer) as unknown as IRelationship;
  },

  // Relationship batch
  encodeRelationshipBatch(relationships: IRelationship[]): Uint8Array {
    const type = getRelationshipBatchType();
    return type.encode(type.create({ relationships })).finish();
  },

  decodeRelationshipBatch(buffer: Uint8Array): IRelationship[] {
    const type = getRelationshipBatchType();
    const decoded = type.decode(buffer) as unknown as { relationships: IRelationship[] };
    return decoded.relationships || [];
  },

  // Branch Delta
  encodeBranchDelta(delta: IBranchDelta): Uint8Array {
    const type = getBranchDeltaType();
    const errMsg = type.verify(delta);
    if (errMsg) throw new Error(`BranchDelta verification failed: ${errMsg}`);
    return type.encode(type.create(delta)).finish();
  },

  decodeBranchDelta(buffer: Uint8Array): IBranchDelta {
    const type = getBranchDeltaType();
    return type.decode(buffer) as unknown as IBranchDelta;
  },

  // IPC Message
  encodeIPCMessage(message: IIPCMessage): Uint8Array {
    const type = getIPCMessageType();
    return type.encode(type.create(message)).finish();
  },

  decodeIPCMessage(buffer: Uint8Array): IIPCMessage {
    const type = getIPCMessageType();
    return type.decode(buffer) as unknown as IIPCMessage;
  },

  // GPU Worker Response
  encodeGpuWorkerResponse(response: IGpuWorkerResponse): Uint8Array {
    const type = getGpuWorkerResponseType();
    return type.encode(type.create(response)).finish();
  },

  decodeGpuWorkerResponse(buffer: Uint8Array): IGpuWorkerResponse {
    const type = getGpuWorkerResponseType();
    return type.decode(buffer) as unknown as IGpuWorkerResponse;
  },

  // Packet Header
  encodePacketHeader(header: IPacketHeader): Uint8Array {
    const type = getPacketHeaderType();
    return type.encode(type.create(header)).finish();
  },

  decodePacketHeader(buffer: Uint8Array): IPacketHeader {
    const type = getPacketHeaderType();
    return type.decode(buffer) as unknown as IPacketHeader;
  },
};

export default proto;

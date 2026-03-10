import { describe, expect, it } from "bun:test";
import { ProtobufParser } from "../../src/parsers/protobuf/protobuf-parser.js";

const parser = new ProtobufParser();

const FULL_PROTO = `
syntax = "proto3";
package myapp.v1;

import "google/protobuf/timestamp.proto";

option go_package = "github.com/myapp/api/v1";

enum UserStatus {
  USER_STATUS_UNSPECIFIED = 0;
  ACTIVE = 1;
  INACTIVE = 2;
}

message Address {
  string street = 1;
  string city = 2;
  string country = 3;
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
  UserStatus status = 4;
  Address address = 5;
  repeated string tags = 6;
  map<string, string> metadata = 7;
  google.protobuf.Timestamp created_at = 8;

  oneof contact {
    string phone = 9;
    string fax = 10;
  }

  message Preferences {
    bool notifications = 1;
    string theme = 2;
  }
  Preferences preferences = 11;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (stream User);
  rpc CreateUser(User) returns (User);
  rpc UpdateUser(stream UpdateUserRequest) returns (User);
}

message GetUserRequest {
  string id = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
}

message UpdateUserRequest {
  string id = 1;
  User user = 2;
}
`;

describe("ProtobufParser", () => {
  it("parses package as module entity", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");
    const pkg = result.entities.find((e) => e.type === "module" && e.name === "myapp.v1");
    expect(pkg).toBeDefined();
    expect(pkg!.metadata?.protoType).toBe("package");
    expect(pkg!.metadata?.isApiContract).toBe(false);
  });

  it("parses enum with values", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");
    const userStatus = result.entities.find((e) => e.name === "UserStatus");
    expect(userStatus).toBeDefined();
    expect(userStatus!.type).toBe("type");
    expect(userStatus!.metadata?.protoType).toBe("enum");
    expect(userStatus!.metadata?.isApiContract).toBe(true);

    const values = userStatus!.metadata?.values as Array<{ name: string; number: number }>;
    expect(values).toHaveLength(3);
    expect(values[0]!.name).toBe("USER_STATUS_UNSPECIFIED");
    expect(values[0]!.number).toBe(0);
    expect(values[1]!.name).toBe("ACTIVE");
    expect(values[2]!.name).toBe("INACTIVE");
  });

  it("parses message with fields", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");
    const address = result.entities.find((e) => e.name === "Address");
    expect(address).toBeDefined();
    expect(address!.type).toBe("type");
    expect(address!.metadata?.protoType).toBe("message");
    expect(address!.metadata?.isApiContract).toBe(true);

    const fields = address!.metadata?.fields as Array<{ name: string; type: string; number: number }>;
    expect(fields).toHaveLength(3);
    expect(fields[0]).toMatchObject({ name: "street", type: "string", number: 1 });
    expect(fields[1]).toMatchObject({ name: "city", type: "string", number: 2 });
    expect(fields[2]).toMatchObject({ name: "country", type: "string", number: 3 });
  });

  it("parses repeated, map, and optional fields", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");
    const user = result.entities.find((e) => e.name === "User");
    expect(user).toBeDefined();

    const fields = user!.metadata?.fields as Array<{
      name: string;
      type: string;
      repeated: boolean;
      mapKey?: string;
      mapValue?: string;
    }>;

    const tagsField = fields.find((f) => f.name === "tags");
    expect(tagsField).toBeDefined();
    expect(tagsField!.repeated).toBe(true);

    const metadataField = fields.find((f) => f.name === "metadata");
    expect(metadataField).toBeDefined();
    expect(metadataField!.type).toBe("map");
    expect(metadataField!.mapKey).toBe("string");
    expect(metadataField!.mapValue).toBe("string");
  });

  it("parses nested message (User.Preferences)", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");
    const prefs = result.entities.find((e) => e.name === "User.Preferences");
    expect(prefs).toBeDefined();
    expect(prefs!.type).toBe("type");
    expect(prefs!.metadata?.protoType).toBe("message");

    const fields = prefs!.metadata?.fields as Array<{ name: string; type: string }>;
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({ name: "notifications", type: "bool" });
    expect(fields[1]).toMatchObject({ name: "theme", type: "string" });
  });

  it("parses oneof fields", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");
    const user = result.entities.find((e) => e.name === "User");
    const fields = user!.metadata?.fields as Array<{
      name: string;
      oneofGroup?: string;
    }>;

    const phoneField = fields.find((f) => f.name === "phone");
    expect(phoneField).toBeDefined();
    expect(phoneField!.oneofGroup).toBe("contact");

    const faxField = fields.find((f) => f.name === "fax");
    expect(faxField).toBeDefined();
    expect(faxField!.oneofGroup).toBe("contact");
  });

  it("parses service as class entity", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");
    const service = result.entities.find((e) => e.name === "UserService");
    expect(service).toBeDefined();
    expect(service!.type).toBe("class");
    expect(service!.metadata?.protoType).toBe("service");
    expect(service!.metadata?.isApiContract).toBe(true);
  });

  it("parses rpc methods with streaming info", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");

    const getUser = result.entities.find((e) => e.name === "GetUser");
    expect(getUser).toBeDefined();
    expect(getUser!.type).toBe("method");
    expect(getUser!.metadata?.protoType).toBe("rpc");
    expect(getUser!.metadata?.isApiContract).toBe(true);
    expect(getUser!.metadata?.requestType).toBe("GetUserRequest");
    expect(getUser!.metadata?.responseType).toBe("User");
    expect(getUser!.metadata?.isClientStreaming).toBe(false);
    expect(getUser!.metadata?.isServerStreaming).toBe(false);
    expect(getUser!.signature).toContain("rpc GetUser(GetUserRequest) returns (User)");

    const listUsers = result.entities.find((e) => e.name === "ListUsers");
    expect(listUsers).toBeDefined();
    expect(listUsers!.metadata?.isServerStreaming).toBe(true);
    expect(listUsers!.metadata?.isClientStreaming).toBe(false);

    const updateUser = result.entities.find((e) => e.name === "UpdateUser");
    expect(updateUser).toBeDefined();
    expect(updateUser!.metadata?.isClientStreaming).toBe(true);
    expect(updateUser!.metadata?.isServerStreaming).toBe(false);
  });

  it("creates relationships: service→message, message→message, message→enum", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");

    // rpc → request/response types
    const rpcRefs = result.relationships.filter(
      (r) => r.type === "references" && r.metadata?.context === "rpc request type",
    );
    expect(rpcRefs.length).toBeGreaterThan(0);

    // message → enum references
    const msgToEnum = result.relationships.filter(
      (r) => r.type === "references" && r.metadata?.context === "message field type" && r.to.includes("UserStatus"),
    );
    expect(msgToEnum.length).toBeGreaterThan(0);

    // message → message references (User → Address)
    const msgToMsg = result.relationships.filter(
      (r) => r.type === "references" && r.metadata?.context === "message field type" && r.to.includes("Address"),
    );
    expect(msgToMsg.length).toBeGreaterThan(0);
  });

  it("parses google.api.http annotations", async () => {
    const httpProto = `
syntax = "proto3";
package api.v1;

service UserService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {
      get: "/v1/users/{id}"
    };
  }
  rpc CreateUser(User) returns (User) {
    option (google.api.http) = {
      post: "/v1/users"
    };
  }
}

message GetUserRequest { string id = 1; }
message User { string id = 1; string name = 2; }
`;
    const result = await parser.parse("api.proto", httpProto, "hash2");

    const getUser = result.entities.find((e) => e.name === "GetUser");
    expect(getUser).toBeDefined();
    expect(getUser!.metadata?.httpMethod).toBe("GET");
    expect(getUser!.metadata?.httpPath).toBe("/v1/users/{id}");

    const createUser = result.entities.find((e) => e.name === "CreateUser");
    expect(createUser).toBeDefined();
    expect(createUser!.metadata?.httpMethod).toBe("POST");
    expect(createUser!.metadata?.httpPath).toBe("/v1/users");
  });

  it("handles empty/minimal proto file", async () => {
    const minimal = `syntax = "proto3";`;
    const result = await parser.parse("empty.proto", minimal, "hash3");
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(0); // No package, no entities
  });

  it("handles proto2 syntax", async () => {
    const proto2 = `
syntax = "proto2";
package legacy;

message OldMessage {
  required string name = 1;
  optional int32 age = 2;
}
`;
    const result = await parser.parse("legacy.proto", proto2, "hash4");
    const msg = result.entities.find((e) => e.name === "OldMessage");
    expect(msg).toBeDefined();
    expect(msg!.metadata?.syntax).toBe("proto2");
  });

  it("sets isApiContract on rpc/service/message entities", async () => {
    const result = await parser.parse("test.proto", FULL_PROTO, "hash1");

    // Services
    const services = result.entities.filter((e) => e.metadata?.protoType === "service");
    for (const s of services) {
      expect(s.metadata?.isApiContract).toBe(true);
    }

    // RPCs
    const rpcs = result.entities.filter((e) => e.metadata?.protoType === "rpc");
    for (const r of rpcs) {
      expect(r.metadata?.isApiContract).toBe(true);
    }

    // Messages
    const messages = result.entities.filter((e) => e.metadata?.protoType === "message");
    for (const m of messages) {
      expect(m.metadata?.isApiContract).toBe(true);
    }

    // Enums
    const enums = result.entities.filter((e) => e.metadata?.protoType === "enum");
    for (const en of enums) {
      expect(en.metadata?.isApiContract).toBe(true);
    }
  });
});

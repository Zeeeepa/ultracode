import { describe, expect, it } from "bun:test";
import { GraphQLSchemaParser } from "../../src/parsers/graphql/graphql-parser.js";

const parser = new GraphQLSchemaParser();

const FULL_SCHEMA = `
# User management schema

scalar DateTime

directive @auth(requires: Role!) on FIELD_DEFINITION

enum Role {
  ADMIN
  USER
  GUEST
}

enum UserStatus {
  ACTIVE
  INACTIVE
  BANNED
}

interface Node {
  id: ID!
  createdAt: DateTime!
}

interface Timestamped {
  createdAt: DateTime!
  updatedAt: DateTime!
}

type User implements Node & Timestamped {
  id: ID!
  name: String!
  email: String!
  status: UserStatus!
  posts: [Post!]!
  friends(limit: Int = 10, offset: Int = 0): [User!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Post implements Node {
  id: ID!
  title: String!
  body: String!
  author: User!
  tags: [String!]
  createdAt: DateTime!
}

input CreateUserInput {
  name: String!
  email: String!
  status: UserStatus = ACTIVE
}

input UpdateUserInput {
  name: String
  email: String
  status: UserStatus
}

union SearchResult = User | Post

type Query {
  user(id: ID!): User
  users(limit: Int = 10, offset: Int = 0, status: UserStatus): [User!]!
  search(query: String!): [SearchResult!]!
}

type Mutation {
  createUser(input: CreateUserInput!): User! @auth(requires: ADMIN)
  updateUser(id: ID!, input: UpdateUserInput!): User! @auth(requires: ADMIN)
  deleteUser(id: ID!): Boolean!
}

type Subscription {
  userCreated: User!
  postAdded(authorId: ID): Post!
}

extend type User {
  avatar: String
}
`;

describe("GraphQLSchemaParser", () => {
  it("parses scalar as type entity", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const dateTime = result.entities.find((e) => e.name === "DateTime");
    expect(dateTime).toBeDefined();
    expect(dateTime!.type).toBe("type");
    expect(dateTime!.metadata?.graphqlType).toBe("scalar");
    expect(dateTime!.metadata?.isApiContract).toBe(false);
  });

  it("parses directive as constant entity", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const auth = result.entities.find((e) => e.name === "@auth");
    expect(auth).toBeDefined();
    expect(auth!.type).toBe("constant");
    expect(auth!.metadata?.graphqlType).toBe("directive");
    expect(auth!.metadata?.isApiContract).toBe(false);
  });

  it("parses enum with values", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const role = result.entities.find((e) => e.name === "Role");
    expect(role).toBeDefined();
    expect(role!.type).toBe("type");
    expect(role!.metadata?.graphqlType).toBe("enum");
    expect(role!.metadata?.isApiContract).toBe(true);

    const values = role!.metadata?.values as string[];
    expect(values).toContain("ADMIN");
    expect(values).toContain("USER");
    expect(values).toContain("GUEST");
  });

  it("parses interface with fields", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const node = result.entities.find((e) => e.name === "Node" && e.metadata?.graphqlType === "interface");
    expect(node).toBeDefined();
    expect(node!.type).toBe("type");
    expect(node!.metadata?.isApiContract).toBe(true);

    const fields = node!.metadata?.fields as Array<{ name: string; type: string; isNonNull: boolean }>;
    expect(fields).toHaveLength(2);
    const idField = fields.find((f) => f.name === "id");
    expect(idField).toBeDefined();
    expect(idField!.isNonNull).toBe(true);
  });

  it("parses type with implements", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const user = result.entities.find((e) => e.name === "User" && e.metadata?.graphqlType === "type");
    expect(user).toBeDefined();
    expect(user!.type).toBe("type");
    expect(user!.metadata?.isApiContract).toBe(true);

    const interfaces = user!.metadata?.interfaces as string[];
    expect(interfaces).toContain("Node");
    expect(interfaces).toContain("Timestamped");

    // Check implements relationships
    const implRels = result.relationships.filter((r) => r.type === "implements" && r.from.includes("User"));
    expect(implRels.length).toBeGreaterThanOrEqual(2);
  });

  it("parses input type", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const createInput = result.entities.find((e) => e.name === "CreateUserInput");
    expect(createInput).toBeDefined();
    expect(createInput!.type).toBe("type");
    expect(createInput!.metadata?.graphqlType).toBe("input");
    expect(createInput!.metadata?.isApiContract).toBe(true);
  });

  it("parses union with member types", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const union = result.entities.find((e) => e.name === "SearchResult");
    expect(union).toBeDefined();
    expect(union!.type).toBe("type");
    expect(union!.metadata?.graphqlType).toBe("union");
    expect(union!.metadata?.isApiContract).toBe(true);

    const memberTypes = union!.metadata?.memberTypes as string[];
    expect(memberTypes).toContain("User");
    expect(memberTypes).toContain("Post");

    // Union → member type relationships
    const unionRefs = result.relationships.filter(
      (r) => r.from.includes("SearchResult") && r.metadata?.context === "union member type",
    );
    expect(unionRefs).toHaveLength(2);
  });

  it("parses Query as class entity (operation=query)", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const query = result.entities.find((e) => e.name === "Query" && e.metadata?.graphqlType === "query");
    expect(query).toBeDefined();
    expect(query!.type).toBe("class");
    expect(query!.metadata?.isApiContract).toBe(true);
  });

  it("parses Mutation as class entity (operation=mutation)", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const mutation = result.entities.find((e) => e.name === "Mutation" && e.metadata?.graphqlType === "mutation");
    expect(mutation).toBeDefined();
    expect(mutation!.type).toBe("class");
    expect(mutation!.metadata?.isApiContract).toBe(true);
  });

  it("parses Subscription as class entity (operation=subscription)", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");
    const sub = result.entities.find((e) => e.name === "Subscription" && e.metadata?.graphqlType === "subscription");
    expect(sub).toBeDefined();
    expect(sub!.type).toBe("class");
    expect(sub!.metadata?.isApiContract).toBe(true);
  });

  it("parses fields with arguments and default values", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");

    // Query field: users(limit: Int = 10, offset: Int = 0, status: UserStatus): [User!]!
    const usersField = result.entities.find((e) => e.name === "users" && e.metadata?.graphqlType === "field");
    expect(usersField).toBeDefined();
    expect(usersField!.type).toBe("method");

    const args = usersField!.metadata?.args as Array<{ name: string; type: string; defaultValue?: string }>;
    expect(args.length).toBeGreaterThanOrEqual(2);

    const limitArg = args.find((a) => a.name === "limit");
    expect(limitArg).toBeDefined();
    expect(limitArg!.type).toBe("Int");
    expect(limitArg!.defaultValue).toBe("10");
  });

  it("parses [User!]! — isList, isNonNull", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");

    const usersField = result.entities.find((e) => e.name === "users" && e.metadata?.graphqlType === "field");
    expect(usersField).toBeDefined();
    expect(usersField!.metadata?.isList).toBe(true);
    expect(usersField!.metadata?.isNonNull).toBe(true);
  });

  it("parses extend type with isExtension", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");

    const extended = result.entities.find((e) => e.name === "User" && e.metadata?.isExtension === true);
    expect(extended).toBeDefined();
    expect(extended!.metadata?.graphqlType).toBe("type");

    // Extension → original type relationship
    const extRel = result.relationships.find((r) => r.metadata?.context === "type extension");
    expect(extRel).toBeDefined();
  });

  it("creates type→interface, field→type, union→member relationships", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");

    // type→interface
    const implRels = result.relationships.filter((r) => r.type === "implements");
    expect(implRels.length).toBeGreaterThan(0);

    // field→type (references)
    const fieldRefs = result.relationships.filter(
      (r) => r.type === "references" && r.metadata?.context === "field return type",
    );
    expect(fieldRefs.length).toBeGreaterThan(0);

    // union→members
    const unionRefs = result.relationships.filter((r) => r.metadata?.context === "union member type");
    expect(unionRefs.length).toBeGreaterThan(0);
  });

  it("handles empty/minimal schema", async () => {
    const minimal = `scalar JSON`;
    const result = await parser.parse("empty.graphql", minimal, "hash2");
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe("JSON");
  });

  it("handles triple-quote descriptions", async () => {
    const schema = `
"""
A user in the system
"""
type User {
  id: ID!
  name: String!
}
`;
    const result = await parser.parse("doc.graphql", schema, "hash3");
    const user = result.entities.find((e) => e.name === "User");
    expect(user).toBeDefined();
    // Description is extracted
    expect(user!.metadata?.description).toBeDefined();
  });

  it("sets isApiContract on query/mutation/type entities", async () => {
    const result = await parser.parse("schema.graphql", FULL_SCHEMA, "hash1");

    // Query/Mutation/Subscription
    const operations = result.entities.filter(
      (e) =>
        e.metadata?.graphqlType === "query" ||
        e.metadata?.graphqlType === "mutation" ||
        e.metadata?.graphqlType === "subscription",
    );
    for (const op of operations) {
      expect(op.metadata?.isApiContract).toBe(true);
    }

    // Types
    const types = result.entities.filter((e) => e.metadata?.graphqlType === "type");
    for (const t of types) {
      expect(t.metadata?.isApiContract).toBe(true);
    }

    // Enums
    const enums = result.entities.filter((e) => e.metadata?.graphqlType === "enum");
    for (const en of enums) {
      expect(en.metadata?.isApiContract).toBe(true);
    }
  });
});

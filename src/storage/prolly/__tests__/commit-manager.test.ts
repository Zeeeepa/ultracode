import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CommitManager } from "../commit-manager.js";

// Mock Client for testing
function createMockClient() {
  const commits = new Map<string, Record<string, unknown>>();
  const branchHeads = new Map<string, Record<string, unknown>>();

  return {
    execute: mock(async ({ sql, args }: { sql: string; args: unknown[] }) => {
      // CREATE TABLE
      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [], rowsAffected: 0 };
      }

      // INSERT commit
      if (sql.includes("INSERT INTO graph_commits")) {
        const commit = {
          commit_hash: args[0],
          project_hash: args[1],
          branch_name: args[2],
          parent_hash: args[3],
          root_node_hash: args[4],
          file_tree_hash: args[5],
          message: args[6],
          entity_count: args[7],
          relationship_count: args[8],
          created_at: args[9],
        };
        commits.set(commit.commit_hash as string, commit);
        return { rows: [], rowsAffected: 1 };
      }

      // INSERT/REPLACE branch head
      if (sql.includes("INSERT OR REPLACE INTO branch_heads")) {
        const key = `${args[0]}:${args[1]}`;
        branchHeads.set(key, {
          project_hash: args[0],
          branch_name: args[1],
          commit_hash: args[2],
          updated_at: args[3],
        });
        return { rows: [], rowsAffected: 1 };
      }

      // SELECT commit by hash
      if (sql.includes("SELECT * FROM graph_commits WHERE commit_hash")) {
        const hash = args[0] as string;
        const row = commits.get(hash);
        return { rows: row ? [row] : [], rowsAffected: 0 };
      }

      // SELECT commits history
      if (sql.includes("SELECT * FROM graph_commits") && sql.includes("ORDER BY created_at DESC")) {
        const projectHash = args[0] as string;
        const branchName = args[1] as string;

        // Check if this is getCommitsSince (has timestamp filter)
        const hasSinceFilter = sql.includes("created_at >=");
        const sinceTimestamp = hasSinceFilter ? (args[2] as number) : 0;
        const limit = hasSinceFilter ? (args[3] as number) : (args[2] as number);

        const rows = Array.from(commits.values())
          .filter(
            (c) =>
              c.project_hash === projectHash &&
              c.branch_name === branchName &&
              (c.created_at as number) >= sinceTimestamp,
          )
          .sort((a, b) => (b.created_at as number) - (a.created_at as number))
          .slice(0, limit);

        return { rows, rowsAffected: 0 };
      }

      // SELECT branch head
      if (sql.includes("SELECT commit_hash FROM branch_heads")) {
        const key = `${args[0]}:${args[1]}`;
        const head = branchHeads.get(key);
        return { rows: head ? [{ commit_hash: head.commit_hash }] : [], rowsAffected: 0 };
      }

      return { rows: [], rowsAffected: 0 };
    }),
    batch: mock(async () => {
      return [];
    }),
  };
}

describe("CommitManager", () => {
  let commitManager: CommitManager;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    mockClient = createMockClient();
    commitManager = new CommitManager();
    await commitManager.initialize(mockClient as never);
    commitManager.setContext("test-project-hash", "main");
  });

  describe("commit", () => {
    it("should create a commit", async () => {
      const commit = await commitManager.commit(
        "root-hash-123",
        null,
        { entityCount: 10, relationshipCount: 5 },
        "Test commit",
      );

      expect(commit).toBeDefined();
      expect(commit.commitHash).toBeDefined();
      expect(commit.rootNodeHash).toBe("root-hash-123");
      expect(commit.entityCount).toBe(10);
      expect(commit.relationshipCount).toBe(5);
      expect(commit.message).toBe("Test commit");
      expect(commit.parentHash).toBeNull();
    });

    it("should link to parent commit", async () => {
      const commit1 = await commitManager.commit("root-1", null, { entityCount: 5, relationshipCount: 2 }, "First");
      const commit2 = await commitManager.commit("root-2", null, { entityCount: 10, relationshipCount: 4 }, "Second");

      expect(commit2.parentHash).toBe(commit1.commitHash);
    });
  });

  describe("getHistory", () => {
    it("should return commits in reverse chronological order", async () => {
      await commitManager.commit("root-1", null, { entityCount: 1, relationshipCount: 0 }, "First");
      await new Promise((r) => setTimeout(r, 10));
      await commitManager.commit("root-2", null, { entityCount: 2, relationshipCount: 0 }, "Second");
      await new Promise((r) => setTimeout(r, 10));
      await commitManager.commit("root-3", null, { entityCount: 3, relationshipCount: 0 }, "Third");

      const history = await commitManager.getHistory(10);

      expect(history.length).toBe(3);
      expect(history[0]?.message).toBe("Third");
      expect(history[1]?.message).toBe("Second");
      expect(history[2]?.message).toBe("First");
    });
  });

  describe("getCommitsSince", () => {
    it("should return commits after timestamp", async () => {
      await commitManager.commit("root-1", null, { entityCount: 1, relationshipCount: 0 }, "Old commit");
      await new Promise((r) => setTimeout(r, 20));

      const midpoint = Date.now();
      await new Promise((r) => setTimeout(r, 20));

      await commitManager.commit("root-2", null, { entityCount: 2, relationshipCount: 0 }, "New commit");

      const recent = await commitManager.getCommitsSince(midpoint);

      expect(recent.length).toBe(1);
      expect(recent[0]?.message).toBe("New commit");
    });

    it("should return empty array if no commits after timestamp", async () => {
      await commitManager.commit("root-1", null, { entityCount: 1, relationshipCount: 0 }, "Commit");

      const futureTimestamp = Date.now() + 1000000;
      const recent = await commitManager.getCommitsSince(futureTimestamp);

      expect(recent.length).toBe(0);
    });

    it("should respect limit parameter", async () => {
      const baseTime = Date.now();

      for (let i = 0; i < 5; i++) {
        await commitManager.commit(`root-${i}`, null, { entityCount: i, relationshipCount: 0 }, `Commit ${i}`);
        await new Promise((r) => setTimeout(r, 10));
      }

      const recent = await commitManager.getCommitsSince(baseTime, 3);

      expect(recent.length).toBe(3);
    });
  });

  describe("getCommit", () => {
    it("should retrieve commit by hash", async () => {
      const created = await commitManager.commit(
        "root-xyz",
        null,
        { entityCount: 42, relationshipCount: 7 },
        "My commit",
      );

      const retrieved = await commitManager.getCommit(created.commitHash);

      expect(retrieved).toBeDefined();
      expect(retrieved?.commitHash).toBe(created.commitHash);
      expect(retrieved?.message).toBe("My commit");
      expect(retrieved?.entityCount).toBe(42);
    });

    it("should return null for non-existent commit", async () => {
      const result = await commitManager.getCommit("non-existent-hash");
      expect(result).toBeNull();
    });
  });
});

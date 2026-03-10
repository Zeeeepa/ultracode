/**
 * Redis Detector
 *
 * Post-indexing step: analyzes indexed entities to find Redis usage patterns.
 * Extracts key patterns, data structures, and TTL information.
 */

import type { Entity } from "../../types/storage.js";
import type { DbCodeLink } from "./types.js";

// =============================================================================
// Redis Detector
// =============================================================================

/**
 * Detect Redis/KeyDB patterns from already-indexed entities.
 */
export function detectRedisPatterns(allEntities: Entity[]): DbCodeLink[] {
  const links: DbCodeLink[] = [];

  // Look for entities that have Redis imports or usage
  for (const entity of allEntities) {
    if (entity.metadata?.["isDbSchema"]) continue;

    const imports = (entity.metadata?.["importData"] as { source?: string }) || {};
    const source = (imports.source as string) || "";

    // Check for Redis imports
    const isRedisFile = isRedisImport(source) || isRedisEntity(entity);
    if (!isRedisFile) continue;

    // This entity uses Redis — extract patterns from its body/members
    const patterns = extractRedisPatterns(entity);
    links.push(...patterns);
  }

  return links;
}

// =============================================================================
// Detection Helpers
// =============================================================================

const REDIS_MODULES = ["ioredis", "redis", "@redis/client", "keydb", "bull", "bullmq", "bee-queue"];
// Redis methods used for pattern matching (inline in regex below)

function isRedisImport(source: string): boolean {
  return REDIS_MODULES.some((m) => source.includes(m));
}

function isRedisEntity(entity: Entity): boolean {
  const name = entity.name.toLowerCase();
  return name.includes("redis") || name.includes("cache") || name.includes("keydb");
}

function extractRedisPatterns(entity: Entity): DbCodeLink[] {
  const links: DbCodeLink[] = [];
  const bodyContent = (entity.metadata?.["body"] as string) || "";

  // Extract key patterns from string templates
  // redis.set("user:${id}", ...)  → pattern "user:{id}"
  // redis.get(`session:${token}`) → pattern "session:{token}"
  const keyPatterns = new Set<string>();
  const keyMatches = bodyContent.matchAll(
    /\.(set|get|hset|hget|hgetall|lpush|rpush|sadd|zadd|del|expire|setex)\s*\(\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)')/gi,
  );

  for (const m of keyMatches) {
    const method = m[1]!.toLowerCase();
    const key = m[2] || m[3] || m[4] || "";

    // Normalize template variables
    const pattern = key.replace(/\$\{[^}]+\}/g, (match) => {
      const varName = match.slice(2, -1).split(".").pop() || "id";
      return `{${varName}}`;
    });

    if (pattern && !keyPatterns.has(pattern)) {
      keyPatterns.add(pattern);

      // Detect data structure type for future use
      methodToDataStructure(method);

      links.push({
        dbEntityName: `redis:${pattern}`,
        codeEntityName: entity.name,
        codeFilePath: entity.filePath,
        linkType:
          method === "get" || method === "hget" || method === "hgetall" || method === "smembers" || method === "zrange"
            ? "reads_table"
            : "writes_table",
        confidence: 0.7,
        evidence: [`Redis ${method}() call with key pattern "${pattern}"`],
        orm: "redis",
      });
    }
  }

  return links;
}

function methodToDataStructure(method: string): string {
  switch (method) {
    case "set":
    case "get":
    case "setex":
      return "STRING";
    case "hset":
    case "hget":
    case "hgetall":
      return "HASH";
    case "lpush":
    case "rpush":
    case "lpop":
    case "rpop":
      return "LIST";
    case "sadd":
    case "srem":
    case "smembers":
      return "SET";
    case "zadd":
    case "zrange":
    case "zrangebyscore":
      return "ZSET";
    default:
      return "STRING";
  }
}

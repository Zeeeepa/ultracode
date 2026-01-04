/**
 * Comment Processor Module
 *
 * Handles standalone comment processing and embedding generation.
 * Extracted from semantic-agent.ts for better modularity.
 *
 * Main responsibilities:
 * - Extract comments from files
 * - Create comment entities
 * - Generate embeddings for comments
 * - Create documentation relationships
 */

import type { EmbeddingGenerator } from "../../semantic/embedding-generator.js";
import type { VectorStore } from "../../semantic/vector-store.js";
import { logger } from "../../utils/logger.js";

// =============================================================================
// CONTEXT INTERFACE
// =============================================================================

/**
 * Context for comment processing
 */
export interface CommentProcessorContext {
  embeddingGen: EmbeddingGenerator;
  vectorStore: VectorStore;
  embeddingDim: number;
  embeddingMutex: Promise<void>;
  setEmbeddingMutex: (p: Promise<void>) => void;
}

// =============================================================================
// MAIN PROCESSING FUNCTION
// =============================================================================

/**
 * Process standalone comments and create comment entities + relationships
 *
 * @param commentsByFile - Map of file path to extracted comments
 * @param associationsByFile - Map of file path to entity-comment associations
 * @param storage - Graph storage instance
 * @param ctx - Comment processor context
 */
export async function processStandaloneComments(
  commentsByFile: Map<string, any>,
  associationsByFile: Map<string, Map<string, any[]>>,
  storage: any,
  ctx: CommentProcessorContext,
): Promise<{ entities: number; relationships: number }> {
  logger.trace("EMBEDDING_GEN", "processStandaloneComments: entering");

  // Detailed profiling for comments processing
  const pStart = Date.now();
  const pLog = (phase: string) => {
    const elapsed = Date.now() - pStart;
    logger.info("PROFILE_COMMENTS", phase, { elapsedMs: elapsed });
  };

  const { CommentExtractor } = await import("../../utils/comment-extractor.js");
  pLog("P1_IMPORT");

  logger.trace("EMBEDDING_GEN", "processStandaloneComments: import done");

  // OPTIMIZATION: Collect all entities and relationships first, then batch insert
  const allCommentEntities: any[] = [];
  const allRelationships: any[] = [];
  const filePathsToQuery = Array.from(commentsByFile.keys());

  // Phase 1: Parallel fetch all file entities (instead of sequential per-file)
  const FETCH_CONCURRENCY = 20;
  const fileEntitiesMap = new Map<string, any[]>();

  for (let i = 0; i < filePathsToQuery.length; i += FETCH_CONCURRENCY) {
    const batch = filePathsToQuery.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map((filePath) => storage.findEntities({ filters: { filePath }, limit: 10000 }).catch(() => [])),
    );
    for (let j = 0; j < batch.length; j++) {
      fileEntitiesMap.set(batch[j]!, results[j] || []);
    }
  }
  pLog("P2_FETCH_FILE_ENTITIES");

  // Phase 2: Create all comment entities and relationships (CPU-only, no await)
  for (const [filePath, commentsResult] of commentsByFile.entries()) {
    const associations = associationsByFile.get(filePath) || new Map();
    const fileEntities = fileEntitiesMap.get(filePath) || [];

    const commentEntities = CommentExtractor.createCommentEntities(commentsResult.comments, filePath, associations);
    const relationships = CommentExtractor.createDocumentationRelationships(
      commentEntities,
      fileEntities,
      associations,
    );

    allCommentEntities.push(...commentEntities);
    allRelationships.push(...relationships);
  }
  pLog("P3_BUILD_ENTITIES");

  if (allCommentEntities.length === 0) {
    logger.trace("EMBEDDING_GEN", "processStandaloneComments: no comments");
    return { entities: 0, relationships: 0 };
  }

  // Phase 3: Batch insert all entities
  let releaseMutex: () => void;
  const prevMutex = ctx.embeddingMutex;
  const newMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });
  ctx.setEmbeddingMutex(newMutex);
  await prevMutex;

  try {
    // Parallel entity insert with concurrency limit
    const INSERT_CONCURRENCY = 50;
    for (let i = 0; i < allCommentEntities.length; i += INSERT_CONCURRENCY) {
      const batch = allCommentEntities.slice(i, i + INSERT_CONCURRENCY);
      await Promise.all(batch.map((entity) => storage.insertEntity(entity).catch(() => {})));
    }
    pLog("P4_INSERT_ENTITIES");

    // Phase 4: Generate embeddings in one big batch
    const commentTexts = allCommentEntities.map((c) => (c.metadata?.content as string) || "");
    const commentEmbeddings = await ctx.embeddingGen.generateBatch(commentTexts);
    pLog("P5_GENERATE_EMBEDDINGS");

    // Phase 5: Batch insert into vector store
    const vectorEmbeddings = allCommentEntities.map((entity, i) => ({
      id: `ent:${entity.id}`,
      content: (commentTexts[i] as string) ?? "",
      vector: commentEmbeddings[i] ?? new Float32Array(ctx.embeddingDim),
      metadata: {
        path: entity.filePath,
        type: entity.type,
        name: entity.name,
        entityId: entity.id,
        isComment: true,
        commentType: entity.metadata?.commentType,
      },
      createdAt: Date.now(),
    }));

    await ctx.vectorStore.adaptiveBulkInsert(vectorEmbeddings);
    pLog("P6_VECTOR_INSERT");

    // Phase 6: Parallel relationship insert
    for (let i = 0; i < allRelationships.length; i += INSERT_CONCURRENCY) {
      const batch = allRelationships.slice(i, i + INSERT_CONCURRENCY);
      await Promise.all(batch.map((rel) => storage.insertRelationship(rel).catch(() => {})));
    }
    pLog("P7_INSERT_RELATIONSHIPS");

    logger.debug("SemanticAgent", "Indexed comments (batched)", {
      entities: allCommentEntities.length,
      relationships: allRelationships.length,
    });
  } catch (error) {
    logger.debug("SemanticAgent", "Comment batch insert failed", { error: (error as Error).message });
  } finally {
    releaseMutex!();
  }

  logger.trace("EMBEDDING_GEN", "processStandaloneComments: returning", {
    totalCommentEntities: allCommentEntities.length,
    totalRelationships: allRelationships.length,
  });

  return { entities: allCommentEntities.length, relationships: allRelationships.length };
}

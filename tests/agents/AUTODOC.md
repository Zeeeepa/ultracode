# tests/agents

## Overview

This module provides comprehensive test suites for the agent framework, covering core agent functionality, backpressure handling, semantic search capabilities, parser operations, and resource management. Tests validate agent initialization, task processing, error handling, concurrency limits, and integration with storage, caching, and analysis services. The suite uses mock implementations of external services to isolate agent behavior and ensure reliable, deterministic test execution.

## Flow

```
Test Input
    ↓
Agent Initialize
    ├─→ Setup Mocks (Storage, Cache, Embedding)
    ├─→ Configure Task Type/Payload
    └─→ Verify canProcessTask
    ↓
Execute processTask
    ├─→ Semantic Analysis (if applicable)
    ├─→ Resource Adjustment (if applicable)
    ├─→ File Parsing (if applicable)
    └─→ Collect Results/Metrics
    ↓
Verify Output
    ├─→ Assert Task Results
    ├─→ Check Metrics/Performance
    └─→ Validate Error Handling
    ↓
Cleanup & Verify State
    ├─→ Shutdown Agent
    ├─→ Cleanup Test Files
    └─→ Verify Memory/Resources
```

## Entity Listing

### Public Test Suites

- **base-agent.test.ts:31-57** — Backpressure test suite validating AgentBusyError when agent reaches concurrency limit during concurrent task processing.
- **parser-agent.test.ts:105-500** — Comprehensive parser agent test suite covering file parsing, error handling, and file modification workflows.
- **resource-adjustment.test.ts:7-35** — Resource allocation adjustment test suite validating dynamic reallocation during concurrent processing.
- **semantic-agent.test.ts:176-566** — Comprehensive semantic agent test suite covering embedding generation, code analysis, caching, and hybrid search workflows.

### Mock Implementations

- **TestAgent** (base-agent.test.ts:6-28) — Mock agent extending BaseAgent for backpressure testing with configurable concurrency and memory limits.
- **VectorStore** (semantic-agent.test.ts:28-36) — Mock vector database supporting batch insertion, count queries, and retrieval operations for semantic search testing.
- **EmbeddingGenerator** (semantic-agent.test.ts:45-58) — Mock embedding service generating deterministic Float32Array embeddings for test inputs.
- **HybridSearchEngine** (semantic-agent.test.ts:67-78) — Mock search engine combining vector and keyword search with configurable relevance scores.
- **SemanticCache** (semantic-agent.test.ts:87-112) — Mock semantic caching layer with hit-rate tracking and query result storage for cache behavior validation.
- **CodeAnalyzer** (semantic-agent.test.ts:138-163) — Mock code analysis service generating complexity metrics, dependencies, and performance estimates.

### Test Infrastructure & Utilities

- **TestFile** (parser-agent.test.ts:33-36) — Defines test file structure with path, content, and expected parse results for parser validation.
- **createTestFiles** (parser-agent.test.ts:45-54) — Creates temporary test files with sample code for parser agent testing.
- **cleanupTestFiles** (parser-agent.test.ts:59-65) — Removes temporary test files and directories after test completion.
- **generateSampleCode** (parser-agent.test.ts:70-99) — Generates TypeScript/JavaScript code snippets for parser test scenarios.

### Test Cases by Feature

#### Parser Agent Coverage

- **supported file types** (parser-agent.test.ts:128-139) — Validates parser agent can identify and process supported file types.
- **error recovery** (parser-agent.test.ts:141-202) — Tests error recovery in parser agent with both valid and invalid file paths.
- **batch processing** (parser-agent.test.ts:204-240) — Validates batch file processing with progress tracking and result aggregation.
- **file modification** (parser-agent.test.ts:242-308) — Tests file modification workflow including parsing, transformation, and file writing.
- **memory and metrics** (parser-agent.test.ts:310-379) — Verifies parser agent memory cache efficiency and metric collection.
- **event subscription** (parser-agent.test.ts:381-460) — Tests event subscription and message handling during parser operations.
- **error handling** (parser-agent.test.ts:462-499) — Validates error handling for invalid tasks and missing handlers.

#### Semantic Agent Coverage

- **agent warmup** (semantic-agent.test.ts:208-239) — Validates agent warmup initialization with mock vector storage and embedding cache.
- **semantic search** (semantic-agent.test.ts:241-379) — Tests semantic search queries with embedding generation and relevance ranking.
- **resource metrics** (semantic-agent.test.ts:381-432) — Tests resource metrics collection during agent operations.
- **cache hit rate** (semantic-agent.test.ts:434-459) — Validates semantic cache hit-rate tracking and search performance optimization.
- **graph storage** (semantic-agent.test.ts:461-514) — Tests graph storage integration and entity relationship analysis.
- **parallel embeddings** (semantic-agent.test.ts:516-565) — Tests parallel embedding generation performance and concurrent request handling.

### Test Fixtures & Helpers

- **TASK** (parser-agent.test.ts:109-113) — Task configuration constants for test execution with specific parameters.
- **testFile** (parser-agent.test.ts:142-165, parser-agent.test.ts:167-201, parser-agent.test.ts:223-239, parser-agent.test.ts:382-403, parser-agent.test.ts:431-459) — Test file instances with content and paths for parser validation scenarios.
- **testFiles** (parser-agent.test.ts:205-221, parser-agent.test.ts:405-429) — Collections of multiple test files for batch processing scenarios.
- **Cache** (parser-agent.test.ts:361-378) — Mock cache instance tracking memory usage and hit rates for cache behavior verification.
- **task** (semantic-agent.test.ts:243-252, semantic-agent.test.ts:267-277, semantic-agent.test.ts:297-306, semantic-agent.test.ts:328-337, semantic-agent.test.ts:351-360, semantic-agent.test.ts:383-392, semantic-agent.test.ts:404-413, semantic-agent.test.ts:485-493, semantic-agent.test.ts:499-508, semantic-agent.test.ts:520-530) — Agent task configurations for different operation types including search, analysis, and clone detection.
- **entities** (semantic-agent.test.ts:119-123, semantic-agent.test.ts:181-189, semantic-agent.test.ts:462-472) — Entity collections for semantic graph testing and relationship validation.

## Key Patterns & Dependencies

### Testing Patterns

**Mock Service Layer** — Isolates agent behavior by replacing real dependencies (vector store, embedding service, code analyzer) with deterministic test doubles. Each mock enforces contract compatibility while enabling controlled test scenarios and performance measurement.

**Fixture-Driven Test Design** — Uses centralized task, file, and entity fixtures to ensure consistency across test suites and reduce test setup boilerplate. Fixtures are re-used across multiple test cases within each suite.

**Backpressure & Concurrency Testing** — Validates agent queue limits and concurrent processing through deliberate overload scenarios, ensuring AgentBusyError is thrown when task backlog exceeds configured capacity.

**Resource Lifecycle Management** — Test infrastructure automatically creates and cleans up temporary test files, mock service instances, and agent state, ensuring no test pollution or resource leaks between test runs.

### Dependencies Between Test Suites

- **base-agent.test.ts** — Foundation for all agent tests; validates core concurrency and backpressure mechanisms inherited by specialized agents.
- **parser-agent.test.ts** — Depends on file system utilities and sample code generation; exercises agent task dispatch and result collection.
- **semantic-agent.test.ts** — Depends on mock embedding and vector store implementations; validates embedding pipeline, hybrid search, and graph storage integration.
- **resource-adjustment.test.ts** — Validates concurrent resource allocation across all agent types during high-load scenarios.

### Mock Service Contracts

- **VectorStore** implements insertion, retrieval, and count operations mirroring production graph storage APIs.
- **EmbeddingGenerator** produces fixed-size Float32Array outputs with deterministic values based on input hash.
- **HybridSearchEngine** combines vector similarity and keyword matching with configurable scoring for relevance validation.
- **SemanticCache** tracks hit/miss rates and stores query results, enabling cache behavior assertions.
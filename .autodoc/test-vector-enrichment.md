# Vector Store Architecture

## Overview

This document describes the vector storage architecture used for semantic search.

### Core Components

The main class is [→ entity:VectorStore](src/semantic/vector-store.ts) which manages the FAISS index. 

Key method [→ entity:enrichResultsFromLibSQL](src/semantic/vector-store.ts) enriches search results with entity metadata from LibSQL.

### Search Engine  

The [→ entity:HybridSearchEngine](src/semantic/hybrid-search-engine.ts) combines multiple search strategies for better relevance ranking.

## Implementation

For semantic operations, see [→ entity:SemanticAgent](src/agents/semantic-agent.ts) which coordinates all semantic search functionality.
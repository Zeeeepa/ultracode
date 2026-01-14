# Vector Storage System

## Overview

The vector storage system manages semantic embeddings for code search.

### Core Components  

The main class [→ entity:D:\github\ultrascript-tools-mcp\src\semantic\vector-store.ts:class:VectorStore](src/semantic/vector-store.ts) handles all vector operations.

Key enrichment method [→ entity:D:\github\ultrascript-tools-mcp\src\semantic\vector-store.ts:function:enrichResultsFromLibSQL](src/semantic/vector-store.ts) restores metadata.

### Search Strategy

The [→ entity:D:\github\ultrascript-tools-mcp\src\semantic\hybrid-search-engine.ts:class:HybridSearchEngine](src/semantic/hybrid-search-engine.ts) combines multiple search approaches.
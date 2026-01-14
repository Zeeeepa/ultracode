# Semantic Search Test

## Overview

This document describes semantic search functionality for testing AutoDoc enrichment.

### Key Components

The main semantic search is implemented in [[SemanticAgent]]. It uses vector embeddings to find similar code.

### Vector Store

The [[VectorStore]] class manages FAISS index and enrichment. Key method is [[enrichResultsFromLibSQL]] which now supports AutoDoc-driven entity discovery.

## Implementation Details

The search uses [[HybridSearchEngine]] to combine structural and semantic results. This provides better relevance ranking.

### Helper Functions

For embedding generation, see [[EmbeddingGenerator]]. It supports multiple providers like Ollama and TEI.

## Examples

Basic usage example with [[semanticSearch]] method for querying the codebase.
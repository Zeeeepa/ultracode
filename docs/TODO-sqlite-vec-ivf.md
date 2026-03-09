# TODO: sqlite-vec IVF Roadmap

## Current State
- UltraCode uses **FAISS** (native addon) for all vector operations
- sqlite-vec (v0.1.x) supports only brute-force KNN (`vec0` virtual table)
- No IVF index support in sqlite-vec yet

## Future Consideration
When sqlite-vec adds **IVF index** support, consider replacing FAISS with sqlite-vec for unified storage:

### Benefits
- Metadata-filtered vector search in SQL (`WHERE type = 'function' AND vec_distance(...)`)
- Single database file (vectors + entities + metadata)
- No separate `.bin` FAISS index files
- SQL-native API, no FFI/addon complexity
- Simplified backup/migration (just copy `.db` file)

### Current Blockers
- sqlite-vec lacks IVF/HNSW indexes (brute-force only → O(n) per query)
- FAISS native addon already handles IVF,SQ8 with GPU acceleration
- No performance benefit from sqlite-vec until index support lands

### Links
- sqlite-vec: https://github.com/asg017/sqlite-vec
- FAISS: https://github.com/facebookresearch/faiss

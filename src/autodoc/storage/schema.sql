-- AutoDoc Schema
-- Tables for documentation layer with semantic search

-- =============================================================================
-- DOC_ENTITIES: Documentation sections and files
-- =============================================================================
CREATE TABLE IF NOT EXISTS doc_entities (
    -- Primary key: doc::{filePath}::{sectionId}
    id TEXT PRIMARY KEY,
    -- Type: architecture, flow, process, dependency, deployment, glossary, module_index, entity_doc, section
    type TEXT NOT NULL,
    -- Path to .md file relative to .autodoc/
    file_path TEXT NOT NULL,
    -- Section within file (null for whole file)
    section TEXT,
    -- Section title from heading
    title TEXT NOT NULL,
    -- Markdown content
    content TEXT NOT NULL,
    -- JSON array of tags
    tags TEXT DEFAULT '[]',
    -- 1 if AI-generated, 0 if human-written
    auto_generated INTEGER DEFAULT 1,
    -- AI confidence in accuracy (0.0-1.0)
    confidence REAL DEFAULT 1.0,
    -- Last sync with code (Unix timestamp ms)
    last_sync INTEGER,
    -- Creation timestamp (Unix timestamp ms)
    created_at INTEGER NOT NULL,
    -- Last update timestamp (Unix timestamp ms)
    updated_at INTEGER NOT NULL
);

-- Indexes for doc_entities
CREATE INDEX IF NOT EXISTS idx_doc_file ON doc_entities(file_path);
CREATE INDEX IF NOT EXISTS idx_doc_type ON doc_entities(type);
CREATE INDEX IF NOT EXISTS idx_doc_section ON doc_entities(section);
CREATE INDEX IF NOT EXISTS idx_doc_confidence ON doc_entities(confidence);
CREATE INDEX IF NOT EXISTS idx_doc_updated ON doc_entities(updated_at);

-- =============================================================================
-- REFERENCES: Links between docs, code, and comments
-- =============================================================================
CREATE TABLE IF NOT EXISTS doc_references (
    -- UUID
    id TEXT PRIMARY KEY,
    -- Source type: doc, comment, code
    source_type TEXT NOT NULL,
    -- Source file path
    source_file_path TEXT NOT NULL,
    -- Source line start
    source_line_start INTEGER NOT NULL,
    -- Source line end
    source_line_end INTEGER NOT NULL,
    -- Source char start (optional)
    source_char_start INTEGER,
    -- Source char end (optional)
    source_char_end INTEGER,
    -- Target type: entity, doc, line_range, commit
    target_type TEXT NOT NULL,
    -- Target identifier
    target_id TEXT NOT NULL,
    -- Reference type: describes, depends, example, test, participates, uses
    ref_type TEXT NOT NULL,
    -- Original syntax of the reference
    ref_syntax TEXT NOT NULL,
    -- 1 if valid, 0 if broken
    valid INTEGER DEFAULT 1,
    -- Validation error message if invalid
    validation_error TEXT,
    -- Creation timestamp
    created_at INTEGER NOT NULL,
    -- Last update timestamp
    updated_at INTEGER NOT NULL,

    -- Denormalized fields for fast querying
    target_entity_id TEXT,
    target_file_path TEXT,
    target_line_start INTEGER,
    target_line_end INTEGER
);

-- Indexes for doc_references
CREATE INDEX IF NOT EXISTS idx_ref_source_file ON doc_references(source_file_path);
CREATE INDEX IF NOT EXISTS idx_ref_source_type ON doc_references(source_type);
CREATE INDEX IF NOT EXISTS idx_ref_target_id ON doc_references(target_id);
CREATE INDEX IF NOT EXISTS idx_ref_target_type ON doc_references(target_type);
CREATE INDEX IF NOT EXISTS idx_ref_target_entity ON doc_references(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_ref_target_file ON doc_references(target_file_path);
CREATE INDEX IF NOT EXISTS idx_ref_valid ON doc_references(valid);
CREATE INDEX IF NOT EXISTS idx_ref_type ON doc_references(ref_type);

-- =============================================================================
-- DOC_CHANGELOG: History of documentation changes
-- =============================================================================
CREATE TABLE IF NOT EXISTS doc_changelog (
    -- UUID
    id TEXT PRIMARY KEY,
    -- Timestamp of change (Unix timestamp ms)
    timestamp INTEGER NOT NULL,
    -- Git commit hash (optional)
    commit_hash TEXT,
    -- Git branch name
    branch TEXT NOT NULL,
    -- Human-readable summary
    summary TEXT,
    -- JSON array of changes: [{entityId, changeType, summary, diffHighlights}]
    changes TEXT NOT NULL,
    -- JSON array of impacted doc IDs
    impacted_docs TEXT DEFAULT '[]'
);

-- Indexes for doc_changelog
CREATE INDEX IF NOT EXISTS idx_changelog_time ON doc_changelog(timestamp);
CREATE INDEX IF NOT EXISTS idx_changelog_commit ON doc_changelog(commit_hash);
CREATE INDEX IF NOT EXISTS idx_changelog_branch ON doc_changelog(branch);

-- =============================================================================
-- COMMENT_REFS: References extracted from code comments
-- =============================================================================
CREATE TABLE IF NOT EXISTS comment_refs (
    -- comment::{filePath}::{lineStart}
    id TEXT PRIMARY KEY,
    -- Source file path
    file_path TEXT NOT NULL,
    -- Comment start line
    line_start INTEGER NOT NULL,
    -- Comment end line
    line_end INTEGER NOT NULL,
    -- Comment content
    content TEXT NOT NULL,
    -- Parent code entity ID (optional)
    parent_entity_id TEXT,
    -- JSON array of doc reference IDs
    doc_refs TEXT DEFAULT '[]',
    -- JSON array of entity reference IDs
    entity_refs TEXT DEFAULT '[]',
    -- JSON array of flow tags
    flow_tags TEXT DEFAULT '[]',
    -- Creation timestamp
    created_at INTEGER NOT NULL,
    -- Last update timestamp
    updated_at INTEGER NOT NULL
);

-- Indexes for comment_refs
CREATE INDEX IF NOT EXISTS idx_comment_file ON comment_refs(file_path);
CREATE INDEX IF NOT EXISTS idx_comment_parent ON comment_refs(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_comment_lines ON comment_refs(file_path, line_start, line_end);

-- =============================================================================
-- DOC_TODOS: Sections needing documentation
-- =============================================================================
CREATE TABLE IF NOT EXISTS doc_todos (
    -- Section ID
    id TEXT PRIMARY KEY,
    -- File path
    file_path TEXT NOT NULL,
    -- Section title
    title TEXT NOT NULL,
    -- Priority: high, medium, low
    priority TEXT NOT NULL DEFAULT 'medium',
    -- Reason why this needs documentation
    reason TEXT,
    -- Related entity ID (optional)
    related_entity_id TEXT,
    -- 1 if completed, 0 if pending
    completed INTEGER DEFAULT 0,
    -- Creation timestamp
    created_at INTEGER NOT NULL,
    -- Completion timestamp (optional)
    completed_at INTEGER
);

-- Indexes for doc_todos
CREATE INDEX IF NOT EXISTS idx_todo_priority ON doc_todos(priority);
CREATE INDEX IF NOT EXISTS idx_todo_completed ON doc_todos(completed);
CREATE INDEX IF NOT EXISTS idx_todo_file ON doc_todos(file_path);

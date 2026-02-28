# AutoDoc Guide

AutoDoc is an automatic code documentation system with semantic search.

## Concept

**AutoDoc != code comments**

| Comments | AutoDoc |
|----------|---------|
| HOW code works | WHY, WHO uses it, IN WHICH scenarios |
| Local context | Business context + architecture |
| For developer in IDE | For AI + system understanding |

## `.autodoc/` Structure

```
.autodoc/
├── ARCHITECTURE.md    # System components
├── FLOW.md            # Business scenarios (user stories)
├── PROCESSES.md       # Technical processes
├── DEPENDENCIES.md    # Packages, APIs, microservices
├── DEPLOYMENT.md      # Build, CI/CD, ENV
├── GLOSSARY.md        # Terms
│
└── src/               # Mirrors code structure
    ├── _index.md      # Directory overview
    ├── module/
    │   ├── _index.md  # Module documentation
    │   └── file.md    # Entity documentation
    └── ...
```

## MCP Tools

### Initialization and Status

```
autodoc_init({ enabled: true, language: 'ru' | 'en' | 'zh', docsDir?: string })
```
Initializes AutoDoc. Sets documentation language.

```
autodoc_status()
```
Status: enabled/disabled, statistics (docs, sections, refs).

```
autodoc_detect_language({ scope: 'all' | 'comments' | 'docs', sampleSize?: number })
```
Automatic language detection based on code comments and existing documentation.

### Search and Reading

```
autodoc_search({ query: "...", scope: 'all' | 'code' | 'docs', mode: 'text' | 'semantic' | 'hybrid' })
```
Semantic search across code + documentation.
**Use instead of regular search** — provides context!

```
autodoc_get({ filePath: "...", section?: "..." })
```
Get documentation by path. If a section is specified, returns only that section.

### Saving

```
autodoc_save({ filePath: "...", content: "..." })
```
Saves a document. Automatically:
- Parses links
- Generates embeddings for semantic search
- Extracts sections

### Generation

```
autodoc_generate({ filePath: "...", scope?: 'file' | 'module' | 'project', style?: 'brief' | 'detailed' })
```
Generates documentation for code entities using LLM. Produces structured AutoDoc content with role descriptions, consumers, and process participation.

### Validation and Synchronization

```
autodoc_validate({ fixBrokenRefs: false | true })
```
Validates all links, optionally fixes them.

```
autodoc_sync({ scope: 'all' | 'outdated' | 'file', filePath?: string })
```
Synchronizes documentation with code changes.
Finds outdated documents and invalid links.

### Change History

```
autodoc_changelog({ since?: timestamp, limit?: number, branch?: string })
```
View documentation change history.
Shows what changed after code modifications.

### Auto-update (Watcher)

AutoDoc Watcher automatically updates AUTODOC.md files when code changes:
- Adds/removes exports in the list
- Updates line numbers in links
- Debounce 30-60 seconds (adaptive)

**Enable in ultracode.yaml:**
```yaml
mcp:
  autodoc:
    watcherEnabled: true
    debounceMs: 45000      # base delay
    minDebounceMs: 30000   # minimum
    maxDebounceMs: 60000   # maximum
    useLlm: false          # LLM for descriptions
```

### Git Hooks (legacy)

```
autodoc_install_hooks({ action: 'install' | 'uninstall' | 'status' })
```
Pre-commit hook for link validation. **Deprecated** — use Watcher instead.

## Workflows

### 1. Project Initialization

```
User: "Document the project"

1. autodoc_detect_language({ scope: 'comments' })
   -> Detects project language from comments

2. autodoc_init({ enabled: true, language: 'en' })
   -> Initializes AutoDoc

3. autodoc_status()
   -> Shows current state

4. Create .autodoc/ directory with documentation
   autodoc_save({ filePath: 'ARCHITECTURE.md', content: '...' })
```

### 2. Understanding an Existing Project

```
User: "How does authorization work?"

1. autodoc_search({ query: "authorization authentication", mode: 'semantic' })
   -> Finds documentation + code

2. autodoc_get({ filePath: 'FLOW.md', section: 'registration' })
   -> Business scenario

3. autodoc_get({ filePath: 'PROCESSES.md', section: 'auth-flow' })
   -> Technical implementation
```

### 3. After Code Changes

```
User: "Added rate limiting to AuthService"

1. autodoc_sync({ scope: 'outdated' })
   -> Finds outdated documents

2. autodoc_validate()
   -> Validates links

3. autodoc_save({
     filePath: 'src/services/auth/auth.service.md',
     content: '...'
   })

4. autodoc_changelog({ limit: 5 })
   -> Shows recent changes
```

### 4. Automatic Documentation Updates

AutoDoc Watcher works automatically when enabled in config:
```yaml
# ultracode.yaml
mcp:
  autodoc:
    watcherEnabled: true
```

When .ts/.js files change:
1. Watcher tracks changes via KnowledgeBus
2. Debounce 30-60 sec (groups multiple changes)
3. Updates AUTODOC.md in the corresponding module:
   - Adds new exports
   - Removes deleted exports
   - Updates line numbers in links

## Entity-level Documentation Format

**Do NOT duplicate comments!** Write about:
- Role in the system (WHY)
- Who uses it (BY WHOM)
- Process participation (WHERE)
- Business invariants
- Critical dependencies
- Known issues

```markdown
# AuthService

[-> auth.service.ts:15-120](auth.service.ts#L15-L120)

## Role in the System

**Purpose**: Single point for authentication management...

## Consumers

| Consumer | How It Uses |
|----------|-------------|
| [-> API Gateway](../../gateway/README.md) | Token verification |

## Process Participation

- [-> FLOW.md#registration](../../FLOW.md#registration)
- [-> PROCESSES.md#auth-flow](../../PROCESSES.md#auth-flow)

## Business Invariants

- One active token per user
- Rate limiting: 5 attempts/min
```

## Link Syntax

```markdown
[-> file.ts:25-50](file.ts#L25-L50)     # To code lines
[-> ModuleName](./_index.md)             # To documentation
[-> FLOW.md#scenario](../../FLOW.md#scenario)  # To section
```

In code comments:
```typescript
/**
 * @see docs://.autodoc/PROCESSES.md#auth-flow
 * @flow user-registration, api-auth
 */
```

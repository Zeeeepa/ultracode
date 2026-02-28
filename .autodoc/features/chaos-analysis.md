# Chaos Analysis - State Sprawl Detection

STATUS: WORKING IMPLEMENTATION

## Overview

**Chaos Analysis** is a tool for detecting and analyzing state management problems in TypeScript/JavaScript codebases, with a focus on Angular projects.

### Implementation Status

**Full working version** - GraphStorage API has been extended, Chaos Analysis is implemented!

**New GraphStorage methods:**
- `getAllEntities()` - get all entities from the graph
- `searchEntities(pattern, types)` - search entities by pattern
- `getRelationships(sourceId)` - get entity relationships

**Implemented:**
- Types and interfaces (`src/types/chaos-analysis.ts`)
- MCP tool `analyze_state_chaos` registered
- State Pattern Detection (simplified version)
- Chaos Metrics (basic metrics)
- Refactoring recommendations
- AI-friendly Summary

### Problem

During development, "state sprawl" often occurs:
1. State is created in one place
2. Passed through multiple components
3. Each component starts modifying it for its own needs
4. Local copies, checks, and defensive code appear
5. On process restart, states begin to diverge
6. **Result**: chaos, tightly coupled components, maintenance difficulty

### Solution

Chaos Analysis automatically:
- **Detects** state management patterns
- **Traces** where the state originally comes from
- **Builds a graph** of state propagation through code
- **Measures metrics** of coupling, mutations, defensive code
- **Assesses risk** of state divergence
- **Proposes a strategy** for refactoring

## Usage

### MCP Tool: `analyze_state_chaos`

```typescript
{
  "scope": "project",                          // "file" | "module" | "project"
  "stateIdentifiers": ["token", "userId"],     // Specific identifiers (optional)
  "autoDetect": true,                          // Auto-detection (optional)
  "format": "summary",                         // "summary" | "detailed" | "json"
  "maxDepth": 10,                              // Maximum tracing depth
  "excludePatterns": ["**/*.spec.ts"]          // Exclusion patterns
}
```

### Examples

#### 1. Analyze specific state

```typescript
// Analyze "token" variable in the project
{
  "scope": "project",
  "stateIdentifiers": ["token"],
  "format": "summary"
}
```

**Result:**
```
## token
Chaos: 72/100 (high)
Files: 8, Operations: 23
Strategy: Service
Effort: Medium (5-10 components)

**Problem areas:**
- auth.service.ts:getUserToken (mutates state, defensive code, depth 4)
- user-profile.component.ts:loadUser (defensive code, depth 3)
- api.interceptor.ts:intercept (mutates state, depth 5)

**Quick fixes:**
- Remove redundant local state copies
- Consolidate state mutations in one place
```

#### 2. Auto-detect all problematic states

```typescript
{
  "scope": "module",
  "autoDetect": true,
  "format": "summary"
}
```

Will find all variables with names like:
- `token`, `_token`, `savedToken`
- `userId`, `currentUser`
- `config`, `settings`, `state`
- `isLoading`, `hasAccess`
- etc.

#### 3. Detailed report

```typescript
{
  "scope": "project",
  "stateIdentifiers": ["anonymousId"],
  "format": "detailed"
}
```

**Result:**
```markdown
# State Analysis: anonymousId

**Overall score:** 65/100
**Divergence risk:** high

## Metrics
- Coupling: 68/100
- Components affected: 12
- Mutation points: 8
- Files with mutations: 6
- Defensive patterns: 15

## Refactoring Recommendation
**Strategy:** Service
**Rationale:** Medium component coupling. Angular DI makes it easy to inject a service. BehaviorSubject provides reactivity.

**Benefits:**
- Coupling reduction: 40%
- Fewer mutation points: -4

**Risks:**
- Changes are spread across many files - high regression risk
```

## Architecture

### Components

```
ChaosAnalyzer (main orchestrator)
  ├── StateDetector         - state pattern detection
  ├── OriginTracer          - origin tracing
  ├── FlowMapper            - propagation graph building
  └── MetricsCalculator     - chaos metrics calculation
```

### Analysis Phases

1. **State Pattern Detection**
   - Search for state variables in Code Graph
   - Operation classification (read/write/check/store/etc)
   - Angular pattern detection (@Input, BehaviorSubject, etc)

2. **Origin Tracing**
   - Tracing through imports
   - Tracing through DI (Angular services)
   - Building the dependency chain

3. **Flow Mapping**
   - Building the node graph (StateFlowNode)
   - Linking through edges (data/control/import/injection)
   - Depth calculation (BFS from source)

4. **Chaos Metrics**
   - **Coupling**: component coupling through state
   - **Mutation Spread**: how many places mutate the state
   - **Defensive Patterns**: checks, copies, fallbacks
   - **Divergence Risk**: divergence risk (low/medium/high/critical)

5. **Refactoring Plan**
   - Strategy selection: Service | Store | Signal | Context
   - Effort and benefit estimation
   - Risk identification

## Angular-specific Patterns

Chaos Analysis recognizes:

```typescript
// @Input/@Output
@Input() userData: User;
@Output() userChange = new EventEmitter<User>();

// BehaviorSubject
private userSubject = new BehaviorSubject<User>(null);

// Signals (Angular 16+)
userSignal = signal<User>(null);

// Services
@Injectable()
export class AuthService {
  private token: string;
}

// LocalStorage
localStorage.getItem('token');
sessionStorage.setItem('userId', id);

// Defensive patterns
user?.profile?.name ?? 'Guest'
const savedUser = { ...this.user }  // Copying
```

## Metrics

### Chaos Score (0-100)

Calculated based on:
- **Coupling** (30%): component coupling
- **Mutation Spread** (25%): mutation distribution
- **Defensive Code** (20%): defensive patterns
- **Divergence Risk** (15%): divergence risk
- **Complexity** (10%): cyclomatic complexity

### Divergence Risk

- **low** (< 25): state is managed centrally
- **medium** (25-50): issues exist but are manageable
- **high** (50-75): refactoring required
- **critical** (> 75): critical situation, high bug risk

## Refactoring Strategies

### 1. Service (Angular)
```typescript
@Injectable({ providedIn: 'root' })
export class TokenService {
  private token$ = new BehaviorSubject<string | null>(null);

  getToken(): Observable<string | null> {
    return this.token$.asObservable();
  }

  setToken(token: string): void {
    this.token$.next(token);
  }
}
```

**When to use:**
- Medium coupling (30-70)
- Angular project
- Reactivity needed (RxJS)

### 2. Store (NgRx/Redux)
```typescript
// State
interface AppState {
  token: string | null;
}

// Actions
const setToken = createAction('[Auth] Set Token', props<{ token: string }>());

// Reducer
const authReducer = createReducer(
  initialState,
  on(setToken, (state, { token }) => ({ ...state, token }))
);
```

**When to use:**
- High coupling (> 70)
- Many state mutation points (> 10 places)
- Large application

### 3. Signal (Angular 16+)
```typescript
export class AppComponent {
  token = signal<string | null>(null);

  updateToken(newToken: string) {
    this.token.set(newToken);
  }
}
```

**When to use:**
- Low coupling (< 30)
- Simple state
- Angular 16+

### 4. Context (React) / DI Container
```typescript
@Injectable({ providedIn: 'root' })
export class AppContext {
  private state = {
    token: null as string | null,
    user: null as User | null
  };

  get<K extends keyof typeof this.state>(key: K) {
    return this.state[key];
  }

  set<K extends keyof typeof this.state>(key: K, value: typeof this.state[K]) {
    this.state[key] = value;
  }
}
```

**When to use:**
- Lots of defensive code
- Type safety needed
- Centralized access

## Integration with Other Tools

### Code Graph RAG
Chaos Analysis uses Code Graph RAG for:
- Searching variables and their usages
- Tracing imports and dependencies
- Building the propagation graph

### Semantic Search
Can use embeddings for:
- Grouping related states
- Searching for similar patterns
- Semantic code analysis

## Limitations

1. **Depends on indexing**: requires an indexed Code Graph
2. **Static analysis**: does not analyze runtime behavior
3. **TypeScript/JavaScript**: optimized for TS/JS and Angular
4. **Heuristics**: uses patterns and heuristics, may be imprecise

## Roadmap

- [ ] Graph visualization (Mermaid/GraphViz)
- [ ] Automatic refactoring (code generation)
- [ ] React/Vue specific pattern support
- [ ] Integration with oxlint for CI checks
- [ ] ML-based pattern detection improvement

## Usage Examples

See `examples/chaos-analysis-example.ts` for full examples.

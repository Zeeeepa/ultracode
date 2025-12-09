# Semantic Tracing — План имплементации

## Структура файлов

```
src/
├── tracing/                          # Новый модуль трейсинга
│   ├── index.ts                      # Экспорты
│   ├── trace-engine.ts               # Основной движок трассировки
│   ├── path-builder.ts               # Построение путей (BFS/DFS)
│   ├── state-tracker.ts              # Отслеживание состояний
│   ├── condition-analyzer.ts         # Анализ условий
│   ├── data-flow-analyzer.ts         # Анализ потоков данных
│   ├── output-formatter.ts           # Форматирование вывода
│   └── types.ts                      # Типы для трейсинга
│
├── tools/handlers/
│   └── tracing-tool-handlers.ts      # MCP handlers для инструментов
│
└── types/
    └── tracing.ts                    # Публичные типы
```

## Типы (src/tracing/types.ts)

```typescript
// ============================================================
// ВХОДНЫЕ ПАРАМЕТРЫ ИНСТРУМЕНТОВ
// ============================================================

export interface TraceFlowParams {
  from: string;              // Начальная точка (семантический поиск)
  to: string;                // Конечная точка
  trackStates?: boolean;     // Отслеживать изменения состояний
  trackConditions?: boolean; // Отслеживать условия
  maxDepth?: number;         // Глубина анализа (default: 20)
  format?: 'sequence' | 'tree' | 'graph' | 'mermaid';
}

export interface TraceBackwardsParams {
  target: string;            // Целевой метод
  question: 'why_not_called' | 'what_affects' | 'dependencies';
  depth?: number;            // Глубина обратного анализа
  includeStates?: boolean;   // Анализировать состояния
  includeEffects?: boolean;  // Анализировать side effects
}

export interface TraceDataFlowParams {
  entryPoint: string;        // Точка входа
  targetState: string;       // Целевое состояние
  dataSources?: string[];    // Источники данных (семантический поиск)
  trackTransformations?: boolean;
}

export interface AnalyzeStateImpactParams {
  state: string;             // Состояние для анализа
  scenarios: Array<{
    value: unknown;
    label: string;
  }>;
  scope?: string;            // Область анализа (семантический поиск)
}

export interface FindDecisionPointsParams {
  scenario: string;          // Семантический поиск сценария
  includeGuards?: boolean;
  includeEffects?: boolean;
  groupBy?: 'impact' | 'location' | 'type';
}

// ============================================================
// ВЫХОДНЫЕ СТРУКТУРЫ
// ============================================================

export interface TraceStep {
  order: number;
  entity: string;
  entityId: string;
  file: string;
  line: number;
  action: 'call' | 'condition' | 'setState' | 'await' | 'return' | 'throw';

  // Для action === 'condition'
  condition?: string;
  branches?: Record<string, string>; // outcome → next action

  // Для action === 'setState'
  stateChanges?: Array<{
    variable: string;
    from?: string;
    to?: string;
  }>;

  // Для action === 'await'
  awaits?: boolean;
  awaitTarget?: string;

  // Дополнительный контекст
  preconditions?: string[];
  postconditions?: string[];
  documentation?: string;
}

export interface TracePath {
  id: string;
  confidence: number;        // 0-1, насколько уверены в пути
  steps: TraceStep[];
  summary: string;
  warnings?: string[];
}

export interface TraceFlowResult {
  from: string;
  to: string;
  paths: TracePath[];

  statesSummary: {
    modified: string[];
    read: string[];
    critical: string[];
  };

  conditionsSummary: {
    guards: number;
    branches: number;
    criticalConditions: string[];
  };

  mermaid?: string;          // Если format === 'mermaid'
}

export interface Caller {
  name: string;
  entityId: string;
  file: string;
  line: number;
  condition?: string;
  probability: 'always' | 'conditional' | 'rare';
}

export interface BlockingCondition {
  condition: string;
  location: string;
  currentValue: string;      // 'unknown (runtime)' для статического анализа
  recommendation: string;
}

export interface StateDependency {
  state: string;
  modifiedBy: string[];
  requiredValue?: string;
}

export interface CallChain {
  chain: string[];           // ['A → B → C']
  guards: string[];
  likelihood: 'high' | 'medium' | 'low';
}

export interface TraceBackwardsResult {
  target: {
    name: string;
    entityId: string;
    file: string;
    signature: string;
  };

  callers: Caller[];
  blockingConditions: BlockingCondition[];
  statesDependencies: StateDependency[];
  callChains: CallChain[];

  diagnosis: {
    possibleReasons: string[];
    suggestedDebugPoints: string[];
  };
}

export interface DataFlowStep {
  step: number;
  location: string;
  action: 'parse' | 'transform' | 'branch' | 'setState' | 'fetch';
  input?: string;
  output?: string;
  transformation?: string;

  // Для action === 'branch'
  condition?: string;
  branches?: Record<string, string>;
}

export interface DataFlow {
  source: string;
  flow: DataFlowStep[];
  affectsTarget: boolean;
  criticalConditions: string[];
}

export interface BehaviorCombination {
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  path: string;
}

export interface TraceDataFlowResult {
  entryPoint: string;
  targetState: string;
  dataFlows: DataFlow[];

  behaviorMatrix: {
    combinations: BehaviorCombination[];
  };

  summary: {
    dataSourcesAnalyzed: number;
    branchingPoints: number;
    possibleOutcomes: number;
    criticalDecisions: string[];
  };
}

export interface StateUsage {
  location: string;
  usage: 'condition' | 'assignment' | 'read' | 'parameter';
  code: string;
}

export interface ScenarioAnalysis {
  reachablePaths: string[];
  blockedPaths: string[];
  enabledFeatures: string[];
  stateChanges: string[];
}

export interface StateConflict {
  description: string;
  location: string;
  risk: string;
  recommendation: string;
}

export interface AnalyzeStateImpactResult {
  state: string;
  usages: StateUsage[];
  scenarioAnalysis: Record<string, ScenarioAnalysis>;
  conflicts: StateConflict[];
  rippleEffects: {
    directEffects: number;
    indirectEffects: number;
    affectedComponents: string[];
  };
}

export interface DecisionPoint {
  id: string;
  location: string;
  type: 'validation' | 'api_response' | 'state_mutation' | 'guard' | 'loop';
  condition?: string;
  action?: string;
  outcomes: Record<string, string>;
  effects?: string[];
  impact: 'critical' | 'high' | 'medium' | 'low';
  dataDepends: string[];
  triggeredBy?: string;
}

export interface FindDecisionPointsResult {
  scenario: string;
  entryPoints: Array<{ name: string; file: string }>;
  decisionPoints: DecisionPoint[];

  flowDiagram: {
    mermaid: string;
  };

  summary: {
    totalDecisionPoints: number;
    criticalPoints: number;
    possibleOutcomes: number;
    statesModified: string[];
  };
}
```

## TraceEngine (src/tracing/trace-engine.ts)

```typescript
import type { GraphStorage, Entity, Relationship, RelationType } from '../types/storage.js';
import type { SemanticAgent } from '../agents/semantic-agent.js';
import type { ChaosAnalyzer } from '../analysis/chaos/chaos-analyzer.js';
import { PathBuilder } from './path-builder.js';
import { StateTracker } from './state-tracker.js';
import { ConditionAnalyzer } from './condition-analyzer.js';
import { DataFlowAnalyzer } from './data-flow-analyzer.js';
import { OutputFormatter } from './output-formatter.js';
import type * as T from './types.js';

export class TraceEngine {
  private pathBuilder: PathBuilder;
  private stateTracker: StateTracker;
  private conditionAnalyzer: ConditionAnalyzer;
  private dataFlowAnalyzer: DataFlowAnalyzer;
  private outputFormatter: OutputFormatter;

  constructor(
    private graphStorage: GraphStorage,
    private semanticAgent: SemanticAgent,
    private chaosAnalyzer?: ChaosAnalyzer
  ) {
    this.pathBuilder = new PathBuilder(graphStorage);
    this.stateTracker = new StateTracker(graphStorage, chaosAnalyzer);
    this.conditionAnalyzer = new ConditionAnalyzer(graphStorage);
    this.dataFlowAnalyzer = new DataFlowAnalyzer(graphStorage, semanticAgent);
    this.outputFormatter = new OutputFormatter();
  }

  /**
   * trace_flow: От точки A до точки B — что происходит?
   */
  async traceFlow(params: T.TraceFlowParams): Promise<T.TraceFlowResult> {
    // 1. Найти entry и exit points через семантический поиск
    const fromEntities = await this.findEntities(params.from);
    const toEntities = await this.findEntities(params.to);

    if (fromEntities.length === 0) {
      throw new Error(`Entry point not found: ${params.from}`);
    }
    if (toEntities.length === 0) {
      throw new Error(`Exit point not found: ${params.to}`);
    }

    // 2. Построить все пути между точками
    const rawPaths = await this.pathBuilder.findPaths(
      fromEntities.map(e => e.id),
      toEntities.map(e => e.id),
      params.maxDepth ?? 20
    );

    // 3. Для каждого пути собрать информацию
    const paths: T.TracePath[] = [];

    for (const rawPath of rawPaths) {
      const steps: T.TraceStep[] = [];

      for (let i = 0; i < rawPath.entities.length; i++) {
        const entity = rawPath.entities[i];
        const step = await this.buildTraceStep(entity, i + 1, params);
        steps.push(step);
      }

      paths.push({
        id: `path-${paths.length + 1}`,
        confidence: this.calculatePathConfidence(rawPath),
        steps,
        summary: this.generatePathSummary(steps)
      });
    }

    // 4. Собрать summary
    const statesSummary = params.trackStates
      ? await this.stateTracker.summarizeStates(paths)
      : { modified: [], read: [], critical: [] };

    const conditionsSummary = params.trackConditions
      ? await this.conditionAnalyzer.summarizeConditions(paths)
      : { guards: 0, branches: 0, criticalConditions: [] };

    // 5. Форматировать вывод
    const result: T.TraceFlowResult = {
      from: params.from,
      to: params.to,
      paths,
      statesSummary,
      conditionsSummary
    };

    if (params.format === 'mermaid') {
      result.mermaid = this.outputFormatter.toMermaid(paths);
    }

    return result;
  }

  /**
   * trace_backwards: Почему метод не вызывается? Что влияет?
   */
  async traceBackwards(params: T.TraceBackwardsParams): Promise<T.TraceBackwardsResult> {
    // 1. Найти целевую сущность
    const targetEntities = await this.findEntities(params.target);
    if (targetEntities.length === 0) {
      throw new Error(`Target not found: ${params.target}`);
    }
    const target = targetEntities[0];

    // 2. Найти всех вызывающих (callers)
    const callers = await this.pathBuilder.findCallers(
      target.id,
      params.depth ?? 15
    );

    // 3. Проанализировать условия блокировки
    const blockingConditions = await this.conditionAnalyzer.findBlockingConditions(
      target.id,
      callers
    );

    // 4. Проанализировать зависимости состояний
    const statesDependencies = params.includeStates
      ? await this.stateTracker.findStateDependencies(target.id, callers)
      : [];

    // 5. Построить цепочки вызовов
    const callChains = await this.pathBuilder.buildCallChains(target.id, callers);

    // 6. Сформировать диагноз
    const diagnosis = this.generateDiagnosis(
      params.question,
      callers,
      blockingConditions,
      statesDependencies
    );

    return {
      target: {
        name: target.name,
        entityId: target.id,
        file: target.filePath,
        signature: target.signature || target.name
      },
      callers: callers.map(c => ({
        name: c.entity.name,
        entityId: c.entity.id,
        file: c.entity.filePath,
        line: c.entity.startLine || 0,
        condition: c.condition,
        probability: c.probability
      })),
      blockingConditions,
      statesDependencies,
      callChains,
      diagnosis
    };
  }

  /**
   * trace_data_flow: От каких данных зависит поведение?
   */
  async traceDataFlow(params: T.TraceDataFlowParams): Promise<T.TraceDataFlowResult> {
    return this.dataFlowAnalyzer.analyze(params);
  }

  /**
   * analyze_state_impact: Что произойдёт при изменении состояния?
   */
  async analyzeStateImpact(params: T.AnalyzeStateImpactParams): Promise<T.AnalyzeStateImpactResult> {
    // 1. Найти все использования состояния
    const usages = await this.stateTracker.findStateUsages(params.state, params.scope);

    // 2. Проанализировать каждый сценарий
    const scenarioAnalysis: Record<string, T.ScenarioAnalysis> = {};

    for (const scenario of params.scenarios) {
      scenarioAnalysis[scenario.label] = await this.stateTracker.analyzeScenario(
        params.state,
        scenario.value,
        usages
      );
    }

    // 3. Найти конфликты
    const conflicts = await this.stateTracker.findConflicts(params.state, usages);

    // 4. Вычислить ripple effects
    const rippleEffects = await this.stateTracker.calculateRippleEffects(params.state);

    return {
      state: params.state,
      usages,
      scenarioAnalysis,
      conflicts,
      rippleEffects
    };
  }

  /**
   * find_decision_points: Найти точки принятия решений
   */
  async findDecisionPoints(params: T.FindDecisionPointsParams): Promise<T.FindDecisionPointsResult> {
    // 1. Найти entry points для сценария
    const entryPoints = await this.findEntities(params.scenario);

    // 2. Построить граф от entry points
    const graph = await this.pathBuilder.buildFlowGraph(
      entryPoints.map(e => e.id),
      20 // maxDepth
    );

    // 3. Извлечь decision points
    const decisionPoints = await this.conditionAnalyzer.extractDecisionPoints(
      graph,
      {
        includeGuards: params.includeGuards ?? true,
        includeEffects: params.includeEffects ?? true
      }
    );

    // 4. Сгруппировать по критерию
    const grouped = this.groupDecisionPoints(decisionPoints, params.groupBy ?? 'impact');

    // 5. Построить Mermaid диаграмму
    const mermaid = this.outputFormatter.decisionPointsToMermaid(entryPoints, decisionPoints);

    return {
      scenario: params.scenario,
      entryPoints: entryPoints.map(e => ({ name: e.name, file: e.filePath })),
      decisionPoints: grouped,
      flowDiagram: { mermaid },
      summary: {
        totalDecisionPoints: decisionPoints.length,
        criticalPoints: decisionPoints.filter(d => d.impact === 'critical').length,
        possibleOutcomes: this.countOutcomes(decisionPoints),
        statesModified: this.extractModifiedStates(decisionPoints)
      }
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async findEntities(query: string): Promise<Entity[]> {
    // Сначала пробуем точный поиск
    const exact = await this.graphStorage.findEntities({
      name: query,
      limit: 5
    });

    if (exact.length > 0) return exact;

    // Затем семантический поиск
    const semantic = await this.semanticAgent.search({
      query,
      limit: 5,
      minSimilarity: 0.7
    });

    return semantic.map(s => s.entity);
  }

  private async buildTraceStep(
    entity: Entity,
    order: number,
    params: T.TraceFlowParams
  ): Promise<T.TraceStep> {
    const step: T.TraceStep = {
      order,
      entity: entity.name,
      entityId: entity.id,
      file: entity.filePath,
      line: entity.startLine || 0,
      action: this.determineAction(entity)
    };

    // Добавить информацию об условиях
    if (params.trackConditions && entity.controlFlow?.branches?.length) {
      step.condition = entity.controlFlow.branches[0]?.condition;
      step.branches = this.extractBranches(entity.controlFlow.branches);
    }

    // Добавить информацию о состояниях
    if (params.trackStates) {
      step.stateChanges = await this.stateTracker.getStateChanges(entity.id);
    }

    // Добавить информацию об await
    if (entity.controlFlow?.awaits?.length) {
      step.awaits = true;
      step.awaitTarget = entity.controlFlow.awaits[0]?.target;
    }

    return step;
  }

  private determineAction(entity: Entity): T.TraceStep['action'] {
    if (entity.controlFlow?.branches?.length) return 'condition';
    if (entity.controlFlow?.awaits?.length) return 'await';
    if (entity.type === 'function' || entity.type === 'method') return 'call';
    return 'call';
  }

  private extractBranches(branches: any[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const branch of branches) {
      result[branch.condition || 'default'] = branch.target || 'continue';
    }
    return result;
  }

  private calculatePathConfidence(rawPath: any): number {
    // Базовая уверенность
    let confidence = 1.0;

    // Снижаем за каждое условие
    confidence -= rawPath.conditions * 0.05;

    // Снижаем за длину пути
    confidence -= Math.max(0, (rawPath.length - 5) * 0.02);

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private generatePathSummary(steps: T.TraceStep[]): string {
    const conditions = steps.filter(s => s.action === 'condition').length;
    const awaits = steps.filter(s => s.awaits).length;
    const stateChanges = steps.flatMap(s => s.stateChanges || []).length;

    const parts: string[] = [];
    parts.push(`Path with ${steps.length} steps`);
    if (conditions > 0) parts.push(`${conditions} conditions`);
    if (awaits > 0) parts.push(`${awaits} async operations`);
    if (stateChanges > 0) parts.push(`${stateChanges} state changes`);

    return parts.join(', ');
  }

  private generateDiagnosis(
    question: string,
    callers: any[],
    blockingConditions: T.BlockingCondition[],
    statesDependencies: T.StateDependency[]
  ): T.TraceBackwardsResult['diagnosis'] {
    const possibleReasons: string[] = [];
    const suggestedDebugPoints: string[] = [];

    if (callers.length === 0) {
      possibleReasons.push('No callers found - method is never called');
    } else {
      for (const condition of blockingConditions) {
        possibleReasons.push(`${condition.condition} may be blocking (${condition.recommendation})`);
        suggestedDebugPoints.push(`${condition.location} - check condition`);
      }
    }

    if (question === 'why_not_called' && possibleReasons.length === 0) {
      possibleReasons.push('All paths seem valid - check runtime state');
    }

    return { possibleReasons, suggestedDebugPoints };
  }

  private groupDecisionPoints(
    points: T.DecisionPoint[],
    groupBy: string
  ): T.DecisionPoint[] {
    // Сортировка по критерию
    return [...points].sort((a, b) => {
      if (groupBy === 'impact') {
        const impactOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return impactOrder[a.impact] - impactOrder[b.impact];
      }
      if (groupBy === 'location') {
        return a.location.localeCompare(b.location);
      }
      return a.type.localeCompare(b.type);
    });
  }

  private countOutcomes(points: T.DecisionPoint[]): number {
    return points.reduce((sum, p) => sum + Object.keys(p.outcomes).length, 0);
  }

  private extractModifiedStates(points: T.DecisionPoint[]): string[] {
    const states = new Set<string>();
    for (const point of points) {
      if (point.type === 'state_mutation' && point.action) {
        // Extract state name from action like "setState('user')"
        const match = point.action.match(/set\w*\(['"]?(\w+)['"]?\)/i);
        if (match) states.add(match[1]);
      }
    }
    return [...states];
  }
}
```

## MCP Tool Handlers (src/tools/handlers/tracing-tool-handlers.ts)

```typescript
import { z } from 'zod';
import type { TraceEngine } from '../../tracing/trace-engine.js';

// ============================================================
// SCHEMAS
// ============================================================

export const TraceFlowSchema = z.object({
  from: z.string().describe('Starting point (semantic search query or entity name)'),
  to: z.string().describe('Ending point (semantic search query or entity name)'),
  trackStates: z.boolean().optional().default(true).describe('Track state changes along the path'),
  trackConditions: z.boolean().optional().default(true).describe('Track conditions (if/switch/case)'),
  maxDepth: z.number().optional().default(20).describe('Maximum depth of analysis'),
  format: z.enum(['sequence', 'tree', 'graph', 'mermaid']).optional().default('sequence')
    .describe('Output format')
});

export const TraceBackwardsSchema = z.object({
  target: z.string().describe('Target method/function (semantic search query or name)'),
  question: z.enum(['why_not_called', 'what_affects', 'dependencies'])
    .describe('Type of analysis: why_not_called, what_affects, dependencies'),
  depth: z.number().optional().default(15).describe('Depth of backward analysis'),
  includeStates: z.boolean().optional().default(true).describe('Analyze state dependencies'),
  includeEffects: z.boolean().optional().default(true).describe('Analyze side effects')
});

export const TraceDataFlowSchema = z.object({
  entryPoint: z.string().describe('Entry point (e.g., "AppInit()")'),
  targetState: z.string().describe('Target state to trace (e.g., "startPage")'),
  dataSources: z.array(z.string()).optional()
    .describe('Data sources to analyze (semantic search queries)'),
  trackTransformations: z.boolean().optional().default(true)
    .describe('Track data transformations')
});

export const AnalyzeStateImpactSchema = z.object({
  state: z.string().describe('State variable to analyze (e.g., "user.isAuthenticated")'),
  scenarios: z.array(z.object({
    value: z.unknown().describe('State value for this scenario'),
    label: z.string().describe('Human-readable label for the scenario')
  })).describe('Scenarios to analyze'),
  scope: z.string().optional().describe('Scope of analysis (semantic search query)')
});

export const FindDecisionPointsSchema = z.object({
  scenario: z.string().describe('Scenario to analyze (semantic search query)'),
  includeGuards: z.boolean().optional().default(true).describe('Include guard conditions'),
  includeEffects: z.boolean().optional().default(true).describe('Include side effects'),
  groupBy: z.enum(['impact', 'location', 'type']).optional().default('impact')
    .describe('How to group results')
});

// ============================================================
// HANDLERS
// ============================================================

export function createTracingToolHandlers(traceEngine: TraceEngine) {
  return {
    trace_flow: {
      schema: TraceFlowSchema,
      handler: async (args: z.infer<typeof TraceFlowSchema>) => {
        return traceEngine.traceFlow(args);
      }
    },

    trace_backwards: {
      schema: TraceBackwardsSchema,
      handler: async (args: z.infer<typeof TraceBackwardsSchema>) => {
        return traceEngine.traceBackwards(args);
      }
    },

    trace_data_flow: {
      schema: TraceDataFlowSchema,
      handler: async (args: z.infer<typeof TraceDataFlowSchema>) => {
        return traceEngine.traceDataFlow(args);
      }
    },

    analyze_state_impact: {
      schema: AnalyzeStateImpactSchema,
      handler: async (args: z.infer<typeof AnalyzeStateImpactSchema>) => {
        return traceEngine.analyzeStateImpact(args);
      }
    },

    find_decision_points: {
      schema: FindDecisionPointsSchema,
      handler: async (args: z.infer<typeof FindDecisionPointsSchema>) => {
        return traceEngine.findDecisionPoints(args);
      }
    }
  };
}
```

## Интеграция с index.ts

```typescript
// В src/index.ts добавить:

import { TraceEngine } from './tracing/trace-engine.js';
import { createTracingToolHandlers } from './tools/handlers/tracing-tool-handlers.js';

// После инициализации agents:
const traceEngine = new TraceEngine(graphStorage, semanticAgent, chaosAnalyzer);
const tracingHandlers = createTracingToolHandlers(traceEngine);

// Добавить в tools list:
const tools = [
  // ... existing tools ...

  // Semantic Tracing Tools
  {
    name: 'trace_flow',
    description: 'Trace execution flow from point A to point B. Shows sequence of calls, state changes, and conditions along the path.',
    inputSchema: zodToJsonSchema(tracingHandlers.trace_flow.schema)
  },
  {
    name: 'trace_backwards',
    description: 'Backward trace from a target method. Find why a method is not called, what affects it, or its dependencies.',
    inputSchema: zodToJsonSchema(tracingHandlers.trace_backwards.schema)
  },
  {
    name: 'trace_data_flow',
    description: 'Trace data flow from sources to target state. Shows how different data inputs affect behavior.',
    inputSchema: zodToJsonSchema(tracingHandlers.trace_data_flow.schema)
  },
  {
    name: 'analyze_state_impact',
    description: 'Analyze impact of state changes. Shows what paths are reachable/blocked for different state values.',
    inputSchema: zodToJsonSchema(tracingHandlers.analyze_state_impact.schema)
  },
  {
    name: 'find_decision_points',
    description: 'Find all decision points (conditions, guards, branches) in a scenario. Returns flow diagram.',
    inputSchema: zodToJsonSchema(tracingHandlers.find_decision_points.schema)
  }
];
```

## Этапы реализации

### Phase 1: Core (2-3 дня)
- [ ] `src/tracing/types.ts` — все типы
- [ ] `src/tracing/path-builder.ts` — BFS/DFS по графу
- [ ] `src/tracing/trace-engine.ts` — базовый движок
- [ ] Интеграция с GraphStorage

### Phase 2: Analysis (2-3 дня)
- [ ] `src/tracing/state-tracker.ts` — отслеживание состояний
- [ ] `src/tracing/condition-analyzer.ts` — анализ условий
- [ ] Интеграция с ChaosAnalyzer

### Phase 3: Data Flow (1-2 дня)
- [ ] `src/tracing/data-flow-analyzer.ts` — потоки данных
- [ ] Интеграция с SemanticAgent для поиска

### Phase 4: Output (1 день)
- [ ] `src/tracing/output-formatter.ts` — Mermaid, sequence diagrams
- [ ] Красивый текстовый вывод

### Phase 5: Integration (1 день)
- [ ] `src/tools/handlers/tracing-tool-handlers.ts`
- [ ] Регистрация в index.ts
- [ ] Тесты

### Phase 6: Documentation (0.5 дня)
- [ ] Обновить prompts/
- [ ] Обновить README
- [ ] Примеры использования

**Итого: ~8-10 дней**

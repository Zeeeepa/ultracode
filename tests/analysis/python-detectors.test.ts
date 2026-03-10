/**
 * Python Custom Detectors — Unit Tests
 *
 * Tests each custom detector function from detectors/python.ts
 * with mock Entity objects containing embeddingText and metadata.
 */

import { describe, expect, test } from "bun:test";
import {
  checkAsyncioRunInLoop,
  checkBareExcept,
  checkBoolTrap,
  checkDeepNesting,
  checkDelFinalizer,
  checkGilThread,
  checkGodClass,
  checkHighComplexity,
  checkInitTooComplex,
  checkIsinstanceChain,
  checkManyPosArgs,
  checkMissingRepr,
  checkMissingSlots,
  checkMutableDefaultArg,
  checkNoSeed,
  checkNpFloatCmp,
  checkNpLoop,
  checkOpenNoEncoding,
  checkPdChainedIndexing,
  checkPdCsvNoDtype,
  checkPdInplaceTrue,
  checkPdMissingCopy,
  checkPdNanComparison,
  checkPltNoClose,
  checkPltStateConfusion,
  checkPropertyNoSetter,
  checkReRaiseDifferent,
  checkSkCvLeakage,
  checkSkDataLeakage,
  checkSkNoPipeline,
  checkSkNoRandomState,
  checkSqlInjection,
  checkSubprocessShell,
  checkTestFloatEq,
  checkThreadpoolNoMax,
  checkTooManyReturns,
} from "../../src/analysis/patterns/detectors/python.js";
import type { Entity, EntityType } from "../../src/types/storage.js";

// ─── Helpers ──────────────────────────────────────────────────────

function makeEntity(overrides: Partial<Entity> & { embeddingText?: string }): Entity {
  return {
    id: "test-entity-1",
    name: "test_func",
    type: "function" as EntityType,
    filePath: "src/app.py",
    hash: "abc123",
    location: { start: { line: 1, column: 0, index: 0 }, end: { line: 10, column: 0, index: 100 } },
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Pandas Detectors ─────────────────────────────────────────────

describe("Pandas detectors", () => {
  test("checkPdChainedIndexing: detects df['a']['b'] = val", () => {
    const entity = makeEntity({
      embeddingText: `def process(df):\n    df["col1"]["col2"] = 42\n    return df`,
    });
    const result = checkPdChainedIndexing(entity);
    expect(result.match).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("checkPdChainedIndexing: clean code — no match", () => {
    const entity = makeEntity({
      embeddingText: `def process(df):\n    df.loc[0, "col"] = 42\n    return df`,
    });
    expect(checkPdChainedIndexing(entity).match).toBe(false);
  });

  test("checkPdInplaceTrue: detects inplace=True in kwargs", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "df.dropna", kwargs: { inplace: "True" } }],
      },
    });
    const result = checkPdInplaceTrue(entity);
    expect(result.match).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  test("checkPdInplaceTrue: no inplace — no match", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "df.dropna" }],
      },
    });
    expect(checkPdInplaceTrue(entity).match).toBe(false);
  });

  test("checkPdNanComparison: detects == None", () => {
    const entity = makeEntity({
      embeddingText: `mask = df["col"] == None`,
    });
    expect(checkPdNanComparison(entity).match).toBe(true);
  });

  test("checkPdNanComparison: detects == np.nan", () => {
    const entity = makeEntity({
      embeddingText: `if val == np.nan: pass`,
    });
    expect(checkPdNanComparison(entity).match).toBe(true);
  });

  test("checkPdCsvNoDtype: detects read_csv without dtype", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "pd.read_csv", kwargs: { filepath_or_buffer: "'data.csv'" } }],
      },
    });
    expect(checkPdCsvNoDtype(entity).match).toBe(true);
  });

  test("checkPdCsvNoDtype: read_csv with dtype — no match", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "pd.read_csv", kwargs: { dtype: "{'col': 'int32'}" } }],
      },
    });
    expect(checkPdCsvNoDtype(entity).match).toBe(false);
  });

  test("checkPdMissingCopy: detects slice without .copy()", () => {
    const entity = makeEntity({
      embeddingText: `df_new = df[df["col"] > 0]\ndf_new["x"] = 1`,
    });
    const result = checkPdMissingCopy(entity);
    expect(result.match).toBe(true);
  });
});

// ─── NumPy Detectors ──────────────────────────────────────────────

describe("NumPy detectors", () => {
  test("checkNpLoop: detects range(len()) + array index", () => {
    const entity = makeEntity({
      embeddingText: `for i in range(len(arr)):\n    result.append(arr[i] * 2)`,
    });
    expect(checkNpLoop(entity).match).toBe(true);
  });

  test("checkNpLoop: vectorized code — no match", () => {
    const entity = makeEntity({
      embeddingText: `result = arr * 2`,
    });
    expect(checkNpLoop(entity).match).toBe(false);
  });

  test("checkNpFloatCmp: detects == 0.3 with numpy", () => {
    const entity = makeEntity({
      embeddingText: `import numpy as np\nif a == 0.3: pass`,
      metadata: { calls: [{ name: "np.array" }] },
    });
    expect(checkNpFloatCmp(entity).match).toBe(true);
  });
});

// ─── Sklearn Detectors ────────────────────────────────────────────

describe("Sklearn detectors", () => {
  test("checkSkDataLeakage: fit_transform before split", () => {
    const entity = makeEntity({
      embeddingText: `X = scaler.fit_transform(X)\nX_train, X_test = train_test_split(X, y)`,
    });
    expect(checkSkDataLeakage(entity).match).toBe(true);
  });

  test("checkSkDataLeakage: split before fit — no match", () => {
    const entity = makeEntity({
      embeddingText: `X_train, X_test = train_test_split(X, y)\nX_train = scaler.fit_transform(X_train)`,
    });
    expect(checkSkDataLeakage(entity).match).toBe(false);
  });

  test("checkSkNoPipeline: multiple fit_transform without Pipeline", () => {
    const entity = makeEntity({
      embeddingText: `X = scaler.fit_transform(X)\nX = encoder.fit_transform(X)\nmodel.fit(X, y)`,
    });
    expect(checkSkNoPipeline(entity).match).toBe(true);
  });

  test("checkSkNoPipeline: Pipeline used — no match", () => {
    const entity = makeEntity({
      embeddingText: `pipe = Pipeline([('scaler', StandardScaler()), ('model', SVC())])\npipe.fit_transform(X)\npipe.fit_transform(X)`,
    });
    expect(checkSkNoPipeline(entity).match).toBe(false);
  });

  test("checkSkNoRandomState: sklearn call without random_state", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "RandomForestClassifier", kwargs: { n_estimators: "100" } }],
      },
    });
    expect(checkSkNoRandomState(entity).match).toBe(true);
  });

  test("checkSkNoRandomState: with random_state — no match", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "RandomForestClassifier", kwargs: { random_state: "42" } }],
      },
    });
    expect(checkSkNoRandomState(entity).match).toBe(false);
  });

  test("checkSkCvLeakage: fit_transform before cross_val_score", () => {
    const entity = makeEntity({
      embeddingText: `X = scaler.fit_transform(X)\nscores = cross_val_score(model, X, y)`,
    });
    expect(checkSkCvLeakage(entity).match).toBe(true);
  });
});

// ─── Matplotlib Detectors ─────────────────────────────────────────

describe("Matplotlib detectors", () => {
  test("checkPltNoClose: subplots in loop without close", () => {
    const entity = makeEntity({
      embeddingText: `for data in items:\n    fig, ax = plt.subplots()\n    ax.plot(data)\n    fig.savefig("out.png")`,
      metadata: { controlFlow: { loops: [{}] } },
    });
    expect(checkPltNoClose(entity).match).toBe(true);
  });

  test("checkPltNoClose: with plt.close — no match", () => {
    const entity = makeEntity({
      embeddingText: `for data in items:\n    fig, ax = plt.subplots()\n    ax.plot(data)\n    plt.close(fig)`,
      metadata: { controlFlow: { loops: [{}] } },
    });
    expect(checkPltNoClose(entity).match).toBe(false);
  });

  test("checkPltStateConfusion: mixed plt.* and ax.* API", () => {
    const entity = makeEntity({
      embeddingText: `fig, ax = plt.subplots()\nax.set_title("title")\nplt.xlabel("X")`,
    });
    expect(checkPltStateConfusion(entity).match).toBe(true);
  });
});

// ─── Security Detectors ───────────────────────────────────────────

describe("Security detectors", () => {
  test("checkSubprocessShell: shell=True detected", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "subprocess.run", kwargs: { shell: "True" } }],
      },
    });
    expect(checkSubprocessShell(entity).match).toBe(true);
    expect(checkSubprocessShell(entity).confidence).toBe(0.95);
  });

  test("checkSubprocessShell: shell=False — no match", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "subprocess.run", kwargs: { shell: "False" } }],
      },
    });
    expect(checkSubprocessShell(entity).match).toBe(false);
  });

  test("checkSqlInjection: f-string SQL detected", () => {
    const entity = makeEntity({
      embeddingText: `query = f"SELECT * FROM users WHERE id = {user_id}"`,
    });
    expect(checkSqlInjection(entity).match).toBe(true);
  });

  test("checkSqlInjection: parameterized query — no match", () => {
    const entity = makeEntity({
      embeddingText: `cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))`,
    });
    expect(checkSqlInjection(entity).match).toBe(false);
  });

  test("checkOpenNoEncoding: open() without encoding", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "open", kwargs: {} }],
      },
    });
    expect(checkOpenNoEncoding(entity).match).toBe(true);
  });

  test("checkOpenNoEncoding: binary mode — no match", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "open", kwargs: { mode: "'rb'" } }],
      },
    });
    expect(checkOpenNoEncoding(entity).match).toBe(false);
  });
});

// ─── API Design Detectors ─────────────────────────────────────────

describe("API design detectors", () => {
  test("checkManyPosArgs: >5 positional args", () => {
    const entity = makeEntity({
      metadata: {
        parameters: [
          { name: "a" },
          { name: "b" },
          { name: "c" },
          { name: "d" },
          { name: "e" },
          { name: "f" },
          { name: "g" },
        ],
      },
    });
    expect(checkManyPosArgs(entity).match).toBe(true);
  });

  test("checkManyPosArgs: self excluded, <=5 left — no match", () => {
    const entity = makeEntity({
      type: "method" as EntityType,
      metadata: {
        parameters: [{ name: "self" }, { name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" }],
      },
    });
    expect(checkManyPosArgs(entity).match).toBe(false);
  });

  test("checkBoolTrap: multiple boolean params", () => {
    const entity = makeEntity({
      metadata: {
        parameters: [
          { name: "data" },
          { name: "verbose", type: "bool", defaultValue: "False" },
          { name: "force", type: "bool", defaultValue: "False" },
        ],
      },
    });
    expect(checkBoolTrap(entity).match).toBe(true);
  });

  test("checkBoolTrap: single bool — no match", () => {
    const entity = makeEntity({
      metadata: {
        parameters: [{ name: "data" }, { name: "verbose", type: "bool" }],
      },
    });
    expect(checkBoolTrap(entity).match).toBe(false);
  });
});

// ─── Concurrency Detectors ────────────────────────────────────────

describe("Concurrency detectors", () => {
  test("checkAsyncioRunInLoop: asyncio.run in async function", () => {
    const entity = makeEntity({
      metadata: {
        modifiers: ["async"],
        calls: [{ name: "asyncio.run" }],
      },
    });
    expect(checkAsyncioRunInLoop(entity).match).toBe(true);
    expect(checkAsyncioRunInLoop(entity).confidence).toBe(0.95);
  });

  test("checkAsyncioRunInLoop: sync function — no match", () => {
    const entity = makeEntity({
      metadata: {
        modifiers: [],
        calls: [{ name: "asyncio.run" }],
      },
    });
    expect(checkAsyncioRunInLoop(entity).match).toBe(false);
  });

  test("checkGilThread: ThreadPoolExecutor with CPU-bound work", () => {
    const entity = makeEntity({
      embeddingText: `with ThreadPoolExecutor(max_workers=4) as pool:\n    results = pool.map(lambda x: np.sum(x), data)`,
    });
    expect(checkGilThread(entity).match).toBe(true);
  });

  test("checkThreadpoolNoMax: no max_workers", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "ThreadPoolExecutor", kwargs: {} }],
      },
    });
    expect(checkThreadpoolNoMax(entity).match).toBe(true);
  });

  test("checkThreadpoolNoMax: with max_workers — no match", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "ThreadPoolExecutor", kwargs: { max_workers: "10" } }],
      },
    });
    expect(checkThreadpoolNoMax(entity).match).toBe(false);
  });
});

// ─── Misc Detectors ───────────────────────────────────────────────

describe("Misc detectors", () => {
  test("checkDelFinalizer: __del__ method", () => {
    const entity = makeEntity({ name: "__del__" });
    expect(checkDelFinalizer(entity).match).toBe(true);
  });

  test("checkNoSeed: random usage without seed", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "random.randint" }, { name: "random.choice" }],
      },
    });
    expect(checkNoSeed(entity).match).toBe(true);
  });

  test("checkNoSeed: with random.seed — no match", () => {
    const entity = makeEntity({
      metadata: {
        calls: [{ name: "random.seed" }, { name: "random.randint" }],
      },
    });
    expect(checkNoSeed(entity).match).toBe(false);
  });

  test("checkTestFloatEq: float equality in test file", () => {
    const entity = makeEntity({
      filePath: "tests/test_math.py",
      embeddingText: `def test_add():\n    assert result == 0.3`,
    });
    expect(checkTestFloatEq(entity).match).toBe(true);
  });

  test("checkTestFloatEq: non-test file — no match", () => {
    const entity = makeEntity({
      filePath: "src/app.py",
      embeddingText: `if result == 0.3: pass`,
    });
    expect(checkTestFloatEq(entity).match).toBe(false);
  });

  test("checkMutableDefaultArg: mutable default list", () => {
    const entity = makeEntity({
      metadata: {
        parameters: [{ name: "items", defaultValue: "[]" }],
      },
    });
    expect(checkMutableDefaultArg(entity).match).toBe(true);
  });

  test("checkMutableDefaultArg: None default — no match", () => {
    const entity = makeEntity({
      metadata: {
        parameters: [{ name: "items", defaultValue: "None" }],
      },
    });
    expect(checkMutableDefaultArg(entity).match).toBe(false);
  });
});

// ─── Class-level Detectors (Wave 2) ─────────────────────────────

describe("Class-level detectors", () => {
  test("checkMissingSlots: class without __slots__ and >=3 methods", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { methodCount: 5, dunderMethods: ["__init__"] },
      },
    });
    expect(checkMissingSlots(entity).match).toBe(true);
  });

  test("checkMissingSlots: class with __slots__ — no match", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { hasSlots: true, methodCount: 5 },
      },
    });
    expect(checkMissingSlots(entity).match).toBe(false);
  });

  test("checkMissingSlots: tiny class (<3 methods) — no match", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { methodCount: 2 },
      },
    });
    expect(checkMissingSlots(entity).match).toBe(false);
  });

  test("checkMissingRepr: class without __repr__", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { methodCount: 4, dunderMethods: ["__init__", "__str__"] },
      },
    });
    expect(checkMissingRepr(entity).match).toBe(true);
  });

  test("checkMissingRepr: class with __repr__ — no match", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { methodCount: 3, dunderMethods: ["__init__", "__repr__"] },
      },
    });
    expect(checkMissingRepr(entity).match).toBe(false);
  });

  test("checkPropertyNoSetter: @property without setter", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: {
          properties: { name: { hasSetter: false }, age: { hasSetter: true } },
        },
      },
    });
    const result = checkPropertyNoSetter(entity);
    expect(result.match).toBe(true);
    expect(result.matchedCriteria).toContain("property-no-setter:name");
  });

  test("checkPropertyNoSetter: all properties have setters — no match", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: {
          properties: { name: { hasSetter: true } },
        },
      },
    });
    expect(checkPropertyNoSetter(entity).match).toBe(false);
  });

  test("checkInitTooComplex: __init__ with many calls", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { initCallCount: 15, methodCount: 5 },
      },
    });
    const result = checkInitTooComplex(entity);
    expect(result.match).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("checkInitTooComplex: simple __init__ — no match", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { initCallCount: 3, methodCount: 5 },
      },
    });
    expect(checkInitTooComplex(entity).match).toBe(false);
  });

  test("checkGodClass: class with >20 methods", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { methodCount: 25 },
      },
    });
    const result = checkGodClass(entity);
    expect(result.match).toBe(true);
    expect(result.matchedCriteria?.[0]).toContain("method-count:25");
  });

  test("checkGodClass: small class — no match", () => {
    const entity = makeEntity({
      type: "class" as EntityType,
      metadata: {
        classMeta: { methodCount: 10 },
      },
    });
    expect(checkGodClass(entity).match).toBe(false);
  });
});

// ─── Function Complexity Detectors (Wave 2) ─────────────────────

describe("Function complexity detectors", () => {
  test("checkTooManyReturns: >5 returns", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { returnCount: 8, branches: [{}] },
      },
    });
    const result = checkTooManyReturns(entity);
    expect(result.match).toBe(true);
    expect(result.matchedCriteria?.[0]).toContain("return-count:8");
  });

  test("checkTooManyReturns: <=5 returns — no match", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { returnCount: 3 },
      },
    });
    expect(checkTooManyReturns(entity).match).toBe(false);
  });

  test("checkDeepNesting: depth >4", () => {
    const entity = makeEntity({
      type: "method" as EntityType,
      metadata: {
        controlFlow: { nestingDepth: 6 },
      },
    });
    const result = checkDeepNesting(entity);
    expect(result.match).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  test("checkDeepNesting: depth <=4 — no match", () => {
    const entity = makeEntity({
      type: "method" as EntityType,
      metadata: {
        controlFlow: { nestingDepth: 3 },
      },
    });
    expect(checkDeepNesting(entity).match).toBe(false);
  });

  test("checkHighComplexity: cyclomatic >10", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { cyclomaticComplexity: 15 },
      },
    });
    const result = checkHighComplexity(entity);
    expect(result.match).toBe(true);
  });

  test("checkHighComplexity: cyclomatic <=10 — no match", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { cyclomaticComplexity: 8 },
      },
    });
    expect(checkHighComplexity(entity).match).toBe(false);
  });

  test("checkIsinstanceChain: >3 isinstance calls", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { isinstanceCount: 5 },
      },
    });
    const result = checkIsinstanceChain(entity);
    expect(result.match).toBe(true);
    expect(result.matchedCriteria?.[0]).toContain("isinstance-count:5");
  });

  test("checkIsinstanceChain: <=3 — no match", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { isinstanceCount: 2 },
      },
    });
    expect(checkIsinstanceChain(entity).match).toBe(false);
  });

  test("checkReRaiseDifferent: except X: raise Y()", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { exceptions: [{}], reRaiseDifferentType: true },
      },
    });
    const result = checkReRaiseDifferent(entity);
    expect(result.match).toBe(true);
    expect(result.matchedCriteria).toContain("re-raise-different-type");
  });

  test("checkReRaiseDifferent: no re-raise — no match", () => {
    const entity = makeEntity({
      type: "function" as EntityType,
      metadata: {
        controlFlow: { exceptions: [{}] },
      },
    });
    expect(checkReRaiseDifferent(entity).match).toBe(false);
  });
});

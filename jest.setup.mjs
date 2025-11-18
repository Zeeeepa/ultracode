import { jest as jestGlobal } from "@jest/globals";

if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID) {
  global.console = {
    ...console,
    log: jestGlobal.fn(),
    debug: jestGlobal.fn(),
    info: jestGlobal.fn(),
    warn: jestGlobal.fn(),
    error: console.error,
  };
}

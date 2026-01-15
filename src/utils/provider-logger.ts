import { log } from "../logging/index.js";
import type { ProviderLogger } from "../semantic/providers/base.js";

export function makeProviderLogger(_unused: unknown, category: string): ProviderLogger {
  return {
    debug: (msg, data, requestId) => log.d(category, msg, { ...(data || {}), req: requestId }),
    info: (msg, data, requestId) => log.i(category, msg, { ...(data || {}), req: requestId }),
    warn: (msg, data, requestId) => log.w(category, msg, { ...(data || {}), req: requestId }),
    error: (msg, data, requestId, err) => log.e(category, msg, { ...(data || {}), req: requestId, err: String(err) }),
  };
}

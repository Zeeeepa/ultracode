import { log } from "../logging/index.js";
import type { KVPairs } from "../logging/log-types.js";
import type { ProviderLogger } from "../semantic/providers/base.js";

export function makeProviderLogger(_: unknown, tag: string): ProviderLogger {
  const kv = (data: unknown, rid: string | undefined): KVPairs => {
    const out: KVPairs = {};
    if (data != null && typeof data === "object") Object.assign(out, data);
    if (rid !== undefined) out["req"] = rid;
    return out;
  };

  return {
    debug: (msg, data, rid) => log.d(tag, msg, kv(data, rid)),
    info: (msg, data, rid) => log.i(tag, msg, kv(data, rid)),
    warn: (msg, data, rid) => log.w(tag, msg, kv(data, rid)),
    error: (msg, data, rid, err) => {
      const p = kv(data, rid);
      if (err) p["err"] = String(err);
      log.e(tag, msg, p);
    },
  };
}

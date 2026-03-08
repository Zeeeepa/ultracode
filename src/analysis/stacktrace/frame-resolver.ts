/**
 * Frame-to-Entity Resolver
 *
 * Binds stacktrace frames to code graph entities using the same
 * resolution strategies as TraceEngine.resolveEntity():
 * 1. Exact file:name match
 * 2. Class.Method pattern search
 * 3. Name-only with file path suffix filter
 * 4. Fuzzy by basename
 *
 * Optimized for batch resolution: groups frames by filePath,
 * one findEntities() call per file.
 */

import type { ResolvedFrame, StackFrame } from "./types.js";

/** Minimal interface for graph storage operations needed by the resolver */
export interface FrameResolverStorage {
  findEntities(opts: { filePath?: string; filters?: Record<string, unknown>; limit?: number }): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      filePath?: string;
      code?: string;
      location?: { start?: { line?: number }; end?: { line?: number } };
    }>
  >;
  searchEntities(opts: { namePattern?: string }): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      filePath?: string;
    }>
  >;
}

/** Paths that indicate framework/runtime code — skip resolution */
const SYSTEM_PATH_PATTERNS = [
  /node_modules\//,
  /site-packages\//,
  /\/usr\/lib\//,
  /\/usr\/local\/lib\//,
  /<anonymous>/,
  /\(native\)/,
  /\(eval\)/,
  /Unknown Source/,
  /Native Method/,
  /\/lib\/std\//,
  /\/runtime\//,
  /\\runtime\\/,
];

function isSystemFrame(frame: StackFrame): boolean {
  if (frame.isNative) return true;
  if (!frame.filePath) return true;
  return SYSTEM_PATH_PATTERNS.some((p) => p.test(frame.filePath!));
}

/**
 * Resolve all frames in a stacktrace against the code graph.
 * Returns ResolvedFrame[] with entity bindings and confidence scores.
 */
export async function resolveFrames(frames: StackFrame[], storage: FrameResolverStorage): Promise<ResolvedFrame[]> {
  const resolved: ResolvedFrame[] = [];

  // Group user frames by filePath for batch lookup
  const fileGroups = new Map<string, StackFrame[]>();
  const systemFrames: StackFrame[] = [];

  for (const frame of frames) {
    if (isSystemFrame(frame)) {
      systemFrames.push(frame);
    } else if (frame.filePath) {
      const key = frame.filePath.replace(/\\/g, "/").toLowerCase();
      const group = fileGroups.get(key) ?? [];
      group.push(frame);
      fileGroups.set(key, group);
    } else {
      systemFrames.push(frame);
    }
  }

  // Batch resolve by file
  const entityCache = new Map<string, ResolvedFrame>();

  for (const [, groupFrames] of fileGroups) {
    const samplePath = groupFrames[0]!.filePath!;

    // Try finding entities by filePath
    let entities: Array<{
      id: string;
      name: string;
      type: string;
      filePath?: string;
      location?: { start?: { line?: number }; end?: { line?: number } };
    }> = [];

    try {
      entities = await storage.findEntities({ filePath: samplePath, limit: 500 });
    } catch {
      // filePath might not match exactly — try with basename
      const basename = samplePath.split(/[/\\]/).pop();
      if (basename) {
        try {
          const all = await storage.searchEntities({ namePattern: basename.replace(/\.\w+$/, "") });
          entities = all.filter(
            (e) =>
              e.filePath &&
              e.filePath
                .replace(/\\/g, "/")
                .toLowerCase()
                .endsWith(samplePath.replace(/\\/g, "/").toLowerCase().split("/").slice(-2).join("/")),
          );
        } catch {
          // storage not available
        }
      }
    }

    for (const frame of groupFrames) {
      const rf = resolveFrameAgainstEntities(frame, entities);
      entityCache.set(`${frame.index}`, rf);
    }
  }

  // Build final array in original order
  for (const frame of frames) {
    const cached = entityCache.get(`${frame.index}`);
    if (cached) {
      resolved.push(cached);
    } else {
      // System/unresolvable frame
      resolved.push({
        ...frame,
        resolved: false,
        confidence: 0,
      });
    }
  }

  // For frames we couldn't resolve by file, try name-only search
  for (let i = 0; i < resolved.length; i++) {
    const rf = resolved[i]!;
    if (!rf.resolved && !isSystemFrame(rf) && rf.functionName && rf.functionName !== "<anonymous>") {
      const nameResolved = await resolveByName(rf, storage);
      if (nameResolved) {
        resolved[i] = nameResolved;
      }
    }
  }

  return resolved;
}

function resolveFrameAgainstEntities(
  frame: StackFrame,
  entities: Array<{
    id: string;
    name: string;
    type: string;
    filePath?: string;
    location?: { start?: { line?: number }; end?: { line?: number } };
  }>,
): ResolvedFrame {
  const funcName = frame.functionName;

  // Strategy 1: Exact name match
  let match = entities.find((e) => e.name === funcName);
  if (match) {
    return {
      ...frame,
      entityId: match.id,
      entityName: match.name,
      entityType: match.type,
      resolved: true,
      confidence: 1.0,
    };
  }

  // Strategy 2: Class.Method → search for "className.methodName" or just methodName within class
  if (frame.className) {
    match = entities.find(
      (e) => (e.name === `${frame.className}.${funcName}` || e.name === funcName) && e.type === "method",
    );
    if (match) {
      return {
        ...frame,
        entityId: match.id,
        entityName: match.name,
        entityType: match.type,
        resolved: true,
        confidence: 0.95,
      };
    }
  }

  // Strategy 3: Line number proximity (if we have line numbers)
  if (frame.lineNumber && entities.length > 0) {
    const withLocation = entities.filter((e) => e.location?.start?.line != null && e.location?.end?.line != null);
    const containing = withLocation.find(
      (e) => e.location!.start!.line! <= frame.lineNumber! && e.location!.end!.line! >= frame.lineNumber!,
    );
    if (containing) {
      return {
        ...frame,
        entityId: containing.id,
        entityName: containing.name,
        entityType: containing.type,
        resolved: true,
        confidence: 0.7,
      };
    }
  }

  // Strategy 4: Fuzzy name match (suffix)
  match = entities.find((e) => e.name.endsWith(`.${funcName}`) || e.name.endsWith(`#${funcName}`));
  if (match) {
    return {
      ...frame,
      entityId: match.id,
      entityName: match.name,
      entityType: match.type,
      resolved: true,
      confidence: 0.5,
    };
  }

  return { ...frame, resolved: false, confidence: 0 };
}

async function resolveByName(frame: ResolvedFrame, storage: FrameResolverStorage): Promise<ResolvedFrame | null> {
  const searchName = frame.className ? `${frame.className}.${frame.functionName}` : frame.functionName;

  try {
    const results = await storage.searchEntities({ namePattern: searchName });
    if (results.length === 0) return null;

    // If multiple results, prefer the one with matching file path suffix
    if (frame.filePath && results.length > 1) {
      const pathSuffix = frame.filePath.replace(/\\/g, "/").split("/").slice(-2).join("/").toLowerCase();
      const fileMatch = results.find((e) => e.filePath?.replace(/\\/g, "/").toLowerCase().includes(pathSuffix));
      if (fileMatch) {
        return {
          ...frame,
          entityId: fileMatch.id,
          entityName: fileMatch.name,
          entityType: fileMatch.type,
          resolved: true,
          confidence: 0.6,
        };
      }
    }

    const best = results[0]!;
    return {
      ...frame,
      entityId: best.id,
      entityName: best.name,
      entityType: best.type,
      resolved: true,
      confidence: 0.5,
    };
  } catch {
    return null;
  }
}

import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";

import { hashText } from "../utils/fast-hash.js";

// ---------------------------------------------------------------------------
// Safety constraints
// ---------------------------------------------------------------------------

const LIMITS = {
  maxFiles: 500,
  maxFileSizeBytes: 500_000,
  maxTotalTokens: 500_000,
} as const;

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface TokenLocation {
  line: number;
  column?: number;
  position?: number;
}

export interface CloneDuplication {
  sourceId: string;
  start: TokenLocation;
  end: TokenLocation;
  range: [number, number];
  fragment?: string;
}

export interface IClone {
  format: string;
  isNew?: boolean;
  foundDate?: number;
  duplicationA: CloneDuplication;
  duplicationB: CloneDuplication;
}

export interface DetectionOptions {
  minLines?: number | undefined;
  maxLines?: number | undefined;
  maxSize?: string;
  minTokens?: number;
  path?: string[];
  pattern?: string | undefined;
  ignore?: string[];
  format?: string[];
  silent?: boolean;
  absolute?: boolean;
  noSymlinks?: boolean;
  ignoreCase?: boolean;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface JscpdRunOptions {
  paths: string[];
  pattern?: string | undefined;
  ignore?: string[];
  formats?: string[];
  minLines?: number | undefined | null;
  maxLines?: number | undefined | null;
  minTokens?: number | undefined | null;
  ignoreCase?: boolean;
}

export interface JscpdCloneDetail {
  clone: IClone;
  snippetA: string;
  snippetB: string;
}

export interface JscpdCloneSummary {
  totalLinesAnalyzed: number;
  totalTokensAnalyzed: number;
  duplicatedLines: number;
  duplicatedTokens: number;
  duplicationPercentage: number;
  duplicationTokensPercentage: number;
  cloneCount: number;
  clones: JscpdCloneDetail[];
}

export interface JscpdCloneResult {
  clones: IClone[];
  statistic: StatReport;
  summary: JscpdCloneSummary;
}

// ---------------------------------------------------------------------------
// Internal stat types
// ---------------------------------------------------------------------------

type FormatStats = {
  lines: number;
  tokens: number;
  sources: number;
  clones: number;
  duplicatedLines: number;
  duplicatedTokens: number;
  percentage: number;
  percentageTokens: number;
  newDuplicatedLines: number;
  newClones: number;
};

type StatReport = {
  detectionDate: string;
  total: FormatStats;
  formats: Record<string, { total: FormatStats; sources: Record<string, FormatStats> }>;
};

// ---------------------------------------------------------------------------
// Options builder
// ---------------------------------------------------------------------------

const DEFAULTS: Required<DetectionOptions> = {
  path: [],
  minLines: 5,
  maxLines: 1000,
  maxSize: "100kb",
  minTokens: 50,
  ignore: [],
  pattern: undefined as never,
  format: [],
  silent: false,
  absolute: false,
  noSymlinks: false,
  ignoreCase: false,
};

export function buildJscpdOptions(run: JscpdRunOptions): DetectionOptions {
  const tokens = run.minTokens != null ? Math.max(Number(run.minTokens), 1) : DEFAULTS.minTokens;
  return {
    path: run.paths.length > 0 ? run.paths : DEFAULTS.path,
    minLines: run.minLines != null ? Number(run.minLines) : DEFAULTS.minLines,
    maxLines: run.maxLines != null ? Number(run.maxLines) : DEFAULTS.maxLines,
    maxSize: DEFAULTS.maxSize,
    minTokens: tokens,
    pattern: run.pattern,
    ignore: run.ignore ?? DEFAULTS.ignore,
    format: run.formats && run.formats.length > 0 ? run.formats : DEFAULTS.format,
    silent: true,
    absolute: true,
    noSymlinks: DEFAULTS.noSymlinks,
    ignoreCase: run.ignoreCase ?? DEFAULTS.ignoreCase,
  };
}

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

function compileGlob(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++;
    } else if (ch === "*") {
      re += "[^/\\\\]*";
      i++;
    } else if (ch === "?") {
      re += "[^/\\\\]";
      i++;
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}

type GlobFilter = (rel: string) => boolean;

function makeFilter(patterns: string[] | undefined, defaultResult: boolean): GlobFilter {
  if (!patterns || patterns.length === 0) return () => defaultResult;
  const matchers = patterns.map(compileGlob);
  return (p: string) => matchers.some((rx) => rx.test(p));
}

// ---------------------------------------------------------------------------
// Size parsing
// ---------------------------------------------------------------------------

const SIZE_UNITS: Record<string, number> = { kb: 1024, mb: 1 << 20, gb: 1 << 30 };

function parseSizeSpec(spec: string | undefined): number {
  if (!spec) return Infinity;
  const m = /^(\d+)\s*(kb|mb|gb)?$/i.exec(spec.trim());
  if (!m) return Infinity;
  return Number(m[1]) * (SIZE_UNITS[(m[2] ?? "kb").toLowerCase()] ?? 1024);
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function resolveExtension(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase();
  return ext || "text";
}

function lineCount(text: string): number {
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

function scanDir(
  root: string,
  sub: string,
  accept: GlobFilter,
  reject: GlobFilter,
  followLinks: boolean,
  out: string[],
): void {
  const dir = sub ? join(root, sub) : root;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.isSymbolicLink() && !followLinks) continue;
    const rel = sub ? `${sub}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      scanDir(root, rel, accept, reject, followLinks, out);
    } else if (ent.isFile() && accept(rel) && !reject(rel)) {
      out.push(join(root, rel));
    }
  }
}

function gatherFiles(opts: DetectionOptions): FileEntry[] {
  const roots = opts.path && opts.path.length > 0 ? opts.path : [process.cwd()];
  const sizeLimit = parseSizeSpec(opts.maxSize);
  const minLn = opts.minLines ?? 0;
  const maxLn = opts.maxLines ?? Number.MAX_SAFE_INTEGER;
  const allowedFormats =
    opts.format && opts.format.length > 0 ? new Set(opts.format.map((f) => f.toLowerCase())) : null;
  const accept = makeFilter(opts.pattern ? [opts.pattern] : undefined, true);
  const reject = makeFilter(opts.ignore, false);
  const followLinks = !opts.noSymlinks;

  const paths: string[] = [];
  for (const r of roots) {
    const abs = isAbsolute(r) ? r : resolve(r);
    const st = statSync(abs, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isFile()) {
      const rel = basename(abs);
      if (accept(rel) && !reject(rel)) paths.push(abs);
    } else if (st.isDirectory()) {
      scanDir(abs, "", accept, reject, followLinks, paths);
    }
  }

  const result: FileEntry[] = [];
  for (const p of paths) {
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st?.isFile() || st.size > sizeLimit || st.size > LIMITS.maxFileSizeBytes) continue;
    if (allowedFormats && !allowedFormats.has(resolveExtension(p))) continue;
    const content = readFileSync(p, "utf-8");
    const lc = lineCount(content);
    if (lc < minLn || lc > maxLn) continue;
    result.push({ path: p, content });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tokenisation  — line-based with whitespace normalisation
// ---------------------------------------------------------------------------

type NormLine = {
  hash: string;
  lineNum: number;
  colStart: number;
  colEnd: number;
  posStart: number;
  posEnd: number;
};

function tokenise(entry: FileEntry, foldCase: boolean): NormLine[] {
  const out: NormLine[] = [];
  let pos = 0;
  let lineNum = 1;

  const src = entry.content;
  let segStart = 0;

  for (let i = 0; i <= src.length; i++) {
    const isEnd = i === src.length;
    const isNl = !isEnd && src.charCodeAt(i) === 10;
    const isCr = !isEnd && src.charCodeAt(i) === 13;

    if (isEnd || isNl || (isCr && i + 1 < src.length && src.charCodeAt(i + 1) === 10)) {
      const lineEnd = isCr ? i : isNl ? i : i;
      const raw = src.slice(segStart, lineEnd);
      const trimmed = raw.replace(/\s+/g, " ").trim();
      const normalised = foldCase ? trimmed.toLowerCase() : trimmed;
      const firstNonWs = raw.search(/\S/);
      const cs = firstNonWs >= 0 ? firstNonWs : 0;

      out.push({
        hash: normalised,
        lineNum,
        colStart: cs,
        colEnd: raw.length,
        posStart: pos + cs,
        posEnd: pos + raw.length,
      });

      if (isCr && src.charCodeAt(i + 1) === 10) {
        pos += raw.length + 2;
        i++; // skip LF after CR
      } else {
        pos += raw.length + 1;
      }
      segStart = i + 1;
      lineNum++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rolling-hash clone detection (Rabin-Karp inspired)
// ---------------------------------------------------------------------------

type Fingerprint = {
  digest: string;
  srcPath: string;
  fmt: string;
  fromLine: number;
  toLine: number;
  fromCol: number;
  toCol: number;
  fromPos: number;
  toPos: number;
};

function computeFingerprints(tokens: NormLine[], winSize: number, srcPath: string, fmt: string): Fingerprint[] {
  if (tokens.length < winSize) return [];
  const fps: Fingerprint[] = [];

  // Build composite hash for each window using rolling concatenation
  for (let i = 0, end = tokens.length - winSize; i <= end; i++) {
    const parts: string[] = [];
    for (let k = 0; k < winSize; k++) parts.push(tokens[i + k]!.hash);
    const first = tokens[i]!;
    const last = tokens[i + winSize - 1]!;
    fps.push({
      digest: hashText(parts.join("\n")),
      srcPath,
      fmt,
      fromLine: first.lineNum,
      toLine: last.lineNum,
      fromCol: first.colStart,
      toCol: last.colEnd,
      fromPos: first.posStart,
      toPos: last.posEnd,
    });
  }
  return fps;
}

function detectClones(
  fileData: { entry: FileEntry; tokens: NormLine[]; format: string }[],
  windowSz: number,
): IClone[] {
  // Collect fingerprints across all files
  const buckets = new Map<string, Fingerprint[]>();
  for (const fd of fileData) {
    for (const fp of computeFingerprints(fd.tokens, windowSz, fd.entry.path, fd.format)) {
      const arr = buckets.get(fp.digest);
      if (arr) arr.push(fp);
      else buckets.set(fp.digest, [fp]);
    }
  }

  // Emit clone pairs for each bucket with ≥2 entries
  const clones: IClone[] = [];
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        // Skip self-overlap within the same file at the same position
        if (a.srcPath === b.srcPath && a.fromLine === b.fromLine) continue;
        clones.push({
          format: a.fmt,
          foundDate: Date.now(),
          duplicationA: {
            sourceId: a.srcPath,
            start: { line: a.fromLine, column: a.fromCol, position: a.fromPos },
            end: { line: a.toLine, column: a.toCol, position: a.toPos },
            range: [a.fromPos, a.toPos],
          },
          duplicationB: {
            sourceId: b.srcPath,
            start: { line: b.fromLine, column: b.fromCol, position: b.fromPos },
            end: { line: b.toLine, column: b.toCol, position: b.toPos },
            range: [b.fromPos, b.toPos],
          },
        });
      }
    }
  }
  return clones;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function blankStats(): FormatStats {
  return {
    lines: 0,
    tokens: 0,
    sources: 0,
    clones: 0,
    duplicatedLines: 0,
    duplicatedTokens: 0,
    percentage: 0,
    percentageTokens: 0,
    newDuplicatedLines: 0,
    newClones: 0,
  };
}

function ratio(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 10_000) / 100;
}

function addCloneToStats(s: FormatStats, c: IClone): void {
  const dupLines = Math.max(
    c.duplicationA.end.line - c.duplicationA.start.line,
    c.duplicationB.end.line - c.duplicationB.start.line,
    1,
  );
  const dupTokens =
    c.duplicationA.range[1] - c.duplicationA.range[0] + (c.duplicationB.range[1] - c.duplicationB.range[0]);

  s.clones++;
  s.duplicatedLines += dupLines;
  s.duplicatedTokens += Math.max(dupTokens, 0);
  s.newDuplicatedLines += dupLines;
  s.newClones++;
}

function compileReport(
  fileData: { entry: FileEntry; tokens: NormLine[]; format: string }[],
  clones: IClone[],
): StatReport {
  const report: StatReport = {
    detectionDate: new Date().toISOString(),
    total: blankStats(),
    formats: {},
  };

  for (const fd of fileData) {
    const lc = lineCount(fd.entry.content);
    const t = report.total;
    t.sources++;
    t.lines += lc;
    t.tokens += fd.tokens.length;

    const fmtEntry = (report.formats[fd.format] ??= { total: blankStats(), sources: {} });
    fmtEntry.total.sources++;
    fmtEntry.total.lines += lc;
    fmtEntry.total.tokens += fd.tokens.length;

    const srcEntry = (fmtEntry.sources[fd.entry.path] ??= blankStats());
    srcEntry.sources = 1;
    srcEntry.lines += lc;
    srcEntry.tokens += fd.tokens.length;
  }

  for (const c of clones) {
    addCloneToStats(report.total, c);
    const fmtEntry = (report.formats[c.format] ??= { total: blankStats(), sources: {} });
    addCloneToStats(fmtEntry.total, c);
    for (const sid of [c.duplicationA.sourceId, c.duplicationB.sourceId]) {
      const srcEntry = (fmtEntry.sources[sid] ??= blankStats());
      addCloneToStats(srcEntry, c);
    }
  }

  report.total.percentage = ratio(report.total.duplicatedLines, report.total.lines);
  report.total.percentageTokens = ratio(report.total.duplicatedTokens, report.total.tokens);

  for (const fmt of Object.values(report.formats)) {
    fmt.total.percentage = ratio(fmt.total.duplicatedLines, fmt.total.lines);
    fmt.total.percentageTokens = ratio(fmt.total.duplicatedTokens, fmt.total.tokens);
    for (const src of Object.values(fmt.sources)) {
      src.percentage = ratio(src.duplicatedLines, src.lines);
      src.percentageTokens = ratio(src.duplicatedTokens, src.tokens);
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// Snippet extraction
// ---------------------------------------------------------------------------

function extractSnippet(content: string, startLine: number, endLine: number): string {
  const lines: string[] = [];
  let lineIdx = 1;
  let segStart = 0;

  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content.charCodeAt(i) === 10) {
      if (lineIdx >= startLine && lineIdx <= endLine) {
        lines.push(content.slice(segStart, i));
      }
      if (lineIdx > endLine) break;
      segStart = i + 1;
      lineIdx++;
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runJscpdCloneDetection(options: JscpdRunOptions): Promise<JscpdCloneResult> {
  const opts = buildJscpdOptions(options);
  const rawFiles = gatherFiles(opts);

  const emptySummary: JscpdCloneSummary = {
    totalLinesAnalyzed: 0,
    totalTokensAnalyzed: 0,
    duplicatedLines: 0,
    duplicatedTokens: 0,
    duplicationPercentage: 0,
    duplicationTokensPercentage: 0,
    cloneCount: 0,
    clones: [],
  };

  if (rawFiles.length === 0) {
    return {
      clones: [],
      statistic: { detectionDate: new Date().toISOString(), total: blankStats(), formats: {} },
      summary: emptySummary,
    };
  }

  // Apply safety limits
  const capped = rawFiles.slice(0, LIMITS.maxFiles);
  const foldCase = opts.ignoreCase ?? false;

  const fileData: { entry: FileEntry; tokens: NormLine[]; format: string }[] = [];
  let accumulatedTokens = 0;
  for (const entry of capped) {
    const toks = tokenise(entry, foldCase);
    if (accumulatedTokens + toks.length > LIMITS.maxTotalTokens) break;
    accumulatedTokens += toks.length;
    fileData.push({ entry, tokens: toks, format: resolveExtension(entry.path) });
  }

  const winSz = Math.max(opts.minTokens ?? 50, opts.minLines ?? 5, 1);
  const clones = detectClones(fileData, winSz);
  const statistic = compileReport(fileData, clones);

  // Build content cache for snippet extraction
  const contentByPath = new Map<string, string>();
  for (const fd of fileData) contentByPath.set(fd.entry.path, fd.entry.content);

  const details: JscpdCloneDetail[] = clones.map((c) => ({
    clone: c,
    snippetA: extractSnippet(
      contentByPath.get(c.duplicationA.sourceId) ?? "",
      c.duplicationA.start.line,
      c.duplicationA.end.line,
    ),
    snippetB: extractSnippet(
      contentByPath.get(c.duplicationB.sourceId) ?? "",
      c.duplicationB.start.line,
      c.duplicationB.end.line,
    ),
  }));

  return {
    clones,
    statistic,
    summary: {
      totalLinesAnalyzed: statistic.total.lines,
      totalTokensAnalyzed: statistic.total.tokens,
      duplicatedLines: statistic.total.duplicatedLines,
      duplicatedTokens: statistic.total.duplicatedTokens,
      duplicationPercentage: statistic.total.percentage,
      duplicationTokensPercentage: statistic.total.percentageTokens,
      cloneCount: clones.length,
      clones: details,
    },
  };
}

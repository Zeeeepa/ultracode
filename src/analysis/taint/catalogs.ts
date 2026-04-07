import type { TaintCategory } from "./types.js";

export interface SourcePattern {
  pattern: RegExp;
  type: string;
  description: string;
  priority: number; // 1 = highest (HTTP input), 4 = lowest (DOM/websocket)
}

export interface SinkPattern {
  pattern: RegExp;
  type: string;
  categories: TaintCategory[];
  description: string;
  priority: number; // 1 = highest (command/sql injection), 3 = lowest (prototype pollution)
}

export interface SanitizerPattern {
  pattern: RegExp;
  type: string;
  protectsAgainst: TaintCategory[];
  description: string;
}

// ===========================================================================
// SOURCE PATTERNS — untrusted data entry points
// ===========================================================================
export const SOURCE_PATTERNS: SourcePattern[] = [
  // HTTP request data — priority 1 (direct untrusted input)
  { pattern: /req\.body/i, type: "http_body", description: "HTTP request body", priority: 1 },
  { pattern: /req\.params/i, type: "http_params", description: "URL path parameters", priority: 1 },
  { pattern: /req\.query/i, type: "http_query", description: "URL query parameters", priority: 1 },
  { pattern: /req\.headers/i, type: "http_headers", description: "HTTP request headers", priority: 1 },
  { pattern: /req\.cookies/i, type: "http_cookies", description: "HTTP cookies", priority: 1 },
  {
    pattern: /request\.(body|params|query|headers|form)/i,
    type: "http_request",
    description: "HTTP request data",
    priority: 1,
  },
  // Environment and config — priority 2
  { pattern: /process\.env/i, type: "env_var", description: "Environment variable", priority: 2 },
  // File system — priority 3
  { pattern: /fs\.(readFile|readFileSync|read)\b/i, type: "file_read", description: "File system read", priority: 3 },
  { pattern: /readFile|readFileSync/i, type: "file_read", description: "File read operation", priority: 3 },
  // User input — priority 4
  { pattern: /readline/i, type: "stdin", description: "Standard input / readline", priority: 4 },
  { pattern: /prompt\(/i, type: "prompt", description: "User prompt input", priority: 4 },
  { pattern: /window\.location/i, type: "url", description: "Browser URL", priority: 4 },
  { pattern: /document\.location/i, type: "url", description: "Document location", priority: 4 },
  { pattern: /location\.(hash|search|href|pathname)/i, type: "url_parts", description: "URL components", priority: 4 },
  // Network — priority 3
  { pattern: /fetch\(/i, type: "fetch", description: "Fetch API response", priority: 3 },
  {
    pattern: /axios\.(get|post|put|delete|patch)\b/i,
    type: "http_client",
    description: "Axios HTTP response",
    priority: 3,
  },
  { pattern: /\.json\(\)/i, type: "json_parse", description: "Parsed JSON response", priority: 3 },
  // WebSocket — priority 4
  { pattern: /\.on\(['"]message['"]/i, type: "websocket", description: "WebSocket message", priority: 4 },
  { pattern: /socket\.on\(/i, type: "websocket", description: "Socket event data", priority: 4 },
  // Database results — priority 3
  { pattern: /\.query\(.*\)\s*\.then/i, type: "db_result", description: "Database query result", priority: 3 },
  // Form data — priority 4
  { pattern: /FormData/i, type: "form_data", description: "Form data", priority: 4 },
  { pattern: /event\.target\.value/i, type: "dom_event", description: "DOM event value", priority: 4 },
  // API entry points — priority 1 (for missing_auth detection)
  {
    pattern: /\brpc\s+\w+\s*\(/i,
    type: "api_endpoint",
    description: "gRPC RPC method",
    priority: 1,
  },
  {
    pattern: /@(Get|Post|Put|Patch|Delete|Head|Options)\b/i,
    type: "api_endpoint",
    description: "REST controller method",
    priority: 1,
  },
  {
    pattern: /@(Query|Mutation|Subscription|ResolveField)\b/i,
    type: "api_endpoint",
    description: "GraphQL resolver",
    priority: 1,
  },
];

// ===========================================================================
// SINK PATTERNS — dangerous operations
// ===========================================================================
export const SINK_PATTERNS: SinkPattern[] = [
  // Code execution — priority 1 (critical)
  {
    pattern: /\beval\(/i,
    type: "eval",
    categories: ["command_injection", "xss"],
    description: "eval() execution",
    priority: 1,
  },
  {
    pattern: /new\s+Function\(/i,
    type: "function_constructor",
    categories: ["command_injection"],
    description: "Function constructor",
    priority: 1,
  },
  {
    pattern: /setTimeout\(\s*[^,)]*\bstr/i,
    type: "timeout_eval",
    categories: ["command_injection"],
    description: "setTimeout with string",
    priority: 1,
  },
  {
    pattern: /setInterval\(\s*[^,)]*\bstr/i,
    type: "interval_eval",
    categories: ["command_injection"],
    description: "setInterval with string",
    priority: 1,
  },
  // Shell execution — priority 1 (critical)
  {
    pattern: /exec\(/i,
    type: "shell_exec",
    categories: ["command_injection"],
    description: "Shell command execution",
    priority: 1,
  },
  {
    pattern: /execSync\(/i,
    type: "shell_exec",
    categories: ["command_injection"],
    description: "Synchronous shell execution",
    priority: 1,
  },
  {
    pattern: /spawn\(/i,
    type: "shell_spawn",
    categories: ["command_injection"],
    description: "Process spawn",
    priority: 1,
  },
  {
    pattern: /execFile/i,
    type: "shell_exec",
    categories: ["command_injection"],
    description: "File execution",
    priority: 1,
  },
  // SQL — priority 1 (critical)
  {
    pattern: /\.query\(\s*[`'"]/i,
    type: "sql_query",
    categories: ["sql_injection"],
    description: "Direct SQL query",
    priority: 1,
  },
  { pattern: /\.raw\(/i, type: "sql_raw", categories: ["sql_injection"], description: "Raw SQL query", priority: 1 },
  {
    pattern: /\.execute\(\s*[`'"]/i,
    type: "sql_execute",
    categories: ["sql_injection"],
    description: "SQL execute",
    priority: 1,
  },
  {
    pattern: /sequelize\.literal/i,
    type: "sql_literal",
    categories: ["sql_injection"],
    description: "Sequelize literal",
    priority: 1,
  },
  { pattern: /knex\.raw/i, type: "sql_raw", categories: ["sql_injection"], description: "Knex raw query", priority: 1 },
  // XSS — priority 2
  { pattern: /innerHTML/i, type: "inner_html", categories: ["xss"], description: "innerHTML assignment", priority: 2 },
  { pattern: /outerHTML/i, type: "outer_html", categories: ["xss"], description: "outerHTML assignment", priority: 2 },
  { pattern: /document\.write/i, type: "doc_write", categories: ["xss"], description: "document.write", priority: 2 },
  {
    pattern: /\.insertAdjacentHTML/i,
    type: "insert_html",
    categories: ["xss"],
    description: "insertAdjacentHTML",
    priority: 2,
  },
  {
    pattern: /dangerouslySetInnerHTML/i,
    type: "react_html",
    categories: ["xss"],
    description: "React dangerouslySetInnerHTML",
    priority: 2,
  },
  // Path traversal — priority 2
  {
    pattern: /path\.(join|resolve)\(/i,
    type: "path_join",
    categories: ["path_traversal"],
    description: "Path construction",
    priority: 2,
  },
  {
    pattern: /fs\.(writeFile|unlink|rmdir|mkdir|access)\b/i,
    type: "fs_write",
    categories: ["path_traversal"],
    description: "File system write",
    priority: 2,
  },
  // SSRF — priority 2
  {
    pattern: /fetch\(\s*[^'"`)]/i,
    type: "dynamic_fetch",
    categories: ["ssrf"],
    description: "Dynamic URL fetch",
    priority: 2,
  },
  {
    pattern: /axios\(\{.*url\s*:/i,
    type: "dynamic_request",
    categories: ["ssrf"],
    description: "Dynamic URL request",
    priority: 2,
  },
  { pattern: /http\.request\(/i, type: "http_request", categories: ["ssrf"], description: "HTTP request", priority: 2 },
  // Prototype pollution — priority 3
  {
    pattern: /Object\.assign\(/i,
    type: "object_assign",
    categories: ["prototype_pollution"],
    description: "Object.assign merge",
    priority: 3,
  },
  {
    pattern: /\.\.\.\s*\w+/i,
    type: "spread",
    categories: ["prototype_pollution"],
    description: "Spread operator merge",
    priority: 3,
  },
  {
    pattern: /\[.*\]\s*=/i,
    type: "dynamic_prop",
    categories: ["prototype_pollution"],
    description: "Dynamic property assignment",
    priority: 3,
  },
  // Redirect — priority 2
  {
    pattern: /res\.redirect\(/i,
    type: "redirect",
    categories: ["ssrf", "xss"],
    description: "HTTP redirect",
    priority: 2,
  },
  // Sensitive operations behind API (for missing_auth) — priority 2
  {
    pattern: /\.(save|create|update|delete|remove|destroy|insert)\s*\(/i,
    type: "data_write",
    categories: ["missing_auth"],
    description: "Database write operation",
    priority: 2,
  },
  {
    pattern: /sendEmail|sendNotification|sendMessage|publishEvent/i,
    type: "notification",
    categories: ["missing_auth"],
    description: "Notification/email sending",
    priority: 2,
  },
  {
    pattern: /transfer|charge|payment|refund|withdraw|deposit/i,
    type: "financial",
    categories: ["missing_auth"],
    description: "Financial operation",
    priority: 2,
  },
];

// ===========================================================================
// SANITIZER PATTERNS — protective functions
// ===========================================================================
export const SANITIZER_PATTERNS: SanitizerPattern[] = [
  // Encoding / escaping
  { pattern: /escapeHtml/i, type: "html_escape", protectsAgainst: ["xss"], description: "HTML escaping" },
  { pattern: /encodeURIComponent/i, type: "uri_encode", protectsAgainst: ["xss", "ssrf"], description: "URI encoding" },
  { pattern: /encodeURI\(/i, type: "uri_encode", protectsAgainst: ["ssrf"], description: "URI encoding" },
  { pattern: /escape\(/i, type: "escape", protectsAgainst: ["sql_injection", "xss"], description: "General escape" },
  {
    pattern: /sanitize/i,
    type: "sanitize",
    protectsAgainst: ["xss", "sql_injection", "command_injection"],
    description: "Sanitization function",
  },
  // DOMPurify
  { pattern: /DOMPurify/i, type: "dom_purify", protectsAgainst: ["xss"], description: "DOMPurify sanitization" },
  { pattern: /purify/i, type: "purify", protectsAgainst: ["xss"], description: "Purify function" },
  // Validation libraries
  {
    pattern: /zod\.(parse|safeParse)/i,
    type: "zod",
    protectsAgainst: ["sql_injection", "xss", "command_injection", "path_traversal", "prototype_pollution"],
    description: "Zod schema validation",
  },
  { pattern: /\.parse\(/i, type: "parse", protectsAgainst: ["sql_injection", "xss"], description: "Schema parse" },
  {
    pattern: /joi\.validate/i,
    type: "joi",
    protectsAgainst: ["sql_injection", "xss", "command_injection", "path_traversal", "prototype_pollution"],
    description: "Joi validation",
  },
  {
    pattern: /yup\.validate/i,
    type: "yup",
    protectsAgainst: ["sql_injection", "xss", "command_injection"],
    description: "Yup validation",
  },
  // Type coercion
  {
    pattern: /parseInt\(/i,
    type: "int_parse",
    protectsAgainst: ["sql_injection", "command_injection"],
    description: "Integer parsing",
  },
  {
    pattern: /Number\(/i,
    type: "number_cast",
    protectsAgainst: ["sql_injection", "command_injection"],
    description: "Number casting",
  },
  {
    pattern: /Boolean\(/i,
    type: "bool_cast",
    protectsAgainst: ["sql_injection", "command_injection", "xss"],
    description: "Boolean casting",
  },
  // SQL parameterization
  { pattern: /\?\s*,/i, type: "parameterized", protectsAgainst: ["sql_injection"], description: "Parameterized query" },
  { pattern: /\$\d+/i, type: "parameterized", protectsAgainst: ["sql_injection"], description: "Positional parameter" },
  // Path validation
  {
    pattern: /path\.normalize/i,
    type: "path_normalize",
    protectsAgainst: ["path_traversal"],
    description: "Path normalization",
  },
  {
    pattern: /path\.basename/i,
    type: "path_basename",
    protectsAgainst: ["path_traversal"],
    description: "Path basename extraction",
  },
  // Authorization patterns (for missing_auth)
  {
    pattern: /@Authorize\b/i,
    type: "auth_decorator",
    protectsAgainst: ["missing_auth"],
    description: "Authorization decorator",
  },
  {
    pattern: /@Auth\b/i,
    type: "auth_decorator",
    protectsAgainst: ["missing_auth"],
    description: "Auth decorator",
  },
  {
    pattern: /@UseGuards\b/i,
    type: "auth_guard",
    protectsAgainst: ["missing_auth"],
    description: "Guard decorator (NestJS)",
  },
  {
    pattern: /@Roles\b/i,
    type: "auth_roles",
    protectsAgainst: ["missing_auth"],
    description: "Roles decorator",
  },
  {
    pattern: /@RequiresPermission\b/i,
    type: "auth_permission",
    protectsAgainst: ["missing_auth"],
    description: "Permission decorator",
  },
  {
    pattern: /@PreAuthorize\b/i,
    type: "auth_spring",
    protectsAgainst: ["missing_auth"],
    description: "Spring PreAuthorize",
  },
  {
    pattern: /@Secured\b/i,
    type: "auth_spring",
    protectsAgainst: ["missing_auth"],
    description: "Spring Secured",
  },
  {
    pattern: /@RolesAllowed\b/i,
    type: "auth_roles",
    protectsAgainst: ["missing_auth"],
    description: "RolesAllowed annotation",
  },
  {
    pattern: /\[Authorize\]/i,
    type: "auth_dotnet",
    protectsAgainst: ["missing_auth"],
    description: ".NET Authorize attribute",
  },
  {
    pattern: /\[AllowAnonymous\]/i,
    type: "auth_anonymous",
    protectsAgainst: ["missing_auth"],
    description: ".NET AllowAnonymous attribute",
  },
  {
    pattern: /authenticate\s*\(|authorize\s*\(|requireAuth|isAuthenticated/i,
    type: "auth_middleware",
    protectsAgainst: ["missing_auth"],
    description: "Authentication middleware",
  },
  {
    pattern: /AuthInterceptor|grpc\.UnaryInterceptor/i,
    type: "auth_interceptor",
    protectsAgainst: ["missing_auth"],
    description: "gRPC auth interceptor",
  },
  {
    pattern: /@hasRole\b|@requireAuth\b/i,
    type: "auth_directive",
    protectsAgainst: ["missing_auth"],
    description: "GraphQL auth directive",
  },
];

// ===========================================================================
// Pre-compiled combined regex for each category.
// Single .test() per category instead of iterating 20-30 individual patterns.
// Reduces 89 regex.test() calls per entity → 3 (one per category).
// Individual pattern matching only runs on entities that pass the combined test.
// ===========================================================================

function buildCombinedRegex(patterns: Array<{ pattern: RegExp }>): RegExp {
  const sources = patterns.map((p) => p.pattern.source);
  return new RegExp(sources.join("|"), "i");
}

const SOURCE_COMBINED_RE = buildCombinedRegex(SOURCE_PATTERNS);
const SINK_COMBINED_RE = buildCombinedRegex(SINK_PATTERNS);
const SANITIZER_COMBINED_RE = buildCombinedRegex(SANITIZER_PATTERNS);

/** Pre-screen: matches ANY taint-relevant pattern (source | sink | sanitizer) */
const PRE_SCREEN_RE = buildCombinedRegex([...SOURCE_PATTERNS, ...SINK_PATTERNS, ...SANITIZER_PATTERNS]);

export function hasTaintRelevance(code: string): boolean {
  return PRE_SCREEN_RE.test(code);
}

export function classifyAsSource(code: string): { type: string; description: string; priority: number } | null {
  if (!SOURCE_COMBINED_RE.test(code)) return null;
  for (const pat of SOURCE_PATTERNS) {
    if (pat.pattern.test(code)) {
      return { type: pat.type, description: pat.description, priority: pat.priority };
    }
  }
  return null;
}

export function classifyAsSink(
  code: string,
): { type: string; categories: TaintCategory[]; description: string; priority: number } | null {
  if (!SINK_COMBINED_RE.test(code)) return null;
  for (const pat of SINK_PATTERNS) {
    if (pat.pattern.test(code)) {
      return { type: pat.type, categories: pat.categories, description: pat.description, priority: pat.priority };
    }
  }
  return null;
}

export function classifyAsSanitizer(
  code: string,
): { type: string; protectsAgainst: TaintCategory[]; description: string } | null {
  if (!SANITIZER_COMBINED_RE.test(code)) return null;
  for (const pat of SANITIZER_PATTERNS) {
    if (pat.pattern.test(code)) {
      return { type: pat.type, protectsAgainst: pat.protectsAgainst, description: pat.description };
    }
  }
  return null;
}

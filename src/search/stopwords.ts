/**
 * Extended Stopwords — English + Programming + Code Tokens
 *
 * 200+ words that are too common to be useful for code search:
 * - English: articles, prepositions, conjunctions, pronouns
 * - Programming: keywords common across all languages
 * - Code tokens: single letters, common abbreviations
 *
 * Used by search pipeline to skip indexing/querying noise words.
 */

const STOPWORD_LIST = [
  // ── English (56) ──────────────────────────────────────────────────
  "a", "an", "the", "and", "or", "not", "but", "if", "then", "else",
  "when", "at", "by", "for", "with", "about", "against", "between",
  "through", "during", "before", "after", "above", "below", "to",
  "from", "up", "down", "in", "out", "on", "off", "over", "under",
  "again", "further", "once", "here", "there", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor",
  "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "as", "until", "while", "of", "into",
  // Pronouns / be / do / have
  "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
  "she", "her", "it", "its", "they", "them", "their", "what", "which",
  "who", "whom", "this", "that", "these", "those",
  "is", "am", "are", "was", "were", "be", "been", "being",
  "has", "have", "had", "having", "do", "does", "did", "doing",
  "will", "would", "shall", "should", "may", "might", "must", "can",
  "could",

  // ── Programming keywords (common across languages) ────────────────
  "var", "let", "const", "function", "class", "interface", "type",
  "enum", "struct", "impl", "trait", "module", "package", "import",
  "export", "default", "extends", "implements", "abstract", "override",
  "public", "private", "protected", "static", "final", "readonly",
  "async", "await", "yield", "return", "throw", "try", "catch",
  "finally", "new", "delete", "typeof", "instanceof", "void", "null",
  "undefined", "true", "false", "nil", "none", "self", "super",
  "break", "continue", "switch", "case", "while", "for", "do",
  "foreach", "loop", "fn", "def", "lambda", "proc", "method",
  "constructor", "destructor", "init", "deinit",

  // ── Code tokens (too generic for search) ──────────────────────────
  "get", "set", "add", "put", "run", "log", "err", "msg", "val",
  "key", "idx", "len", "max", "min", "sum", "cnt", "num", "str",
  "buf", "ptr", "ref", "obj", "src", "dst", "tmp", "res", "ret",
  "arg", "args", "param", "params", "data", "info", "config",
  "options", "opts", "ctx", "context", "state", "status",
  "name", "value", "result", "error", "message", "item", "items",
  "list", "array", "map", "hash", "node", "child", "parent",
  "next", "prev", "first", "last", "index", "count", "size",
  "todo", "fixme", "hack", "note", "xxx", "deprecated",
];

/** Set of all stopwords for O(1) lookup */
export const STOPWORDS: ReadonlySet<string> = new Set(STOPWORD_LIST);

/** Check if a word is a stopword (case-insensitive) */
export function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}

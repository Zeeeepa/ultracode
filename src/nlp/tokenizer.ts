/**
 * Text Tokenizer for Query Expansion
 *
 * Provides simple, lightweight tokenization for co-occurrence analysis
 * and TF-IDF extraction. No heavy NLP dependencies.
 *
 * Features:
 * - Unicode-aware (supports Cyrillic, CJK, etc.)
 * - Stop word filtering (English + Russian)
 * - CamelCase/snake_case splitting for code identifiers
 */

// =============================================================================
// STOP WORDS
// =============================================================================

/**
 * English stop words (common function words)
 */
const ENGLISH_STOP_WORDS = new Set([
  // Articles and determiners
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  // Pronouns
  "i",
  "me",
  "my",
  "we",
  "us",
  "our",
  "you",
  "your",
  "he",
  "him",
  "his",
  "she",
  "her",
  "they",
  "them",
  "their",
  // Verbs (common auxiliaries)
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  // Prepositions
  "in",
  "on",
  "at",
  "to",
  "for",
  "from",
  "by",
  "with",
  "of",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "over",
  // Conjunctions
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "if",
  "then",
  "else",
  "when",
  "where",
  "while",
  "as",
  "because",
  "although",
  // Other common words
  "not",
  "no",
  "yes",
  "all",
  "any",
  "some",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "such",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "just",
  "also",
  // Programming-specific common words (too generic)
  "var",
  "let",
  "const",
  "new",
  "return",
  "true",
  "false",
  "null",
  "undefined",
  "void",
]);

/**
 * Russian stop words
 */
const RUSSIAN_STOP_WORDS = new Set([
  // Pronouns
  "я",
  "мы",
  "ты",
  "вы",
  "он",
  "она",
  "оно",
  "они",
  "мой",
  "твой",
  "его",
  "её",
  "наш",
  "ваш",
  "их",
  "этот",
  "тот",
  "что",
  "кто",
  "который",
  // Verbs (common)
  "быть",
  "есть",
  "был",
  "была",
  "было",
  "были",
  "будет",
  "будут",
  "иметь",
  "имеет",
  // Prepositions
  "в",
  "на",
  "с",
  "из",
  "к",
  "по",
  "за",
  "до",
  "от",
  "при",
  "для",
  "без",
  "под",
  "над",
  "между",
  "через",
  "после",
  "перед",
  // Conjunctions
  "и",
  "или",
  "но",
  "а",
  "да",
  "если",
  "что",
  "чтобы",
  "когда",
  "где",
  "как",
  "так",
  "потому",
  "поэтому",
  // Particles
  "не",
  "ни",
  "бы",
  "же",
  "ли",
  "вот",
  "только",
  "уже",
  "ещё",
  "тоже",
  "также",
  // Other
  "весь",
  "все",
  "всё",
  "каждый",
  "любой",
  "другой",
  "один",
  "два",
  "три",
  "много",
  "мало",
  "очень",
  "более",
  "менее",
  "самый",
]);

/**
 * Combined stop words set
 */
export const STOP_WORDS = new Set([...ENGLISH_STOP_WORDS, ...RUSSIAN_STOP_WORDS]);

// =============================================================================
// TOKENIZER
// =============================================================================

/**
 * Split camelCase and PascalCase identifiers into separate words.
 * Examples:
 * - "getUserById" → ["get", "user", "by", "id"]
 * - "XMLParser" → ["xml", "parser"]
 * - "parseHTTPResponse" → ["parse", "http", "response"]
 */
function splitCamelCase(str: string): string[] {
  // Handle acronyms: "XMLParser" → "XML_Parser" → ["xml", "parser"]
  // Insert underscore before uppercase letters that follow lowercase
  const withSeparators = str
    .replace(/([a-z])([A-Z])/g, "$1_$2") // camelCase
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2"); // XMLParser → XML_Parser

  return withSeparators.split("_").filter((s) => s.length > 0);
}

/**
 * Split snake_case and kebab-case identifiers.
 * Examples:
 * - "get_user_by_id" → ["get", "user", "by", "id"]
 * - "api-endpoint" → ["api", "endpoint"]
 */
function splitSnakeCase(str: string): string[] {
  return str.split(/[-_]/).filter((s) => s.length > 0);
}

/**
 * Tokenize text into normalized terms.
 *
 * Process:
 * 1. Convert to lowercase
 * 2. Split by whitespace and punctuation
 * 3. Split camelCase/snake_case identifiers
 * 4. Filter stop words and short tokens
 *
 * @param text - Input text to tokenize
 * @param minLength - Minimum token length (default: 2)
 * @returns Array of normalized tokens
 */
export function tokenize(text: string, minLength = 2): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  const tokens: string[] = [];

  // Split by whitespace and common punctuation, preserving Unicode letters/numbers
  const rawTokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ") // Keep letters, numbers, underscores, hyphens
    .split(/\s+/)
    .filter((t) => t.length > 0);

  for (const raw of rawTokens) {
    // Check if it's a compound identifier (has underscores, hyphens, or mixed case)
    const hasUnderscore = raw.includes("_");
    const hasHyphen = raw.includes("-");
    const hasMixedCase = /[a-z][A-Z]/.test(raw) || /[A-Z]{2,}[a-z]/.test(raw);

    if (hasUnderscore || hasHyphen) {
      // Split snake_case or kebab-case
      const parts = splitSnakeCase(raw);
      for (const part of parts) {
        if (hasMixedCase) {
          tokens.push(...splitCamelCase(part));
        } else {
          tokens.push(part);
        }
      }
    } else if (hasMixedCase) {
      // Split camelCase/PascalCase
      tokens.push(...splitCamelCase(raw));
    } else {
      tokens.push(raw);
    }
  }

  // Filter: remove stop words and short tokens
  return tokens.map((t) => t.toLowerCase()).filter((t) => t.length >= minLength && !STOP_WORDS.has(t));
}

/**
 * Tokenize text and return unique tokens only.
 * Useful for document frequency counting.
 */
export function tokenizeUnique(text: string, minLength = 2): Set<string> {
  return new Set(tokenize(text, minLength));
}

/**
 * Count token frequencies in text.
 * Returns Map of token → count.
 */
export function countTokens(text: string, minLength = 2): Map<string, number> {
  const counts = new Map<string, number>();
  const tokens = tokenize(text, minLength);

  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return counts;
}

/**
 * Extract n-grams from tokens.
 *
 * @param tokens - Array of tokens
 * @param n - N-gram size (2 for bigrams, 3 for trigrams)
 * @returns Array of n-gram strings (joined with space)
 */
export function extractNgrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];

  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(" "));
  }
  return ngrams;
}

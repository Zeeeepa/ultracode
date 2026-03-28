/**
 * Porter Stemmer (simplified) — ported from ultracode.zig/src/nlp/stemmer.zig
 *
 * Stems English words using the classic Porter algorithm (steps 1a–5).
 * Designed for search quality: reduces "running"→"run", "connected"→"connect",
 * "generalization"→"gener". Not linguistically perfect, but fast and consistent.
 *
 * Unlike the Zig version (in-place mutable buffer), this works on immutable
 * JS strings — allocates a char array, mutates it, returns a new string.
 */

// ── Helpers ────────────────────────────────────────────────────────────

function isVowel(c: number): boolean {
  // a=97 e=101 i=105 o=111 u=117
  return c === 97 || c === 101 || c === 105 || c === 111 || c === 117;
}

function isConsonant(word: Uint8Array, i: number): boolean {
  if (i >= word.length) return false;
  const c = word[i]!;
  if (isVowel(c)) return false;
  if (c === 121 /* y */) {
    if (i === 0) return true;
    return !isConsonant(word, i - 1);
  }
  return true;
}

/** Count VC groups (the "measure" m in Porter's paper) */
function measure(word: Uint8Array, len: number): number {
  if (len === 0) return 0;
  let n = 0;
  let i = 0;
  // Skip initial consonants
  while (i < len && isConsonant(word, i)) i++;
  while (i < len) {
    // Skip vowels
    while (i < len && !isConsonant(word, i)) i++;
    // Skip consonants
    if (i < len) {
      n++;
      while (i < len && isConsonant(word, i)) i++;
    }
  }
  return n;
}

function containsVowel(word: Uint8Array, len: number): boolean {
  for (let i = 0; i < len; i++) {
    if (!isConsonant(word, i)) return true;
  }
  return false;
}

function endsCvc(word: Uint8Array, len: number): boolean {
  if (len < 3) return false;
  if (!isConsonant(word, len - 1)) return false;
  if (isConsonant(word, len - 2)) return false;
  if (!isConsonant(word, len - 3)) return false;
  const c = word[len - 1];
  return c !== 119 /* w */ && c !== 120 /* x */ && c !== 121 /* y */;
}

function endsWith(word: Uint8Array, len: number, suffix: string): boolean {
  if (len < suffix.length) return false;
  for (let i = 0; i < suffix.length; i++) {
    if (word[len - suffix.length + i] !== suffix.charCodeAt(i)) return false;
  }
  return true;
}

function replaceSuffix(word: Uint8Array, pos: number, replacement: string): number {
  for (let i = 0; i < replacement.length; i++) {
    word[pos + i] = replacement.charCodeAt(i);
  }
  return pos + replacement.length;
}

// ── Steps ──────────────────────────────────────────────────────────────

function step1a(word: Uint8Array, len: number): number {
  if (endsWith(word, len, "sses")) return len - 2;
  if (endsWith(word, len, "ies")) return len - 2;
  if (endsWith(word, len, "ss")) return len;
  if (len > 1 && word[len - 1] === 115 /* s */) return len - 1;
  return len;
}

function step1bFixup(word: Uint8Array, len: number): number {
  if (len === 0) return len;
  if (endsWith(word, len, "at") || endsWith(word, len, "bl") || endsWith(word, len, "iz")) {
    word[len] = 101; // 'e'
    return len + 1;
  }
  if (len >= 2 && word[len - 1] === word[len - 2] && isDoubleEnd(word[len - 1]!)) {
    return len - 1;
  }
  if (len >= 3 && measure(word, len) === 1 && endsCvc(word, len)) {
    word[len] = 101; // 'e'
    return len + 1;
  }
  return len;
}

function isDoubleEnd(c: number): boolean {
  return c !== 108 /* l */ && c !== 115 /* s */ && c !== 122 /* z */ && !isVowel(c);
}

function step1b(word: Uint8Array, len: number): number {
  if (endsWith(word, len, "eed")) {
    if (measure(word, len - 3) > 0) return len - 1;
    return len;
  }
  if (endsWith(word, len, "ed")) {
    if (containsVowel(word, len - 2)) return step1bFixup(word, len - 2);
    return len;
  }
  if (endsWith(word, len, "ing")) {
    if (containsVowel(word, len - 3)) return step1bFixup(word, len - 3);
    return len;
  }
  return len;
}

function step1c(word: Uint8Array, len: number): number {
  if (len > 1 && word[len - 1] === 121 /* y */ && containsVowel(word, len - 1)) {
    word[len - 1] = 105; // 'i'
  }
  return len;
}

interface StemRule {
  suffix: string;
  replacement: string;
}

function applyRules(word: Uint8Array, len: number, rules: StemRule[], minMeasure: number): number {
  for (const rule of rules) {
    if (endsWith(word, len, rule.suffix)) {
      const stemLen = len - rule.suffix.length;
      if (measure(word, stemLen) > minMeasure) {
        return replaceSuffix(word, stemLen, rule.replacement);
      }
      return len; // matched but m too low — don't try other rules
    }
  }
  return len;
}

function step2(word: Uint8Array, len: number): number {
  if (len < 4) return len;
  return applyRules(
    word,
    len,
    [
      { suffix: "ational", replacement: "ate" },
      { suffix: "tional", replacement: "tion" },
      { suffix: "enci", replacement: "ence" },
      { suffix: "anci", replacement: "ance" },
      { suffix: "izer", replacement: "ize" },
      { suffix: "abli", replacement: "able" },
      { suffix: "alli", replacement: "al" },
      { suffix: "entli", replacement: "ent" },
      { suffix: "eli", replacement: "e" },
      { suffix: "ousli", replacement: "ous" },
      { suffix: "ization", replacement: "ize" },
      { suffix: "ation", replacement: "ate" },
      { suffix: "ator", replacement: "ate" },
      { suffix: "alism", replacement: "al" },
      { suffix: "iveness", replacement: "ive" },
      { suffix: "fulness", replacement: "ful" },
      { suffix: "ousnes", replacement: "ous" },
      { suffix: "aliti", replacement: "al" },
      { suffix: "iviti", replacement: "ive" },
      { suffix: "biliti", replacement: "ble" },
    ],
    0,
  );
}

function step3(word: Uint8Array, len: number): number {
  if (len < 4) return len;
  return applyRules(
    word,
    len,
    [
      { suffix: "icate", replacement: "ic" },
      { suffix: "ative", replacement: "" },
      { suffix: "alize", replacement: "al" },
      { suffix: "iciti", replacement: "ic" },
      { suffix: "ical", replacement: "ic" },
      { suffix: "ful", replacement: "" },
      { suffix: "ness", replacement: "" },
    ],
    0,
  );
}

function step4(word: Uint8Array, len: number): number {
  if (len < 4) return len;
  const suffixes = [
    "al",
    "ance",
    "ence",
    "er",
    "ic",
    "able",
    "ible",
    "ant",
    "ement",
    "ment",
    "ent",
    "ion",
    "ou",
    "ism",
    "ate",
    "iti",
    "ous",
    "ive",
    "ize",
  ];
  for (const suffix of suffixes) {
    if (endsWith(word, len, suffix)) {
      const stemLen = len - suffix.length;
      if (suffix === "ion") {
        if (stemLen > 0 && (word[stemLen - 1] === 115 /* s */ || word[stemLen - 1] === 116) /* t */) {
          if (measure(word, stemLen) > 1) return stemLen;
        }
      } else {
        if (measure(word, stemLen) > 1) return stemLen;
      }
    }
  }
  return len;
}

function step5(word: Uint8Array, len: number): number {
  if (len === 0) return len;
  let result = len;
  // 5a: (m>1) E → ∅
  if (word[len - 1] === 101 /* e */) {
    const m = measure(word, len - 1);
    if (m > 1) {
      result = len - 1;
    } else if (m === 1 && !endsCvc(word, len - 1)) {
      result = len - 1;
    }
  }
  // 5b: (m>1 and *d and *L) → single letter
  if (result >= 2 && word[result - 1] === 108 /* l */ && word[result - 1] === word[result - 2]) {
    if (measure(word, result) > 1) result -= 1;
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────

// Reusable buffer to avoid per-call allocation (max word 256 chars)
const _buf = new Uint8Array(256);

/**
 * Stem an English word using the Porter algorithm.
 * Returns the stemmed form (lowercase). Non-allocating for words ≤256 chars.
 *
 * @example stem("running") → "run"
 * @example stem("generalization") → "gener"
 */
export function stem(word: string): string {
  if (word.length <= 2) return word.toLowerCase();

  const lower = word.toLowerCase();
  const len = Math.min(lower.length, 256);

  for (let i = 0; i < len; i++) {
    _buf[i] = lower.charCodeAt(i);
  }

  let n = len;
  n = step1a(_buf, n);
  n = step1b(_buf, n);
  n = step1c(_buf, n);
  n = step2(_buf, n);
  n = step3(_buf, n);
  n = step4(_buf, n);
  n = step5(_buf, n);

  // Build string from buffer
  let result = "";
  for (let i = 0; i < n; i++) {
    result += String.fromCharCode(_buf[i]!);
  }
  return result;
}

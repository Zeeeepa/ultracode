/**
 * Java and Kotlin Built-ins
 */

import type { GlobalCacheEntry } from "../types.js";

/**
 * Java built-ins
 */
export const JAVA_BUILTINS: GlobalCacheEntry[] = [
  // Common classes
  { text: "String", category: "builtin", language: "java" },
  { text: "Integer", category: "builtin", language: "java" },
  { text: "Long", category: "builtin", language: "java" },
  { text: "Double", category: "builtin", language: "java" },
  { text: "Boolean", category: "builtin", language: "java" },
  { text: "Object", category: "builtin", language: "java" },
  { text: "Class", category: "builtin", language: "java" },

  // Collections
  { text: "List", category: "stdlib", language: "java" },
  { text: "ArrayList", category: "stdlib", language: "java" },
  { text: "LinkedList", category: "stdlib", language: "java" },
  { text: "Map", category: "stdlib", language: "java" },
  { text: "HashMap", category: "stdlib", language: "java" },
  { text: "TreeMap", category: "stdlib", language: "java" },
  { text: "Set", category: "stdlib", language: "java" },
  { text: "HashSet", category: "stdlib", language: "java" },
  { text: "TreeSet", category: "stdlib", language: "java" },
  { text: "Queue", category: "stdlib", language: "java" },
  { text: "Deque", category: "stdlib", language: "java" },
  { text: "Stack", category: "stdlib", language: "java" },
  { text: "Collections", category: "stdlib", language: "java" },
  { text: "Arrays", category: "stdlib", language: "java" },

  // Streams
  { text: "Stream", category: "stdlib", language: "java" },
  { text: ".stream()", category: "stdlib", language: "java" },
  { text: ".filter()", category: "stdlib", language: "java" },
  { text: ".map()", category: "stdlib", language: "java" },
  { text: ".collect()", category: "stdlib", language: "java" },
  { text: "Collectors.toList()", category: "stdlib", language: "java" },

  // Optional
  { text: "Optional", category: "stdlib", language: "java" },
  { text: "Optional.of", category: "stdlib", language: "java" },
  { text: "Optional.empty", category: "stdlib", language: "java" },
  { text: "Optional.ofNullable", category: "stdlib", language: "java" },

  // Concurrency
  { text: "CompletableFuture", category: "stdlib", language: "java" },
  { text: "ExecutorService", category: "stdlib", language: "java" },
  { text: "Executors", category: "stdlib", language: "java" },
  { text: "synchronized", category: "builtin", language: "java" },
  { text: "volatile", category: "builtin", language: "java" },

  // Annotations
  { text: "@Override", category: "pattern", language: "java" },
  { text: "@Deprecated", category: "pattern", language: "java" },
  { text: "@SuppressWarnings", category: "pattern", language: "java" },
  { text: "@FunctionalInterface", category: "pattern", language: "java" },

  // Patterns
  { text: "public static void main", category: "pattern", language: "java" },
  { text: "try catch finally", category: "pattern", language: "java" },
  { text: "throws Exception", category: "pattern", language: "java" },
  { text: "implements", category: "pattern", language: "java" },
  { text: "extends", category: "pattern", language: "java" },
];

/**
 * Kotlin built-ins
 */
export const KOTLIN_BUILTINS: GlobalCacheEntry[] = [
  // Collections
  { text: "listOf", category: "builtin", language: "kotlin" },
  { text: "mutableListOf", category: "builtin", language: "kotlin" },
  { text: "mapOf", category: "builtin", language: "kotlin" },
  { text: "mutableMapOf", category: "builtin", language: "kotlin" },
  { text: "setOf", category: "builtin", language: "kotlin" },
  { text: "mutableSetOf", category: "builtin", language: "kotlin" },

  // Scope functions
  { text: ".let", category: "builtin", language: "kotlin" },
  { text: ".run", category: "builtin", language: "kotlin" },
  { text: ".with", category: "builtin", language: "kotlin" },
  { text: ".apply", category: "builtin", language: "kotlin" },
  { text: ".also", category: "builtin", language: "kotlin" },

  // Null safety
  { text: "?.", category: "builtin", language: "kotlin" },
  { text: "?:", category: "builtin", language: "kotlin" },
  { text: "!!", category: "builtin", language: "kotlin" },

  // Coroutines
  { text: "suspend fun", category: "stdlib", language: "kotlin" },
  { text: "launch", category: "stdlib", language: "kotlin" },
  { text: "async", category: "stdlib", language: "kotlin" },
  { text: "await", category: "stdlib", language: "kotlin" },
  { text: "withContext", category: "stdlib", language: "kotlin" },
  { text: "Dispatchers.IO", category: "stdlib", language: "kotlin" },
  { text: "Dispatchers.Main", category: "stdlib", language: "kotlin" },
  { text: "CoroutineScope", category: "stdlib", language: "kotlin" },
  { text: "Flow", category: "stdlib", language: "kotlin" },

  // Patterns
  { text: "data class", category: "pattern", language: "kotlin" },
  { text: "sealed class", category: "pattern", language: "kotlin" },
  { text: "object", category: "pattern", language: "kotlin" },
  { text: "companion object", category: "pattern", language: "kotlin" },
  { text: "when", category: "pattern", language: "kotlin" },
  { text: "is", category: "pattern", language: "kotlin" },
];

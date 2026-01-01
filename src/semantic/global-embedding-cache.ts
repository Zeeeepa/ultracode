/**
 * Global Embedding Cache
 *
 * Pre-computed embeddings for language built-ins, stdlib, and framework patterns.
 * These are shared across all projects to avoid redundant embedding generation.
 *
 * Structure (centralized storage):
 * - Windows: %LOCALAPPDATA%/UltraScriptTools/global-embeddings/
 * - macOS: ~/Library/Application Support/UltraScriptTools/global-embeddings/
 * - Linux: ~/.local/share/UltraScriptTools/global-embeddings/
 *   - metadata.json (model version, last update)
 *   - javascript.bin (binary embeddings)
 *   - typescript.bin
 *   - python.bin
 *   - react.bin (framework)
 *   - angular.bin
 *   - ...
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils/config-paths.js";
import { hashText } from "../utils/fast-hash.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface GlobalCacheEntry {
  text: string;
  category: "builtin" | "stdlib" | "framework" | "pattern";
  language: string;
  framework?: string;
}

export interface GlobalCacheMetadata {
  version: string;
  model: string;
  dimension: number;
  lastUpdated: string;
  entryCounts: Record<string, number>;
}

// =============================================================================
// LANGUAGE BUILT-INS DEFINITIONS
// =============================================================================

/**
 * JavaScript/TypeScript built-in objects and methods
 */
export const JAVASCRIPT_BUILTINS: GlobalCacheEntry[] = [
  // Array methods
  { text: "Array.prototype.map", category: "builtin", language: "javascript" },
  { text: "Array.prototype.filter", category: "builtin", language: "javascript" },
  { text: "Array.prototype.reduce", category: "builtin", language: "javascript" },
  { text: "Array.prototype.forEach", category: "builtin", language: "javascript" },
  { text: "Array.prototype.find", category: "builtin", language: "javascript" },
  { text: "Array.prototype.findIndex", category: "builtin", language: "javascript" },
  { text: "Array.prototype.some", category: "builtin", language: "javascript" },
  { text: "Array.prototype.every", category: "builtin", language: "javascript" },
  { text: "Array.prototype.includes", category: "builtin", language: "javascript" },
  { text: "Array.prototype.indexOf", category: "builtin", language: "javascript" },
  { text: "Array.prototype.slice", category: "builtin", language: "javascript" },
  { text: "Array.prototype.splice", category: "builtin", language: "javascript" },
  { text: "Array.prototype.concat", category: "builtin", language: "javascript" },
  { text: "Array.prototype.join", category: "builtin", language: "javascript" },
  { text: "Array.prototype.sort", category: "builtin", language: "javascript" },
  { text: "Array.prototype.reverse", category: "builtin", language: "javascript" },
  { text: "Array.prototype.flat", category: "builtin", language: "javascript" },
  { text: "Array.prototype.flatMap", category: "builtin", language: "javascript" },
  { text: "Array.from", category: "builtin", language: "javascript" },
  { text: "Array.isArray", category: "builtin", language: "javascript" },

  // Object methods
  { text: "Object.keys", category: "builtin", language: "javascript" },
  { text: "Object.values", category: "builtin", language: "javascript" },
  { text: "Object.entries", category: "builtin", language: "javascript" },
  { text: "Object.assign", category: "builtin", language: "javascript" },
  { text: "Object.freeze", category: "builtin", language: "javascript" },
  { text: "Object.seal", category: "builtin", language: "javascript" },
  { text: "Object.create", category: "builtin", language: "javascript" },
  { text: "Object.defineProperty", category: "builtin", language: "javascript" },
  { text: "Object.getOwnPropertyNames", category: "builtin", language: "javascript" },
  { text: "Object.hasOwn", category: "builtin", language: "javascript" },

  // String methods
  { text: "String.prototype.split", category: "builtin", language: "javascript" },
  { text: "String.prototype.trim", category: "builtin", language: "javascript" },
  { text: "String.prototype.replace", category: "builtin", language: "javascript" },
  { text: "String.prototype.replaceAll", category: "builtin", language: "javascript" },
  { text: "String.prototype.includes", category: "builtin", language: "javascript" },
  { text: "String.prototype.startsWith", category: "builtin", language: "javascript" },
  { text: "String.prototype.endsWith", category: "builtin", language: "javascript" },
  { text: "String.prototype.toLowerCase", category: "builtin", language: "javascript" },
  { text: "String.prototype.toUpperCase", category: "builtin", language: "javascript" },
  { text: "String.prototype.slice", category: "builtin", language: "javascript" },
  { text: "String.prototype.substring", category: "builtin", language: "javascript" },
  { text: "String.prototype.padStart", category: "builtin", language: "javascript" },
  { text: "String.prototype.padEnd", category: "builtin", language: "javascript" },

  // Promise
  { text: "Promise.resolve", category: "builtin", language: "javascript" },
  { text: "Promise.reject", category: "builtin", language: "javascript" },
  { text: "Promise.all", category: "builtin", language: "javascript" },
  { text: "Promise.allSettled", category: "builtin", language: "javascript" },
  { text: "Promise.race", category: "builtin", language: "javascript" },
  { text: "Promise.any", category: "builtin", language: "javascript" },
  { text: "new Promise", category: "builtin", language: "javascript" },
  { text: "async function", category: "builtin", language: "javascript" },
  { text: "await", category: "builtin", language: "javascript" },

  // Console
  { text: "console.log", category: "builtin", language: "javascript" },
  { text: "console.error", category: "builtin", language: "javascript" },
  { text: "console.warn", category: "builtin", language: "javascript" },
  { text: "console.info", category: "builtin", language: "javascript" },
  { text: "console.debug", category: "builtin", language: "javascript" },
  { text: "console.table", category: "builtin", language: "javascript" },
  { text: "console.time", category: "builtin", language: "javascript" },
  { text: "console.timeEnd", category: "builtin", language: "javascript" },

  // Math
  { text: "Math.abs", category: "builtin", language: "javascript" },
  { text: "Math.floor", category: "builtin", language: "javascript" },
  { text: "Math.ceil", category: "builtin", language: "javascript" },
  { text: "Math.round", category: "builtin", language: "javascript" },
  { text: "Math.max", category: "builtin", language: "javascript" },
  { text: "Math.min", category: "builtin", language: "javascript" },
  { text: "Math.random", category: "builtin", language: "javascript" },
  { text: "Math.pow", category: "builtin", language: "javascript" },
  { text: "Math.sqrt", category: "builtin", language: "javascript" },

  // JSON
  { text: "JSON.parse", category: "builtin", language: "javascript" },
  { text: "JSON.stringify", category: "builtin", language: "javascript" },

  // Date
  { text: "new Date", category: "builtin", language: "javascript" },
  { text: "Date.now", category: "builtin", language: "javascript" },
  { text: "Date.parse", category: "builtin", language: "javascript" },

  // Map/Set
  { text: "new Map", category: "builtin", language: "javascript" },
  { text: "new Set", category: "builtin", language: "javascript" },
  { text: "new WeakMap", category: "builtin", language: "javascript" },
  { text: "new WeakSet", category: "builtin", language: "javascript" },

  // Timers
  { text: "setTimeout", category: "builtin", language: "javascript" },
  { text: "setInterval", category: "builtin", language: "javascript" },
  { text: "clearTimeout", category: "builtin", language: "javascript" },
  { text: "clearInterval", category: "builtin", language: "javascript" },

  // Error handling
  { text: "try catch", category: "pattern", language: "javascript" },
  { text: "throw new Error", category: "pattern", language: "javascript" },
  { text: "try catch finally", category: "pattern", language: "javascript" },
];

/**
 * TypeScript-specific built-ins and utility types
 */
export const TYPESCRIPT_BUILTINS: GlobalCacheEntry[] = [
  // Utility types
  { text: "Partial<T>", category: "builtin", language: "typescript" },
  { text: "Required<T>", category: "builtin", language: "typescript" },
  { text: "Readonly<T>", category: "builtin", language: "typescript" },
  { text: "Pick<T, K>", category: "builtin", language: "typescript" },
  { text: "Omit<T, K>", category: "builtin", language: "typescript" },
  { text: "Record<K, V>", category: "builtin", language: "typescript" },
  { text: "Exclude<T, U>", category: "builtin", language: "typescript" },
  { text: "Extract<T, U>", category: "builtin", language: "typescript" },
  { text: "NonNullable<T>", category: "builtin", language: "typescript" },
  { text: "ReturnType<T>", category: "builtin", language: "typescript" },
  { text: "Parameters<T>", category: "builtin", language: "typescript" },
  { text: "InstanceType<T>", category: "builtin", language: "typescript" },
  { text: "Awaited<T>", category: "builtin", language: "typescript" },

  // Type operators
  { text: "keyof", category: "builtin", language: "typescript" },
  { text: "typeof", category: "builtin", language: "typescript" },
  { text: "infer", category: "builtin", language: "typescript" },
  { text: "extends", category: "builtin", language: "typescript" },
  { text: "as const", category: "builtin", language: "typescript" },
  { text: "satisfies", category: "builtin", language: "typescript" },

  // Common patterns
  { text: "interface", category: "pattern", language: "typescript" },
  { text: "type alias", category: "pattern", language: "typescript" },
  { text: "enum", category: "pattern", language: "typescript" },
  { text: "generic function", category: "pattern", language: "typescript" },
  { text: "type guard", category: "pattern", language: "typescript" },
  { text: "discriminated union", category: "pattern", language: "typescript" },
];

/**
 * Python built-ins and stdlib
 */
export const PYTHON_BUILTINS: GlobalCacheEntry[] = [
  // Built-in functions
  { text: "print", category: "builtin", language: "python" },
  { text: "len", category: "builtin", language: "python" },
  { text: "range", category: "builtin", language: "python" },
  { text: "enumerate", category: "builtin", language: "python" },
  { text: "zip", category: "builtin", language: "python" },
  { text: "map", category: "builtin", language: "python" },
  { text: "filter", category: "builtin", language: "python" },
  { text: "sorted", category: "builtin", language: "python" },
  { text: "reversed", category: "builtin", language: "python" },
  { text: "sum", category: "builtin", language: "python" },
  { text: "min", category: "builtin", language: "python" },
  { text: "max", category: "builtin", language: "python" },
  { text: "abs", category: "builtin", language: "python" },
  { text: "round", category: "builtin", language: "python" },
  { text: "int", category: "builtin", language: "python" },
  { text: "float", category: "builtin", language: "python" },
  { text: "str", category: "builtin", language: "python" },
  { text: "bool", category: "builtin", language: "python" },
  { text: "list", category: "builtin", language: "python" },
  { text: "dict", category: "builtin", language: "python" },
  { text: "set", category: "builtin", language: "python" },
  { text: "tuple", category: "builtin", language: "python" },
  { text: "type", category: "builtin", language: "python" },
  { text: "isinstance", category: "builtin", language: "python" },
  { text: "issubclass", category: "builtin", language: "python" },
  { text: "hasattr", category: "builtin", language: "python" },
  { text: "getattr", category: "builtin", language: "python" },
  { text: "setattr", category: "builtin", language: "python" },
  { text: "open", category: "builtin", language: "python" },
  { text: "input", category: "builtin", language: "python" },

  // typing module
  { text: "from typing import List", category: "stdlib", language: "python" },
  { text: "from typing import Dict", category: "stdlib", language: "python" },
  { text: "from typing import Optional", category: "stdlib", language: "python" },
  { text: "from typing import Union", category: "stdlib", language: "python" },
  { text: "from typing import Tuple", category: "stdlib", language: "python" },
  { text: "from typing import Callable", category: "stdlib", language: "python" },
  { text: "from typing import Any", category: "stdlib", language: "python" },
  { text: "from typing import TypeVar", category: "stdlib", language: "python" },
  { text: "from typing import Generic", category: "stdlib", language: "python" },

  // Common imports
  { text: "import os", category: "stdlib", language: "python" },
  { text: "import sys", category: "stdlib", language: "python" },
  { text: "import json", category: "stdlib", language: "python" },
  { text: "import re", category: "stdlib", language: "python" },
  { text: "import logging", category: "stdlib", language: "python" },
  { text: "import datetime", category: "stdlib", language: "python" },
  { text: "import pathlib", category: "stdlib", language: "python" },
  { text: "from pathlib import Path", category: "stdlib", language: "python" },
  { text: "import asyncio", category: "stdlib", language: "python" },
  { text: "from dataclasses import dataclass", category: "stdlib", language: "python" },
  { text: "from enum import Enum", category: "stdlib", language: "python" },
  { text: "from abc import ABC, abstractmethod", category: "stdlib", language: "python" },

  // Patterns
  { text: "def __init__(self)", category: "pattern", language: "python" },
  { text: "def __str__(self)", category: "pattern", language: "python" },
  { text: "def __repr__(self)", category: "pattern", language: "python" },
  { text: "@property", category: "pattern", language: "python" },
  { text: "@staticmethod", category: "pattern", language: "python" },
  { text: "@classmethod", category: "pattern", language: "python" },
  { text: "@dataclass", category: "pattern", language: "python" },
  { text: "async def", category: "pattern", language: "python" },
  { text: "with open", category: "pattern", language: "python" },
  { text: "try except", category: "pattern", language: "python" },
  { text: "if __name__ == '__main__'", category: "pattern", language: "python" },
];

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

/**
 * React framework patterns
 */
export const REACT_PATTERNS: GlobalCacheEntry[] = [
  // Hooks
  { text: "useState", category: "framework", language: "typescript", framework: "react" },
  { text: "useEffect", category: "framework", language: "typescript", framework: "react" },
  { text: "useContext", category: "framework", language: "typescript", framework: "react" },
  { text: "useReducer", category: "framework", language: "typescript", framework: "react" },
  { text: "useCallback", category: "framework", language: "typescript", framework: "react" },
  { text: "useMemo", category: "framework", language: "typescript", framework: "react" },
  { text: "useRef", category: "framework", language: "typescript", framework: "react" },
  { text: "useLayoutEffect", category: "framework", language: "typescript", framework: "react" },
  { text: "useImperativeHandle", category: "framework", language: "typescript", framework: "react" },
  { text: "useDebugValue", category: "framework", language: "typescript", framework: "react" },
  { text: "useDeferredValue", category: "framework", language: "typescript", framework: "react" },
  { text: "useTransition", category: "framework", language: "typescript", framework: "react" },
  { text: "useId", category: "framework", language: "typescript", framework: "react" },
  { text: "useSyncExternalStore", category: "framework", language: "typescript", framework: "react" },

  // Components
  { text: "React.FC", category: "framework", language: "typescript", framework: "react" },
  { text: "React.Component", category: "framework", language: "typescript", framework: "react" },
  { text: "React.PureComponent", category: "framework", language: "typescript", framework: "react" },
  { text: "React.memo", category: "framework", language: "typescript", framework: "react" },
  { text: "React.forwardRef", category: "framework", language: "typescript", framework: "react" },
  { text: "React.lazy", category: "framework", language: "typescript", framework: "react" },
  { text: "React.Suspense", category: "framework", language: "typescript", framework: "react" },
  { text: "React.Fragment", category: "framework", language: "typescript", framework: "react" },

  // Context
  { text: "React.createContext", category: "framework", language: "typescript", framework: "react" },
  { text: "Context.Provider", category: "framework", language: "typescript", framework: "react" },
  { text: "Context.Consumer", category: "framework", language: "typescript", framework: "react" },

  // Common imports
  { text: "import React from 'react'", category: "framework", language: "typescript", framework: "react" },
  { text: "import { useState } from 'react'", category: "framework", language: "typescript", framework: "react" },
  { text: "import { useEffect } from 'react'", category: "framework", language: "typescript", framework: "react" },

  // JSX patterns
  { text: "return (<div>", category: "pattern", language: "typescript", framework: "react" },
  { text: "className=", category: "pattern", language: "typescript", framework: "react" },
  { text: "onClick=", category: "pattern", language: "typescript", framework: "react" },
  { text: "onChange=", category: "pattern", language: "typescript", framework: "react" },
  { text: "{children}", category: "pattern", language: "typescript", framework: "react" },
  { text: "key=", category: "pattern", language: "typescript", framework: "react" },
  { text: "ref=", category: "pattern", language: "typescript", framework: "react" },
];

/**
 * Angular framework patterns
 */
export const ANGULAR_PATTERNS: GlobalCacheEntry[] = [
  // Decorators
  { text: "@Component", category: "framework", language: "typescript", framework: "angular" },
  { text: "@Injectable", category: "framework", language: "typescript", framework: "angular" },
  { text: "@NgModule", category: "framework", language: "typescript", framework: "angular" },
  { text: "@Directive", category: "framework", language: "typescript", framework: "angular" },
  { text: "@Pipe", category: "framework", language: "typescript", framework: "angular" },
  { text: "@Input", category: "framework", language: "typescript", framework: "angular" },
  { text: "@Output", category: "framework", language: "typescript", framework: "angular" },
  { text: "@ViewChild", category: "framework", language: "typescript", framework: "angular" },
  { text: "@ViewChildren", category: "framework", language: "typescript", framework: "angular" },
  { text: "@ContentChild", category: "framework", language: "typescript", framework: "angular" },
  { text: "@ContentChildren", category: "framework", language: "typescript", framework: "angular" },
  { text: "@HostListener", category: "framework", language: "typescript", framework: "angular" },
  { text: "@HostBinding", category: "framework", language: "typescript", framework: "angular" },

  // Lifecycle hooks
  { text: "ngOnInit", category: "framework", language: "typescript", framework: "angular" },
  { text: "ngOnDestroy", category: "framework", language: "typescript", framework: "angular" },
  { text: "ngOnChanges", category: "framework", language: "typescript", framework: "angular" },
  { text: "ngAfterViewInit", category: "framework", language: "typescript", framework: "angular" },
  { text: "ngAfterContentInit", category: "framework", language: "typescript", framework: "angular" },
  { text: "ngDoCheck", category: "framework", language: "typescript", framework: "angular" },

  // DI
  { text: "constructor(private", category: "pattern", language: "typescript", framework: "angular" },
  { text: "inject()", category: "framework", language: "typescript", framework: "angular" },

  // RxJS (commonly used with Angular)
  { text: "Observable", category: "framework", language: "typescript", framework: "angular" },
  { text: "Subject", category: "framework", language: "typescript", framework: "angular" },
  { text: "BehaviorSubject", category: "framework", language: "typescript", framework: "angular" },
  { text: "ReplaySubject", category: "framework", language: "typescript", framework: "angular" },
  { text: ".subscribe", category: "framework", language: "typescript", framework: "angular" },
  { text: ".pipe", category: "framework", language: "typescript", framework: "angular" },
  { text: "map()", category: "framework", language: "typescript", framework: "angular" },
  { text: "filter()", category: "framework", language: "typescript", framework: "angular" },
  { text: "switchMap()", category: "framework", language: "typescript", framework: "angular" },
  { text: "mergeMap()", category: "framework", language: "typescript", framework: "angular" },
  { text: "catchError()", category: "framework", language: "typescript", framework: "angular" },
  { text: "takeUntil()", category: "framework", language: "typescript", framework: "angular" },
  { text: "tap()", category: "framework", language: "typescript", framework: "angular" },

  // Signals (Angular 16+)
  { text: "signal()", category: "framework", language: "typescript", framework: "angular" },
  { text: "computed()", category: "framework", language: "typescript", framework: "angular" },
  { text: "effect()", category: "framework", language: "typescript", framework: "angular" },

  // Common imports
  {
    text: "import { Component } from '@angular/core'",
    category: "framework",
    language: "typescript",
    framework: "angular",
  },
  {
    text: "import { Injectable } from '@angular/core'",
    category: "framework",
    language: "typescript",
    framework: "angular",
  },
  { text: "import { Observable } from 'rxjs'", category: "framework", language: "typescript", framework: "angular" },
];

/**
 * Vue framework patterns
 */
export const VUE_PATTERNS: GlobalCacheEntry[] = [
  // Composition API
  { text: "ref", category: "framework", language: "typescript", framework: "vue" },
  { text: "reactive", category: "framework", language: "typescript", framework: "vue" },
  { text: "computed", category: "framework", language: "typescript", framework: "vue" },
  { text: "watch", category: "framework", language: "typescript", framework: "vue" },
  { text: "watchEffect", category: "framework", language: "typescript", framework: "vue" },
  { text: "onMounted", category: "framework", language: "typescript", framework: "vue" },
  { text: "onUnmounted", category: "framework", language: "typescript", framework: "vue" },
  { text: "onUpdated", category: "framework", language: "typescript", framework: "vue" },
  { text: "provide", category: "framework", language: "typescript", framework: "vue" },
  { text: "inject", category: "framework", language: "typescript", framework: "vue" },
  { text: "defineProps", category: "framework", language: "typescript", framework: "vue" },
  { text: "defineEmits", category: "framework", language: "typescript", framework: "vue" },
  { text: "defineExpose", category: "framework", language: "typescript", framework: "vue" },

  // Options API
  { text: "data()", category: "framework", language: "typescript", framework: "vue" },
  { text: "methods:", category: "framework", language: "typescript", framework: "vue" },
  { text: "computed:", category: "framework", language: "typescript", framework: "vue" },
  { text: "watch:", category: "framework", language: "typescript", framework: "vue" },
  { text: "props:", category: "framework", language: "typescript", framework: "vue" },
  { text: "emits:", category: "framework", language: "typescript", framework: "vue" },

  // Template directives
  { text: "v-if", category: "pattern", language: "typescript", framework: "vue" },
  { text: "v-else", category: "pattern", language: "typescript", framework: "vue" },
  { text: "v-for", category: "pattern", language: "typescript", framework: "vue" },
  { text: "v-bind", category: "pattern", language: "typescript", framework: "vue" },
  { text: "v-on", category: "pattern", language: "typescript", framework: "vue" },
  { text: "v-model", category: "pattern", language: "typescript", framework: "vue" },
  { text: "v-show", category: "pattern", language: "typescript", framework: "vue" },
  { text: "v-slot", category: "pattern", language: "typescript", framework: "vue" },

  // Common imports
  { text: "import { ref } from 'vue'", category: "framework", language: "typescript", framework: "vue" },
  { text: "import { defineComponent } from 'vue'", category: "framework", language: "typescript", framework: "vue" },
];

/**
 * Express/Node.js patterns
 */
export const EXPRESS_PATTERNS: GlobalCacheEntry[] = [
  // HTTP methods
  { text: "app.get", category: "framework", language: "typescript", framework: "express" },
  { text: "app.post", category: "framework", language: "typescript", framework: "express" },
  { text: "app.put", category: "framework", language: "typescript", framework: "express" },
  { text: "app.delete", category: "framework", language: "typescript", framework: "express" },
  { text: "app.patch", category: "framework", language: "typescript", framework: "express" },
  { text: "app.use", category: "framework", language: "typescript", framework: "express" },

  // Request/Response
  { text: "req.body", category: "framework", language: "typescript", framework: "express" },
  { text: "req.params", category: "framework", language: "typescript", framework: "express" },
  { text: "req.query", category: "framework", language: "typescript", framework: "express" },
  { text: "req.headers", category: "framework", language: "typescript", framework: "express" },
  { text: "res.json", category: "framework", language: "typescript", framework: "express" },
  { text: "res.send", category: "framework", language: "typescript", framework: "express" },
  { text: "res.status", category: "framework", language: "typescript", framework: "express" },
  { text: "res.redirect", category: "framework", language: "typescript", framework: "express" },

  // Middleware pattern
  { text: "(req, res, next)", category: "pattern", language: "typescript", framework: "express" },
  { text: "next()", category: "framework", language: "typescript", framework: "express" },

  // Common imports
  { text: "import express from 'express'", category: "framework", language: "typescript", framework: "express" },
  { text: "const app = express()", category: "pattern", language: "typescript", framework: "express" },
  { text: "app.listen", category: "framework", language: "typescript", framework: "express" },
];

/**
 * NestJS patterns
 */
export const NESTJS_PATTERNS: GlobalCacheEntry[] = [
  // Decorators
  { text: "@Controller", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Injectable", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Module", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Get", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Post", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Put", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Delete", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Patch", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Body", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Param", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Query", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@Headers", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@UseGuards", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@UsePipes", category: "framework", language: "typescript", framework: "nestjs" },
  { text: "@UseInterceptors", category: "framework", language: "typescript", framework: "nestjs" },

  // Common imports
  {
    text: "import { Controller } from '@nestjs/common'",
    category: "framework",
    language: "typescript",
    framework: "nestjs",
  },
  {
    text: "import { Injectable } from '@nestjs/common'",
    category: "framework",
    language: "typescript",
    framework: "nestjs",
  },
];

/**
 * Go built-ins
 */
export const GO_BUILTINS: GlobalCacheEntry[] = [
  // Built-in functions
  { text: "fmt.Println", category: "stdlib", language: "go" },
  { text: "fmt.Printf", category: "stdlib", language: "go" },
  { text: "fmt.Sprintf", category: "stdlib", language: "go" },
  { text: "fmt.Errorf", category: "stdlib", language: "go" },
  { text: "make", category: "builtin", language: "go" },
  { text: "new", category: "builtin", language: "go" },
  { text: "append", category: "builtin", language: "go" },
  { text: "copy", category: "builtin", language: "go" },
  { text: "delete", category: "builtin", language: "go" },
  { text: "len", category: "builtin", language: "go" },
  { text: "cap", category: "builtin", language: "go" },
  { text: "close", category: "builtin", language: "go" },
  { text: "panic", category: "builtin", language: "go" },
  { text: "recover", category: "builtin", language: "go" },

  // Common imports
  { text: 'import "fmt"', category: "stdlib", language: "go" },
  { text: 'import "os"', category: "stdlib", language: "go" },
  { text: 'import "io"', category: "stdlib", language: "go" },
  { text: 'import "net/http"', category: "stdlib", language: "go" },
  { text: 'import "encoding/json"', category: "stdlib", language: "go" },
  { text: 'import "context"', category: "stdlib", language: "go" },
  { text: 'import "sync"', category: "stdlib", language: "go" },
  { text: 'import "time"', category: "stdlib", language: "go" },
  { text: 'import "errors"', category: "stdlib", language: "go" },
  { text: 'import "strings"', category: "stdlib", language: "go" },

  // Patterns
  { text: "if err != nil", category: "pattern", language: "go" },
  { text: "defer", category: "pattern", language: "go" },
  { text: "go func()", category: "pattern", language: "go" },
  { text: "select", category: "pattern", language: "go" },
  { text: "chan", category: "pattern", language: "go" },
  { text: "interface{}", category: "pattern", language: "go" },
  { text: "struct{}", category: "pattern", language: "go" },
];

/**
 * Rust built-ins
 */
export const RUST_BUILTINS: GlobalCacheEntry[] = [
  // Common types
  { text: "Option<T>", category: "builtin", language: "rust" },
  { text: "Result<T, E>", category: "builtin", language: "rust" },
  { text: "Vec<T>", category: "builtin", language: "rust" },
  { text: "String", category: "builtin", language: "rust" },
  { text: "&str", category: "builtin", language: "rust" },
  { text: "Box<T>", category: "builtin", language: "rust" },
  { text: "Rc<T>", category: "builtin", language: "rust" },
  { text: "Arc<T>", category: "builtin", language: "rust" },
  { text: "HashMap<K, V>", category: "builtin", language: "rust" },
  { text: "HashSet<T>", category: "builtin", language: "rust" },

  // Common methods
  { text: ".unwrap()", category: "builtin", language: "rust" },
  { text: ".expect()", category: "builtin", language: "rust" },
  { text: ".ok()", category: "builtin", language: "rust" },
  { text: ".err()", category: "builtin", language: "rust" },
  { text: ".map()", category: "builtin", language: "rust" },
  { text: ".and_then()", category: "builtin", language: "rust" },
  { text: ".or_else()", category: "builtin", language: "rust" },
  { text: ".collect()", category: "builtin", language: "rust" },
  { text: ".iter()", category: "builtin", language: "rust" },
  { text: ".into_iter()", category: "builtin", language: "rust" },
  { text: ".clone()", category: "builtin", language: "rust" },

  // Macros
  { text: "println!", category: "builtin", language: "rust" },
  { text: "format!", category: "builtin", language: "rust" },
  { text: "vec!", category: "builtin", language: "rust" },
  { text: "panic!", category: "builtin", language: "rust" },
  { text: "assert!", category: "builtin", language: "rust" },
  { text: "assert_eq!", category: "builtin", language: "rust" },
  { text: "derive", category: "builtin", language: "rust" },

  // Common imports
  { text: "use std::collections::HashMap", category: "stdlib", language: "rust" },
  { text: "use std::io", category: "stdlib", language: "rust" },
  { text: "use std::fs", category: "stdlib", language: "rust" },
  { text: "use std::sync::Arc", category: "stdlib", language: "rust" },
  { text: "use std::sync::Mutex", category: "stdlib", language: "rust" },

  // Patterns
  { text: "impl", category: "pattern", language: "rust" },
  { text: "match", category: "pattern", language: "rust" },
  { text: "if let", category: "pattern", language: "rust" },
  { text: "while let", category: "pattern", language: "rust" },
  { text: "async fn", category: "pattern", language: "rust" },
  { text: ".await", category: "pattern", language: "rust" },
  { text: "#[derive(", category: "pattern", language: "rust" },
];

// =============================================================================
// ALL ENTRIES COMBINED
// =============================================================================

export function getAllGlobalEntries(): GlobalCacheEntry[] {
  return [
    ...JAVASCRIPT_BUILTINS,
    ...TYPESCRIPT_BUILTINS,
    ...PYTHON_BUILTINS,
    ...JAVA_BUILTINS,
    ...KOTLIN_BUILTINS,
    ...GO_BUILTINS,
    ...RUST_BUILTINS,
    ...REACT_PATTERNS,
    ...ANGULAR_PATTERNS,
    ...VUE_PATTERNS,
    ...EXPRESS_PATTERNS,
    ...NESTJS_PATTERNS,
  ];
}

// =============================================================================
// GLOBAL CACHE CLASS
// =============================================================================

export class GlobalEmbeddingCache {
  private static instance: GlobalEmbeddingCache | null = null;
  private cacheDir: string;
  private cache: Map<string, Float32Array> = new Map();
  private textToHash: Map<string, string> = new Map();
  private metadata: GlobalCacheMetadata | null = null;
  private initialized = false;

  private constructor() {
    this.cacheDir = join(getDataDir(), "global-embeddings");
  }

  static getInstance(): GlobalEmbeddingCache {
    if (!GlobalEmbeddingCache.instance) {
      GlobalEmbeddingCache.instance = new GlobalEmbeddingCache();
    }
    return GlobalEmbeddingCache.instance;
  }

  /**
   * Initialize the global cache
   * @param model - Model name (e.g., "all-MiniLM-L6-v2")
   * @param dimension - Embedding dimension (e.g., 384)
   */
  async initialize(model: string, dimension: number): Promise<void> {
    if (this.initialized) return;

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    // Try to load existing cache
    const metadataPath = join(this.cacheDir, "metadata.json");
    if (existsSync(metadataPath)) {
      try {
        const raw = readFileSync(metadataPath, "utf-8");
        this.metadata = JSON.parse(raw) as GlobalCacheMetadata;

        // Check if cache is compatible
        if (this.metadata.model === model && this.metadata.dimension === dimension) {
          await this.loadCache();
          logger.debug("GlobalCache", "Loaded pre-computed embeddings", { count: this.cache.size });
        } else {
          logger.debug("GlobalCache", "Model mismatch, will regenerate", {
            cached: this.metadata.model,
            current: model,
          });
          this.metadata = null;
        }
      } catch (e) {
        logger.warn("GlobalCache", "Failed to load metadata", { error: (e as Error).message });
      }
    }

    // Initialize metadata if not loaded
    if (!this.metadata) {
      this.metadata = {
        version: "1.0",
        model,
        dimension,
        lastUpdated: new Date().toISOString(),
        entryCounts: {},
      };
    }

    this.initialized = true;
  }

  /**
   * Load cache from disk
   */
  private async loadCache(): Promise<void> {
    const embeddingsPath = join(this.cacheDir, "embeddings.bin");
    const textsPath = join(this.cacheDir, "texts.json");

    if (!existsSync(embeddingsPath) || !existsSync(textsPath)) {
      return;
    }

    try {
      // Load text -> hash mapping
      const textsRaw = readFileSync(textsPath, "utf-8");
      const texts = JSON.parse(textsRaw) as Record<string, string>;
      for (const [hash, text] of Object.entries(texts)) {
        this.textToHash.set(text, hash);
      }

      // Load binary embeddings
      const buffer = readFileSync(embeddingsPath);
      const dimension = this.metadata!.dimension;
      const numEmbeddings = buffer.length / (dimension * 4); // 4 bytes per float

      const hashes = Object.keys(texts);
      for (let i = 0; i < numEmbeddings && i < hashes.length; i++) {
        const start = i * dimension * 4;
        const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset + start, dimension);
        this.cache.set(hashes[i]!, new Float32Array(floatArray));
      }
    } catch (e) {
      logger.warn("GlobalCache", "Failed to load cache", { error: (e as Error).message });
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache(): Promise<void> {
    if (!this.metadata) return;

    const metadataPath = join(this.cacheDir, "metadata.json");
    const embeddingsPath = join(this.cacheDir, "embeddings.bin");
    const textsPath = join(this.cacheDir, "texts.json");

    // Save metadata
    this.metadata.lastUpdated = new Date().toISOString();
    writeFileSync(metadataPath, JSON.stringify(this.metadata, null, 2));

    // Save texts (hash -> text)
    const texts: Record<string, string> = {};
    for (const [text, hash] of this.textToHash) {
      texts[hash] = text;
    }
    writeFileSync(textsPath, JSON.stringify(texts));

    // Save binary embeddings
    const dimension = this.metadata.dimension;
    const buffer = Buffer.alloc(this.cache.size * dimension * 4);
    let offset = 0;
    for (const [hash] of this.textToHash) {
      const embedding = this.cache.get(hash);
      if (embedding) {
        for (let i = 0; i < dimension; i++) {
          buffer.writeFloatLE(embedding[i]!, offset);
          offset += 4;
        }
      }
    }
    writeFileSync(embeddingsPath, buffer);

    logger.debug("GlobalCache", "Saved embeddings to disk", { count: this.cache.size });
  }

  /**
   * Check if a text has a pre-computed embedding
   */
  has(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return this.textToHash.has(normalized);
  }

  /**
   * Get pre-computed embedding for text
   */
  get(text: string): Float32Array | null {
    const normalized = text.trim().toLowerCase();
    const hash = this.textToHash.get(normalized);
    if (!hash) return null;
    return this.cache.get(hash) ?? null;
  }

  /**
   * Add embedding to global cache
   */
  set(text: string, embedding: Float32Array): void {
    const normalized = text.trim().toLowerCase();
    const hash = hashText(normalized).slice(0, 16);
    this.textToHash.set(normalized, hash);
    this.cache.set(hash, embedding);
  }

  /**
   * Get all entries that need embeddings
   */
  getEntriesNeedingEmbeddings(): GlobalCacheEntry[] {
    const all = getAllGlobalEntries();
    return all.filter((entry) => !this.has(entry.text));
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; byCategory: Record<string, number>; byLanguage: Record<string, number> } {
    const all = getAllGlobalEntries();
    const byCategory: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};

    for (const entry of all) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
      byLanguage[entry.language] = (byLanguage[entry.language] ?? 0) + 1;
    }

    return {
      total: this.cache.size,
      byCategory,
      byLanguage,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.textToHash.clear();
  }
}

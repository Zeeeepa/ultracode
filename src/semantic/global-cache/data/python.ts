/**
 * Python Built-ins
 */

import type { GlobalCacheEntry } from "../types.js";

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

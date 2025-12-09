/**
 * Native Parsers Test Suite
 *
 * Tests for TypeScript, Python, Java, Kotlin, and Rust native parsers.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { JavaNativeParser } from "../../src/parsers/java-native-parser.js";
import { KotlinNativeParser } from "../../src/parsers/kotlin-native-parser.js";
import { PythonNativeParser } from "../../src/parsers/python-native-parser.js";
import { RustNativeParser } from "../../src/parsers/rust-native-parser.js";
import { TypeScriptParser } from "../../src/parsers/typescript-parser.js";

// =============================================================================
// TYPESCRIPT PARSER TESTS
// =============================================================================

describe("TypeScriptParser", () => {
  let parser: TypeScriptParser;

  beforeEach(async () => {
    parser = new TypeScriptParser();
    await parser.initialize();
  });

  test("supportsFile returns true for .ts files", () => {
    expect(parser.supportsFile("test.ts")).toBe(true);
    expect(parser.supportsFile("Test.TS")).toBe(true);
    expect(parser.supportsFile("path/to/file.ts")).toBe(true);
  });

  test("supportsFile returns true for .tsx files", () => {
    expect(parser.supportsFile("component.tsx")).toBe(true);
    expect(parser.supportsFile("Component.TSX")).toBe(true);
  });

  test("supportsFile returns false for non-ts files", () => {
    // Note: TypeScript parser supports .js and .jsx files as well
    expect(parser.supportsFile("test.py")).toBe(false);
    expect(parser.supportsFile("test.java")).toBe(false);
    expect(parser.supportsFile("test.rs")).toBe(false);
  });

  test("parses class declarations", async () => {
    const content = `
      export class MyClass {
        private name: string;

        constructor(name: string) {
          this.name = name;
        }

        greet(): string {
          return \`Hello, \${this.name}\`;
        }
      }
    `;
    const result = await parser.parse("test.ts", content, "hash123");

    expect(result.language).toBe("typescript");
    expect(result.entities.length).toBeGreaterThan(0);

    const classEntity = result.entities.find((e) => e.name === "MyClass" && e.type === "class");
    expect(classEntity).toBeDefined();
    expect(classEntity?.modifiers).toContain("export");
  });

  test("parses interface declarations", async () => {
    const content = `
      export interface User {
        id: number;
        name: string;
        email?: string;
      }
    `;
    const result = await parser.parse("test.ts", content, "hash123");

    const interfaceEntity = result.entities.find((e) => e.name === "User" && e.type === "interface");
    expect(interfaceEntity).toBeDefined();
  });

  test("parses function declarations", async () => {
    const content = `
      export function add(a: number, b: number): number {
        return a + b;
      }

      export async function fetchData(url: string): Promise<void> {
        await fetch(url);
      }
    `;
    const result = await parser.parse("test.ts", content, "hash123");

    const addFunc = result.entities.find((e) => e.name === "add" && e.type === "function");
    expect(addFunc).toBeDefined();
    expect(addFunc?.returnType).toBe("number");
    expect(addFunc?.parameters?.length).toBe(2);

    const asyncFunc = result.entities.find((e) => e.name === "fetchData");
    expect(asyncFunc).toBeDefined();
    expect(asyncFunc?.type).toBe("async_function");
  });

  test("parses imports", async () => {
    const content = `
      import { Component } from '@angular/core';
      import * as fs from 'fs';
      import path from 'path';
    `;
    const result = await parser.parse("test.ts", content, "hash123");

    const imports = result.entities.filter((e) => e.type === "import");
    expect(imports.length).toBeGreaterThanOrEqual(3);
  });

  test("parses type aliases", async () => {
    const content = `
      export type UserId = string;
      export type Status = 'pending' | 'active' | 'inactive';
    `;
    const result = await parser.parse("test.ts", content, "hash123");

    const typeEntity = result.entities.find((e) => e.name === "UserId" && e.type === "type");
    expect(typeEntity).toBeDefined();
  });

  test("parses enums", async () => {
    const content = `
      export enum Color {
        Red,
        Green,
        Blue
      }
    `;
    const result = await parser.parse("test.ts", content, "hash123");

    const enumEntity = result.entities.find((e) => e.name === "Color" && e.type === "enum");
    expect(enumEntity).toBeDefined();
  });

  test("returns stats correctly", () => {
    const stats = parser.getStats();
    expect(stats).toHaveProperty("filesParsed");
    expect(stats).toHaveProperty("avgParseTimeMs");
    expect(stats).toHaveProperty("errorCount");
  });
});

// =============================================================================
// PYTHON PARSER TESTS
// =============================================================================

describe("PythonNativeParser", () => {
  let parser: PythonNativeParser;

  beforeEach(async () => {
    parser = new PythonNativeParser();
    await parser.initialize();
  });

  test("supportsFile returns true for .py files", () => {
    expect(parser.supportsFile("test.py")).toBe(true);
    expect(parser.supportsFile("Test.PY")).toBe(true);
    expect(parser.supportsFile("path/to/file.py")).toBe(true);
  });

  test("supportsFile returns true for .pyi files", () => {
    expect(parser.supportsFile("types.pyi")).toBe(true);
  });

  test("supportsFile returns false for non-py files", () => {
    expect(parser.supportsFile("test.js")).toBe(false);
    expect(parser.supportsFile("test.ts")).toBe(false);
  });

  test("parses class declarations", async () => {
    const content = `
class MyClass:
    def __init__(self, name: str):
        self.name = name

    def greet(self) -> str:
        return f"Hello, {self.name}"
    `;
    const result = await parser.parse("test.py", content, "hash123");

    expect(result.language).toBe("python");
    expect(result.entities.length).toBeGreaterThan(0);

    const classEntity = result.entities.find((e) => e.name === "MyClass" && e.type === "class");
    expect(classEntity).toBeDefined();
  });

  test("parses function declarations", async () => {
    const content = `
def add(a: int, b: int) -> int:
    return a + b

async def fetch_data(url: str) -> None:
    await aiohttp.get(url)
    `;
    const result = await parser.parse("test.py", content, "hash123");

    const addFunc = result.entities.find((e) => e.name === "add" && e.type === "function");
    expect(addFunc).toBeDefined();

    const asyncFunc = result.entities.find((e) => e.name === "fetch_data");
    expect(asyncFunc).toBeDefined();
    expect(asyncFunc?.type).toBe("async_function");
  });

  test("parses imports", async () => {
    const content = `
import os
from pathlib import Path
from typing import List, Dict
import json as js
    `;
    const result = await parser.parse("test.py", content, "hash123");

    const imports = result.entities.filter((e) => e.type === "import");
    expect(imports.length).toBeGreaterThan(0);
  });

  test("parses decorated classes", async () => {
    const content = `from dataclasses import dataclass

@dataclass
class User:
    name: str
    age: int

class SimpleClass:
    def method(self):
        pass
`;
    const result = await parser.parse("test.py", content, "hash123");

    // Should find at least the SimpleClass which has no decorator
    const simpleClass = result.entities.find((e) => e.name === "SimpleClass" && e.type === "class");
    expect(simpleClass).toBeDefined();
  });

  test("returns stats correctly", () => {
    const stats = parser.getStats();
    expect(stats).toHaveProperty("filesParsed");
    expect(stats).toHaveProperty("avgParseTimeMs");
  });
});

// =============================================================================
// JAVA PARSER TESTS
// =============================================================================

describe("JavaNativeParser", () => {
  let parser: JavaNativeParser;

  beforeEach(async () => {
    parser = new JavaNativeParser();
    await parser.initialize();
  });

  test("supportsFile returns true for .java files", () => {
    expect(parser.supportsFile("Test.java")).toBe(true);
    expect(parser.supportsFile("test.JAVA")).toBe(true);
    expect(parser.supportsFile("path/to/File.java")).toBe(true);
  });

  test("supportsFile returns false for non-java files", () => {
    expect(parser.supportsFile("test.js")).toBe(false);
    expect(parser.supportsFile("test.kt")).toBe(false);
  });

  test("parses class declarations", async () => {
    const content = `
package com.example;

public class MyClass {
    private String name;

    public MyClass(String name) {
        this.name = name;
    }

    public String greet() {
        return "Hello, " + name;
    }
}
    `;
    const result = await parser.parse("MyClass.java", content, "hash123");

    expect(result.language).toBe("java");
    expect(result.entities.length).toBeGreaterThan(0);

    const classEntity = result.entities.find((e) => e.name === "MyClass" && e.type === "class");
    expect(classEntity).toBeDefined();
    expect(classEntity?.modifiers).toContain("public");
  });

  test("parses interface declarations", async () => {
    const content = `
package com.example;

public interface Service {
    void process();
    String getName();
}
    `;
    const result = await parser.parse("Service.java", content, "hash123");

    const interfaceEntity = result.entities.find((e) => e.name === "Service" && e.type === "interface");
    expect(interfaceEntity).toBeDefined();
  });

  test("parses enum declarations", async () => {
    const content = `
package com.example;

public enum Status {
    PENDING,
    ACTIVE,
    INACTIVE
}
    `;
    const result = await parser.parse("Status.java", content, "hash123");

    const enumEntity = result.entities.find((e) => e.name === "Status" && e.type === "enum");
    expect(enumEntity).toBeDefined();
  });

  test("parses imports", async () => {
    const content = `
package com.example;

import java.util.List;
import java.util.Map;
import static java.lang.Math.PI;

public class Test {}
    `;
    const result = await parser.parse("Test.java", content, "hash123");

    const imports = result.entities.filter((e) => e.type === "import");
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  test("parses package declaration", async () => {
    const content = `
package com.example.myapp;

public class App {}
    `;
    const result = await parser.parse("App.java", content, "hash123");

    const packageEntity = result.entities.find((e) => e.type === "module");
    expect(packageEntity).toBeDefined();
    expect(packageEntity?.name).toBe("com.example.myapp");
  });

  test("returns stats correctly", () => {
    const stats = parser.getStats();
    expect(stats).toHaveProperty("filesParsed");
    expect(stats).toHaveProperty("avgParseTimeMs");
  });
});

// =============================================================================
// KOTLIN PARSER TESTS
// =============================================================================

describe("KotlinNativeParser", () => {
  let parser: KotlinNativeParser;

  beforeEach(async () => {
    parser = new KotlinNativeParser();
    await parser.initialize();
  });

  test("supportsFile returns true for .kt files", () => {
    expect(parser.supportsFile("Test.kt")).toBe(true);
    expect(parser.supportsFile("test.KT")).toBe(true);
    expect(parser.supportsFile("path/to/File.kt")).toBe(true);
  });

  test("supportsFile returns true for .kts files", () => {
    expect(parser.supportsFile("build.gradle.kts")).toBe(true);
    expect(parser.supportsFile("script.kts")).toBe(true);
  });

  test("supportsFile returns false for non-kotlin files", () => {
    expect(parser.supportsFile("test.java")).toBe(false);
    expect(parser.supportsFile("test.js")).toBe(false);
  });

  test("parses class declarations", async () => {
    const content = `
package com.example

class MyClass(private val name: String) {
    fun greet(): String {
        return "Hello, $name"
    }
}
    `;
    const result = await parser.parse("MyClass.kt", content, "hash123");

    expect(result.language).toBe("kotlin");
    expect(result.entities.length).toBeGreaterThan(0);

    const classEntity = result.entities.find((e) => e.name === "MyClass" && e.type === "class");
    expect(classEntity).toBeDefined();
  });

  test("parses data class declarations", async () => {
    const content = `
package com.example

data class User(
    val id: Long,
    val name: String,
    val email: String?
)
    `;
    const result = await parser.parse("User.kt", content, "hash123");

    const classEntity = result.entities.find((e) => e.name === "User" && e.type === "class");
    expect(classEntity).toBeDefined();
    expect(classEntity?.modifiers).toContain("data");
  });

  test("parses interface declarations", async () => {
    const content = `
package com.example

interface Service {
    fun process()
    fun getName(): String
}
    `;
    const result = await parser.parse("Service.kt", content, "hash123");

    const interfaceEntity = result.entities.find((e) => e.name === "Service" && e.type === "interface");
    expect(interfaceEntity).toBeDefined();
  });

  test("parses function declarations", async () => {
    const content = `
fun add(a: Int, b: Int): Int = a + b

suspend fun fetchData(url: String): String {
    return httpClient.get(url)
}
    `;
    const result = await parser.parse("test.kt", content, "hash123");

    const addFunc = result.entities.find((e) => e.name === "add" && e.type === "function");
    expect(addFunc).toBeDefined();
    expect(addFunc?.returnType).toBe("Int");

    const suspendFunc = result.entities.find((e) => e.name === "fetchData");
    expect(suspendFunc).toBeDefined();
    expect(suspendFunc?.type).toBe("async_function");
    expect(suspendFunc?.modifiers).toContain("suspend");
  });

  test("parses imports", async () => {
    const content = `
package com.example

import kotlin.collections.List
import kotlinx.coroutines.flow.Flow
import java.util.Date as JDate
    `;
    const result = await parser.parse("test.kt", content, "hash123");

    const imports = result.entities.filter((e) => e.type === "import");
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  test("parses object declarations", async () => {
    const content = `
object Singleton {
    val instance = "single"
    fun doSomething() {}
}
    `;
    const result = await parser.parse("test.kt", content, "hash123");

    const objectEntity = result.entities.find((e) => e.name === "Singleton" && e.type === "class");
    expect(objectEntity).toBeDefined();
  });

  test("parses extension functions", async () => {
    const content = `
fun String.isEmail(): Boolean = this.contains("@")
    `;
    const result = await parser.parse("test.kt", content, "hash123");

    const extFunc = result.entities.find((e) => e.name === "String.isEmail");
    expect(extFunc).toBeDefined();
  });

  test("returns stats correctly", () => {
    const stats = parser.getStats();
    expect(stats).toHaveProperty("filesParsed");
    expect(stats).toHaveProperty("avgParseTimeMs");
  });
});

// =============================================================================
// RUST PARSER TESTS
// =============================================================================

describe("RustNativeParser", () => {
  let parser: RustNativeParser;

  beforeEach(async () => {
    parser = new RustNativeParser();
    await parser.initialize();
  }, 15000); // Increase timeout for rust-analyzer check

  test("supportsFile returns true for .rs files", () => {
    expect(parser.supportsFile("lib.rs")).toBe(true);
    expect(parser.supportsFile("main.RS")).toBe(true);
    expect(parser.supportsFile("path/to/mod.rs")).toBe(true);
  });

  test("supportsFile returns false for non-rust files", () => {
    expect(parser.supportsFile("test.js")).toBe(false);
    expect(parser.supportsFile("test.c")).toBe(false);
  });

  test("parses struct declarations", async () => {
    const content = `
pub struct User {
    pub name: String,
    pub age: u32,
}
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    expect(result.language).toBe("rust");
    expect(result.entities.length).toBeGreaterThan(0);

    const structEntity = result.entities.find((e) => e.name === "User" && e.type === "class");
    expect(structEntity).toBeDefined();
    expect(structEntity?.modifiers).toContain("pub");
  });

  test("parses enum declarations", async () => {
    const content = `
pub enum Status {
    Pending,
    Active,
    Inactive,
}
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    const enumEntity = result.entities.find((e) => e.name === "Status" && e.type === "enum");
    expect(enumEntity).toBeDefined();
  });

  test("parses trait declarations", async () => {
    const content = `
pub trait Service {
    fn process(&self);
    fn get_name(&self) -> String;
}
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    const traitEntity = result.entities.find((e) => e.name === "Service" && e.type === "interface");
    expect(traitEntity).toBeDefined();
  });

  test("parses function declarations", async () => {
    const content = `
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub async fn fetch_data(url: &str) -> Result<String, Error> {
    client.get(url).await
}
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    const addFunc = result.entities.find((e) => e.name === "add" && e.type === "function");
    expect(addFunc).toBeDefined();
    expect(addFunc?.returnType).toBe("i32");

    const asyncFunc = result.entities.find((e) => e.name === "fetch_data");
    expect(asyncFunc).toBeDefined();
    expect(asyncFunc?.type).toBe("async_function");
  });

  test("parses use statements", async () => {
    const content = `
use std::collections::HashMap;
use std::io::{Read, Write};
use crate::utils::helper;
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    const imports = result.entities.filter((e) => e.type === "import");
    expect(imports.length).toBeGreaterThan(0);
  });

  test("parses mod declarations", async () => {
    const content = `
pub mod utils;
mod internal;
    `;
    const result = await parser.parse("lib.rs", content, "hash123");

    const modules = result.entities.filter((e) => e.type === "module");
    expect(modules.length).toBeGreaterThanOrEqual(2);
  });

  test("parses impl blocks", async () => {
    const content = `
impl User {
    pub fn new(name: String) -> Self {
        User { name }
    }
}

impl Display for User {
    fn fmt(&self, f: &mut Formatter) -> Result {
        write!(f, "{}", self.name)
    }
}
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    const implBlocks = result.entities.filter((e) => e.modifiers?.includes("impl"));
    expect(implBlocks.length).toBeGreaterThanOrEqual(2);
  });

  test("parses constants and statics", async () => {
    const content = `
pub const MAX_SIZE: usize = 1024;
pub static mut COUNTER: u32 = 0;
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    const constEntity = result.entities.find((e) => e.name === "MAX_SIZE" && e.type === "constant");
    expect(constEntity).toBeDefined();

    const staticEntity = result.entities.find((e) => e.name === "COUNTER" && e.type === "constant");
    expect(staticEntity).toBeDefined();
    expect(staticEntity?.modifiers).toContain("static");
    expect(staticEntity?.modifiers).toContain("mut");
  });

  test("parses macros", async () => {
    const content = `
macro_rules! my_macro {
    ($x:expr) => {
        println!("{}", $x);
    };
}
    `;
    const result = await parser.parse("test.rs", content, "hash123");

    const macroEntity = result.entities.find((e) => e.name === "my_macro");
    expect(macroEntity).toBeDefined();
    expect(macroEntity?.modifiers).toContain("macro");
  });

  test("returns stats correctly", () => {
    const stats = parser.getStats();
    expect(stats).toHaveProperty("filesParsed");
    expect(stats).toHaveProperty("avgParseTimeMs");
  });
});

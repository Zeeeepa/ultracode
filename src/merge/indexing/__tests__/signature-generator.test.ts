import { beforeEach, describe, expect, it } from "@jest/globals";
import type { CodeUnit } from "../../models/code-unit.js";
import { CodeUnitType } from "../../models/code-unit.js";
import { SignatureGenerator } from "../signature-generator.js";

describe("SignatureGenerator", () => {
  let generator: SignatureGenerator;

  beforeEach(() => {
    generator = new SignatureGenerator();
  });

  describe("Function signature generation", () => {
    it("should generate signature for TypeScript function with typed parameters", () => {
      const unit: CodeUnit = {
        id: "test-1",
        type: CodeUnitType.Function,
        name: "getUserById",
        fullyQualifiedName: "UserService.getUserById",
        filePath: "/src/user.ts",
        language: "typescript",
        content: "function getUserById(id: number, includeDeleted?: boolean) { return users[id]; }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("UserService.getUserById(number,boolean)");
    });

    it("should generate signature for JavaScript function without types", () => {
      const unit: CodeUnit = {
        id: "test-2",
        type: CodeUnitType.Function,
        name: "add",
        fullyQualifiedName: "Math.add",
        filePath: "/src/math.js",
        language: "javascript",
        content: "function add(a, b) { return a + b; }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("Math.add(a,b)");
    });

    it("should generate empty parameter list for function with no parameters", () => {
      const unit: CodeUnit = {
        id: "test-3",
        type: CodeUnitType.Function,
        name: "getTimestamp",
        fullyQualifiedName: "Utils.getTimestamp",
        filePath: "/src/utils.ts",
        language: "typescript",
        content: "function getTimestamp() { return Date.now(); }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("Utils.getTimestamp()");
    });

    it("should generate signature for Python function with type hints", () => {
      const unit: CodeUnit = {
        id: "test-4",
        type: CodeUnitType.Function,
        name: "process_data",
        fullyQualifiedName: "DataProcessor.process_data",
        filePath: "/src/processor.py",
        language: "python",
        content: "def process_data(self, data: list, mode: str) -> dict: pass",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      // Note: 'self' is filtered out by extractParameters
      expect(signature).toBe("DataProcessor.process_data(list,str)");
    });

    it("should handle method signatures", () => {
      const unit: CodeUnit = {
        id: "test-5",
        type: CodeUnitType.Method,
        name: "save",
        fullyQualifiedName: "User.save",
        filePath: "/src/user.ts",
        language: "typescript",
        content: "save(options: SaveOptions): Promise<void> { }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("User.save(SaveOptions)");
    });
  });

  describe("Class/Interface signature generation", () => {
    it("should generate signature for TypeScript generic class", () => {
      const unit: CodeUnit = {
        id: "test-6",
        type: CodeUnitType.Class,
        name: "List",
        fullyQualifiedName: "Collections.List",
        filePath: "/src/collections.ts",
        language: "typescript",
        content: "class List<T> { items: T[] = []; }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("Collections.List<T>");
    });

    it("should generate signature for class with multiple type parameters", () => {
      const unit: CodeUnit = {
        id: "test-7",
        type: CodeUnitType.Class,
        name: "Map",
        fullyQualifiedName: "Collections.Map",
        filePath: "/src/collections.ts",
        language: "typescript",
        content: "class Map<K, V> { entries: [K, V][] = []; }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("Collections.Map<K,V>");
    });

    it("should generate FQN for class without type parameters", () => {
      const unit: CodeUnit = {
        id: "test-8",
        type: CodeUnitType.Class,
        name: "User",
        fullyQualifiedName: "Models.User",
        filePath: "/src/user.ts",
        language: "typescript",
        content: "class User { name: string; }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("Models.User");
    });

    it("should handle interface with generics", () => {
      const unit: CodeUnit = {
        id: "test-9",
        type: CodeUnitType.Interface,
        name: "Repository",
        fullyQualifiedName: "Data.Repository",
        filePath: "/src/repo.ts",
        language: "typescript",
        content: "interface Repository<T> { findById(id: string): T; }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("Data.Repository<T>");
    });
  });

  describe("Module signature generation", () => {
    it("should generate signature for module with exports", () => {
      const unit: CodeUnit = {
        id: "test-10",
        type: CodeUnitType.Module,
        name: "utils",
        fullyQualifiedName: "utils/array",
        filePath: "/src/utils/array.ts",
        language: "typescript",
        content: "export const map = ...; export const filter = ...; export const reduce = ...;",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
        structure: {
          normalizedAst: "",
          identifiers: new Set(),
          imports: new Set(),
          exports: new Set(["map", "filter", "reduce"]),
        },
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("module:utils/array:filter,map,reduce"); // sorted alphabetically
    });

    it("should generate signature for file", () => {
      const unit: CodeUnit = {
        id: "test-11",
        type: CodeUnitType.File,
        name: "index.ts",
        fullyQualifiedName: "src/index",
        filePath: "/src/index.ts",
        language: "typescript",
        content: 'export * from "./user";',
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
        structure: {
          normalizedAst: "",
          identifiers: new Set(),
          imports: new Set(),
          exports: new Set(["User", "createUser"]),
        },
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("module:src/index:User,createUser"); // sorted
    });

    it("should handle module without exports", () => {
      const unit: CodeUnit = {
        id: "test-12",
        type: CodeUnitType.Module,
        name: "config",
        fullyQualifiedName: "config/database",
        filePath: "/src/config/database.ts",
        language: "typescript",
        content: 'const config = { host: "localhost" };',
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBe("module:config/database:");
    });
  });

  describe("Non-signature types", () => {
    it("should return undefined for property", () => {
      const unit: CodeUnit = {
        id: "test-13",
        type: CodeUnitType.Property,
        name: "userName",
        fullyQualifiedName: "User.userName",
        filePath: "/src/user.ts",
        language: "typescript",
        content: "userName: string;",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBeUndefined();
    });

    it("should return undefined for block", () => {
      const unit: CodeUnit = {
        id: "test-14",
        type: CodeUnitType.Block,
        name: "if-block",
        fullyQualifiedName: "main.if-block",
        filePath: "/src/main.ts",
        language: "typescript",
        content: "if (x > 0) { console.error(x); }",
        contentHash: "hash1",
        structuralHash: "hash2",
        startLine: 1,
        endLine: 1,
        childIds: [],
        metadata: {},
      };

      const signature = generator.generateSignature(unit);
      expect(signature).toBeUndefined();
    });
  });

  describe("Hash computation", () => {
    it("should compute SHA256 hash of signature", () => {
      const signature = "UserService.getUserById(number,boolean)";
      const hash = generator.computeSignatureHash(signature);

      expect(hash).toHaveLength(64); // SHA256 hex
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // Hex format
    });

    it("should compute same hash for identical signatures", () => {
      const sig1 = "Math.add(number,number)";
      const sig2 = "Math.add(number,number)";

      const hash1 = generator.computeSignatureHash(sig1);
      const hash2 = generator.computeSignatureHash(sig2);

      expect(hash1).toBe(hash2);
    });

    it("should compute different hash for different signatures", () => {
      const sig1 = "Math.add(number,number)";
      const sig2 = "Math.subtract(number,number)";

      const hash1 = generator.computeSignatureHash(sig1);
      const hash2 = generator.computeSignatureHash(sig2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Signature normalization", () => {
    it("should remove whitespace from signature", () => {
      const signature = "User Service . get User By Id ( number , boolean )";
      const normalized = generator.normalizeSignature(signature, "typescript");

      expect(normalized).toBe("UserService.getUserById(number,boolean)");
    });

    it("should lowercase for case-insensitive languages (VBA)", () => {
      const signature = "Module.GetUserById(Integer,Boolean)";
      const normalized = generator.normalizeSignature(signature, "vba");

      expect(normalized).toBe("module.getuserbyid(integer,boolean)");
    });

    it("should preserve case for case-sensitive languages", () => {
      const signature = "UserService.getUserById(Number,Boolean)";
      const normalized = generator.normalizeSignature(signature, "typescript");

      expect(normalized).toBe("UserService.getUserById(Number,Boolean)");
    });
  });
});

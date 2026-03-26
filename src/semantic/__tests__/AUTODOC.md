# src/semantic/__tests__

## Overview

This module contains integration tests for the embedding provider factory and configuration mapping system. It validates that provider configurations defined in the MCP settings are correctly parsed, mapped, and instantiated into their corresponding provider implementations (Ollama, OpenAI, etc.), ensuring the embedding generation pipeline receives properly configured provider instances.

## Entity Listing

### Test Cases

- **mappingCases** — `provider-mapping.test.ts:6-126` — Test dataset validating provider configuration mapping from MCP configuration structure to provider-specific settings for multiple providers (Ollama, OpenAI, Anthropic, etc.).

- **creationCases** — `provider-mapping.test.ts:128-203` — Test dataset validating successful instantiation of provider instances from factory given valid configurations.

- **generatorCases** — `provider-mapping.test.ts:205-232` — Test dataset validating embedding generator creation and behavior with different provider configurations.

### Test Execution

- **describe** — `provider-mapping.test.ts:234-284` — Test suite grouping all provider factory and configuration tests.

- **describe (embedding provider mapping)** — `provider-mapping.test.ts:235-258` — Nested test suite validating configuration mapping logic for embedding providers.

- **embedding** — `provider-mapping.test.ts:237-256` — Per-provider test iteration validating configuration structure mapping.

- **describe (provider creation)** — `provider-mapping.test.ts:260-272` — Nested test suite validating factory instantiation of configured providers.

- **provider** — `provider-mapping.test.ts:262-270` — Per-provider test iteration validating successful provider creation from factory.

- **describe (generator creation)** — `provider-mapping.test.ts:274-283` — Nested test suite validating embedding generator instantiation with configured providers.

- **expect** — `provider-mapping.test.ts:276-281` — Assertion validating generator instance properties and provider assignment.

- **generator** — `provider-mapping.test.ts:277-280` — Per-case test iteration validating generator creation behavior.

### Test Variables (Runtime)

- **embedding** — `provider-mapping.test.ts:238-238` — Current embedding provider configuration being tested from mappingCases dataset.

- **providerSection** — `provider-mapping.test.ts:239-239` — Provider-specific configuration section extracted from MCP configuration for assertion.

- **actual** — `provider-mapping.test.ts:249-249` — Actual provider instance created by factory for comparison against expected properties.

- **provider** — `provider-mapping.test.ts:263-263` — Current provider configuration being tested from creationCases dataset.

- **generator** — `provider-mapping.test.ts:278-278` — Current embedding generator test case being validated from generatorCases dataset.

## Dependencies

- **Imports:**
  - `bun:test` — Test framework providing `describe`, `it`, `expect` assertions
  - `EmbeddingGenerator` — Embedding generation orchestrator from `../embedding-generator.js`
  - `ProviderFactoryOptions` — Configuration type for provider factory from `../providers/factory.js`
  - `createProvider` — Factory function creating provider instances from `../providers/factory.js`

- **Implicit Internal Connections:**
  - Tests validate the factory pattern (`createProvider`) used to instantiate provider implementations
  - Tests ensure configuration schema mapping from MCP settings to provider-specific options
  - Tests verify EmbeddingGenerator correctly accepts and uses configured providers
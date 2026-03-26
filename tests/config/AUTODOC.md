# tests/config

## Overview

This test suite validates configuration transformation for semantic/embedding providers and YAML configuration loading. It tests the provider configuration mapping pipeline that converts semantic configuration settings into provider-specific runtime options, and validates YAML-based configuration file loading, parsing, and validation.

## Flow

```
Raw Semantic Config → mapSemanticConfigToProvider → Provider Name
                    ↓
                  Build Options → Provider-Specific Options

YAML File → ConfigLoader → Parse + Validate → Merged Configuration
```

## Entity Listing

### Provider Configuration Tests (provider-config.test.ts)

**Test Cases**

- **mapSemanticConfigToProvider null config** — `provider-config.test.ts:12-39` — Tests that null configuration defaults to 'auto' provider.
- **mapSemanticConfigToProvider disabled config** — `provider-config.test.ts:41-81` — Tests mapping of known platforms and fallback to 'auto' for unknown platforms.
- **getModelNameFromSemanticConfig** — `provider-config.test.ts:42-48` — Tests model name resolution with defaults for null and disabled configurations.
- **buildEmbeddingGeneratorOptions** — `provider-config.test.ts:83-193` — Tests building embedding generator options across multiple configuration scenarios.
- **buildWorkerProviderOptions** — `provider-config.test.ts:195-240` — Tests generation of worker provider options with various embeddings and batch size configurations.
- **getBatchSizeFromConfig** — `provider-config.test.ts:242-261` — Tests batch size extraction with platform overrides.
- **Semantic config resolution and merging** — `provider-config.test.ts:264-331` — Tests loading and merging semantic configuration from multiple sources with provider validation.

**Configuration Fixtures**

- **platforms** — `provider-config.test.ts:22-22` — Array of supported embedding provider platform names.
- **opts** — `provider-config.test.ts:85-85`, `94-96`, `101-112`, `121-127`, `133-151`, `160-166`, `175-181`, `187-187`, `202-204`, `211-221`, `228-228`, `236-236`, `312-312` — Provider configuration option objects specifying embeddings, batch sizes, and worker settings.
- **result** — `provider-config.test.ts:24-27`, `33-36`, `51-54`, `59-62`, `67-70`, `75-78`, `248-248`, `253-253`, `258-258` — Provider mapping and option generation results from configuration transformations.
- **semanticConfig** — `provider-config.test.ts:265-265` — Complete semantic configuration loaded from multiple sources.
- **yamlProvider** — `provider-config.test.ts:267-267` — Provider options extracted from YAML configuration source.
- **jsonProvider** — `provider-config.test.ts:269-269` — Provider options extracted from JSON configuration source.
- **resolved** — `provider-config.test.ts:270-270` — Final merged provider configuration state.
- **jsonModel** — `provider-config.test.ts:299-299`, `308-308` — Model configuration loaded from JSON source.
- **yamlModel** — `provider-config.test.ts:300-300`, `309-309` — Model configuration loaded from YAML source.
- **model** — `provider-config.test.ts:301-301`, `310-310` — Final resolved model configuration after merging.

**Test Assertions**

- **expect** — `provider-config.test.ts:13-15`, `17-19`, `43-44`, `46-48`, `196-199`, `243-245` — Validation assertions on provider mappings, model names, and configuration values.

### YAML Configuration Tests (yaml-config.test.ts)

**Test Cases**

- **YAML configuration loading and validation** — `yaml-config.test.ts:6-45` — Tests ConfigLoader functionality for reading, parsing, validating, and merging YAML configuration files with provider name validation.

**Configuration Fixtures**

- **a** — `yaml-config.test.ts:8-8` — First configuration object for merging tests.
- **b** — `yaml-config.test.ts:9-9` — Second configuration object for merging tests.
- **loader** — `yaml-config.test.ts:14-14`, `22-22`, `31-31` — ConfigLoader instance managing YAML file loading and configuration parsing.
- **config** — `yaml-config.test.ts:15-15`, `42-42` — Parsed and validated configuration object from YAML source.
- **embConfig** — `yaml-config.test.ts:23-23`, `32-32` — Embedding-specific configuration extracted from loaded configuration.
- **validProviders** — `yaml-config.test.ts:35-35` — Set of valid provider names for validation during configuration loading.

## Dependencies

- `src/agents/semantic/provider-config.ts` — Provider configuration mapping and option building functions
- `src/config/yaml-config.ts` — YAML configuration loader and validator
- `src/utils/config-paths.ts` — Configuration path resolution and loading utilities
- `bun:test` — Test framework (describe, it, expect)
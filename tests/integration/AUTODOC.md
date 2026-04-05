# Integration Module

## Overview

The `integration` module provides tools for testing and validating Model Control Protocol (MCP) integrations with external systems. It serves as an internal testing utility for verifying MCP tool interactions and does not expose public APIs. The module is designed for integration testing workflows within the system.

## Entity Listing

### Tools
- **test-mcp-tool.mjs** — Internal utility for testing MCP (Model Control Protocol) tool integrations and validating external system interactions.

### Tests

#### Test Harness
- **MCPTester** — `mcp-methods-dev.test.js:24-468` — Test harness for executing and validating MCP method implementations against a running server.
- **MCPTester** — `mcp-methods.test.js:24-468` — Test harness for executing and validating MCP method implementations against a running server.

#### Test Suites
- **jscpd-tool.test.ts:10-33** — Test suite for JSCPD clone detection functionality.
- **mcp-methods.test.ts:34-49** — Test suite validating uniqueness and categorization of all MCP methods.
- **mcp-methods.test.ts:109-133** — Test suite for verifying storage and resource manager integrations.
- **mcp-methods.test.ts:135-191** — Test suite validating resource management, knowledge bus, and SQLite manager interactions.

#### MCPTester Methods
- **constructor** — `mcp-methods-dev.test.js:25-34` — Initializes the MCPTester instance with server process and logging configuration.
- **log** — `mcp-methods-dev.test.js:36-38` — Logs colored test output with optional prefixes for test result tracking.
- **startServer** — `mcp-methods-dev.test.js:40-73` — Starts the MCP server process and establishes a socket connection for testing.
- **sendRequest** — `mcp-methods-dev.test.js:75-108` — Sends a formatted request to the MCP server and handles timeout validation.
- **runTest** — `mcp-methods-dev.test.js:110-160` — Executes a single test case by sending a request and measuring response time and validation.
- **runAllTests** — `mcp-methods-dev.test.js:162-408` — Executes the complete test suite with error handling and result aggregation.
- **generateReport** — `mcp-methods-dev.test.js:410-467` — Generates a formatted HTML test report with pass/fail statistics and detailed results.
- **constructor** — `mcp-methods.test.js:25-34` — Initializes the MCPTester instance with server process and logging configuration.
- **log** — `mcp-methods.test.js:36-38` — Logs colored test output with optional prefixes for test result tracking.
- **startServer** — `mcp-methods.test.js:40-73` — Starts the MCP server process and establishes a socket connection for testing.
- **sendRequest** — `mcp-methods.test.js:75-108` — Sends a formatted request to the MCP server and handles timeout validation.
- **runTest** — `mcp-methods.test.js:110-160` — Executes a single test case by sending a request and measuring response time and validation.
- **runAllTests** — `mcp-methods.test.js:162-408` — Executes the complete test suite with error handling and result aggregation.
- **generateReport** — `mcp-methods.test.js:410-467` — Generates a formatted HTML test report with pass/fail statistics and detailed results.

#### Test Helpers and Variables
- **TIMEOUT** — `mcp-methods-dev.test.js:11-11` — Maximum time in milliseconds allowed for server startup before test timeout.
- **TEST_PROJECT_DIR** — `mcp-methods-dev.test.js:12-12` — Root directory path for the test project.
- **colors** — `mcp-methods-dev.test.js:15-22` — ANSI color codes for formatted console output.
- **ALL_MCP_METHODS** — `mcp-methods.test.ts:8-234` — Comprehensive listing of all available MCP method definitions and their categories.
- **ALL_MCP_METHODS** — `mcp-methods.test.ts:9-32` — Data structure containing all MCP methods organized by type.
- **coreOps** — `mcp-methods.test.ts:52-52` — Collection of core MCP operations for entity management.
- **queryOps** — `mcp-methods.test.ts:53-53` — Collection of query-based MCP operations.
- **graphInfo** — `mcp-methods.test.ts:54-54` — MCP operations for graph information retrieval.
- **semanticOps** — `mcp-methods.test.ts:55-64` — Collection of semantic analysis and search operations.
- **monitoringOps** — `mcp-methods.test.ts:65-65` — Collection of monitoring and metrics operations.
- **getGraphStorage** — `mcp-methods.test.ts:111-111` — Factory function returning a graph storage instance.
- **getSQLiteManager** — `mcp-methods.test.ts:117-117` — Factory function returning a SQLite database manager instance.
- **resourceManager** — `mcp-methods.test.ts:123-123` — Instance managing resource allocation and lifecycle.
- **knowledgeBus** — `mcp-methods.test.ts:129-129` — Instance providing knowledge graph query and update operations.
- **collectAgentMetrics** — `mcp-methods.test.ts:202-206` — Function that collects performance and usage metrics for agents.
- **newMethods** — `mcp-methods.test.ts:193-233` — Array of newly added MCP method definitions.
- **currentDir** — `jscpd-tool.test.ts:7-7` — Current directory path derived from the test file location.
- **fixtureRoot** — `jscpd-tool.test.ts:8-8` — Path to the test fixtures directory for clone detection tests.
- **outputBuffer** — `mcp-methods-dev.test.js:48-48` — Accumulates server output during test execution for logging.
- **timeout** — `mcp-methods-dev.test.js:49-51` — Timeout handler for server startup validation.
- **request** — `mcp-methods-dev.test.js:77-85` — Socket request object for MCP communication.
- **timeout** — `mcp-methods-dev.test.js:87-89` — Timeout handler for request transmission.
- **responseBuffer** — `mcp-methods-dev.test.js:91-91` — Accumulates server response data during request handling.
- **dataHandler** — `mcp-methods-dev.test.js:93-103` — Callback function processing incoming server response data.
- **response** — `mcp-methods-dev.test.js:96-96` — Parsed MCP response object from server.
- **startTime** — `mcp-methods-dev.test.js:112-112` — Timestamp marking the beginning of a test case execution.
- **response** — `mcp-methods-dev.test.js:118-118` — MCP server response data for the current test.
- **duration** — `mcp-methods-dev.test.js:119-119` — Measured time in milliseconds for test case execution.
- **validationResult** — `mcp-methods-dev.test.js:128-128` — Result object from validating the MCP response format.
- **graphResult** — `mcp-methods-dev.test.js:206-214` — Response data from graph storage operations during testing.
- **testEntityId** — `mcp-methods-dev.test.js:216-216` — Unique identifier for entities created during test execution.
- **passRate** — `mcp-methods-dev.test.js:415-415` — Percentage of test cases that passed the validation.
- **reportPath** — `mcp-methods-dev.test.js:439-439` — File system path where the generated test report is written.
- **tester** — `mcp-methods-dev.test.js:474-477` — MCPTester instance used for executing the test suite.
- **TIMEOUT** — `mcp-methods.test.js:11-11` — Maximum time in milliseconds allowed for server startup before test timeout.
- **TEST_PROJECT_DIR** — `mcp-methods.test.js:12-12` — Root directory path for the test project.
- **colors** — `mcp-methods.test.js:15-22` — ANSI color codes for formatted console output.
- **outputBuffer** — `mcp-methods.test.js:48-48` — Accumulates server output during test execution for logging.
- **timeout** — `mcp-methods.test.js:49-51` — Timeout handler for server startup validation.
- **request** — `mcp-methods.test.js:77-85` — Socket request object for MCP communication.
- **timeout** — `mcp-methods.test.js:87-89` — Timeout handler for request transmission.
- **responseBuffer** — `mcp-methods.test.js:91-91` — Accumulates server response data during request handling.
- **dataHandler** — `mcp-methods.test.js:93-103` — Callback function processing incoming server response data.
- **response** — `mcp-methods.test.js:96-96` — Parsed MCP response object from server.
- **startTime** — `mcp-methods.test.js:112-112` — Timestamp marking the beginning of a test case execution.
- **response** — `mcp-methods.test.js:118-118` — MCP server response data for the current test.
- **duration** — `mcp-methods.test.js:119-119` — Measured time in milliseconds for test case execution.
- **validationResult** — `mcp-methods.test.js:128-128` — Result object from validating the MCP response format.
- **graphResult** — `mcp-methods.test.js:206-214` — Response data from graph storage operations during testing.
- **testEntityId** — `mcp-methods.test.js:216-216` — Unique identifier for entities created during test execution.
- **passRate** — `mcp-methods.test.js:415-415` — Percentage of test cases that passed the validation.
- **reportPath** — `mcp-methods.test.js:439-439` — File system path where the generated test report is written.
- **tester** — `mcp-methods.test.js:474-477` — MCPTester instance used for executing the test suite.
- **uniqueMethods** — `mcp-methods.test.ts:40-40` — Deduplicated list of all MCP methods by name.
- **totalCategorized** — `mcp-methods.test.ts:103-104` — Count of methods successfully assigned to test categories.
- **usage** — `mcp-methods.test.ts:145-145` — Resource usage statistics from the resource manager.
- **stats** — `mcp-methods.test.ts:159-159` — Knowledge bus statistics and query performance metrics.
- **sqliteManager** — `mcp-methods.test.ts:171-171` — SQLite database manager instance for persistent storage.
- **storage** — `mcp-methods.test.ts:174-174` — Initialized graph storage instance.
- **sqliteManager** — `mcp-methods.test.ts:183-183` — SQLite database manager instance for testing metrics persistence.
- **storage** — `mcp-methods.test.ts:184-184` — Initialized graph storage instance for metric storage.
- **metrics** — `mcp-methods.test.ts:185-185` — Collected performance and usage metrics from the knowledge bus.
- **result** — `jscpd-tool.test.ts:11-32` — Result object containing clone detection output and statistics.
- **firstDetail** — `jscpd-tool.test.ts:23-23` — First clone detail object from the results summary.
- **firstClone** — `jscpd-tool.test.ts:28-28` — First detected code clone with source references.

#### Anonymous/Internal Functions
- **<anonymous>** — `mcp-methods-dev.test.js:24-24` — Immediately-invoked function expression encapsulating test harness initialization.
- **<anonymous>** — `mcp-methods.test.js:24-24` — Immediately-invoked function expression encapsulating test harness initialization.
- **resolve** — `mcp-methods-dev.test.js:43-72` — Promise resolver for successful server startup.
- **reject** — `mcp-methods-dev.test.js:49-51` — Promise rejector for server startup timeout.
- **data** — `mcp-methods-dev.test.js:53-62` — Handler for server initialization data events.
- **_data** — `mcp-methods-dev.test.js:64-66` — Temporary buffer for collecting additional server output.
- **error** — `mcp-methods-dev.test.js:68-71` — Error handler for server startup failures.
- **resolve** — `mcp-methods-dev.test.js:76-107` — Promise resolver for successful request transmission.
- **reject** — `mcp-methods-dev.test.js:87-89` — Promise rejector for request timeout.
- **data** — `mcp-methods-dev.test.js:93-103` — Handler for server response data events.
- **result** — `mcp-methods-dev.test.js:176-179` — Validation result for method parameter schemas.
- **result** — `mcp-methods-dev.test.js:181-184` — Validation result for method return type schemas.
- **result** — `mcp-methods-dev.test.js:190-193` — Test execution result with timing and response data.
- **result** — `mcp-methods-dev.test.js:196-199` — Standardized test case result object.
- **result** — `mcp-methods-dev.test.js:210-213` — Aggregated results from multiple test executions.
- **result** — `mcp-methods-dev.test.js:225-228` — Test result with error information.
- **result** — `mcp-methods-dev.test.js:236-239` — Test case result from resource manager operations.
- **result** — `mcp-methods-dev.test.js:247-250` — Test result from graph storage operations.
- **result** — `mcp-methods-dev.test.js:262-265` — Test result from semantic search operations.
- **result** — `mcp-methods-dev.test.js:272-275` — Test result from knowledge bus operations.
- **result** — `mcp-methods-dev.test.js:282-285` — Test result from database operations.
- **result** — `mcp-methods-dev.test.js:292-295` — Test result from entity mutation operations.
- **result** — `mcp-methods-dev.test.js:302-305` — Test result from relationship operations.
- **result** — `mcp-methods-dev.test.js:318-321` — Test result from indexing operations.
- **result** — `mcp-methods-dev.test.js:329-332` — Test result from validation operations.
- **result** — `mcp-methods-dev.test.js:339-342` — Test result from caching operations.
- **result** — `mcp-methods-dev.test.js:350-353` — Test result from metric collection.
- **result** — `mcp-methods-dev.test.js:355-358` — Test result from monitoring operations.
- **result** — `mcp-methods-dev.test.js:360-363` — Test result from performance operations.
- **result** — `mcp-methods-dev.test.js:369-372` — Test result from import/export operations.
- **result** — `mcp-methods-dev.test.js:384-387` — Test result from integration operations.
- **t** — `mcp-methods-dev.test.js:430-430` — Current test iteration counter.
- **test** — `mcp-methods-dev.test.js:431-435` — Single test case object from the test suite.
- **error** — `mcp-methods-dev.test.js:478-481` — Captured error object during test execution.
- **resolve** — `mcp-methods.test.js:43-72` — Promise resolver for successful server startup.
- **reject** — `mcp-methods.test.js:49-51` — Promise rejector for server startup timeout.
- **data** — `mcp-methods.test.js:53-62` — Handler for server initialization data events.
- **_data** — `mcp-methods.test.js:64-66` — Temporary buffer for collecting additional server output.
- **error** — `mcp-methods.test.js:68-71` — Error handler for server startup failures.
- **resolve** — `mcp-methods.test.js:76-107` — Promise resolver for successful request transmission.
- **reject** — `mcp-methods.test.js:87-89` — Promise rejector for request timeout.
- **data** — `mcp-methods.test.js:93-103` — Handler for server response data events.
- **result** — `mcp-methods.test.js:176-179` — Validation result for method parameter schemas.
- **result** — `mcp-methods.test.js:181-184` — Validation result for method return type schemas.
- **result** — `mcp-methods.test.js:190-193` — Test execution result with timing and response data.
- **result** — `mcp-methods.test.js:196-199` — Standardized test case result object.
- **result** — `mcp-methods.test.js:210-213` — Aggregated results from multiple test executions.
- **result** — `mcp-methods.test.js:225-228` — Test result with error information.
- **result** — `mcp-methods.test.js:236-239` — Test case result from resource manager operations.
- **result** — `mcp-methods.test.js:247-250` — Test result from graph storage operations.
- **result** — `mcp-methods.test.js:262-265` — Test result from semantic search operations.
- **result** — `mcp-methods.test.js:272-275` — Test result from knowledge bus operations.
- **result** — `mcp-methods.test.js:282-285` — Test result from database operations.
- **result** — `mcp-methods.test.js:292-295` — Test result from entity mutation operations.
- **result** — `mcp-methods.test.js:302-305` — Test result from relationship operations.
- **result** — `mcp-methods.test.js:318-321` — Test result from indexing operations.
- **result** — `mcp-methods.test.js:329-332` — Test result from validation operations.
- **result** — `mcp-methods.test.js:339-342` — Test result from caching operations.
- **result** — `mcp-methods.test.js:350-353` — Test result from metric collection.
- **result** — `mcp-methods.test.js:355-358` — Test result from monitoring operations.
- **result** — `mcp-methods.test.js:360-363` — Test result from performance operations.
- **result** — `mcp-methods.test.js:369-372` — Test result from import/export operations.
- **result** — `mcp-methods.test.js:384-387` — Test result from integration operations.
- **t** — `mcp-methods.test.js:430-430` — Current test iteration counter.
- **test** — `mcp-methods.test.js:431-435` — Single test case object from the test suite.
- **error** — `mcp-methods.test.js:478-481` — Captured error object during test execution.
- **expect** — `mcp-methods.test.ts:35-37` — Assertion function validating test expectations.
- **method** — `mcp-methods.test.ts:45-47` — Individual MCP method from the method collection.
- **expect** — `mcp-methods.test.ts:67-72` — Assertion validating core operations categorization.
- **method** — `mcp-methods.test.ts:69-71` — Core operation method being validated.
- **expect** — `mcp-methods.test.ts:74-79` — Assertion validating query operations categorization.
- **method** — `mcp-methods.test.ts:76-78` — Query operation method being validated.
- **expect** — `mcp-methods.test.ts:81-86` — Assertion validating graph info categorization.
- **method** — `mcp-methods.test.ts:83-85` — Graph info method being validated.
- **expect** — `mcp-methods.test.ts:88-93` — Assertion validating semantic operations categorization.
- **method** — `mcp-methods.test.ts:90-92` — Semantic operation method being validated.
- **expect** — `mcp-methods.test.ts:95-100` — Assertion validating monitoring operations categorization.
- **method** — `mcp-methods.test.ts:97-99` — Monitoring operation method being validated.
- **getGraphStorage** — `mcp-methods.test.ts:110-114` — Test setup obtaining graph storage instance.
- **getSQLiteManager** — `mcp-methods.test.ts:116-120` — Test setup obtaining SQLite manager instance.
- **resourceManager** — `mcp-methods.test.ts:122-126` — Test setup obtaining resource manager instance.
- **knowledgeBus** — `mcp-methods.test.ts:128-132` — Test setup obtaining knowledge bus instance.
- **resourceManager** — `mcp-methods.test.ts:136-155` — Resource manager being tested for storage and lifecycle management.
- **knowledgeBus** — `mcp-methods.test.ts:157-165` — Knowledge bus being tested for query statistics.
- **getSQLiteManager** — `mcp-methods.test.ts:167-177` — SQLite manager being tested for persistence.
- **getSQLiteManager** — `mcp-methods.test.ts:179-190` — SQLite manager being tested for metrics storage.
- **newMethods** — `mcp-methods.test.ts:196-200` — Array slice containing newly added methods.
- **method** — `mcp-methods.test.ts:197-199` — Individual new method being enumerated.
- **knowledgeBus** — `mcp-methods.test.ts:208-214** — Knowledge bus being tested for metric collection.
- **knowledgeBus** — `mcp-methods.test.ts:216-232** — Knowledge bus being tested for metrics retrieval.
- **{ getGraphStorage }** — `mcp-methods.test.ts:111-111` — Destructured import of graph storage factory.
- **{ getSQLiteManager }** — `mcp-methods.test.ts:117-117` — Destructured import of SQLite manager factory.
- **{ resourceManager }** — `mcp-methods.test.ts:123-123` — Destructured import of resource manager.
- **{ knowledgeBus }** — `mcp-methods.test.ts:129-129` — Destructured import of knowledge bus.
- **{ resourceManager }** — `mcp-methods.test.ts:137-137` — Destructured reference to resource manager in test.
- **{ knowledgeBus }** — `mcp-methods.test.ts:158-158` — Destructured reference to knowledge bus in test.
- **{ getSQLiteManager }** — `mcp-methods.test.ts:168-168` — Destructured reference to SQLite manager factory.
- **{ getGraphStorage }** — `mcp-methods.test.ts:169-169` — Destructured reference to graph storage factory.
- **{ getSQLiteManager }** — `mcp-methods.test.ts:180-180` — Destructured reference to SQLite manager factory.
- **{ getGraphStorage }** — `mcp-methods.test.ts:181-181` — Destructured reference to graph storage factory.
- **{ collectAgentMetrics }** — `mcp-methods.test.ts:203-203` — Destructured import of metrics collection function.
- **{ knowledgeBus }** — `mcp-methods.test.ts:209-209` — Destructured reference to knowledge bus in test.
- **{ knowledgeBus }** — `mcp-methods.test.ts:217-217` — Destructured reference to knowledge bus in test.
- **entries** — `mcp-methods.test.ts:223-223` — Enumerated entries from collected metrics.

## Design Notes

This module follows an internal-only design pattern with no public API exports. It is intended exclusively for testing MCP protocol implementations and verifying integration points with external systems. The module operates as a self-contained testing utility without exposing reusable abstractions.

## Dependencies

- MCP Protocol — for integration protocol validation
- External system APIs — validated through MCP tooling
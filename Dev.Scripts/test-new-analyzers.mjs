#!/usr/bin/env node
/**
 * Test Script for New Language Analyzers (Swift, Kotlin, CSS, HTML, Angular)
 * Tests UltraScript Tools MCP tools with Ollama embeddings
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const PROJECTS = {
	swift: "D:\\fabuza-iOS-Moderation",
	kotlin: "D:\\fabuza2-AndroidModeration",
};

const OLLAMA_CONFIG = {
	provider: "ollama",
	model: "ibm/granite-embedding:30m", // Fast English-only model
	enabled: true,
};

const RESULTS = {
	timestamp: new Date().toISOString(),
	projects: {},
};

// Utility: Execute MCP method via stdio
async function executeMCPMethod(method, params = {}) {
	return new Promise((resolve, reject) => {
		const request = {
			jsonrpc: "2.0",
			id: `test-${Date.now()}`,
			method: "tools/call",
			params: {
				name: method,
				arguments: params,
			},
		};

		const mcpProcess = spawn("node", ["dist/index.js"], {
			cwd: "D:\\OneDrive\\_mcp\\ultrascript-tools-mcp",
			env: {
				...process.env,
				MCP_EMBEDDING_PROVIDER: OLLAMA_CONFIG.provider,
				MCP_EMBEDDING_MODEL: OLLAMA_CONFIG.model,
				MCP_EMBEDDING_ENABLED: "true",
				NODE_ENV: "test",
			},
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let foundResponse = false;

		mcpProcess.stdout.on("data", (data) => {
			stdout += data.toString();
			const lines = stdout.split("\n");
			for (const line of lines) {
				if (line.trim() && !foundResponse) {
					try {
						const response = JSON.parse(line);
						if (response.id === request.id) {
							foundResponse = true;
							mcpProcess.kill();
							if (response.error) {
								reject(new Error(JSON.stringify(response.error)));
							} else {
								resolve(response.result);
							}
						}
					} catch (e) {
						// Not JSON, skip
					}
				}
			}
		});

		mcpProcess.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		mcpProcess.on("close", (code) => {
			if (!foundResponse) {
				reject(new Error(`Process exited with code ${code}\nStderr: ${stderr}`));
			}
		});

		setTimeout(() => {
			if (!foundResponse) {
				mcpProcess.kill();
				reject(new Error("Timeout waiting for MCP response"));
			}
		}, 120000); // 2 minutes timeout

		// Send request
		mcpProcess.stdin.write(JSON.stringify(request) + "\n");
		mcpProcess.stdin.end();
	});
}

// Test 1: Index Project
async function testIndex(projectName, projectPath) {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`TEST 1: Indexing ${projectName} Project`);
	console.log(`${"=".repeat(80)}`);
	console.log(`Path: ${projectPath}`);

	const startTime = Date.now();

	try {
		const result = await executeMCPMethod("index", {
			directory: projectPath,
			reset: true,
			fullScan: true,
			incremental: false,
		});

		const duration = ((Date.now() - startTime) / 1000).toFixed(2);

		console.log(`✅ SUCCESS - Indexed in ${duration}s`);
		console.log(`Files: ${result.filesProcessed || "N/A"}`);
		console.log(`Entities: ${result.entitiesCreated || "N/A"}`);
		console.log(`Relationships: ${result.relationshipsCreated || "N/A"}`);

		return {
			success: true,
			duration,
			filesProcessed: result.filesProcessed,
			entitiesCreated: result.entitiesCreated,
			relationshipsCreated: result.relationshipsCreated,
		};
	} catch (error) {
		console.log(`❌ FAILED: ${error.message}`);
		return { success: false, error: error.message };
	}
}

// Test 2: Get Graph Stats
async function testGetGraph(projectName) {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`TEST 2: Get Graph Statistics (${projectName})`);
	console.log(`${"=".repeat(80)}`);

	try {
		const result = await executeMCPMethod("get_graph_stats", {});

		console.log(`✅ SUCCESS`);
		console.log(`Total Entities: ${result.totalEntities || 0}`);
		console.log(`Total Relationships: ${result.totalRelationships || 0}`);
		console.log(`Entity Types:`, result.entityTypes || {});

		return { success: true, stats: result };
	} catch (error) {
		console.log(`❌ FAILED: ${error.message}`);
		return { success: false, error: error.message };
	}
}

// Test 3: List File Entities
async function testListFileEntities(projectName, projectPath, testFile) {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`TEST 3: List File Entities (${projectName})`);
	console.log(`${"=".repeat(80)}`);
	console.log(`File: ${testFile}`);

	try {
		const result = await executeMCPMethod("list_file_entities", {
			filePath: `${projectPath}/${testFile}`,
		});

		console.log(`✅ SUCCESS`);
		console.log(`Entities found: ${result.entities?.length || 0}`);
		if (result.entities && result.entities.length > 0) {
			result.entities.slice(0, 5).forEach((entity) => {
				console.log(`  - ${entity.type}: ${entity.name}`);
			});
		}

		return { success: true, entitiesFound: result.entities?.length || 0 };
	} catch (error) {
		console.log(`❌ FAILED: ${error.message}`);
		return { success: false, error: error.message };
	}
}

// Test 4: Semantic Search
async function testSemanticSearch(projectName, query) {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`TEST 4: Semantic Search (${projectName})`);
	console.log(`${"=".repeat(80)}`);
	console.log(`Query: "${query}"`);

	try {
		const result = await executeMCPMethod("semantic_search", {
			query,
			limit: 5,
		});

		console.log(`✅ SUCCESS`);
		console.log(`Results: ${result.results?.length || 0}`);
		if (result.results && result.results.length > 0) {
			result.results.forEach((res, idx) => {
				console.log(`  ${idx + 1}. ${res.entity?.name} (score: ${res.score?.toFixed(3)})`);
			});
		}

		return { success: true, resultsFound: result.results?.length || 0 };
	} catch (error) {
		console.log(`❌ FAILED: ${error.message}`);
		return { success: false, error: error.message };
	}
}

// Test 5: Detect Code Clones
async function testDetectClones(projectName) {
	console.log(`\n${"=".repeat(80)}`);
	console.log(`TEST 5: Detect Code Clones (${projectName})`);
	console.log(`${"=".repeat(80)}`);

	try {
		const result = await executeMCPMethod("detect_code_clones", {
			minSimilarity: 0.8,
			scope: "all",
		});

		console.log(`✅ SUCCESS`);
		console.log(`Clones detected: ${result.clones?.length || 0}`);

		return { success: true, clonesDetected: result.clones?.length || 0 };
	} catch (error) {
		console.log(`❌ FAILED: ${error.message}`);
		return { success: false, error: error.message };
	}
}

// Main test runner
async function runTests() {
	console.log("\n" + "=".repeat(80));
	console.log("🚀 TESTING NEW LANGUAGE ANALYZERS (Swift, Kotlin)");
	console.log("=".repeat(80));
	console.log(`Embedding Provider: ${OLLAMA_CONFIG.provider}`);
	console.log(`Model: ${OLLAMA_CONFIG.model}`);
	console.log("=".repeat(80));

	// Test Swift Project
	const swiftResults = {};
	swiftResults.index = await testIndex("Swift", PROJECTS.swift);
	if (swiftResults.index.success) {
		swiftResults.graph = await testGetGraph("Swift");
		swiftResults.fileEntities = await testListFileEntities(
			"Swift",
			PROJECTS.swift,
			"ModerationApp.swift",
		);
		swiftResults.semanticSearch = await testSemanticSearch("Swift", "user authentication");
		swiftResults.clones = await testDetectClones("Swift");
	}
	RESULTS.projects.swift = swiftResults;

	// Test Kotlin Project
	const kotlinResults = {};
	kotlinResults.index = await testIndex("Kotlin", PROJECTS.kotlin);
	if (kotlinResults.index.success) {
		kotlinResults.graph = await testGetGraph("Kotlin");
		kotlinResults.fileEntities = await testListFileEntities(
			"Kotlin",
			PROJECTS.kotlin,
			"MainActivity.kt",
		);
		kotlinResults.semanticSearch = await testSemanticSearch("Kotlin", "network request");
		kotlinResults.clones = await testDetectClones("Kotlin");
	}
	RESULTS.projects.kotlin = kotlinResults;

	// Generate report
	const reportPath = "TEST_RESULTS_NEW_ANALYZERS.md";
	generateReport(reportPath);

	console.log("\n" + "=".repeat(80));
	console.log(`📊 Full report saved to: ${reportPath}`);
	console.log("=".repeat(80));
}

function generateReport(filePath) {
	let report = `# Code Graph RAG - New Analyzers Test Report

**Date:** ${RESULTS.timestamp}
**Embedding Provider:** ${OLLAMA_CONFIG.provider}
**Model:** ${OLLAMA_CONFIG.model}

---

## 📊 Summary

| Project | Index | Graph Stats | File Entities | Semantic Search | Clone Detection |
|---------|-------|-------------|---------------|-----------------|-----------------|
`;

	for (const [proj, results] of Object.entries(RESULTS.projects)) {
		const row = `| ${proj.toUpperCase()} | ${results.index?.success ? "✅" : "❌"} | ${results.graph?.success ? "✅" : "❌"} | ${results.fileEntities?.success ? "✅" : "❌"} | ${results.semanticSearch?.success ? "✅" : "❌"} | ${results.clones?.success ? "✅" : "❌"} |
`;
		report += row;
	}

	report += `\n---\n\n## 🔍 Detailed Results\n\n`;

	for (const [proj, results] of Object.entries(RESULTS.projects)) {
		report += `### ${proj.toUpperCase()} Project\n\n`;

		if (results.index) {
			report += `**Indexing:**\n`;
			report += `- Status: ${results.index.success ? "✅ Success" : "❌ Failed"}\n`;
			if (results.index.success) {
				report += `- Duration: ${results.index.duration}s\n`;
				report += `- Files Processed: ${results.index.filesProcessed}\n`;
				report += `- Entities Created: ${results.index.entitiesCreated}\n`;
				report += `- Relationships: ${results.index.relationshipsCreated}\n`;
			} else {
				report += `- Error: ${results.index.error}\n`;
			}
			report += `\n`;
		}

		if (results.graph) {
			report += `**Graph Statistics:**\n`;
			report += `- Total Entities: ${results.graph.stats?.totalEntities || 0}\n`;
			report += `- Total Relationships: ${results.graph.stats?.totalRelationships || 0}\n`;
			report += `\n`;
		}

		if (results.fileEntities) {
			report += `**File Entities:**\n`;
			report += `- Entities Found: ${results.fileEntities.entitiesFound || 0}\n`;
			report += `\n`;
		}

		if (results.semanticSearch) {
			report += `**Semantic Search:**\n`;
			report += `- Results Found: ${results.semanticSearch.resultsFound || 0}\n`;
			report += `\n`;
		}

		if (results.clones) {
			report += `**Clone Detection:**\n`;
			report += `- Clones Detected: ${results.clones.clonesDetected || 0}\n`;
			report += `\n`;
		}

		report += `---\n\n`;
	}

	writeFileSync(filePath, report, "utf-8");
}

// Run all tests
runTests().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});

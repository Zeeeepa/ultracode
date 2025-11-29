/**
 * Examples: Code Modification Features
 *
 * This file demonstrates how to use the new code modification tools:
 * - Version Manager (snapshots and rollback)
 * - Code Modifier (entity-based code replacement)
 * - File Operations (copy, rename, split, synthesize)
 */

// =============================================================================
// 1. VERSION MANAGER - Safe Code Modifications with Rollback
// =============================================================================

/**
 * Example 1: Create a snapshot before risky changes
 */
async function example1_createSnapshot() {
  // Create snapshot of specific files
  const result = await mcpClient.callTool("create_snapshot", {
    description: "Before refactoring authentication module",
    files: ["src/auth/login.ts", "src/auth/register.ts", "src/auth/middleware.ts"],
  });

  console.log("Snapshot created:", result.snapshotId);
  // Output: { success: true, snapshotId: "snap_20250117_143022", ... }
}

/**
 * Example 2: List available snapshots
 */
async function example2_listSnapshots() {
  const result = await mcpClient.callTool("list_snapshots", {
    limit: 10,
  });

  console.log(`Found ${result.count} snapshots:`);
  result.snapshots.forEach((snap) => {
    console.log(`  ${snap.id}: ${snap.description} (${snap.timestamp})`);
  });
}

/**
 * Example 3: Rollback to previous snapshot
 */
async function example3_rollback() {
  // Something went wrong, rollback!
  const result = await mcpClient.callTool("rollback_snapshot", {
    snapshotId: "snap_20250117_143022",
  });

  console.log("Rollback successful:", result.message);
}

/**
 * Example 4: Cleanup old snapshots
 */
async function example4_cleanup() {
  const result = await mcpClient.callTool("cleanup_snapshots", {
    olderThanDays: 30,
  });

  console.log(`Deleted ${result.deletedCount} old snapshots`);
}

// =============================================================================
// 2. CODE MODIFIER - Entity-based Code Replacement
// =============================================================================

/**
 * Example 5: Preview code modification (safe by default)
 */
async function example5_previewModification() {
  // First, find the entity to modify
  const entities = await mcpClient.callTool("list_file_entities", {
    filePath: "src/utils/helpers.ts",
  });

  const calculateTotalEntity = entities.find((e) => e.name === "calculateTotal" && e.type === "function");

  // Preview the change (default: preview=true)
  const result = await mcpClient.callTool("modify_entity_code", {
    entityId: calculateTotalEntity.id,
    newCode: `
export function calculateTotal(items: Item[]): number {
  // Improved implementation with reduce
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}`,
    preview: true, // Shows diff without applying
  });

  console.log("Preview:");
  console.log(result.preview.changes);
  console.log(`Impact: ${result.preview.estimatedImpact.entitiesAffected} entities affected`);
}

/**
 * Example 6: Apply code modification with validation
 */
async function example6_applyModification() {
  // Apply the change (creates automatic snapshot)
  const result = await mcpClient.callTool("modify_entity_code", {
    entityId: "entity_abc123",
    newCode: `
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}`,
    preview: false, // Actually apply changes
    preserveComments: true,
    updateImports: true,
    skipValidation: false,
  });

  console.log("Modification applied:");
  console.log(`  Files modified: ${result.filesModified.join(", ")}`);
  console.log(`  Embeddings updated: ${result.embeddingsUpdated}`);
  console.log(`  Snapshot ID: ${result.snapshotId}`);

  // Check validation report
  if (result.validationReport) {
    console.log(`  Before: ${result.validationReport.before.summary.errors} errors`);
    console.log(`  After: ${result.validationReport.after.summary.errors} errors`);
    console.log(`  Net change: ${result.validationReport.improvement.netChange}`);
  }
}

// =============================================================================
// 3. FILE OPERATIONS - Token-Efficient File Manipulation
// =============================================================================

/**
 * Example 7: Copy file with graph updates
 */
async function example7_copyFile() {
  const result = await mcpClient.callTool("copy_file", {
    source: "src/components/Button.tsx",
    target: "src/components/IconButton.tsx",
    preview: false,
    updateGraph: true,
  });

  console.log(`Copied file:`);
  console.log(`  ${result.filesAffected.length} files affected`);
  console.log(`  ${result.entitiesAffected} entities duplicated in graph`);
}

/**
 * Example 8: Rename file with automatic import updates
 */
async function example8_renameFile() {
  const result = await mcpClient.callTool("rename_file", {
    oldPath: "src/utils/string-helpers.ts",
    newPath: "src/utils/text-utilities.ts",
    preview: false,
    updateImports: true, // Automatically updates all import statements!
    updateGraph: true,
  });

  console.log(`Renamed file:`);
  console.log(`  ${result.filesAffected.length} files affected`);
  console.log(`  ${result.entitiesAffected} entities updated in graph`);
  console.log(`  All imports automatically updated across project`);
}

/**
 * Example 9: Split large file into smaller modules
 */
async function example9_splitFile() {
  // Find entities to extract
  const entities = await mcpClient.callTool("list_file_entities", {
    filePath: "src/utils/helpers.ts",
  });

  // Extract UserHelper and OrderHelper classes to separate files
  const userHelperEntity = entities.find((e) => e.name === "UserHelper");
  const orderHelperEntity = entities.find((e) => e.name === "OrderHelper");

  const result = await mcpClient.callTool("split_file", {
    filePath: "src/utils/helpers.ts",
    entityIds: [userHelperEntity.id, orderHelperEntity.id],
    preview: false,
    updateGraph: true,
  });

  console.log(`Split file into ${result.filesAffected.length} files:`);
  result.filesAffected.forEach((f) => console.log(`  - ${f}`));
}

/**
 * Example 10: Synthesize multiple files into one
 */
async function example10_synthesizeFiles() {
  const result = await mcpClient.callTool("synthesize_files", {
    files: ["src/models/user/User.ts", "src/models/user/UserProfile.ts", "src/models/user/UserSettings.ts"],
    targetPath: "src/models/User.ts",
    preview: false,
    deleteOriginals: true, // Clean up old files
    updateGraph: true,
  });

  console.log(`Synthesized ${result.filesAffected.length - 1} files into one:`);
  console.log(`  Target: ${result.filesAffected[result.filesAffected.length - 1]}`);
  console.log(`  ${result.entitiesAffected} entities merged in graph`);
}

// =============================================================================
// 4. ADVANCED WORKFLOWS
// =============================================================================

/**
 * Example 11: Safe refactoring workflow
 */
async function example11_safeRefactoring() {
  // Step 1: Create snapshot
  const snapshot = await mcpClient.callTool("create_snapshot", {
    description: "Before refactoring payment module",
    files: ["src/payment/**"],
  });

  try {
    // Step 2: Preview changes
    const _preview = await mcpClient.callTool("modify_entity_code", {
      entityId: "payment_process_entity",
      newCode: "// new implementation",
      preview: true,
    });

    console.log("Preview looks good, applying...");

    // Step 3: Apply changes
    const result = await mcpClient.callTool("modify_entity_code", {
      entityId: "payment_process_entity",
      newCode: "// new implementation",
      preview: false,
    });

    // Step 4: Check validation
    if (result.validationReport.improvement.netChange > 0) {
      console.log("⚠️ Validation issues increased, rolling back...");
      await mcpClient.callTool("rollback_snapshot", {
        snapshotId: snapshot.snapshotId,
      });
    } else {
      console.log("✅ Refactoring successful!");
    }
  } catch (_error) {
    console.error("Error during refactoring, rolling back...");
    await mcpClient.callTool("rollback_snapshot", {
      snapshotId: snapshot.snapshotId,
    });
  }
}

/**
 * Example 12: Batch file restructuring
 */
async function example12_batchRestructure() {
  // Reorganize project structure
  const operations = [
    { old: "src/helpers/userHelpers.ts", new: "src/utils/user.ts" },
    { old: "src/helpers/orderHelpers.ts", new: "src/utils/order.ts" },
    { old: "src/helpers/paymentHelpers.ts", new: "src/utils/payment.ts" },
  ];

  // Create snapshot before batch operations
  const _snapshot = await mcpClient.callTool("create_snapshot", {
    description: "Before batch restructure",
  });

  for (const op of operations) {
    await mcpClient.callTool("rename_file", {
      oldPath: op.old,
      newPath: op.new,
      preview: false,
      updateImports: true,
    });
  }

  console.log(`✅ Restructured ${operations.length} files with automatic import updates`);
}

export {
  example1_createSnapshot,
  example2_listSnapshots,
  example3_rollback,
  example4_cleanup,
  example5_previewModification,
  example6_applyModification,
  example7_copyFile,
  example8_renameFile,
  example9_splitFile,
  example10_synthesizeFiles,
  example11_safeRefactoring,
  example12_batchRestructure,
};

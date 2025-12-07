/**
 * Git Hook Installer for AutoDoc
 *
 * Installs pre-commit hook for reference validation.
 *
 * Architecture References:
 * - Types: src/autodoc/types.ts
 * - RFC: docs/design/documentation-layer-rfc.md
 */

import { exec } from "node:child_process";
import { chmod, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileExists, mkdir, readText, rm } from "../../utils/file-ops.js";

const execAsync = promisify(exec);

export interface HookInstallResult {
  success: boolean;
  installed: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Pre-commit hook script template
 */
const PRE_COMMIT_HOOK = `#!/bin/sh
#
# AutoDoc pre-commit hook
# Validates documentation references before commit
#

# Check if autodoc is enabled
if [ ! -f ".autodoc/autodoc.json" ]; then
  exit 0
fi

# Run validation via MCP (requires ultrascript-tools-mcp in PATH)
# For now, just warn about staged .md files
MD_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.md$')

if [ -n "$MD_FILES" ]; then
  echo "AutoDoc: Checking staged documentation files..."
  # In the future, this will call the MCP server for full validation
  # For now, we just remind to validate
  echo "  Staged .md files:"
  echo "$MD_FILES" | while read file; do
    echo "    - $file"
  done
  echo "  Tip: Run 'autodoc_validate' to check references"
fi

exit 0
`;

/**
 * Get git hooks directory
 */
export async function getGitHooksDir(projectPath: string): Promise<string | null> {
  try {
    // Check if .git directory exists
    const gitDir = path.join(projectPath, ".git");
    if (!(await fileExists(gitDir))) {
      return null;
    }

    // Check for custom hooks path
    try {
      const { stdout } = await execAsync("git config core.hooksPath", { cwd: projectPath });
      const customPath = stdout.trim();
      if (customPath) {
        return path.isAbsolute(customPath) ? customPath : path.join(projectPath, customPath);
      }
    } catch {
      // No custom hooks path, use default
    }

    return path.join(gitDir, "hooks");
  } catch {
    return null;
  }
}

/**
 * Check if hook is already installed
 */
export async function isHookInstalled(hooksDir: string, hookName: string): Promise<boolean> {
  const hookPath = path.join(hooksDir, hookName);
  try {
    if (!(await fileExists(hookPath))) {
      return false;
    }
    const content = await readText(hookPath);
    return content.includes("AutoDoc");
  } catch {
    return false;
  }
}

/**
 * Install pre-commit hook
 */
export async function installPreCommitHook(projectPath: string): Promise<HookInstallResult> {
  const result: HookInstallResult = {
    success: true,
    installed: [],
    skipped: [],
    errors: [],
  };

  const hooksDir = await getGitHooksDir(projectPath);
  if (!hooksDir) {
    result.success = false;
    result.errors.push("Not a git repository");
    return result;
  }

  // Ensure hooks directory exists
  try {
    await mkdir(hooksDir, { recursive: true });
  } catch (error) {
    result.success = false;
    result.errors.push(`Failed to create hooks directory: ${(error as Error).message}`);
    return result;
  }

  const hookPath = path.join(hooksDir, "pre-commit");

  // Helper to write hook with executable permission
  const writeHookFile = async (content: string) => {
    await fsWriteFile(hookPath, content, "utf-8");
    await chmod(hookPath, 0o755);
  };

  // Check if hook already exists
  if (await fileExists(hookPath)) {
    try {
      const existing = await readText(hookPath);

      if (existing.includes("AutoDoc")) {
        result.skipped.push("pre-commit (already installed)");
        return result;
      }

      // Append to existing hook
      const combined = existing.trim() + "\n\n" + PRE_COMMIT_HOOK;
      await writeHookFile(combined);
      result.installed.push("pre-commit (appended)");
    } catch (error) {
      result.errors.push(`Failed to update hook: ${(error as Error).message}`);
    }
  } else {
    // Hook doesn't exist, create new
    await writeHookFile(PRE_COMMIT_HOOK);
    result.installed.push("pre-commit (created)");
  }

  return result;
}

/**
 * Uninstall AutoDoc hooks
 */
export async function uninstallHooks(projectPath: string): Promise<HookInstallResult> {
  const result: HookInstallResult = {
    success: true,
    installed: [],
    skipped: [],
    errors: [],
  };

  const hooksDir = await getGitHooksDir(projectPath);
  if (!hooksDir) {
    result.errors.push("Not a git repository");
    return result;
  }

  const hookPath = path.join(hooksDir, "pre-commit");

  if (!(await fileExists(hookPath))) {
    result.skipped.push("pre-commit (not found)");
    return result;
  }

  try {
    const existing = await readText(hookPath);

    if (!existing.includes("AutoDoc")) {
      result.skipped.push("pre-commit (not installed)");
      return result;
    }

    // Remove AutoDoc section
    const lines = existing.split("\n");
    const newLines: string[] = [];
    let inAutoDocSection = false;

    for (const line of lines) {
      if (line.includes("AutoDoc pre-commit hook")) {
        inAutoDocSection = true;
        continue;
      }
      if (inAutoDocSection && line === "exit 0") {
        inAutoDocSection = false;
        continue;
      }
      if (!inAutoDocSection) {
        newLines.push(line);
      }
    }

    const newContent = newLines.join("\n").trim();

    if (newContent === "#!/bin/sh" || newContent === "") {
      // Remove empty hook file
      await rm(hookPath);
      result.installed.push("pre-commit (removed)");
    } else {
      await fsWriteFile(hookPath, newContent, "utf-8");
      await chmod(hookPath, 0o755);
      result.installed.push("pre-commit (cleaned)");
    }
  } catch {
    result.skipped.push("pre-commit (not found)");
  }

  return result;
}

/**
 * Get hook installation status
 */
export async function getHookStatus(projectPath: string): Promise<{
  gitRepo: boolean;
  hooksDir: string | null;
  preCommit: boolean;
}> {
  const hooksDir = await getGitHooksDir(projectPath);

  return {
    gitRepo: hooksDir !== null,
    hooksDir,
    preCommit: hooksDir ? await isHookInstalled(hooksDir, "pre-commit") : false,
  };
}

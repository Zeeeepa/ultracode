/**
 * MCP config auto-installer for AI coding agents.
 *
 * Detects installed AI agents and adds UltraCode MCP server entry
 * to each agent's config. Called at the end of setup wizard.
 *
 * Ported from ultracode.zig/src/cli/mcp_installer.zig
 *
 * Supported agents:
 *   - Claude Code       (~/.claude.json)
 *   - Cursor            (~/.cursor/mcp.json)
 *   - Windsurf          (~/.codeium/windsurf/mcp_config.json)
 *   - VS Code           (platform-specific mcp.json)
 *   - Copilot CLI       (~/.copilot/mcp-config.json)
 *   - Zed               (platform-specific settings.json)
 *   - Codex CLI         (~/.codex/config.toml)
 *   - OpenCode          (platform-specific opencode.json)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { c, printInfo, prompt } from "./setup-ui.js";

const ENTRY_NAME = "ultracode";

// ═══════════════════════════════════════════════════════════════
// Agent definitions
// ═══════════════════════════════════════════════════════════════

type EntryStyle = "standard" | "with_type" | "zed" | "opencode" | "toml";

interface AgentDef {
  name: string;
  detectDir: string;
  configFile: string;
  serversKey: string;
  style: EntryStyle;
}

function getAgents(): AgentDef[] {
  const home = homedir();
  const plat = platform();
  const appdata = process.env["APPDATA"] || "";
  const agents: AgentDef[] = [];

  // Claude Code
  agents.push({
    name: "Claude Code",
    detectDir: join(home, ".claude"),
    configFile: join(home, ".claude.json"),
    serversKey: "mcpServers",
    style: "with_type",
  });

  // Cursor
  agents.push({
    name: "Cursor",
    detectDir: join(home, ".cursor"),
    configFile: join(home, ".cursor", "mcp.json"),
    serversKey: "mcpServers",
    style: "standard",
  });

  // Windsurf
  agents.push({
    name: "Windsurf",
    detectDir: join(home, ".codeium", "windsurf"),
    configFile: join(home, ".codeium", "windsurf", "mcp_config.json"),
    serversKey: "mcpServers",
    style: "standard",
  });

  // VS Code
  if (plat === "win32") {
    agents.push({
      name: "VS Code",
      detectDir: join(appdata, "Code", "User"),
      configFile: join(appdata, "Code", "User", "mcp.json"),
      serversKey: "servers",
      style: "with_type",
    });
  } else if (plat === "darwin") {
    agents.push({
      name: "VS Code",
      detectDir: join(home, "Library", "Application Support", "Code", "User"),
      configFile: join(home, "Library", "Application Support", "Code", "User", "mcp.json"),
      serversKey: "servers",
      style: "with_type",
    });
  } else {
    agents.push({
      name: "VS Code",
      detectDir: join(home, ".config", "Code", "User"),
      configFile: join(home, ".config", "Code", "User", "mcp.json"),
      serversKey: "servers",
      style: "with_type",
    });
  }

  // Copilot CLI
  agents.push({
    name: "Copilot CLI",
    detectDir: join(home, ".copilot"),
    configFile: join(home, ".copilot", "mcp-config.json"),
    serversKey: "mcpServers",
    style: "with_type",
  });

  // Zed
  if (plat === "win32") {
    agents.push({
      name: "Zed",
      detectDir: join(appdata, "Zed"),
      configFile: join(appdata, "Zed", "settings.json"),
      serversKey: "context_servers",
      style: "zed",
    });
  } else if (plat === "darwin") {
    agents.push({
      name: "Zed",
      detectDir: join(home, "Library", "Application Support", "Zed"),
      configFile: join(home, "Library", "Application Support", "Zed", "settings.json"),
      serversKey: "context_servers",
      style: "zed",
    });
  } else {
    agents.push({
      name: "Zed",
      detectDir: join(home, ".config", "zed"),
      configFile: join(home, ".config", "zed", "settings.json"),
      serversKey: "context_servers",
      style: "zed",
    });
  }

  // Codex CLI
  agents.push({
    name: "Codex CLI",
    detectDir: join(home, ".codex"),
    configFile: join(home, ".codex", "config.toml"),
    serversKey: "",
    style: "toml",
  });

  // OpenCode
  if (plat === "win32") {
    agents.push({
      name: "OpenCode",
      detectDir: join(appdata, "opencode"),
      configFile: join(appdata, "opencode", "opencode.json"),
      serversKey: "mcp",
      style: "opencode",
    });
  } else {
    agents.push({
      name: "OpenCode",
      detectDir: join(home, ".config", "opencode"),
      configFile: join(home, ".config", "opencode", "opencode.json"),
      serversKey: "mcp",
      style: "opencode",
    });
  }

  return agents;
}

// ═══════════════════════════════════════════════════════════════
// Detection
// ═══════════════════════════════════════════════════════════════

interface AgentStatus {
  agent: AgentDef;
  alreadyConfigured: boolean;
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function detectAgents(): AgentStatus[] {
  const agents = getAgents();
  const results: AgentStatus[] = [];

  for (const agent of agents) {
    if (!existsSync(agent.detectDir)) continue;

    let alreadyConfigured = false;

    if (existsSync(agent.configFile)) {
      try {
        const content = stripBom(readFileSync(agent.configFile, "utf-8"));
        const entryName = getEntryName(agent);

        if (agent.style === "toml") {
          alreadyConfigured = content.includes(`[mcp_servers.${entryName}]`);
        } else {
          // Quick string check — works for JSONC with comments too
          alreadyConfigured = content.includes(`"${entryName}"`);
        }
      } catch {
        // Can't read — treat as not configured
      }
    }

    results.push({ agent, alreadyConfigured });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// JSON entry builders
// ═══════════════════════════════════════════════════════════════

function buildJsonEntry(style: EntryStyle, command: string): Record<string, unknown> {
  switch (style) {
    case "standard":
      // Cursor, Windsurf: { "command": "...", "args": ["--stdio"] }
      return { command, args: ["--stdio"] };
    case "with_type":
      // Claude Code, VS Code, Copilot CLI: { "type": "stdio", "command": "...", "args": ["--stdio"] }
      return { type: "stdio", command, args: ["--stdio"] };
    case "zed":
      // Zed: { "command": { "path": "...", "args": ["--stdio"] }, "settings": {} }
      return { command: { path: command, args: ["--stdio"] }, settings: {} };
    case "opencode":
      // OpenCode: { "type": "local", "command": ["...", "--stdio"] }
      return { type: "local", command: [command, "--stdio"] };
    default:
      return { command, args: ["--stdio"] };
  }
}

// ═══════════════════════════════════════════════════════════════
// Installation
// ═══════════════════════════════════════════════════════════════

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function installJson(agent: AgentDef, command: string): "added" | "already_exists" | "error" {
  const entryName = getEntryName(agent);
  let config: Record<string, unknown> = {};

  if (existsSync(agent.configFile)) {
    try {
      const raw = stripBom(readFileSync(agent.configFile, "utf-8"));
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Parse failed — check string fallback (JSONC with comments)
      try {
        const raw = readFileSync(agent.configFile, "utf-8");
        if (raw.includes(`"${entryName}"`)) return "already_exists";
      } catch {}
      // Start fresh
      config = {};
    }
  }

  // Navigate to servers section
  const key = agent.serversKey;
  if (!config[key] || typeof config[key] !== "object" || Array.isArray(config[key])) {
    config[key] = {};
  }

  const servers = config[key] as Record<string, unknown>;
  if (servers[entryName]) return "already_exists";

  // Add entry
  servers[entryName] = buildJsonEntry(agent.style, command);

  ensureParentDir(agent.configFile);
  writeFileSync(agent.configFile, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return "added";
}

function installToml(agent: AgentDef, command: string): "added" | "already_exists" | "error" {
  const entryName = getEntryName(agent);
  let content = "";

  if (existsSync(agent.configFile)) {
    content = readFileSync(agent.configFile, "utf-8");
    if (content.includes(`[mcp_servers.${entryName}]`)) return "already_exists";
  }

  // Append TOML section
  let toml = content;
  if (toml.length > 0 && !toml.endsWith("\n")) toml += "\n";
  if (toml.length > 0) toml += "\n";

  const escaped = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  toml += `[mcp_servers.${entryName}]\n`;
  toml += `command = "${escaped}"\n`;
  toml += `args = ["--stdio"]\n`;

  ensureParentDir(agent.configFile);
  writeFileSync(agent.configFile, toml, "utf-8");
  return "added";
}

function installToAgent(agent: AgentDef, command: string): "added" | "already_exists" | "error" {
  try {
    return agent.style === "toml" ? installToml(agent, command) : installJson(agent, command);
  } catch {
    return "error";
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

export async function installMcpConfigs(): Promise<void> {
  const statuses = detectAgents();

  if (statuses.length === 0) {
    console.error(`\n  ${c.dim}No AI agents detected${c.reset}`);
    return;
  }

  const notConfigured = statuses.filter((s) => !s.alreadyConfigured);

  // Header
  console.error(`\n${c.bright}--- Detected AI agents ---${c.reset}\n`);

  // Show status for each
  for (const s of statuses) {
    if (s.alreadyConfigured) {
      console.error(`  ${c.green}\u2713${c.reset} ${s.agent.name} \u2014 MCP installed`);
    } else {
      console.error(`  ${c.yellow}\u25CB${c.reset} ${s.agent.name} \u2014 not configured`);
    }
  }

  // All already configured — nothing to do
  if (notConfigured.length === 0) {
    console.error("");
    return;
  }

  console.error("");

  // Non-interactive — auto-install
  if (!process.stdin.isTTY) {
    performInstall(notConfigured);
    return;
  }

  // Ask user
  const names = notConfigured.map((s) => s.agent.name).join(", ");
  const answer = await prompt(`  Install UltraCode MCP to ${names}? [Y/n]: `);

  if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
    printInfo("Skipped MCP installation");
    return;
  }

  performInstall(notConfigured);
}

/**
 * Get the native comm proxy binary name for the current platform.
 * Falls back to cosmopolitan ultracode.com if native binary not found.
 */
function getNativeBinaryName(): string {
  const plat = platform();
  const { arch } = require("node:os");
  const a = arch();

  if (plat === "win32") return "ultracode-win32-x64.exe";
  if (plat === "darwin" && a === "arm64") return "ultracode-darwin-arm64";
  if (plat === "darwin") return "ultracode-darwin-x64";
  if (plat === "linux" && a === "arm64") return "ultracode-linux-arm64";
  return "ultracode-linux-x64";
}

/**
 * Determine the MCP command for a given agent.
 *
 * Priority:
 *   1. Native platform binary (ultracode-{os}-{arch}) — no Cosmopolitan dependency
 *   2. Cosmopolitan binary (ultracode.com / ultracode.cmd) — fallback
 *
 * For Claude Code specifically, the entry is registered as "ultracode.ts"
 * (since "ultracode" is already taken by the zig version).
 */
function getCommandForAgent(_agent: AgentDef): string {
  // Try native binary first
  const nativeName = getNativeBinaryName();
  const nativePath = join(__dirname, "..", "..", nativeName);
  if (existsSync(nativePath)) return nativePath;

  // Check in dist/ (development)
  const distPath = join(__dirname, "..", "..", "..", "dist", nativeName);
  if (existsSync(distPath)) return distPath;

  // Fallback to cosmopolitan binary
  return platform() === "win32" ? "ultracode.cmd" : "ultracode.com";
}

/**
 * Get the MCP entry name for a given agent.
 * Claude Code uses "ultracode.ts" to avoid conflict with zig version.
 */
function getEntryName(agent: AgentDef): string {
  return agent.name === "Claude Code" ? "ultracode.ts" : ENTRY_NAME;
}

function performInstall(targets: AgentStatus[]): void {
  console.error("");
  for (const s of targets) {
    const command = getCommandForAgent(s.agent);
    const result = installToAgent(s.agent, command);
    switch (result) {
      case "added":
        console.error(`  ${c.green}+${c.reset} ${s.agent.name} \u2014 MCP added`);
        break;
      case "already_exists":
        console.error(`  ${c.green}\u2713${c.reset} ${s.agent.name} \u2014 already configured`);
        break;
      case "error":
        console.error(`  ${c.red}!${c.reset} ${s.agent.name} \u2014 error writing config`);
        break;
    }
  }
  console.error("");
}

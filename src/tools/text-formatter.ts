/**
 * Generic JSON → human-readable text formatter for MCP tool responses.
 *
 * Synced with Zig's text_formatter.zig — text is the DEFAULT output.
 * JSON only returned when _format=json is explicitly requested.
 *
 * Text format (terminal-friendly):
 * - Keys → UPPER CASE ("file_path" → "FILE PATH", "fileName" → "FILENAME")
 * - Scalars → "KEY: value"
 * - Arrays of objects → fixed-width column table with ─ separator
 * - Arrays of primitives → comma-separated inline
 * - Nested objects → indented with UPPER CASE header
 * - bool → "yes"/"no", null → "-"
 * - NO markdown syntax (no | tables, no ## headers)
 *
 * Markdown format (for _format=markdown):
 * - Keys as **bold**, tables with | syntax
 * - Arrays of objects → markdown tables
 * - Nested objects → bullet lists
 */

/** Maximum display width for tables and wrapped output. */
const MAX_WIDTH = 140;

/** Keys to skip in auto-formatted output. */
const SKIP_KEYS = new Set(["success", "_text", "_markdown", "_json", "_format"]);

/** Max items in a table before truncation. */
const MAX_TABLE_ROWS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// TEXT FORMAT (default — terminal-friendly, NO markdown)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert any JSON data to terminal-friendly plain text.
 * Matches Zig's text_formatter.formatAsText().
 */
export function formatAsText(data: unknown): string {
  if (data === null || data === undefined) return "";
  if (typeof data !== "object") return String(data);

  if (Array.isArray(data)) {
    // Top-level array
    return formatTextTable(data, MAX_WIDTH);
  }

  const obj = data as Record<string, unknown>;

  // Error case: ✗ message
  if (obj["success"] === false) {
    const errMsg = typeof obj["error"] === "string" ? obj["error"] : "operation failed";
    return `✗ ${errMsg}`;
  }

  // Normal object → key-value pairs
  return formatTextObject(obj, 0);
}

/**
 * Format object as text with indented key-value pairs.
 */
function formatTextObject(obj: Record<string, unknown>, indent: number): string {
  const lines: string[] = [];
  const pad = " ".repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;

    const upper = keyToUpper(key);

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      // Array of objects → table
      if (typeof value[0] === "object" && value[0] !== null && !Array.isArray(value[0])) {
        lines.push(`${pad}${upper} (${value.length})`);
        lines.push(formatTextTable(value, MAX_WIDTH - indent));
      } else {
        // Array of primitives → comma-separated
        const items = value.map((v) => valueToStr(v));
        lines.push(`${pad}${upper}: ${items.join(", ")}`);
      }
    } else if (typeof value === "object") {
      lines.push(`${pad}${upper}:`);
      lines.push(formatTextObject(value as Record<string, unknown>, indent + 2));
    } else {
      lines.push(`${pad}${upper}: ${valueToStr(value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format array of objects as a fixed-width text table.
 * Matches Zig's formatTable().
 */
function formatTextTable(items: unknown[], width: number): string {
  if (items.length === 0) return "";

  const first = items[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    // Array of primitives — one per line
    return items.map((item) => `  ${valueToStr(item)}`).join("\n");
  }

  // Collect column names from first object
  const colNames: string[] = [];
  for (const key of Object.keys(first as Record<string, unknown>)) {
    if (!SKIP_KEYS.has(key)) {
      colNames.push(key);
    }
  }
  if (colNames.length === 0) return "";

  // Build cell values: rows × cols
  const rows: string[][] = [];
  const displayItems = items.slice(0, MAX_TABLE_ROWS);
  for (const item of displayItems) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const row = colNames.map((col) => valueToStr(obj[col]));
    rows.push(row);
  }

  // Compute column widths
  const colWidths = colNames.map((name) => name.length);
  for (const row of rows) {
    for (let ci = 0; ci < colNames.length; ci++) {
      colWidths[ci] = Math.max(colWidths[ci]!, row[ci]!.length);
    }
  }

  // Shrink columns to fit width (2 spaces gap between columns)
  const gap = 2;
  const total = colWidths.reduce((s, w) => s + w, 0) + (colNames.length - 1) * gap;
  if (total > width && colNames.length > 1) {
    const excess = total - width;
    let shrinkable = 0;
    for (const cw of colWidths) {
      if (cw > 12) shrinkable += cw - 12;
    }
    if (shrinkable > 0) {
      let remaining = excess;
      for (let i = 0; i < colWidths.length; i++) {
        if (colWidths[i]! > 12 && remaining > 0) {
          const take = Math.min(remaining, Math.floor(((colWidths[i]! - 12) * excess) / shrinkable) + 1);
          const shrink = Math.min(take, colWidths[i]! - 12);
          colWidths[i]! -= shrink;
          remaining -= shrink;
        }
      }
    }
  }

  const lines: string[] = [];

  // Header (UPPER CASE)
  const headerCells = colNames.map((name, ci) => writeColumn(keyToUpper(name), colWidths[ci]!));
  lines.push(headerCells.join("  "));

  // Separator ─
  const sepWidth = colWidths.reduce((s, w) => s + w, 0) + (colNames.length - 1) * gap;
  lines.push("─".repeat(Math.min(MAX_WIDTH, sepWidth)));

  // Rows
  for (const row of rows) {
    const cells = row.map((cell, ci) => writeColumn(cell, colWidths[ci]!));
    lines.push(cells.join("  "));
  }

  if (items.length > MAX_TABLE_ROWS) {
    lines.push(`... +${items.length - MAX_TABLE_ROWS} more`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN FORMAT (_format=markdown)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert any JSON data to markdown format.
 * Matches Zig's text_formatter.formatAsMarkdown().
 */
export function formatAsMarkdown(data: unknown): string {
  if (data === null || data === undefined) return "";
  if (typeof data !== "object") return String(data);

  if (Array.isArray(data)) {
    return formatMarkdownTable(data);
  }

  const obj = data as Record<string, unknown>;

  // Error case
  if (obj["success"] === false) {
    const errMsg = typeof obj["error"] === "string" ? obj["error"] : "operation failed";
    return `**Error:** ${errMsg}`;
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;

    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      // Array of objects → markdown table
      const upper = keyToUpper(key);
      lines.push("");
      lines.push(`### ${upper} (${value.length})`);
      lines.push("");
      lines.push(formatMarkdownTable(value));
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const upper = keyToUpper(key);
      lines.push("");
      lines.push(`**${upper}:**`);
      lines.push(formatMarkdownObject(value as Record<string, unknown>));
    } else {
      lines.push(`**${key}:** ${valueToStr(value)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Format array of objects as a markdown table.
 */
function formatMarkdownTable(items: unknown[]): string {
  if (items.length === 0) return "";
  const first = items[0];
  if (typeof first !== "object" || first === null) return "";

  // Column names
  const colNames: string[] = [];
  for (const key of Object.keys(first as Record<string, unknown>)) {
    if (!SKIP_KEYS.has(key)) colNames.push(key);
  }
  if (colNames.length === 0) return "";

  const lines: string[] = [];
  // Header
  lines.push("| " + colNames.join(" | ") + " |");
  lines.push("|" + colNames.map(() => "---").join("|") + "|");

  // Rows
  const displayItems = items.slice(0, MAX_TABLE_ROWS);
  for (const item of displayItems) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const cells = colNames.map((col) => valueToStr(obj[col]));
    lines.push("| " + cells.join(" | ") + " |");
  }

  if (items.length > MAX_TABLE_ROWS) {
    lines.push(`... +${items.length - MAX_TABLE_ROWS} more`);
  }

  return lines.join("\n");
}

/**
 * Format a nested object as markdown bullet list.
 */
function formatMarkdownObject(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    lines.push(`- **${key}:** ${valueToStr(value)}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert key to UPPER CASE.
 * "file_path" → "FILE PATH", "fileName" → "FILENAME", "isAsync" → "ISASYNC"
 * Matches Zig's snakeToUpper().
 */
function keyToUpper(key: string): string {
  return key.replace(/_/g, " ").toUpperCase();
}

/**
 * Format a value as a display string (for table cells / kv values).
 * Matches Zig's valueToStr().
 */
function valueToStr(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return value.toFixed(2);
    return String(value);
  }
  if (typeof value === "string") {
    if (value.length > 80) return value.slice(0, 79) + "…";
    return value;
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "object") return `{${Object.keys(value).length} fields}`;
  return String(value);
}

/**
 * Write string into a fixed-width column with space padding.
 * If overflows, truncate with … (U+2026).
 * Matches Zig's writeColumn().
 */
function writeColumn(s: string, width: number): string {
  if (s.length <= width) {
    return s + " ".repeat(width - s.length);
  }
  if (width > 1) {
    return s.slice(0, width - 1) + "…";
  }
  return s.slice(0, width);
}

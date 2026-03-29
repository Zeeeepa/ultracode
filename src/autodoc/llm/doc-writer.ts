/**
 * LLM-powered Documentation Writer
 *
 * Uses LLM to generate meaningful documentation from code.
 */

import { log } from "../../logging/index.js";
import type { ModuleInfo } from "../generator/doc-generator.js";
import type { LLMProvider } from "./llm-provider.js";

/**
 * Language name mapping — synced with Zig's batch_generator.zig (16 languages).
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  uk: "Ukrainian",
  tr: "Turkish",
  ar: "Arabic",
  hi: "Hindi",
};

function getLanguageName(code?: string): string {
  return LANGUAGE_NAMES[code ?? "en"] ?? "English";
}

/**
 * System prompt for FULL documentation generation.
 * Synced with Zig's batch_generator.buildSystemPromptFull().
 */
function getSystemPrompt(language?: string): string {
  const langName = getLanguageName(language);
  return `You are a senior technical documentation writer for a multi-language codebase.
Write clear, practical, developer-facing documentation in Markdown.
ALWAYS write in ${langName} regardless of source code comments or surrounding context.

Rules:
- Infer purpose from entity names, types, and file structure
- Be specific: describe WHAT each entity does, not just its type
- Keep per-entity descriptions to 1 sentence
- Preserve ALL entity listings with exact file:start_line-end_line references — do NOT omit any
  Format: \`filename.ext:123-456\` (start line dash end line). NEVER drop the end line number.
- Group logically: public API first, then internals, then types
- Add a "## Overview" section (2-4 sentences) explaining the module's role and design
- Add a "## Flow" section with a short ASCII diagram showing data/control flow through the module:
  Input → Processing steps → Output. Use arrows (→, ↓) and boxes. Only where applicable
  (pipelines, request handlers, data transformers, parsers). Skip for pure utility/type modules.
- If you see patterns (factory, builder, observer, pipeline), name them
- If you see key dependencies between entities, mention them briefly

CRITICAL:
- Output ONLY markdown, NO preamble or closing remarks
- Start directly with "# ..." heading, end with last section
- NEVER include conversational text, questions, or meta-commentary
- NEVER include raw code samples or code blocks with source code
- Language: ${langName} only.`;
}

/**
 * System prompt for INCREMENTAL documentation update.
 * Synced with Zig's batch_generator.buildSystemPromptIncremental().
 */
export function getIncrementalSystemPrompt(language?: string): string {
  const langName = getLanguageName(language);
  return `You are updating existing module documentation with new entities.
ALWAYS write in ${langName} regardless of source code comments or surrounding context.

Rules:
- DO NOT rewrite the Overview or Flow sections — keep them exactly as is
- DO NOT change descriptions of existing entities — keep them word-for-word
- ONLY add 1-sentence descriptions for the NEW entities listed below
- Insert new entities into the correct type-group section
- Preserve all file:start_line-end_line references exactly (e.g. \`file.ts:10-25\`)
- If a new entity clearly relates to existing ones, you may add a brief note

CRITICAL:
- Output the COMPLETE updated markdown (existing + new descriptions merged)
- NO preamble, NO closing remarks, NO questions, NO meta-commentary
- Start with "# ..." heading
- If the entity listing is unchanged, output the existing documentation AS IS
- NEVER include raw code samples or code blocks with source code
- Language: ${langName} only.`;
}

/**
 * Generate module documentation using LLM
 */
export async function generateModuleDoc(
  llm: LLMProvider,
  module: ModuleInfo,
  codeSnippets?: string[],
  options?: { language?: string },
): Promise<string> {
  const prompt = buildModulePrompt(module, codeSnippets, options?.language);
  const systemPrompt = getSystemPrompt(options?.language);

  const response = await llm.generate(prompt, {
    systemPrompt,
    maxTokens: 2500,
    temperature: 0.3,
  });

  return formatResponse(module.name, response.text);
}

/**
 * Generate incremental documentation update — only adds new entities.
 * Synced with Zig's enrichSingleDoc(.incremental) mode.
 *
 * @param existingDoc - Current AUTODOC content
 * @param newEntities - Description of new entities to add
 * @returns Updated documentation with new entities merged in
 */
export async function generateIncrementalDoc(
  llm: LLMProvider,
  existingDoc: string,
  newEntities: string,
  options?: { language?: string },
): Promise<string> {
  const prompt = `Update this documentation by adding ONLY the new entities listed below.
Do NOT modify existing content.

## Existing Documentation
${existingDoc}

## New Entities to Add
${newEntities}

## Updated Documentation (complete, with new entities merged):`;

  const systemPrompt = getIncrementalSystemPrompt(options?.language);

  const response = await llm.generate(prompt, {
    systemPrompt,
    maxTokens: 16000,
    temperature: 0.3,
  });

  const result = response.text.trim();

  // Truncation detection: reject if output is <70% of input length (Zig compat)
  if (result.length < existingDoc.length * 0.7 && existingDoc.length > 200) {
    return existingDoc; // Likely truncated — keep original
  }

  return formatResponse("", result);
}

/**
 * Generate description for a single export
 */
export async function generateExportDoc(llm: LLMProvider, exportName: string, code: string): Promise<string> {
  const prompt = `Describe this TypeScript/JavaScript export in 1-2 sentences:

\`\`\`typescript
${code.slice(0, 2000)}
\`\`\`

Export name: ${exportName}
Description:`;

  const response = await llm.generate(prompt, {
    systemPrompt: getSystemPrompt(),
    maxTokens: 200,
    temperature: 0.2,
  });

  return response.text.trim();
}

/**
 * Improve existing documentation
 */
export async function improveDoc(llm: LLMProvider, existingDoc: string, codeContext?: string): Promise<string> {
  const prompt = `Improve this documentation. Make it clearer and more complete.
${codeContext ? `\nCode context:\n\`\`\`\n${codeContext.slice(0, 3000)}\n\`\`\`` : ""}

Current documentation:
${existingDoc}

Improved documentation:`;

  const response = await llm.generate(prompt, {
    systemPrompt: getSystemPrompt(),
    maxTokens: 2000,
    temperature: 0.3,
  });

  return response.text.trim();
}

/**
 * Generate architecture overview
 */
export async function generateArchitectureDoc(
  llm: LLMProvider,
  projectName: string,
  modules: ModuleInfo[],
): Promise<string> {
  const moduleList = modules
    .slice(0, 30) // Limit to avoid context overflow
    .map((m) => `- ${m.name}: ${m.files.length} files, exports: ${m.exports.slice(0, 5).join(", ") || "internal"}`)
    .join("\n");

  const prompt = `Generate an architecture overview for the "${projectName}" project.

Modules:
${moduleList}

Write:
1. Brief overview (2-3 sentences)
2. Main components and their responsibilities
3. How modules relate to each other

Architecture documentation:`;

  const response = await llm.generate(prompt, {
    systemPrompt: getSystemPrompt(),
    maxTokens: 2000,
    temperature: 0.4,
  });

  return `# ${projectName} Architecture\n\n${response.text.trim()}`;
}

// ============================================================================
// Zig-compat Enrichment (ported from batch_generator.enrichSingleDoc)
// ============================================================================

export type EnrichMode = "full" | "incremental";

export interface EnrichableDoc {
  entityId: string;
  content: string;
  sourceHash: string;
  version: number;
}

export interface EnrichResult {
  enriched: string;
  newSourceHash: string;
  newVersion: number;
}

/**
 * Enrich a single document with LLM.
 * Ported from Zig batch_generator.enrichSingleDoc.
 *
 * For "full" mode: rewrites the entire doc with descriptions.
 * For "incremental" mode: only adds descriptions for "## New (pending description)" entries.
 *
 * Returns enriched content and updated source_hash, or null on failure/skip.
 */
export async function enrichSingleDoc(
  llm: LLMProvider,
  doc: EnrichableDoc,
  mode: EnrichMode,
  codeContext: string | null,
  options?: { language?: string },
): Promise<EnrichResult | null> {
  if (doc.sourceHash === "edited") return null;

  // For incremental: skip if no pending entries and not a synced doc
  if (mode === "incremental") {
    const hasPending = doc.content.includes("## New (pending description)");
    const isSynced = doc.sourceHash.startsWith("synced|");
    if (!hasPending && !isSynced) return null;
  }

  const prompt =
    mode === "full"
      ? buildFullEnrichPrompt(doc.content, codeContext)
      : buildIncrementalEnrichPrompt(doc.content, codeContext);

  const systemPrompt =
    mode === "full" ? getSystemPrompt(options?.language) : getIncrementalSystemPrompt(options?.language);

  const response = await llm.generate(prompt, {
    systemPrompt,
    maxTokens: 16000,
    temperature: 0.3,
  });

  const { postProcessLlmOutput } = await import("../generator/batch-autodoc.js");
  const enriched = postProcessLlmOutput(response.text);
  if (!enriched) return null;

  // Reject if output is significantly shorter (likely truncated)
  if (enriched.length < doc.content.length * 0.7 && doc.content.length > 200) {
    log.w("AUTODOC", "enrich-truncated", {
      entity: doc.entityId,
      llmLen: enriched.length,
      origLen: doc.content.length,
    });
    return null;
  }

  const newSourceHash = `enriched|${doc.sourceHash}`;
  return {
    enriched,
    newSourceHash,
    newVersion: doc.version + 1,
  };
}

// ============================================================================
// Zig-compat Prompt Builders (batch autodoc enrichment)
// ============================================================================

/**
 * Build full enrichment prompt for a new module.
 * Synced with Zig batch_generator.buildFullPrompt.
 */
export function buildFullEnrichPrompt(templateContent: string, codeContext?: string | null): string {
  return `Generate documentation for this module.

## Auto-generated entity listing (preserve ALL entries with file:line refs):

${templateContent}
${codeContext ?? ""}
## Task:
Write a complete AUTODOC.md with:
1. **Title** — module name as heading
2. **Overview** — what this module does, its role, key design decisions (2-4 sentences)
3. **Flow** — ASCII diagram of data/control flow IF this module has a pipeline, request path,
   or data transformation. Show: Input → Step1 → Step2 → Output. Skip for utility/type modules.
4. **Entity listing** — ALL entities from above, grouped by type, with 1-sentence descriptions added
5. **Dependencies** — key internal/external dependencies if visible from code

Generate the documentation now:`;
}

/**
 * Build incremental enrichment prompt for updated module.
 * Synced with Zig batch_generator.buildIncrementalPrompt.
 */
export function buildIncrementalEnrichPrompt(existingContent: string, codeContext?: string | null): string {
  return `Here is the current module documentation with some NEW entities that need descriptions:

${existingContent}

${codeContext ?? ""}

## Task:
- Keep ALL existing sections and descriptions EXACTLY as they are
- For entries under "## New (pending description)" — write a 1-sentence description
  and move them into the appropriate existing section (by entity type)
- Remove the "## New (pending description)" heading after integrating entries
- Preserve all \`filename:start_line-end_line\` references exactly
- Output the complete updated AUTODOC.md`;
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildModulePrompt(module: ModuleInfo, codeSnippets?: string[], language?: string): string {
  // Format files as a list for better LLM understanding
  const fileList = module.files
    .slice(0, 25) // Limit to avoid token overflow
    .map((f) => `- ${f}`)
    .join("\n");

  const exportList =
    module.exports.length > 0
      ? module.exports
          .slice(0, 15)
          .map((e) => `- \`${e}\``)
          .join("\n")
      : language === "ru"
        ? "Нет публичных экспортов (внутренний модуль)"
        : "No public exports (internal module)";

  // Language instruction at the start for better compliance
  const langInstruction =
    language === "ru"
      ? "ВАЖНО: Пиши документацию на РУССКОМ языке.\n\n"
      : language === "zh"
        ? "IMPORTANT: Write documentation in CHINESE.\n\n"
        : "";

  let prompt = `${langInstruction}Generate documentation for the "${module.name}" module in a TypeScript project.

## Module Files:
${fileList}
${module.files.length > 25 ? `\n... and ${module.files.length - 25} more files` : ""}

## Public Exports:
${exportList}

## Task:
Write a complete AUTODOC.md with these sections:

1. **Title and Overview** - What this module does (2-3 sentences)
2. **Files** - Table with each file and what it does:
   | File | Description |
   |------|-------------|
   | \`filename.ts\` | What this file does |
3. **Exports** - If any public exports, describe each one
4. **Usage** - Brief example if applicable`;

  if (codeSnippets && codeSnippets.length > 0) {
    prompt += `\n\n## Code Context:\n`;
    for (const snippet of codeSnippets.slice(0, 2)) {
      prompt += `\`\`\`typescript\n${snippet.slice(0, 1000)}\n\`\`\`\n`;
    }
  }

  prompt += `\n\nGenerate the documentation now:`;

  return prompt;
}

function formatResponse(moduleName: string, text: string): string {
  // Clean up LLM artifacts (DeepSeek tokenizer artifacts, etc.)
  let cleanText = text
    .replace(/<｜[^｜]+｜>/g, "") // DeepSeek artifacts like <｜begin▁of▁sentence｜>
    .replace(/<\|[^|]+\|>/g, "") // Alternative format <|...|>
    .replace(/\|>\s*\|/g, "|") // Fix broken table cells
    .trim();

  // Remove meta-text preamble (before first heading)
  const firstHeading = cleanText.indexOf("# ");
  if (firstHeading > 0) {
    cleanText = cleanText.slice(firstHeading);
  }

  // Remove meta-text postamble (after last code block or section)
  // Common patterns: "---\n\nDocumentation ready", "Documentation ready for..."
  cleanText = cleanText
    .replace(/\n---\n+(?:Документация|Documentation|Для применения|Ready for|This documentation)[\s\S]*$/i, "")
    .replace(/\n+(?:Документация готова|Documentation (?:ready|complete)|Для применения|Ready for use)[\s\S]*$/i, "")
    .trim();

  // Ensure it starts with a proper title
  if (!cleanText.startsWith("#")) {
    const title = moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace(/-/g, " ");
    return `# ${title}\n\n${cleanText}`;
  }

  return cleanText;
}

/**
 * Batch generate documentation for multiple modules
 */
export async function batchGenerateDocs(
  llm: LLMProvider,
  modules: ModuleInfo[],
  options?: {
    concurrency?: number | undefined;
    language?: string | undefined;
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  // Claude Code CLI: sequential (1) to avoid multiple sessions and rate limits
  // Other LLMs: conservative concurrency (2)
  const concurrency = options?.concurrency ?? (llm.name === "claude-code" ? 1 : 2);
  const language = options?.language;
  let completed = 0;

  // Process in batches
  for (let i = 0; i < modules.length; i += concurrency) {
    const batch = modules.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (mod) => {
        try {
          const doc = await generateModuleDoc(llm, mod, undefined, language != null ? { language } : {});
          return { path: mod.path, doc };
        } catch (_error) {
          // Fallback to basic template on error
          const fallbackTitle = language === "ru" ? "Модуль" : "Module";
          const fallbackDesc =
            language === "ru" ? `${fallbackTitle} ${mod.name}.` : `Module for ${mod.name} functionality.`;
          return {
            path: mod.path,
            doc: `# ${mod.name}\n\n${fallbackDesc}\n\n## Exports\n\n${
              mod.exports.map((e) => `- \`${e}\``).join("\n") ||
              (language === "ru" ? "Внутренний модуль" : "Internal module")
            }`,
          };
        }
      }),
    );

    for (const { path, doc } of batchResults) {
      results.set(path, doc);
      completed++;
      options?.onProgress?.(completed, modules.length);
    }
  }

  return results;
}

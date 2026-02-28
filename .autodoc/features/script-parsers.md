# Script and Infrastructure Parsers (PowerShell, Bash, Batch, Helm)

Support for parsing and validating scripts and infrastructure files using Tree-sitter and specialized analyzers.

## Features

### PowerShell (.ps1, .psm1, .psd1)

**Entity extraction:**
- Functions with `[CmdletBinding()]` and parameters
- Filters - special pipeline functions
- Classes and enums (PowerShell 5.0+)
- Variables with scope definition (global/script/function)
- Module imports (`using module`, `Import-Module`)
- Cmdlet and function calls

**Validation:**
- Check for `Invoke-Expression` usage with user input
- Hardcoded credentials detection
- Approved verbs usage check (Get, Set, New, Remove, etc.)
- Parameter sets and mandatory parameters validation

**Extracted data example:**
```typescript
{
  id: "script.ps1:function:Get-UserData",
  name: "Get-UserData",
  type: "function",
  metadata: {
    parameters: ["Username", "Detailed"],
    isCmdlet: true,
    attributes: ["CmdletBinding", "OutputType"]
  }
}
```

---

### Bash/Shell (.sh, .bash, .zsh, .fish)

**Entity extraction:**
- Functions with auto-detection of parameters ($1, $2, ...)
- Variables (declare, local, export)
- Source/import statements (source, .)
- Commands and pipelines
- Control flow (if/while/for/case)

**Validation:**
- Undefined variables check
- Dangerous patterns detection (`rm -rf`, `eval`)
- Unquoted variables warnings
- Best practices (set -e, trap, error handling)

**Extracted data example:**
```typescript
{
  id: "deploy.sh:function:deploy_app",
  name: "deploy_app",
  type: "function",
  metadata: {
    parameters: ["$1", "$2", "$3"],
    isBashFunction: true
  }
}
```

---

### Batch/CMD (.bat, .cmd)

**Entity extraction:**
- Labels and GOTO statements
- CALL statements (subroutines and external scripts)
- Variables (SET, SETX)
- Control flow (IF, FOR, ERRORLEVEL)

**Validation:**
- Unused labels check
- Undefined labels detection
- Dangerous commands (FORMAT without /P, DEL /S /Q)
- Incorrect ERRORLEVEL usage
- Delayed expansion recommendations

**Extracted data example:**
```typescript
{
  id: "build.bat:label:COMPILE",
  name: ":COMPILE",
  type: "function",
  metadata: {
    isLabel: true,
    isBatchLabel: true
  }
}
```

---

### Helm Charts (.tpl, Chart.yaml, values.yaml)

**Entity extraction:**
- Named templates (`{{ define "name" }}`) as function entities
- Include/template calls (`{{ include "name" . }}`) with relationship tracking
- Value references (`.Values.*`, `.Release.*`, `.Chart.*`, `.Capabilities.*`)
- Control flow (`{{ if }}`, `{{ range }}`, `{{ with }}`, `{{ else }}`)
- Template variables (`{{ $var := ... }}`)
- Chart.yaml - module entity with version, appVersion, dependencies
- values.yaml - top-level keys as variable entities
- Indent/nindent tracking with YAML context

**Helm Context Detection:**
- Automatic Helm chart detection by presence of `Chart.yaml` in the directory tree
- `.tpl` files are always parsed as Helm
- `.yaml` files with `{{ }}` in Helm context are parsed as Helm templates
- Regular YAML files (without Chart.yaml nearby) are not affected

**Extracted data example:**
```typescript
// Named template (from _helpers.tpl)
{
  name: "mychart.fullname",
  type: "function",
  metadata: { helmType: "named-template" }
}

// Chart metadata (from Chart.yaml)
{
  name: "my-chart",
  type: "module",
  metadata: {
    helmType: "chart",
    version: "1.0.0",
    appVersion: "2.0.0"
  }
}

// Value key (from values.yaml)
{
  name: "replicaCount",
  type: "variable",
  metadata: { helmType: "value-key", valueHint: "3" }
}

// Include call relationship
{
  from: "deployment.yaml",
  to: "mychart.fullname",
  type: "calls"
}
```

**Indent tracking:**
```typescript
// For line: {{ include "mychart.labels" . | nindent 4 }}
{
  indentFunction: "nindent",
  indentValue: 4,
  pipeline: "| nindent 4",
  yamlContextIndent: 6  // line indent in YAML
}
```

---

## Architecture

### PowerShell Analyzer (`src/parsers/powershell-analyzer.ts`)

**Tree-sitter parser:** `tree-sitter-powershell@0.25.9`

**Supported node types:**
- `function_statement` - functions and advanced functions
- `filter_statement` - pipeline filters
- `class_statement` - classes (PS 5.0+)
- `enum_statement` - enumerations
- `assignment_statement` - variables
- `using_statement` - module imports
- `pipeline` - command chains
- `try_statement` - error handling

**Special capabilities:**
- Attribute extraction (`[CmdletBinding()]`, `[Parameter()]`)
- Approved verbs validation
- Security issue detection
- Imported modules and cmdlets tracking

---

### Bash Analyzer (`src/parsers/bash-analyzer.ts`)

**Tree-sitter parser:** `tree-sitter-bash@0.21.0`

**Supported node types:**
- `function_definition` - functions
- `variable_assignment` - variables
- `declaration_command` - declare/local/export
- `command` - commands and source statements
- `pipeline` - pipelines and redirects
- Control flow: `if_statement`, `while_statement`, `for_statement`, `case_statement`

**Special capabilities:**
- Auto-detection of function parameters via regex ($1, $2, ...)
- Exports and variable scope tracking
- Source/import dependency detection
- Undefined variables validation

---

### Batch Analyzer (`src/parsers/batch-analyzer.ts`)

**Parsing:** Regex-based (tree-sitter is not available for Batch)

**Extracted patterns:**
```regex
Label:        ^:([A-Za-z_][A-Za-z0-9_]*)\s*$
GOTO:         \bGOTO\s+:?([A-Za-z_][A-Za-z0-9_]*)
CALL:         \bCALL\s+:?([A-Za-z_][A-Za-z0-9_]*|"[^"]+"|[^\s]+)
SET:          \b(?:SET|SETX)\s+([A-Za-z_][A-Za-z0-9_]*)=
Variable ref: %([A-Za-z_][A-Za-z0-9_]*)%
```

**Special capabilities:**
- Label references and calls tracking
- Built-in variables validation (%PATH%, %TEMP%, etc.)
- Dangerous patterns detection
- Delayed expansion usage check

---

### Helm Parser (`src/parsers/helm-parser.ts`)

**Parsing:** Regex-based (no external dependencies)

**Extracted patterns:**
```regex
Define:       \{\{-?\s*define\s+"([^"]+)"\s*-?\}\}
Include:      \{\{-?\s*include\s+"([^"]+)"\s+(.*?)\s*-?\}\}
Template:     \{\{-?\s*template\s+"([^"]+)"\s+(.*?)\s*-?\}\}
Value ref:    \.(Values|Release|Chart|Capabilities|Template|Files)(\.[a-zA-Z_][\w.-]*)
If/else if:   \{\{-?\s*(?:if|else\s+if)\s+(.*?)\s*-?\}\}
Range:        \{\{-?\s*range\s+(.*?)\s*-?\}\}
With:         \{\{-?\s*with\s+(.*?)\s*-?\}\}
Variable:     \{\{-?\s*\$(\w+)\s*:=\s*(.*?)\s*-?\}\}
nindent:      \|\s*nindent\s+(\d+)
indent:       \|\s*indent\s+(\d+)
toYaml pipe:  toYaml\s*\|\s*n?indent\s+(\d+)
```

**Special capabilities:**
- Cached Helm Context Detection (Chart.yaml lookup up directory tree, up to 10 levels)
- Nested define/end block tracking
- Chart.yaml dependencies parsing as `depends_on` relationships
- Helm constructs mapping to standard entity types (define -> function, range -> for-of loop)

---

## Validation Examples

### PowerShell - Security Issues

```powershell
# WARNING
$userInput = Read-Host "Command"
Invoke-Expression $userInput  # Dangerous!

# SUGGESTION
Use direct invocation or & operator instead
```

```powershell
# ERROR
$password = "MySecretPassword123"  # Hardcoded!

# SUGGESTION
Use Get-Credential or secure parameter storage
```

### Bash - Best Practices

```bash
# INFO
echo $MY_VAR  # Unquoted variable

# SUGGESTION
echo "$MY_VAR"  # Prevents word splitting
```

```bash
# WARNING
eval $user_command  # Dangerous with untrusted input

# SUGGESTION
Avoid eval if possible, or carefully validate input
```

### Batch - Dangerous Patterns

```batch
REM ERROR
FORMAT C:

REM SUGGESTION
FORMAT C: /P
```

```batch
REM WARNING
IF ERRORLEVEL == 1 GOTO ERROR

REM SUGGESTION
IF ERRORLEVEL 1 GOTO ERROR
REM or
IF %ERRORLEVEL% == 1 GOTO ERROR
```

---

## Usage

### Automatic Parsing

Parsers are automatically used during project indexing:

```bash
# Index a project with PowerShell scripts
npx @er77/ultracode index /path/to/project

# The parser will automatically process:
# - .ps1, .psm1, .psd1 → PowerShellAnalyzer
# - .sh, .bash          → BashAnalyzer
# - .bat, .cmd          → BatchAnalyzer
```

### Programmatic Access

```typescript
import { TreeSitterParser } from "./parsers/tree-sitter-parser.js";

const parser = new TreeSitterParser();
await parser.initialize();

// PowerShell
const psResult = await parser.parse(
  "Get-Process | Where-Object CPU -gt 100",
  "/scripts/monitor.ps1"
);

// Bash
const bashResult = await parser.parse(
  'function deploy() { echo "Deploying to $1"; }',
  "/scripts/deploy.sh"
);

// Batch
const batchResult = await parser.parse(
  ":MAIN\nCALL :COMPILE\nGOTO :EOF",
  "/scripts/build.bat"
);

// Check validation results
console.log(psResult.validationIssues);
// [{ type: "info", message: "...", line: 1, suggestion: "..." }]
```

---

## Configuration

Language configuration is located in `src/parsers/language-configs.ts`:

```typescript
export const LANGUAGE_KEYWORDS = {
  bash: {
    functions: ["function", "declare"],
    imports: ["source", ".", "import"],
    exports: ["export", "declare"],
  },
  powershell: {
    functions: ["function", "filter", "workflow"],
    classes: ["class", "enum"],
    imports: ["Import-Module", "using", ".", "source"],
  },
  batch: {
    functions: ["call", "goto", "label"],
    imports: ["call"],
    exports: ["set", "setx"],
  },
};
```

---

## Known Limitations

### PowerShell
- Dynamic function names (via `&`) may not be recognized
- Workflow blocks require additional analysis

### Bash
- Complex heredocs may be parsed incorrectly
- Process substitution `<()` has limited support

### Batch
- No tree-sitter available, resulting in limited syntactic analysis
- Context-dependent constructs may require additional validation
- Delayed expansion `!VAR!` is recognized only through SETLOCAL check

---

## Code Graph Integration

All extracted entities are automatically added to the code graph:

```typescript
// Entities
{ type: "function", name: "Deploy-Application" }
{ type: "class", name: "ConfigManager" }
{ type: "variable", name: "$connectionString" }

// Relationships
{ from: "deploy.ps1:function:Deploy-App", to: "Azure.Storage", type: "imports" }
{ from: "build.sh:function:compile", to: "utils.sh", type: "imports" }
{ from: "setup.bat:line:15", to: "setup.bat:label:INSTALL", type: "calls" }
```

**Graph queries:**

```
"Find all PowerShell functions with CmdletBinding"
"Show dependencies between bash scripts"
"Where is the %JAVA_HOME% variable used?"
```

---

## Additional Resources

- [Tree-sitter PowerShell Grammar](https://github.com/PowerShell/tree-sitter-PowerShell)
- [Tree-sitter Bash Grammar](https://github.com/tree-sitter/tree-sitter-bash)
- [PowerShell Best Practices](https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands)
- [Bash Style Guide](https://google.github.io/styleguide/shellguide.html)

---

**Version:** 3.9.0
**Date:** 2025-11-18

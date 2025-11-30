# Build Tree-sitter Prebuilds for Node.js 24+ (C++20)
# Creates prebuilt native bindings for tree-sitter and language parsers

$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Write-Separator { Write-ColorOutput ("=" * 70) "Cyan" }

Write-Separator
Write-ColorOutput "  Building Tree-sitter Prebuilds for Node.js 24+" "Cyan"
Write-Separator

# Get project root from script location (scripts/ -> project root)
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent $scriptDir
if (-not $projectRoot -or -not (Test-Path (Join-Path $projectRoot "package.json"))) {
    $projectRoot = (Get-Location).Path
}

$platform = "win32"
$arch = "x64"
$outputDir = Join-Path $projectRoot "external-libs\tree-sitter-$platform-$arch"

Write-ColorOutput "`nProject root: $projectRoot" "Gray"
Write-ColorOutput "Output directory: $outputDir" "Gray"

# Ensure output directory exists
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# List of tree-sitter packages to build
$packages = @(
    "tree-sitter",
    "tree-sitter-javascript",
    "tree-sitter-typescript",
    "tree-sitter-python",
    "tree-sitter-go",
    "tree-sitter-rust",
    "tree-sitter-c",
    "tree-sitter-cpp",
    "tree-sitter-java",
    "tree-sitter-kotlin",
    "tree-sitter-swift",
    "tree-sitter-bash",
    "tree-sitter-css",
    "tree-sitter-html",
    "tree-sitter-powershell",
    "tree-sitter-c-sharp"
)

Write-ColorOutput "`n Step 1: Patching binding.gyp files for C++20..." "Blue"

foreach ($pkg in $packages) {
    $pkgPath = Join-Path $projectRoot "node_modules\$pkg"
    $bindingGypPath = Join-Path $pkgPath "binding.gyp"

    if (Test-Path $bindingGypPath) {
        $content = Get-Content $bindingGypPath -Raw
        $originalContent = $content

        # Patch C++17 -> C++20 for Node.js 24 compatibility
        $content = $content -replace '"-std:c\+\+17"', '"-std:c++20"'
        $content = $content -replace '"/std:c\+\+17"', '"/std:c++20"'
        $content = $content -replace '"-std=c\+\+17"', '"-std=c++20"'
        $content = $content -replace '"CLANG_CXX_LANGUAGE_STANDARD": "c\+\+17"', '"CLANG_CXX_LANGUAGE_STANDARD": "c++20"'

        if ($content -ne $originalContent) {
            Set-Content $bindingGypPath -Value $content -NoNewline
            Write-ColorOutput "   Patched: $pkg" "Green"
        } else {
            Write-ColorOutput "   Already patched or no C++17: $pkg" "Gray"
        }
    }
}

Write-ColorOutput "`n Step 2: Rebuilding native modules..." "Blue"

$builtCount = 0
$failedCount = 0

foreach ($pkg in $packages) {
    $pkgPath = Join-Path $projectRoot "node_modules\$pkg"

    if (-not (Test-Path $pkgPath)) {
        Write-ColorOutput "   Skipping (not installed): $pkg" "Yellow"
        continue
    }

    Write-ColorOutput "   Building: $pkg..." "Gray"

    # Rebuild the package
    $buildResult = npm rebuild $pkg 2>&1

    if ($LASTEXITCODE -eq 0) {
        # Find and copy the .node file
        $nodeFiles = Get-ChildItem -Path $pkgPath -Recurse -Filter "*.node" -ErrorAction SilentlyContinue

        foreach ($nodeFile in $nodeFiles) {
            $destPath = Join-Path $outputDir $nodeFile.Name
            Copy-Item -Path $nodeFile.FullName -Destination $destPath -Force
            Write-ColorOutput "   Copied: $($nodeFile.Name)" "Green"
            $builtCount++
        }
    } else {
        Write-ColorOutput "   FAILED: $pkg" "Red"
        $failedCount++
    }
}

Write-Separator
Write-ColorOutput "`n Results:" "Cyan"
Write-ColorOutput "   Built: $builtCount modules" "Green"
if ($failedCount -gt 0) {
    Write-ColorOutput "   Failed: $failedCount modules" "Red"
}

# List built files
Write-ColorOutput "`n Built prebuilds in ${outputDir}:" "Blue"
Get-ChildItem -Path $outputDir -Filter "*.node" | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-ColorOutput "   $($_.Name) ($sizeMB MB)" "Gray"
}

Write-Separator
Write-ColorOutput "  Done! Prebuilds ready for packaging." "Green"
Write-Separator

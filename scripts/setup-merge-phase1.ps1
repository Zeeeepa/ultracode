# Setup script for Semantic Merge Phase 1
# Создаёт все необходимые директории и базовые файлы

$ErrorActionPreference = "Stop"

Write-Host "🚀 Setting up Semantic Merge - Phase 1" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Change to project root
Set-Location (Split-Path -Parent $PSScriptRoot)

# Step 1: Create directories
Write-Host "`n📁 Creating directories..." -ForegroundColor Blue
$directories = @(
    "src\merge\models",
    "src\merge\indexing",
    "src\merge\matching",
    "src\merge\analysis",
    "src\merge\engine",
    "src\merge\integration",
    "src\merge\models\__tests__",
    "src\merge\indexing\__tests__",
    "src\merge\matching\__tests__"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}
Write-Host "✅ Directories created" -ForegroundColor Green

# Step 2: Create index.ts exports
Write-Host "`n📝 Creating index exports..." -ForegroundColor Blue

@"
// Semantic Merge Models
export * from './code-unit.js';
export * from './versioned-index.js';
export * from './merge-result.js';
"@ | Out-File -FilePath "src\merge\models\index.ts" -Encoding UTF8

@"
// Semantic Merge Indexing
export * from './content-normalizer.js';
export * from './structural-normalizer.js';
"@ | Out-File -FilePath "src\merge\indexing\index.ts" -Encoding UTF8

@"
// Semantic Merge Matching
export * from './fast-path-matcher.js';
"@ | Out-File -FilePath "src\merge\matching\index.ts" -Encoding UTF8

@"
// Semantic Merge Main Export
export * from './models/index.js';
export * from './indexing/index.js';
export * from './matching/index.js';
"@ | Out-File -FilePath "src\merge\index.ts" -Encoding UTF8

Write-Host "✅ Index files created" -ForegroundColor Green

# Step 3: Update .gitignore
Write-Host "`n📝 Updating .gitignore..." -ForegroundColor Blue
$gitignoreContent = Get-Content .gitignore -Raw -ErrorAction SilentlyContinue
if ($gitignoreContent -notmatch "# Semantic Merge") {
    @"

# Semantic Merge temporary files
src/merge/**/*.test.ts.snap
src/merge/**/temp/
"@ | Add-Content -Path .gitignore -Encoding UTF8
    Write-Host "✅ .gitignore updated" -ForegroundColor Green
} else {
    Write-Host "✅ .gitignore already contains Semantic Merge section" -ForegroundColor Green
}

# Step 4: Create feature branch
Write-Host "`n🌿 Creating feature branch..." -ForegroundColor Blue
$currentBranch = git branch --show-current
if ($currentBranch -ne "feature/semantic-merge") {
    try {
        git checkout -b feature/semantic-merge 2>$null
    } catch {
        git checkout feature/semantic-merge
    }
    Write-Host "✅ On branch: feature/semantic-merge" -ForegroundColor Green
} else {
    Write-Host "✅ Already on feature/semantic-merge" -ForegroundColor Green
}

# Step 5: Summary
Write-Host "`n✨ Phase 1 setup complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Blue
Write-Host "1. Implement src\merge\models\code-unit.ts"
Write-Host "2. Implement src\merge\models\versioned-index.ts"
Write-Host "3. Implement src\merge\models\merge-result.ts"
Write-Host "4. Implement src\merge\indexing\content-normalizer.ts"
Write-Host "5. Write tests in src\merge\**\__tests__\"
Write-Host ""
Write-Host "📖 See docs\SEMANTIC_MERGE_STEP_BY_STEP.md for detailed instructions"
Write-Host ""
Write-Host "🧪 Run tests: npm test -- src/merge/"
Write-Host "📝 Run typecheck: npm run typecheck"
Write-Host ""

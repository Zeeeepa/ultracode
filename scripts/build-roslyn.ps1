# Build Roslyn C# Addon (UltraCode.CSharp)
# Usage: pwsh scripts/build-roslyn.ps1 [-Force] [-Clean] [-Configuration Release|Debug]

param(
    [switch]$Force,
    [switch]$Clean,
    [ValidateSet("Release", "Debug")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$RoslynDir = Join-Path $ProjectRoot "roslyn"
$PublishDir = Join-Path $ProjectRoot "dist" "roslyn-addon"
$HashFile = Join-Path $PublishDir ".build-hash"
$DllFile = Join-Path $PublishDir "UltraCode.CSharp.dll"
$CsprojFile = Join-Path $RoslynDir "UltraCode.CSharp" "UltraCode.CSharp.csproj"

# Clean mode
if ($Clean) {
    Write-Host "[CLEAN] Removing build artifacts..."
    if (Test-Path $PublishDir) { Remove-Item $PublishDir -Recurse -Force }
    Get-ChildItem $RoslynDir -Recurse -Directory | Where-Object { $_.Name -in @("bin", "obj") } | Remove-Item -Recurse -Force
    Write-Host "[OK] Clean complete"
    return
}

# Check dotnet
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "[SKIP] .NET SDK not found in PATH"
    Write-Host "       Install from: https://dotnet.microsoft.com/download"
    return
}

# Compute hash of source files
function Get-RoslynSourceHash {
    $files = Get-ChildItem $RoslynDir -Recurse -Include "*.cs", "*.csproj", "*.props" |
        Where-Object { $_.FullName -notmatch '\\(obj|bin)\\' } |
        Sort-Object FullName

    $sha = [System.Security.Cryptography.SHA256]::Create()
    $allHashes = $files | ForEach-Object {
        (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    }
    $combined = $allHashes -join ""
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($combined)
    $hash = $sha.ComputeHash($bytes)
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}

$currentHash = Get-RoslynSourceHash

# Check if rebuild needed
if (-not $Force) {
    if ((Test-Path $DllFile) -and (Test-Path $HashFile)) {
        $savedHash = (Get-Content $HashFile -Raw).Trim()
        if ($savedHash -eq $currentHash) {
            Write-Host "[OK] Roslyn addon is up to date (hash match)"
            return
        }
    }

    if (-not (Test-Path $DllFile)) {
        Write-Host "[INFO] DLL not found, building..."
    } else {
        Write-Host "[INFO] Source changed, rebuilding..."
    }
}

# Build
Write-Host "[BUILD] Publishing UltraCode.CSharp ($Configuration)..."
dotnet publish $CsprojFile -c $Configuration -o $PublishDir --no-self-contained -v quiet

if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] Roslyn build failed!"
    exit 1
}

# Save hash
New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null
Set-Content -Path $HashFile -Value $currentHash -NoNewline

Write-Host "[OK] Roslyn addon built: $DllFile"

# CUDA Build Script with VS 2022 Environment
# This script initializes VS 2022 environment before running cmake-js

$ErrorActionPreference = "Stop"

Write-Host "🔧 Initializing Visual Studio 2022 Build Tools environment..." -ForegroundColor Cyan

# Find VS 2022 Build Tools
$vs2022Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
if (-not (Test-Path $vs2022Path)) {
    Write-Host "❌ VS 2022 Build Tools not found at: $vs2022Path" -ForegroundColor Red
    Write-Host "   Please install VS 2022 Build Tools with C++ support" -ForegroundColor Yellow
    exit 1
}

# Initialize VS environment using vcvars64.bat (more reliable than VsDevCmd.bat)
$vcvars64 = Join-Path $vs2022Path "VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars64)) {
    Write-Host "❌ vcvars64.bat not found" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found VS 2022 Build Tools" -ForegroundColor Green

# Run vcvars64.bat and capture environment
$tempFile = [System.IO.Path]::GetTempFileName()
cmd /c "`"$vcvars64`" && set > `"$tempFile`""

# Load environment variables
Get-Content $tempFile | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $name = $matches[1]
        $value = $matches[2]
        Set-Item -Path "env:$name" -Value $value -Force
    }
}
Remove-Item $tempFile

Write-Host "✅ VS 2022 environment initialized" -ForegroundColor Green
Write-Host "   Compiler: $env:VCToolsInstallDir" -ForegroundColor Gray

# Verify compiler is available
$clPath = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $clPath) {
    Write-Host "❌ C++ compiler (cl.exe) not found in PATH" -ForegroundColor Red
    Write-Host "   Install C++ components in VS 2022" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ C++ compiler found: $($clPath.Source)" -ForegroundColor Green

# Verify Windows SDK tools are in PATH
$rcPath = Get-Command rc.exe -ErrorAction SilentlyContinue
if ($rcPath -and $rcPath.Source -like "*Windows Kits*") {
    Write-Host "✅ Windows SDK Resource Compiler found: $($rcPath.Source)" -ForegroundColor Green
} else {
    Write-Host "⚠️  Windows SDK Resource Compiler not in PATH" -ForegroundColor Yellow
    Write-Host "   VsDevCmd.bat should have added it, but PATH may be truncated" -ForegroundColor Gray
}

# Temporarily remove conflicting rc.exe in root node_modules
$projectRoot = Join-Path $PSScriptRoot ".."
$rootNodeModulesRc = Join-Path $projectRoot "node_modules\.bin\rc.exe"
$backupDir = Join-Path $projectRoot "scripts\_backup"
$rootNodeModulesRcBackup = Join-Path $backupDir "rc.exe.backup"
$removed = $false

if (Test-Path $rootNodeModulesRc) {
    Write-Host "🔧 Temporarily removing conflicting rc.exe from root node_modules..." -ForegroundColor Yellow
    Write-Host "   Source: $rootNodeModulesRc" -ForegroundColor Gray
    try {
        # Create backup directory
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }

        # Copy and remove
        Copy-Item $rootNodeModulesRc $rootNodeModulesRcBackup -Force
        Remove-Item $rootNodeModulesRc -Force
        $removed = $true
        Write-Host "✅ Backed up and removed rc.exe" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Could not remove rc.exe: $_" -ForegroundColor Yellow
    }
}

# Navigate to CUDA addon directory
$cudaDir = Join-Path $PSScriptRoot "..\external-tools\native\cuda"
Push-Location $cudaDir

# Remove conflicting rc.exe from CUDA node_modules if exists
$conflictingRc = Join-Path "node_modules\.bin" "rc.cmd"
if (Test-Path $conflictingRc) {
    Write-Host "🔧 Removing conflicting rc.cmd from CUDA node_modules..." -ForegroundColor Yellow
    Remove-Item $conflictingRc -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path "node_modules\.bin" "rc") -Force -ErrorAction SilentlyContinue
}

try {
    Write-Host "`n🔨 Building CUDA addon with Ninja generator..." -ForegroundColor Cyan

    # Find Windows SDK RC.exe
    $windowsKitsRc = Get-Command rc.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -like "*Windows Kits*" } | Select-Object -First 1
    if ($windowsKitsRc) {
        $env:CMAKE_RC_COMPILER = $windowsKitsRc.Source
        Write-Host "📌 Set CMAKE_RC_COMPILER=$($env:CMAKE_RC_COMPILER)" -ForegroundColor Cyan
    }

    # Create output directory
    $distDir = Join-Path $PSScriptRoot "..\dist\native\cuda"
    if (-not (Test-Path $distDir)) {
        New-Item -ItemType Directory -Path $distDir -Force | Out-Null
        Write-Host "📁 Created output directory: dist/native/cuda/" -ForegroundColor Cyan
    }

    # Build directly to dist/native/cuda/ using --out parameter
    # This way we don't need to copy files afterwards
    $distDirAbsolute = (Resolve-Path $distDir).Path
    npx cmake-js compile --generator=Ninja --out="$distDirAbsolute" --verbose

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ CUDA addon built successfully to dist/native/cuda/" -ForegroundColor Green

        # Verify the file exists
        $builtAddon = Get-ChildItem "$distDir\*.node" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($builtAddon) {
            Write-Host "✅ Built file: $($builtAddon.Name) ($([math]::Round($builtAddon.Length/1KB, 2)) KB)" -ForegroundColor Green
        }
    } else {
        Write-Host "`n❌ CUDA build failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location

    # Restore removed rc.exe
    if ($removed -and (Test-Path $rootNodeModulesRcBackup)) {
        Write-Host "🔄 Restoring rc.exe..." -ForegroundColor Cyan
        try {
            Copy-Item $rootNodeModulesRcBackup $rootNodeModulesRc -Force
            Remove-Item $rootNodeModulesRcBackup -Force
            Write-Host "✅ Restored rc.exe" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  Could not restore rc.exe: $_" -ForegroundColor Yellow
        }
    }
}

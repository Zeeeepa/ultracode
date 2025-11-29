#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build native CUDA libraries for all platforms (Windows + Linux via WSL)
.DESCRIPTION
    Cross-compile CUDA native addon for distribution:
    - Windows x64 (native)
    - Linux x64 (via WSL)

    Output: external-libs/cuda-{platform}-{arch}/ultrascript_cuda.node

    Requirements:
    - Windows: CUDA Toolkit 11.x+, Visual Studio 2022 Build Tools (VS 2026 has compatibility issues)
    - Linux:   WSL2 with Ubuntu, CUDA Toolkit in WSL

    The script automatically:
    - Finds and uses VS 2022 BuildTools (preferred for CUDA 13.0 compatibility)
    - Disables npm rc shims to avoid conflict with Windows SDK rc.exe
    - Uses Visual Studio generator (safer than Ninja for CUDA builds)
.EXAMPLE
    .\scripts\build-native-libs.ps1                              # Build all
    .\scripts\build-native-libs.ps1 -Platform windows            # Windows only
    .\scripts\build-native-libs.ps1 -Platform linux              # Linux via WSL only
    .\scripts\build-native-libs.ps1 -Clean                       # Clean build
    .\scripts\build-native-libs.ps1 -Package                     # Build + create tar.gz archives
    .\scripts\build-native-libs.ps1 -Platform windows -Package   # Windows + archive
#>

param(
    [ValidateSet("all", "windows", "linux")]
    [string]$Platform = "all",
    [switch]$Clean,
    [switch]$Debug,
    [switch]$Package,  # Create tar.gz archives for distribution
    [string]$CudaArch = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$CudaSrcDir = Join-Path $ProjectRoot "external-tools/native/cuda"
$OutputDir = Join-Path $ProjectRoot "external-libs"

# ANSI colors
$script:Colors = @{
    Reset   = "`e[0m"
    Bold    = "`e[1m"
    Red     = "`e[31m"
    Green   = "`e[32m"
    Yellow  = "`e[33m"
    Blue    = "`e[34m"
    Cyan    = "`e[36m"
}

function Write-Step($message) {
    Write-Host "`n$($Colors.Cyan)[$($Colors.Bold)BUILD$($Colors.Reset)$($Colors.Cyan)]$($Colors.Reset) $message" -NoNewline
    Write-Host ""
}

function Write-Success($message) {
    Write-Host "$($Colors.Green)✓$($Colors.Reset) $message"
}

function Write-Error($message) {
    Write-Host "$($Colors.Red)✗$($Colors.Reset) $message"
}

function Write-Warning($message) {
    Write-Host "$($Colors.Yellow)⚠$($Colors.Reset) $message"
}

function Write-Info($message) {
    Write-Host "$($Colors.Blue)ℹ$($Colors.Reset) $message"
}

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================

function Find-VS2022Path {
    # Find VS 2022 BuildTools (preferred for CUDA 13.0 compatibility)
    # VS 2026 has CVTRES bugs and CUDA compatibility issues

    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"

    # Try direct path first (most reliable)
    $directPath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
    if (Test-Path "$directPath\VC\Auxiliary\Build\vcvars64.bat") {
        Write-Info "Found VS 2022 BuildTools at direct path"
        return $directPath
    }

    if (-not (Test-Path $vsWhere)) {
        return $null
    }

    # Try vswhere for VS 2022 BuildTools
    $vsPath = & $vsWhere -version "[17.0,18.0)" -products Microsoft.VisualStudio.Product.BuildTools -property installationPath 2>$null
    if ($vsPath) {
        Write-Info "Found VS 2022 BuildTools via vswhere"
        return $vsPath
    }

    # Try vswhere for any VS 2022 edition
    $vsPath = & $vsWhere -version "[17.0,18.0)" -property installationPath 2>$null
    if ($vsPath) {
        Write-Info "Found VS 2022 via vswhere"
        return $vsPath
    }

    # Fallback to latest (may be VS 2026)
    Write-Warning "VS 2022 not found, trying latest VS (may have CUDA compatibility issues)"
    $vsPath = & $vsWhere -latest -property installationPath 2>$null
    return $vsPath
}

function Initialize-VSEnvironment {
    # Find Visual Studio and initialize build environment
    # Prefer VS 2022 for CUDA 13.0 compatibility

    $vsPath = Find-VS2022Path
    if (-not $vsPath) {
        Write-Warning "No Visual Studio installation found"
        return $false
    }

    # Find vcvarsall.bat
    $vcvarsall = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
    if (-not (Test-Path $vcvarsall)) {
        $vcvarsall = Join-Path $vsPath "VC\Auxiliary\Build\vcvarsall.bat"
    }

    if (-not (Test-Path $vcvarsall)) {
        Write-Warning "vcvarsall.bat not found"
        return $false
    }

    Write-Info "Initializing Visual Studio environment from: $vsPath"

    # Run vcvarsall and capture environment
    $envBefore = @{}
    Get-ChildItem env: | ForEach-Object { $envBefore[$_.Name] = $_.Value }

    # Execute vcvarsall and get new environment
    $tempBat = [System.IO.Path]::GetTempFileName() + ".bat"
    $tempEnv = [System.IO.Path]::GetTempFileName()

    @"
@echo off
call "$vcvarsall" x64 >nul 2>&1
set > "$tempEnv"
"@ | Set-Content $tempBat -Encoding ASCII

    & cmd /c $tempBat

    if (Test-Path $tempEnv) {
        Get-Content $tempEnv | ForEach-Object {
            if ($_ -match "^([^=]+)=(.*)$") {
                $name = $Matches[1]
                $value = $Matches[2]
                if ($envBefore[$name] -ne $value) {
                    [Environment]::SetEnvironmentVariable($name, $value, "Process")
                }
            }
        }
        Remove-Item $tempEnv -ErrorAction SilentlyContinue
    }
    Remove-Item $tempBat -ErrorAction SilentlyContinue

    # Verify cl.exe is now in PATH
    $clPath = Get-Command cl.exe -ErrorAction SilentlyContinue
    if ($clPath) {
        Write-Success "VS environment initialized (cl.exe found)"
        return $true
    }

    return $false
}

function Test-WindowsPrerequisites {
    Write-Step "Checking Windows prerequisites..."

    $hasErrors = $false

    # 1. Check CUDA Toolkit
    $nvccPath = Get-Command nvcc -ErrorAction SilentlyContinue
    if (-not $nvccPath) {
        $cudaPath = $env:CUDA_PATH
        if ($cudaPath -and (Test-Path "$cudaPath/bin/nvcc.exe")) {
            $env:PATH = "$cudaPath/bin;$env:PATH"
            $cudaVersion = & nvcc --version 2>&1 | Select-String "release" | ForEach-Object {
                if ($_ -match "release (\d+\.\d+)") { $Matches[1] }
            }
            Write-Success "CUDA Toolkit $cudaVersion found at: $cudaPath"
        } else {
            Write-Error "CUDA Toolkit not found!"
            Write-Host "  Install from: https://developer.nvidia.com/cuda-downloads"
            $hasErrors = $true
        }
    } else {
        $cudaVersion = & nvcc --version 2>&1 | Select-String "release" | ForEach-Object {
            if ($_ -match "release (\d+\.\d+)") { $Matches[1] }
        }
        Write-Success "CUDA Toolkit $cudaVersion"
    }

    # 2. Check Visual Studio Build Tools
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsPath = & $vsWhere -latest -property installationPath 2>$null
        if ($vsPath) {
            $vsVersion = & $vsWhere -latest -property catalog_productLineVersion 2>$null
            Write-Success "Visual Studio $vsVersion found at: $vsPath"
        } else {
            Write-Error "Visual Studio Build Tools not found!"
            Write-Host "  Install from: https://visualstudio.microsoft.com/downloads/"
            Write-Host "  Select 'Desktop development with C++'"
            $hasErrors = $true
        }
    } else {
        # Try to find cl.exe directly
        $clPath = Get-Command cl.exe -ErrorAction SilentlyContinue
        if ($clPath) {
            Write-Success "MSVC compiler found"
        } else {
            Write-Error "Visual Studio Build Tools not found!"
            Write-Host "  Install from: https://visualstudio.microsoft.com/downloads/"
            $hasErrors = $true
        }
    }

    # 3. Check if cl.exe is in PATH (needed for nvcc)
    $clPath = Get-Command cl.exe -ErrorAction SilentlyContinue
    if (-not $clPath) {
        Write-Warning "cl.exe not in PATH - initializing VS environment..."
        if (-not (Initialize-VSEnvironment)) {
            Write-Error "Failed to initialize VS environment!"
            Write-Host "  Try running from 'Developer PowerShell for VS' or"
            Write-Host "  'x64 Native Tools Command Prompt for VS'"
            $hasErrors = $true
        }
    } else {
        Write-Success "cl.exe found in PATH"
    }

    # 4. Check cmake-js
    $cmakejs = Get-Command cmake-js -ErrorAction SilentlyContinue
    if (-not $cmakejs) {
        Write-Warning "cmake-js not found globally, will use npx"
    } else {
        Write-Success "cmake-js found"
    }

    # 5. Check node-addon-api
    $nodeAddonApi = Join-Path $ProjectRoot "node_modules/node-addon-api"
    if (-not (Test-Path $nodeAddonApi)) {
        Write-Warning "node-addon-api not found, will install"
    } else {
        Write-Success "node-addon-api found"
    }

    return -not $hasErrors
}

function Test-WSLPrerequisites {
    Write-Step "Checking WSL prerequisites..."

    # Check if WSL is available
    $wslCheck = wsl --status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "WSL not available or not configured"
        Write-Host "  Install: wsl --install"
        return $false
    }
    Write-Success "WSL is available"

    # Check if CUDA is available in WSL
    $cudaCheck = wsl bash -c "which nvcc 2>/dev/null || echo 'not found'"
    if ($cudaCheck -eq "not found") {
        Write-Warning "CUDA Toolkit not found in WSL"
        Write-Host "  Install in WSL: sudo apt install nvidia-cuda-toolkit"
        Write-Host "  Or use NVIDIA CUDA WSL drivers"
        return $false
    }
    Write-Success "CUDA found in WSL: $cudaCheck"

    # Check cmake in WSL
    $cmakeCheck = wsl bash -c "which cmake 2>/dev/null || echo 'not found'"
    if ($cmakeCheck -eq "not found") {
        Write-Warning "cmake not found in WSL, will try to install"
    } else {
        Write-Success "cmake found in WSL"
    }

    return $true
}

# =============================================================================
# BUILD FUNCTIONS
# =============================================================================

function Disable-NpmRcShims {
    # Temporarily rename npm's rc shims to avoid conflict with Windows SDK rc.exe
    # npm's "rc" package outputs JSON instead of compiling resources!
    $npmBin = Join-Path $ProjectRoot "node_modules\.bin"
    $script:RcShimsDisabled = @()

    foreach ($ext in @("rc.cmd", "rc.ps1", "rc")) {
        $shimPath = Join-Path $npmBin $ext
        if (Test-Path $shimPath) {
            $bakPath = "$shimPath.bak"
            Move-Item -Path $shimPath -Destination $bakPath -Force -ErrorAction SilentlyContinue
            $script:RcShimsDisabled += @{ Original = $shimPath; Backup = $bakPath }
        }
    }

    if ($script:RcShimsDisabled.Count -gt 0) {
        Write-Info "Temporarily disabled npm rc shims to avoid conflict with Windows SDK"
    }
}

function Restore-NpmRcShims {
    # Restore npm's rc shims after build
    foreach ($shim in $script:RcShimsDisabled) {
        if (Test-Path $shim.Backup) {
            Move-Item -Path $shim.Backup -Destination $shim.Original -Force -ErrorAction SilentlyContinue
        }
    }
    $script:RcShimsDisabled = @()
}

function Build-WindowsCuda {
    Write-Step "Building CUDA addon for Windows x64..."

    $outputPath = Join-Path $OutputDir "cuda-win32-x64"

    # Clean if requested
    if ($Clean) {
        $buildDir = Join-Path $CudaSrcDir "build"
        if (Test-Path $buildDir) {
            Write-Info "Cleaning previous build..."
            Remove-Item -Recurse -Force $buildDir
        }
    }

    # Ensure node-addon-api is installed
    $nodeAddonApi = Join-Path $ProjectRoot "node_modules/node-addon-api"
    if (-not (Test-Path $nodeAddonApi)) {
        Write-Info "Installing node-addon-api..."
        Push-Location $ProjectRoot
        npm install node-addon-api
        Pop-Location
    }

    # IMPORTANT: Use Visual Studio generator to avoid CVTRES issues with Ninja + VS 2026
    # Ninja has known issues with VS 2026 preview CVTRES tool
    Write-Info "Using Visual Studio 17 2022 generator (safer for CUDA builds)"

    # Build using cmake-js
    Write-Info "Compiling with cmake-js..."
    Push-Location $CudaSrcDir

    try {
        # Disable npm rc shims to avoid conflict with Windows SDK rc.exe
        Disable-NpmRcShims

        $cmakeArgs = @("compile", "-G", "Visual Studio 17 2022", "-A", "x64")
        if ($Debug) {
            $cmakeArgs += "--debug"
        }
        if ($CudaArch) {
            $cmakeArgs += @("--CD", "CMAKE_CUDA_ARCHITECTURES=$CudaArch")
        }

        # Explicitly set CUDA compiler path if CUDA_PATH is set
        if ($env:CUDA_PATH) {
            $nvccPath = Join-Path $env:CUDA_PATH "bin\nvcc.exe"
            if (Test-Path $nvccPath) {
                $cmakeArgs += @("--CD", "CMAKE_CUDA_COMPILER=$nvccPath")
                Write-Info "Using CUDA compiler: $nvccPath"
            }
        }

        # Use npx if cmake-js not global
        $cmakejs = Get-Command cmake-js -ErrorAction SilentlyContinue
        if ($cmakejs) {
            & cmake-js @cmakeArgs
        } else {
            & npx cmake-js @cmakeArgs
        }

        if ($LASTEXITCODE -ne 0) {
            throw "cmake-js failed with exit code $LASTEXITCODE"
        }
    } finally {
        # Always restore npm rc shims
        Restore-NpmRcShims
        Pop-Location
    }

    # Copy to output
    if (-not (Test-Path $outputPath)) {
        New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
    }

    # Try different possible output locations
    $buildNode = $null
    $possiblePaths = @(
        (Join-Path $CudaSrcDir "build/Release/ultrascript_cuda.node"),
        (Join-Path $CudaSrcDir "build/Debug/ultrascript_cuda.node"),
        (Join-Path $CudaSrcDir "build/ultrascript_cuda.node")
    )
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $buildNode = $path
            break
        }
    }

    if ($buildNode) {
        Copy-Item $buildNode -Destination $outputPath -Force
        $size = [math]::Round((Get-Item $buildNode).Length / 1KB, 0)
        Write-Success "Built: $outputPath/ultrascript_cuda.node (${size} KB)"
        return $true
    } else {
        Write-Error "Build output not found"
        # List what was created
        Write-Info "Contents of build directory:"
        Get-ChildItem -Path (Join-Path $CudaSrcDir "build") -Recurse -Filter "*.node" -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "  $($_.FullName)"
        }
        return $false
    }
}

function Build-LinuxCuda {
    Write-Step "Building CUDA addon for Linux x64 (via WSL)..."

    $outputPath = Join-Path $OutputDir "cuda-linux-x64"

    # Use the standalone bash script (must have LF line endings)
    # $ProjectRoot is defined at script level
    $scriptDir = Join-Path $ProjectRoot "scripts"
    $wslScriptDir = $scriptDir -replace '\\', '/' -replace '^([A-Za-z]):', { '/mnt/' + $_.Groups[1].Value.ToLower() }
    $wslScriptPath = "$wslScriptDir/build-linux-wsl.sh"

    # Run build in WSL using the standalone script
    Write-Info "Running build in WSL..."
    Write-Host ""

    $cleanArg = if ($Clean) { "--clean" } else { "" }

    # Use cmd /c to avoid PowerShell WSL issues
    $process = Start-Process -FilePath "wsl" -ArgumentList "bash", $wslScriptPath, $cleanArg -NoNewWindow -Wait -PassThru
    $buildExitCode = $process.ExitCode

    Write-Host ""

    if ($buildExitCode -eq 0) {
        if (-not (Test-Path $outputPath)) {
            New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
        }

        $nodeFile = Join-Path $outputPath "ultrascript_cuda.node"
        if (Test-Path $nodeFile) {
            $size = [math]::Round((Get-Item $nodeFile).Length / 1KB, 0)
            Write-Success "Built: $outputPath/ultrascript_cuda.node (${size} KB)"
            return $true
        }
    }

    # Check if file exists even if exit code was non-zero
    $nodeFile = Join-Path $outputPath "ultrascript_cuda.node"
    if (Test-Path $nodeFile) {
        $size = [math]::Round((Get-Item $nodeFile).Length / 1KB, 0)
        Write-Warning "Build reported error but output exists: $outputPath/ultrascript_cuda.node (${size} KB)"
        return $true
    }

    Write-Error "Linux build failed (exit code: $buildExitCode)"
    return $false
}

# =============================================================================
# PACKAGING
# =============================================================================

function New-Archive {
    param(
        [string]$SourceDir,
        [string]$ArchiveName
    )

    $archivePath = Join-Path $OutputDir $ArchiveName

    Write-Step "Creating archive: $ArchiveName"

    if (-not (Test-Path $SourceDir)) {
        Write-Warning "Source directory not found: $SourceDir"
        return $null
    }

    # Use tar for .tar.gz (cross-platform compatible)
    Push-Location $OutputDir
    try {
        $dirName = Split-Path -Leaf $SourceDir

        # Check if tar is available (Windows 10+ has built-in tar)
        $tarAvailable = Get-Command tar -ErrorAction SilentlyContinue
        if ($tarAvailable) {
            & tar -czvf $ArchiveName $dirName 2>$null
            if ($LASTEXITCODE -eq 0 -and (Test-Path $archivePath)) {
                $size = [math]::Round((Get-Item $archivePath).Length / 1KB, 0)
                Write-Success "Created: $archivePath (${size} KB)"
                return $archivePath
            }
        }

        # Fallback: use Compress-Archive for .zip
        $zipName = $ArchiveName -replace '\.tar\.gz$', '.zip'
        $zipPath = Join-Path $OutputDir $zipName
        Compress-Archive -Path $SourceDir -DestinationPath $zipPath -Force
        if (Test-Path $zipPath) {
            $size = [math]::Round((Get-Item $zipPath).Length / 1KB, 0)
            Write-Success "Created: $zipPath (${size} KB)"
            return $zipPath
        }
    } finally {
        Pop-Location
    }

    Write-Error "Failed to create archive"
    return $null
}

# =============================================================================
# MAIN
# =============================================================================

Write-Host "`n$($Colors.Cyan)$($Colors.Bold)═══════════════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host "$($Colors.Cyan)$($Colors.Bold)  UltraScript Tools - Native CUDA Library Builder$($Colors.Reset)"
Write-Host "$($Colors.Cyan)$($Colors.Bold)═══════════════════════════════════════════════════════════════════$($Colors.Reset)"

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$results = @{
    Windows = $null
    Linux = $null
}

$archives = @()

# Build Windows
if ($Platform -eq "all" -or $Platform -eq "windows") {
    if (Test-WindowsPrerequisites) {
        $results.Windows = Build-WindowsCuda
        if ($results.Windows -and $Package) {
            $archive = New-Archive -SourceDir (Join-Path $OutputDir "cuda-win32-x64") -ArchiveName "native-libs-cuda-win32-x64.tar.gz"
            if ($archive) { $archives += $archive }
        }
    } else {
        Write-Warning "Skipping Windows build due to missing prerequisites"
        $results.Windows = $false
    }
}

# Build Linux via WSL
if ($Platform -eq "all" -or $Platform -eq "linux") {
    if (Test-WSLPrerequisites) {
        $results.Linux = Build-LinuxCuda
        if ($results.Linux -and $Package) {
            $archive = New-Archive -SourceDir (Join-Path $OutputDir "cuda-linux-x64") -ArchiveName "native-libs-cuda-linux-x64.tar.gz"
            if ($archive) { $archives += $archive }
        }
    } else {
        Write-Warning "Skipping Linux build due to missing WSL prerequisites"
        $results.Linux = $false
    }
}

# Summary
Write-Host "`n$($Colors.Cyan)$($Colors.Bold)═══════════════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host "$($Colors.Cyan)$($Colors.Bold)  Build Summary$($Colors.Reset)"
Write-Host "$($Colors.Cyan)$($Colors.Bold)═══════════════════════════════════════════════════════════════════$($Colors.Reset)"

$successCount = 0
$failCount = 0

foreach ($key in $results.Keys) {
    if ($results[$key] -eq $true) {
        Write-Success "$key build: SUCCESS"
        $successCount++
    } elseif ($results[$key] -eq $false) {
        Write-Error "$key build: FAILED"
        $failCount++
    } else {
        Write-Info "$key build: SKIPPED"
    }
}

Write-Host ""

if ($successCount -gt 0) {
    Write-Host "$($Colors.Green)Output directory: $OutputDir$($Colors.Reset)"
    Get-ChildItem -Path $OutputDir -Recurse -Filter "*.node" | ForEach-Object {
        $relativePath = $_.FullName.Replace($OutputDir, "").TrimStart('\', '/')
        $size = [math]::Round($_.Length / 1KB, 0)
        Write-Host "  $relativePath (${size} KB)"
    }
}

if ($archives.Count -gt 0) {
    Write-Host ""
    Write-Host "$($Colors.Green)Archives created for distribution:$($Colors.Reset)"
    foreach ($archive in $archives) {
        $size = [math]::Round((Get-Item $archive).Length / 1KB, 0)
        Write-Host "  $(Split-Path -Leaf $archive) (${size} KB)"
    }
    Write-Host ""
    Write-Host "$($Colors.Cyan)Upload these archives to GitHub Releases for auto-download during npm install$($Colors.Reset)"
}

Write-Host ""

if ($failCount -gt 0) {
    exit 1
}
